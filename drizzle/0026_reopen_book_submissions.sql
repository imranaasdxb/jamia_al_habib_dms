-- Run this entire statement as the Neon database owner after 0024 and 0025.
-- ADMIN is this project's Super Admin role. Existing flags and receipts are retained.
DO $reopen_setup$
DECLARE definition text; anchor text;
BEGIN
  ALTER TABLE public.book_returns ADD COLUMN IF NOT EXISTS reopened_at timestamptz;

  EXECUTE $definition$
CREATE OR REPLACE FUNCTION public.reopen_receipt_book(target uuid, expected_version integer, reopen_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $reopen$
DECLARE actor public.people; returned public.book_returns; assigned_case public.book_cases;
  target_book uuid; previous_return jsonb; tail public.leftover_books; updated_tail public.leftover_books;
BEGIN
  SELECT * INTO actor FROM public.people
    WHERE id = nullif(current_setting('app.person_id',true),'')::uuid
      AND auth_user_id::text = nullif(current_setting('app.auth_user_id',true),'')
      AND role = current_setting('app.role',true) AND role = 'ADMIN'
      AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_SUPER_ADMIN_ONLY' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(reopen_reason,''))) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'A reopen reason is required';
  END IF;
  SELECT book_id INTO target_book FROM public.book_returns WHERE id = target AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return unavailable'; END IF;
  -- Allocation locks the stock row first too, so an unused tail cannot be taken concurrently.
  PERFORM 1 FROM public.books WHERE id = target_book AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book unavailable'; END IF;
  SELECT * INTO returned FROM public.book_returns WHERE id = target AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return unavailable'; END IF;
  IF returned.finalized_at IS NULL THEN
    IF returned.submission_pending AND returned.reopened_at IS NOT NULL THEN RETURN; END IF;
    RAISE EXCEPTION 'Submission is not finalized';
  END IF;
  IF returned.receipt_entry_version <> expected_version THEN
    RAISE EXCEPTION 'Receipt book changed' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO assigned_case FROM public.book_cases
    WHERE id = returned.case_id AND book_id = returned.book_id
      AND assignment_id = returned.assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment unavailable'; END IF;
  PERFORM 1 FROM public.leftover_books WHERE return_id = target FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.book_cases other_case
       WHERE other_case.book_id = returned.book_id AND other_case.id <> returned.case_id AND other_case.closed_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.leftover_books used_tail WHERE used_tail.return_id = target
       AND (used_tail.status = 'ASSIGNED' OR EXISTS (
         SELECT 1 FROM public.book_cases next_case WHERE next_case.leftover_id = used_tail.id)))
    OR EXISTS (SELECT 1 FROM public.book_returns later_return
       WHERE later_return.book_id = returned.book_id AND later_return.id <> target
         AND later_return.deleted_at IS NULL AND later_return.created_at > returned.created_at
         AND later_return.receipt_from >= returned.receipt_from) THEN
    RAISE EXCEPTION 'RECEIPT_REOPEN_REASSIGNED';
  END IF;
  previous_return := to_jsonb(returned);
  FOR tail IN SELECT * FROM public.leftover_books WHERE return_id = target AND deleted_at IS NULL FOR UPDATE LOOP
    UPDATE public.leftover_books SET status = 'HELD', deleted_at = now(), updated_at = now(), updated_by = actor.id
      WHERE id = tail.id RETURNING * INTO updated_tail;
    INSERT INTO public.activity_log(actor_id,action,resource,record_id,old_values,new_values,reason,created_by,updated_by)
      VALUES(actor.id,'UPDATE','leftover_books',tail.id::text,to_jsonb(tail),to_jsonb(updated_tail),
        'Unused tail withdrawn while submission is reopened',actor.id,actor.id);
  END LOOP;
  UPDATE public.book_cases SET closed_at = NULL WHERE id = returned.case_id;
  UPDATE public.book_returns SET finalized_at = NULL, submission_pending = true,
    reopened_at = now(), receipt_entry_status = 'DRAFT', receipt_entry_version = receipt_entry_version + 1,
    updated_at = now(), updated_by = actor.id
    WHERE id = target RETURNING * INTO returned;
  UPDATE public.books SET status = 'ASSIGNED', updated_at = now(), updated_by = actor.id WHERE id = target_book;
  UPDATE public.book_assignments SET updated_at = now(), updated_by = actor.id WHERE id = returned.assignment_id;
  INSERT INTO public.activity_log(actor_id,action,resource,record_id,old_values,new_values,reason,created_by,updated_by)
    VALUES(actor.id,'REOPEN','book_returns',target::text,previous_return,to_jsonb(returned),btrim(reopen_reason),actor.id,actor.id);
