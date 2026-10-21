-- Run the entire file manually after 0007_book_returns.sql.
BEGIN;
ALTER TABLE public.book_assignments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'NEW';
ALTER TABLE public.book_assignments ADD COLUMN IF NOT EXISTS leftover_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.book_cases ADD COLUMN IF NOT EXISTS receipt_from integer;
ALTER TABLE public.book_cases ADD COLUMN IF NOT EXISTS receipt_to integer;
ALTER TABLE public.book_cases ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'NEW';
ALTER TABLE public.book_cases ADD COLUMN IF NOT EXISTS source_code text NOT NULL DEFAULT '';
ALTER TABLE public.book_cases ADD COLUMN IF NOT EXISTS leftover_id uuid REFERENCES public.leftover_books(id) ON DELETE RESTRICT;
UPDATE public.book_cases c SET receipt_from = b.receipt_from, receipt_to = b.receipt_to FROM public.books b
  WHERE b.id = c.book_id AND (c.receipt_from IS NULL OR c.receipt_to IS NULL);
UPDATE public.book_cases c SET source_code = b.book_number FROM public.books b WHERE b.id = c.book_id AND c.source_code = '';
ALTER TABLE public.book_cases ALTER COLUMN receipt_from SET NOT NULL;
ALTER TABLE public.book_cases ALTER COLUMN receipt_to SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS book_cases_leftover_idx ON public.book_cases(leftover_id) WHERE leftover_id IS NOT NULL;
ALTER TABLE public.book_returns ADD COLUMN IF NOT EXISTS source_code text NOT NULL DEFAULT '';
UPDATE public.book_returns r SET source_code = c.source_code FROM public.book_cases c WHERE c.id = r.case_id AND r.source_code = '';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.book_assignments'::regclass AND conname = 'assignment_source_check') THEN
    ALTER TABLE public.book_assignments ADD CONSTRAINT assignment_source_check CHECK (jsonb_typeof(leftover_ids) = 'array'
      AND ((source = 'NEW' AND jsonb_array_length(leftover_ids) = 0)
        OR (source = 'LEFTOVER' AND jsonb_array_length(leftover_ids) BETWEEN 1 AND 150 AND jsonb_array_length(leftover_ids) = jsonb_array_length(book_ids))));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.book_cases'::regclass AND conname = 'book_case_source_check') THEN
    ALTER TABLE public.book_cases ADD CONSTRAINT book_case_source_check CHECK (receipt_from > 0 AND receipt_to >= receipt_from AND length(source_code) > 0
      AND ((source = 'NEW' AND leftover_id IS NULL) OR (source = 'LEFTOVER' AND leftover_id IS NOT NULL)));
  END IF;
END $$;

-- Existing assignment authentication, active Fundraiser and area guards remain in place.
-- Only this allocation trigger can write cases, stock status or leftover availability.
CREATE OR REPLACE FUNCTION public.allocate_assignment_books() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE stock public.books; leftover public.leftover_books; prior_return public.book_returns;
  found_count integer := 0; selected_count integer; range_from integer; range_to integer; item_code text;
