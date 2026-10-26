-- Run this entire file as the database owner, through COMMIT, after 0023.
-- Keeps imported summaries distinct from checked physical receipts.
BEGIN;
CREATE INDEX IF NOT EXISTS legacy_collection_imports_receipt_idx
  ON public.legacy_collection_imports(receipt_id) WHERE receipt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS legacy_collection_imports_return_idx
  ON public.legacy_collection_imports(return_id) WHERE return_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.receipt_has_historical_import(target_return uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $historical$
  SELECT EXISTS (
    SELECT 1 FROM public.people viewer
    WHERE viewer.id = nullif(current_setting('app.person_id',true),'')::uuid
      AND viewer.auth_user_id::text = nullif(current_setting('app.auth_user_id',true),'')
      AND viewer.role = current_setting('app.role',true) AND viewer.role IN ('ADMIN','STAFF')
      AND viewer.status='ACTIVE' AND viewer.deleted_at IS NULL
  ) AND EXISTS (
    SELECT 1 FROM public.legacy_collection_imports imported
    WHERE imported.return_id=target_return AND imported.status='IMPORTED'
      AND imported.source_key LIKE 'Book3_v1:Sheet1:%'
  );
$historical$;

CREATE OR REPLACE FUNCTION public.receipt_is_imported_summary(target_receipt uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $summary$
  SELECT EXISTS (
    SELECT 1 FROM public.book_receipts receipt
    JOIN public.legacy_collection_imports imported ON imported.receipt_id=receipt.id
    WHERE receipt.id=target_receipt AND receipt.deleted_at IS NULL
      AND imported.status='IMPORTED' AND imported.source_key LIKE 'Book3_v1:Sheet1:%'
      AND imported.return_id=receipt.return_id AND imported.book_id=receipt.book_id
      AND imported.assumed_receipt_number=receipt.receipt_number
      AND receipt.version=1 AND receipt.status='VALID'
      AND receipt.data->>'status'='VALID' AND receipt.data->>'paymentMode'='CASH'
      AND receipt.amount_paise=(imported.source_data->>'Collection Amount')::numeric*100
      AND (receipt.data->>'amountPaise')::bigint=receipt.amount_paise
      AND public.receipt_has_historical_import(receipt.return_id)
  );
$summary$;
REVOKE ALL ON FUNCTION public.receipt_has_historical_import(uuid),public.receipt_is_imported_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receipt_has_historical_import(uuid),public.receipt_is_imported_summary(uuid) TO dms_runtime;

CREATE OR REPLACE FUNCTION public.prepare_open_receipt_range() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $open_range$
DECLARE
  actor public.people; returned public.book_returns; assigned_case public.book_cases;
  entry_day date; last_receipt integer; inferred_total bigint; inferred_cash bigint;
  inferred_digital bigint; new_amount bigint; historical boolean;
BEGIN
  IF TG_OP='UPDATE' AND (NEW.return_id<>OLD.return_id OR NEW.book_id<>OLD.book_id OR NEW.receipt_number<>OLD.receipt_number) THEN
    RAISE EXCEPTION 'Receipt identity is immutable';
  END IF;
  SELECT * INTO returned FROM public.book_returns WHERE id=NEW.return_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book unavailable'; END IF;
  -- Finalized corrections retain the existing approval and validation workflow.
  IF returned.finalized_at IS NOT NULL OR NOT returned.submission_pending THEN RETURN NEW; END IF;
  SELECT * INTO actor FROM public.people
    WHERE id=nullif(current_setting('app.person_id',true),'')::uuid
      AND auth_user_id::text=nullif(current_setting('app.auth_user_id',true),'')
      AND role=current_setting('app.role',true) AND role IN ('ADMIN','STAFF')
      AND status='ACTIVE' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO assigned_case FROM public.book_cases
    WHERE id=returned.case_id AND book_id=returned.book_id AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NEW.book_id<>returned.book_id OR NEW.receipt_number NOT BETWEEN assigned_case.receipt_from AND assigned_case.receipt_to THEN
    RAISE EXCEPTION 'Receipt outside assigned range';
  END IF;
  entry_day:=nullif(NEW.data->>'date','')::date;
  IF entry_day IS NOT NULL AND (entry_day<(SELECT assignment_date FROM public.book_assignments WHERE id=returned.assignment_id)
    OR entry_day>(now() AT TIME ZONE 'Asia/Kolkata')::date) THEN
    RAISE EXCEPTION 'Receipt date outside assignment and current date';
  END IF;
  last_receipt:=greatest(coalesce(returned.last_used,returned.receipt_from-1),NEW.receipt_number);
  historical:=public.receipt_has_historical_import(returned.id);
  inferred_total:=returned.total_paise; inferred_cash:=returned.cash_paise; inferred_digital:=returned.digital_paise;
  IF historical THEN
    -- Historical summaries have no separate declared budget for future collections.
    -- Derive this open draft's handover figures from saved receipts, not arbitrary limits.
    SELECT coalesce(sum(amount_paise),0),
      coalesce(sum(amount_paise) FILTER(WHERE data->>'paymentMode'='CASH'),0)
      INTO inferred_total,inferred_cash FROM public.book_receipts
      WHERE return_id=returned.id AND id<>NEW.id AND status='VALID' AND deleted_at IS NULL;
    new_amount:=CASE WHEN NEW.data->>'status'='VALID' THEN coalesce((NEW.data->>'amountPaise')::bigint,0) ELSE 0 END;
    inferred_total:=inferred_total+new_amount;
    IF NEW.data->>'paymentMode'='CASH' THEN inferred_cash:=inferred_cash+new_amount; END IF;
    inferred_digital:=inferred_total-inferred_cash;
    IF least(inferred_total,inferred_cash,inferred_digital)<0 OR greatest(inferred_total,inferred_cash,inferred_digital)>999999999999 THEN
      RAISE EXCEPTION 'RECEIPT_TOTAL_LIMIT';
    END IF;
  END IF;
  UPDATE public.book_returns SET last_used=last_receipt,receipts_used=last_receipt-receipt_from+1,
    outcome=CASE WHEN outcome='FLAGGED' THEN outcome WHEN last_receipt=receipt_to THEN 'CLOSED' ELSE 'PARTLY_USED' END,
    return_date=greatest(return_date,coalesce(entry_day,return_date)),
    total_paise=inferred_total,cash_paise=inferred_cash,digital_paise=inferred_digital,
    receipt_sum_paise=CASE WHEN historical THEN inferred_total ELSE receipt_sum_paise END,
    commission_given=CASE WHEN historical AND inferred_total>returned.total_paise THEN false ELSE commission_given END,
    updated_at=now(),updated_by=actor.id
    WHERE id=returned.id;
  RETURN NEW;
END;
$open_range$;
DROP TRIGGER IF EXISTS aa_open_receipt_range ON public.book_receipts;
CREATE TRIGGER aa_open_receipt_range BEFORE INSERT OR UPDATE ON public.book_receipts
  FOR EACH ROW EXECUTE FUNCTION public.prepare_open_receipt_range();
REVOKE ALL ON FUNCTION public.prepare_open_receipt_range() FROM PUBLIC,dms_runtime;

CREATE OR REPLACE FUNCTION public.finalize_receipt_book(target uuid, expected_version integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor public.people; returned public.book_returns; stock public.books; start_day date; receipt_row public.book_receipts;
  last_saved integer; missing_number integer; expected_count integer; saved_count integer; valid_total bigint; cash_total bigint; digital_total bigint; cheque_total bigint;
  issue boolean; result_status text; reason public.master_records; existing public.book_flags; recon_data jsonb; previous_return jsonb; next_ordinal integer; assignment public.book_assignments; leftover public.leftover_books;
BEGIN
  SELECT * INTO actor FROM public.people WHERE id = nullif(current_setting('app.person_id',true),'')::uuid
    AND auth_user_id = nullif(current_setting('app.auth_user_id',true),'')::uuid AND role = current_setting('app.role',true)
    AND role IN ('ADMIN','STAFF') AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO returned FROM public.book_returns WHERE id = target AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return unavailable'; END IF;
  IF returned.finalized_at IS NOT NULL THEN RETURN; END IF;
  IF returned.receipt_entry_version <> expected_version THEN RAISE EXCEPTION 'Receipt book changed' USING ERRCODE = '40001'; END IF;
  previous_return := to_jsonb(returned);
  SELECT * INTO stock FROM public.books WHERE id = returned.book_id;
  SELECT assignment_date INTO start_day FROM public.book_assignments WHERE id = returned.assignment_id;
  -- Closing a partly used book needs only its saved, consumed prefix, not all 50 pages.
  SELECT max(receipt_number),count(*) INTO last_saved,saved_count
    FROM public.book_receipts WHERE return_id=target AND deleted_at IS NULL;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(returned.exceptions) recorded_exception
    WHERE (recorded_exception->>'receiptNumber')::integer>coalesce(last_saved,returned.receipt_from-1)) THEN
    RAISE EXCEPTION 'Enter the recorded receipt exceptions before finalizing';
  END IF;
  expected_count:=CASE WHEN last_saved IS NULL THEN 0 ELSE last_saved-returned.receipt_from+1 END;
  IF last_saved IS NOT NULL AND last_saved NOT BETWEEN returned.receipt_from AND returned.receipt_to THEN
    RAISE EXCEPTION 'Receipt outside assigned range';
  END IF;
  IF saved_count<>expected_count THEN
    SELECT missing.number INTO missing_number FROM generate_series(returned.receipt_from,last_saved) missing(number)
      WHERE NOT EXISTS (SELECT 1 FROM public.book_receipts present
        WHERE present.return_id=target AND present.receipt_number=missing.number AND present.deleted_at IS NULL)
      ORDER BY missing.number LIMIT 1;
    RAISE EXCEPTION 'Incomplete receipt %',missing_number USING ERRCODE='P0002';
  END IF;
  UPDATE public.book_returns SET last_used=last_saved,receipts_used=expected_count,
    outcome=CASE WHEN outcome='FLAGGED' THEN outcome
      WHEN expected_count=receipt_to-receipt_from+1 THEN 'CLOSED' ELSE 'PARTLY_USED' END
    WHERE id=target RETURNING * INTO returned;
  FOR receipt_row IN SELECT * FROM public.book_receipts WHERE return_id=target AND deleted_at IS NULL ORDER BY receipt_number LOOP
    IF public.receipt_is_imported_summary(receipt_row.id) THEN
      -- Preserve the original unverified summary; do not pretend it was physically checked.
      CONTINUE;
    END IF;
    IF NOT receipt_row.checked THEN RAISE EXCEPTION 'Incomplete receipt %',receipt_row.receipt_number USING ERRCODE='P0002'; END IF;
    BEGIN PERFORM public.validate_receipt_data(receipt_row.data,true,start_day,returned.return_date,stock.token_value_paise);
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Incomplete receipt %',receipt_row.receipt_number USING ERRCODE='P0002'; END;
  END LOOP;
  SELECT coalesce(sum(amount_paise) FILTER (WHERE status = 'VALID'),0),
    coalesce(sum(amount_paise) FILTER (WHERE status = 'VALID' AND data->>'paymentMode' = 'CASH'),0),
    coalesce(sum(amount_paise) FILTER (WHERE status = 'VALID' AND data->>'paymentMode' = 'DIGITAL'),0),
    coalesce(sum(amount_paise) FILTER (WHERE status = 'VALID' AND data->>'paymentMode' = 'CHEQUE'),0)
    INTO valid_total, cash_total, digital_total, cheque_total FROM public.book_receipts WHERE return_id = target AND deleted_at IS NULL;
  issue := EXISTS (SELECT 1 FROM public.receipt_issues WHERE return_id = target AND status = 'OPEN') OR valid_total <> returned.total_paise OR valid_total <> returned.receipt_sum_paise OR cash_total <> returned.cash_paise
    OR digital_total <> returned.digital_paise OR cheque_total > 0 OR expected_count <> returned.receipts_used
    OR EXISTS (SELECT 1 FROM public.book_receipts WHERE return_id = target AND status IN ('TORN','LOST','BLANK') AND deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(returned.exceptions) e LEFT JOIN public.book_receipts r
      ON r.return_id = target AND r.receipt_number = (e.value->>'receiptNumber')::integer WHERE r.status IS DISTINCT FROM e.value->>'status');
  recon_data := jsonb_build_object('expectedTotal',returned.total_paise,'foundTotal',valid_total,'expectedCash',returned.cash_paise,
    'foundCash',cash_total,'expectedDigital',returned.digital_paise,'foundDigital',digital_total,'cheque',cheque_total,
    'reportedUsed',returned.receipts_used,'entered',saved_count,'historicalSummaries',(SELECT count(*) FROM public.book_receipts imported_receipt WHERE imported_receipt.return_id=target AND imported_receipt.deleted_at IS NULL AND public.receipt_is_imported_summary(imported_receipt.id)),'checkedBy',actor.id,'checkedAt',now());
  SELECT * INTO existing FROM public.book_flags WHERE return_id = target FOR UPDATE;
  IF issue THEN
    IF existing.id IS NULL THEN
      SELECT * INTO reason FROM public.master_records WHERE kind = 'FLAG_REASON' AND code = 'RECEIPT_RECONCILIATION';
      IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation reason missing'; END IF;
      INSERT INTO public.book_flags(return_id,book_id,collector_id,reason_id,reason_en,reason_ur,expected_paise,found_paise,remarks,reconciliation,created_by,updated_by)
        SELECT target,returned.book_id,collector_id,reason.id,reason.name_en,reason.name_ur,returned.total_paise,valid_total,
          'Receipt entry totals or receipt statuses require review',recon_data,actor.id,actor.id FROM public.book_assignments WHERE id = returned.assignment_id;
    ELSE
      UPDATE public.book_flags SET reconciliation = recon_data, status = CASE WHEN status = 'RESOLVED' THEN 'OPEN' ELSE status END,
        updated_at = now(), updated_by = actor.id WHERE id = existing.id;
    END IF;
    INSERT INTO public.activity_log(actor_id,action,resource,record_id,old_values,new_values,reason,created_by,updated_by)
      SELECT actor.id,CASE WHEN existing.id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,'book_flags',f.id::text,
        CASE WHEN existing.id IS NULL THEN NULL ELSE to_jsonb(existing) END,to_jsonb(f),'Receipt reconciliation linked to flag',actor.id,actor.id
        FROM public.book_flags f WHERE f.return_id = target;
    UPDATE public.leftover_books SET status = 'HELD',updated_at = now(),updated_by = actor.id WHERE book_id = returned.book_id AND status = 'AVAILABLE';
    UPDATE public.books SET status = 'FLAGGED',updated_at = now(),updated_by = actor.id WHERE id = returned.book_id
      AND NOT EXISTS (SELECT 1 FROM public.book_cases WHERE book_id = returned.book_id AND closed_at IS NULL);
  END IF;
  result_status := CASE WHEN issue OR EXISTS (SELECT 1 FROM public.book_flags WHERE return_id = target AND status <> 'RESOLVED' AND deleted_at IS NULL) THEN 'FLAGGED' ELSE 'RECONCILED' END;
  IF returned.submission_pending THEN
    SELECT * INTO stock FROM public.books WHERE id = returned.book_id FOR UPDATE;
    SELECT * INTO assignment FROM public.book_assignments WHERE id = returned.assignment_id;
    UPDATE public.book_cases SET closed_at = now() WHERE id = returned.case_id AND closed_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assignment is no longer open'; END IF;
    UPDATE public.books SET status = CASE WHEN result_status = 'FLAGGED' THEN 'FLAGGED' WHEN returned.remaining_receipts > 0 THEN 'PARTLY_USED' ELSE 'CLOSED' END,
      updated_at = now(), updated_by = actor.id WHERE id = returned.book_id;
    UPDATE public.book_assignments SET updated_at = now(),updated_by = actor.id WHERE id = returned.assignment_id;
    IF returned.remaining_receipts > 0 THEN
      SELECT coalesce(max(ordinal),0) + 1 INTO next_ordinal FROM public.leftover_books WHERE book_id = returned.book_id;
      INSERT INTO public.leftover_books(book_id,return_id,returned_by,code,ordinal,receipt_from,receipt_to,status,created_by,updated_by)
        VALUES(returned.book_id,target,assignment.collector_id,returned.book_number || '-B' || next_ordinal::text,next_ordinal,
          coalesce(returned.last_used + 1,returned.receipt_from),returned.receipt_to,CASE WHEN result_status = 'FLAGGED' THEN 'HELD' ELSE 'AVAILABLE' END,actor.id,actor.id)
        RETURNING * INTO leftover;
      INSERT INTO public.activity_log(actor_id,action,resource,record_id,new_values,reason,created_by,updated_by)
        VALUES(actor.id,'INSERT','leftover_books',leftover.id::text,to_jsonb(leftover),'Submission finalized; only unused tail retained',actor.id,actor.id);
    END IF;
  END IF;
  IF result_status = 'RECONCILED' AND NOT EXISTS(SELECT 1 FROM public.book_flags WHERE book_id = returned.book_id AND status <> 'RESOLVED' AND deleted_at IS NULL) THEN
    UPDATE public.leftover_books SET status = 'AVAILABLE', updated_at = now(), updated_by = actor.id WHERE return_id = target AND status = 'HELD';
  END IF;
  UPDATE public.book_returns SET submission_pending = false, receipt_entry_status = result_status,finalized_at = now(),receipt_entry_version = receipt_entry_version + 1,
    updated_at = now(),updated_by = actor.id WHERE id = target;
  INSERT INTO public.activity_log(actor_id,action,resource,record_id,old_values,new_values,reason,created_by,updated_by)
    VALUES (actor.id,'FINALIZE','book_returns',target::text,previous_return,recon_data || jsonb_build_object('status',result_status),'Receipt book finalized',actor.id,actor.id);
END $$;
REVOKE ALL ON FUNCTION public.finalize_receipt_book(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_receipt_book(uuid,integer) TO dms_runtime;
COMMIT;