END;
$reopen$;
$definition$;
  REVOKE ALL ON FUNCTION public.reopen_receipt_book(uuid,integer,text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.reopen_receipt_book(uuid,integer,text) TO dms_runtime;

  -- Extend the installed trigger without replacing its other validation.
  definition := pg_catalog.pg_get_functiondef('public.prepare_open_receipt_range()'::regprocedure);
  anchor := 'historical:=public.receipt_has_historical_import(returned.id);';
  IF position('historical:=public.receipt_has_historical_import(returned.id) OR returned.reopened_at IS NOT NULL;' IN definition) = 0 THEN
    IF position(anchor IN definition) = 0 THEN RAISE EXCEPTION 'Run 0024 first: open receipt range function differs'; END IF;
    definition := replace(definition,anchor,
      'historical:=public.receipt_has_historical_import(returned.id) OR returned.reopened_at IS NOT NULL;');
  END IF;
  IF position('RECEIPT_SUPER_ADMIN_ONLY' IN definition) = 0 THEN
    anchor := 'IF NOT FOUND THEN RAISE EXCEPTION ''Access denied''; END IF;';
    IF position(anchor IN definition) = 0 THEN RAISE EXCEPTION 'Open receipt actor guard differs'; END IF;
    definition := replace(definition,anchor,anchor || E'\n  IF returned.reopened_at IS NOT NULL AND actor.role <> ''ADMIN'' THEN RAISE EXCEPTION ''RECEIPT_SUPER_ADMIN_ONLY'' USING ERRCODE = ''42501''; END IF;');
  END IF;
  EXECUTE definition;
  REVOKE ALL ON FUNCTION public.prepare_open_receipt_range() FROM PUBLIC,dms_runtime;

  definition := pg_catalog.pg_get_functiondef('public.finalize_receipt_book(uuid,integer)'::regprocedure);
  IF position('RECEIPT_SUPER_ADMIN_ONLY' IN definition) = 0 THEN
    anchor := 'IF returned.finalized_at IS NOT NULL THEN RETURN; END IF;';
    IF position(anchor IN definition) = 0 THEN RAISE EXCEPTION 'Run 0024 first: finalize function differs'; END IF;
    definition := replace(definition,anchor,anchor || E'\n  IF returned.reopened_at IS NOT NULL AND actor.role <> ''ADMIN'' THEN RAISE EXCEPTION ''RECEIPT_SUPER_ADMIN_ONLY'' USING ERRCODE = ''42501''; END IF;');
  END IF;
  -- Re-finalizing updates the same unused tail instead of making a duplicate return_id.
  IF position('ON CONFLICT (return_id) DO UPDATE SET receipt_from = EXCLUDED.receipt_from' IN definition) = 0 THEN
    anchor := 'RETURNING * INTO leftover;';
    IF position(anchor IN definition) = 0 THEN RAISE EXCEPTION 'Run 0024 first: leftover finalization differs'; END IF;
    definition := replace(definition,anchor,
      'ON CONFLICT (return_id) DO UPDATE SET receipt_from = EXCLUDED.receipt_from, receipt_to = EXCLUDED.receipt_to,
        status = EXCLUDED.status, deleted_at = NULL, updated_at = now(), updated_by = EXCLUDED.updated_by
        WHERE public.leftover_books.status <> ''ASSIGNED''
        RETURNING * INTO leftover;');
  END IF;
  EXECUTE definition;
  REVOKE ALL ON FUNCTION public.finalize_receipt_book(uuid,integer) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.finalize_receipt_book(uuid,integer) TO dms_runtime;
END;
$reopen_setup$;