BEGIN
  IF NEW.source = 'LEFTOVER' THEN
    IF current_setting('app.role', true) <> 'ADMIN' THEN RAISE EXCEPTION 'Only Admin can reassign leftovers' USING ERRCODE = '42501'; END IF;
    IF jsonb_typeof(NEW.leftover_ids) <> 'array' OR jsonb_array_length(NEW.leftover_ids) <> jsonb_array_length(NEW.book_ids)
      OR (SELECT count(DISTINCT value::uuid) FROM jsonb_array_elements_text(NEW.leftover_ids)) <> jsonb_array_length(NEW.leftover_ids)
      THEN RAISE EXCEPTION 'Invalid leftover selection'; END IF;
  ELSIF NEW.source <> 'NEW' OR NEW.leftover_ids <> '[]'::jsonb THEN RAISE EXCEPTION 'Invalid source'; END IF;
  FOR stock IN SELECT * FROM public.books WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(NEW.book_ids)) ORDER BY id FOR UPDATE LOOP
    IF stock.deleted_at IS NOT NULL OR stock.stock_date > NEW.assignment_date THEN RAISE EXCEPTION 'Book unavailable for this date'; END IF;
    IF EXISTS (SELECT 1 FROM public.book_cases WHERE book_id = stock.id AND closed_at IS NULL) THEN RAISE EXCEPTION 'Book already assigned'; END IF;
    IF NEW.source = 'NEW' THEN
      IF stock.status <> 'IN_STOCK' THEN RAISE EXCEPTION 'Book is no longer in main stock'; END IF;
      range_from := stock.receipt_from; range_to := stock.receipt_to; item_code := stock.book_number;
      INSERT INTO public.book_cases(assignment_id, book_id, receipt_from, receipt_to, source, source_code)
        VALUES (NEW.id, stock.id, range_from, range_to, 'NEW', item_code);
    ELSE
      IF stock.status <> 'PARTLY_USED' OR EXISTS (SELECT 1 FROM public.book_flags WHERE book_id = stock.id AND status <> 'RESOLVED' AND deleted_at IS NULL)
        THEN RAISE EXCEPTION 'Book has an unresolved issue or is unavailable'; END IF;
      SELECT count(*) INTO selected_count FROM public.leftover_books WHERE book_id = stock.id
        AND id IN (SELECT value::uuid FROM jsonb_array_elements_text(NEW.leftover_ids));
      IF selected_count <> 1 THEN RAISE EXCEPTION 'Select exactly one leftover range per original book'; END IF;
      SELECT * INTO leftover FROM public.leftover_books WHERE book_id = stock.id
        AND id IN (SELECT value::uuid FROM jsonb_array_elements_text(NEW.leftover_ids)) FOR UPDATE;
      IF NOT FOUND OR leftover.status <> 'AVAILABLE' OR leftover.deleted_at IS NOT NULL OR leftover.returned_by = NEW.collector_id
        THEN RAISE EXCEPTION 'Leftover unavailable or same Fundraiser selected'; END IF;
      SELECT * INTO prior_return FROM public.book_returns WHERE id = leftover.return_id AND book_id = stock.id AND deleted_at IS NULL;
      IF NOT FOUND OR prior_return.outcome <> 'PARTLY_USED' OR NEW.assignment_date < prior_return.return_date
        OR leftover.receipt_from <> coalesce(prior_return.last_used + 1, prior_return.receipt_from)
        OR leftover.receipt_to <> prior_return.receipt_to OR leftover.receipt_from < stock.receipt_from OR leftover.receipt_to > stock.receipt_to
        OR EXISTS (SELECT 1 FROM public.book_returns WHERE book_id = stock.id AND created_at > prior_return.created_at AND deleted_at IS NULL)
        THEN RAISE EXCEPTION 'Leftover receipt range changed'; END IF;
      range_from := leftover.receipt_from; range_to := leftover.receipt_to; item_code := leftover.code;
      INSERT INTO public.book_cases(assignment_id, book_id, receipt_from, receipt_to, source, source_code, leftover_id)
        VALUES (NEW.id, stock.id, range_from, range_to, 'LEFTOVER', item_code, leftover.id);
      UPDATE public.leftover_books SET status = 'ASSIGNED', updated_by = NEW.created_by, updated_at = now() WHERE id = leftover.id;
      INSERT INTO public.activity_log(actor_id, action, resource, record_id, old_values, new_values, reason, created_by, updated_by)
        VALUES (NEW.created_by, 'UPDATE', 'leftover_books', leftover.id::text, to_jsonb(leftover),
          to_jsonb(leftover) || jsonb_build_object('status','ASSIGNED','assignmentId',NEW.id), 'Unused receipts reassigned', NEW.created_by, NEW.created_by);
    END IF;
    UPDATE public.books SET status = CASE WHEN NEW.source = 'NEW' THEN 'ASSIGNED' ELSE 'LEFTOVER_ASSIGNED' END,
      updated_by = NEW.created_by, updated_at = now() WHERE id = stock.id;
    found_count := found_count + 1;
  END LOOP;
  IF found_count <> jsonb_array_length(NEW.book_ids) THEN RAISE EXCEPTION 'Book selection changed'; END IF;
  INSERT INTO public.activity_log(actor_id, action, resource, record_id, new_values, reason, created_by, updated_by)
    VALUES (NEW.created_by, 'INSERT', 'book_assignments', NEW.id::text, to_jsonb(NEW), 'Book assignment', NEW.created_by, NEW.created_by);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.allocate_assignment_books() FROM PUBLIC, dms_runtime;

-- Every return is validated against its assigned range, never against earlier used receipts.
CREATE OR REPLACE FUNCTION public.prepare_book_return() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor public.people; current_case public.book_cases; stock public.books; assignment public.book_assignments;
  item jsonb; reason public.master_records; canonical jsonb := '[]'::jsonb; consumed integer; matched boolean; number_used integer; assigned_count integer;
BEGIN
  SELECT * INTO actor FROM public.people WHERE id = nullif(current_setting('app.person_id', true), '')::uuid
    AND auth_user_id = nullif(current_setting('app.auth_user_id', true), '')::uuid AND role IN ('ADMIN','STAFF')
    AND role = current_setting('app.role', true) AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO current_case FROM public.book_cases WHERE id = NEW.case_id AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book already returned or case unavailable'; END IF;
  SELECT * INTO stock FROM public.books WHERE id = current_case.book_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR stock.status NOT IN ('ASSIGNED','LEFTOVER_ASSIGNED') THEN RAISE EXCEPTION 'Book is not with a Fundraiser'; END IF;
  SELECT * INTO assignment FROM public.book_assignments WHERE id = current_case.assignment_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NEW.return_date < assignment.assignment_date OR NEW.return_date > (now() AT TIME ZONE 'Asia/Kolkata')::date
    THEN RAISE EXCEPTION 'Invalid return date'; END IF;
  IF current_case.receipt_from < stock.receipt_from OR current_case.receipt_to > stock.receipt_to THEN RAISE EXCEPTION 'Invalid assigned range'; END IF;
  NEW.book_id := stock.id; NEW.assignment_id := assignment.id; NEW.book_number := stock.book_number; NEW.collector_name := assignment.collector_name;
  NEW.source_code := current_case.source_code; NEW.receipt_from := current_case.receipt_from; NEW.receipt_to := current_case.receipt_to;
  assigned_count := NEW.receipt_to - NEW.receipt_from + 1;
  IF NEW.last_used IS NOT NULL AND NEW.last_used NOT BETWEEN NEW.receipt_from AND NEW.receipt_to THEN RAISE EXCEPTION 'Last receipt outside assigned range'; END IF;
  IF NEW.last_used IS NULL AND NEW.receipts_used <> 0 THEN RAISE EXCEPTION 'Last used receipt is required'; END IF;
  IF jsonb_typeof(NEW.exceptions) <> 'array' OR jsonb_array_length(NEW.exceptions) > 1000
    OR jsonb_array_length(NEW.exceptions) > NEW.receipts_used THEN RAISE EXCEPTION 'Invalid receipt exceptions'; END IF;
  IF (SELECT count(DISTINCT (value->>'receiptNumber')::integer) FROM jsonb_array_elements(NEW.exceptions)) <> jsonb_array_length(NEW.exceptions)
    THEN RAISE EXCEPTION 'Duplicate receipt exception'; END IF;
  PERFORM 1 FROM public.master_records WHERE id IN (SELECT (value->>'reasonId')::uuid FROM jsonb_array_elements(NEW.exceptions)) ORDER BY id FOR SHARE;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.exceptions) LOOP
    number_used := (item->>'receiptNumber')::integer;
    IF NEW.last_used IS NULL OR number_used IS NULL OR number_used NOT BETWEEN NEW.receipt_from AND NEW.last_used
      OR coalesce(item->>'status','') NOT IN ('CANCELLED','TORN','LOST') THEN RAISE EXCEPTION 'Invalid receipt exception'; END IF;
    SELECT * INTO reason FROM public.master_records WHERE id = (item->>'reasonId')::uuid AND kind = 'RECEIPT_REASON' AND active AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Select an active receipt reason'; END IF;
    canonical := canonical || jsonb_build_array(jsonb_build_object('receiptNumber', number_used, 'status', item->>'status',
      'reasonId', reason.id, 'reasonEn', reason.name_en, 'reasonUr', reason.name_ur));
  END LOOP;
  NEW.exceptions := canonical;
  consumed := CASE WHEN NEW.last_used IS NULL THEN 0 ELSE NEW.last_used - NEW.receipt_from + 1 END;
  matched := NEW.total_paise = NEW.receipt_sum_paise AND NEW.receipts_used = consumed
    AND ((NEW.total_paise = 0 AND NEW.receipt_sum_paise = 0) OR (consumed > 0 AND NEW.receipts_used > 0))
    AND (stock.book_type = 'REGULAR' OR NEW.receipt_sum_paise = (NEW.receipts_used::bigint - jsonb_array_length(canonical)) * stock.token_value_paise)
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(canonical) WHERE value->>'status' IN ('TORN','LOST'));
  IF NEW.outcome <> 'FLAGGED' AND NOT matched THEN RAISE EXCEPTION 'Mismatch requires a flag'; END IF;
  IF NEW.outcome = 'CLOSED' AND consumed <> assigned_count THEN RAISE EXCEPTION 'Unused receipts require partly used outcome'; END IF;
  IF NEW.outcome = 'PARTLY_USED' AND consumed >= assigned_count THEN RAISE EXCEPTION 'No receipts remain'; END IF;
  IF NEW.outcome = 'FLAGGED' THEN
    SELECT * INTO reason FROM public.master_records WHERE id = NEW.flag_reason_id AND kind = 'FLAG_REASON' AND active AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Select an active flag reason'; END IF;
    NEW.flag_reason_en := reason.name_en; NEW.flag_reason_ur := reason.name_ur;
  ELSE NEW.flag_reason_en := ''; NEW.flag_reason_ur := ''; END IF;
  NEW.checked_by_name := actor.full_name; NEW.created_by := actor.id; NEW.updated_by := actor.id;
  NEW.created_at := now(); NEW.updated_at := now(); NEW.deleted_at := NULL; NEW.receipt_entry_status := 'PENDING';
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.prepare_book_return() FROM PUBLIC, dms_runtime;

CREATE OR REPLACE FUNCTION public.audit_book_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.activity_log(actor_id, action, resource, record_id, old_values, new_values, reason)
  VALUES (nullif(current_setting('app.person_id', true), '')::uuid, TG_OP, 'books', NEW.id::text,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW),
    CASE WHEN TG_OP = 'INSERT' THEN 'Book stock entry' WHEN NEW.status IN ('ASSIGNED','LEFTOVER_ASSIGNED') THEN 'Book assignment'
      WHEN NEW.status IN ('CLOSED','PARTLY_USED','FLAGGED') THEN 'Book return check' ELSE 'Book status change' END);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_book_stock() FROM PUBLIC;
COMMIT;
