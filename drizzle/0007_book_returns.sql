-- Run this entire file manually after 0006_book_assignments.sql.
BEGIN;
CREATE SEQUENCE IF NOT EXISTS public.return_number_seq;
CREATE TABLE IF NOT EXISTS public.book_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE DEFAULT ('RET-' || extract(year from current_date)::text || '-' || lpad(nextval('public.return_number_seq')::text, 6, '0')),
  case_id uuid NOT NULL UNIQUE REFERENCES public.book_cases(id) ON DELETE RESTRICT,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES public.book_assignments(id) ON DELETE RESTRICT,
  book_number text NOT NULL, collector_name text NOT NULL, return_date date NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('CLOSED','PARTLY_USED','FLAGGED')),
  total_paise bigint NOT NULL, cash_paise bigint NOT NULL, digital_paise bigint NOT NULL, receipt_sum_paise bigint NOT NULL,
  receipt_from integer NOT NULL CHECK (receipt_from > 0), receipt_to integer NOT NULL CHECK (receipt_to >= receipt_from),
  receipts_used integer NOT NULL CHECK (receipts_used >= 0), last_used integer,
  remaining_receipts integer GENERATED ALWAYS AS (CASE WHEN last_used IS NULL THEN receipt_to - receipt_from + 1 ELSE receipt_to - last_used END) STORED NOT NULL,
  commission_basis_points integer NOT NULL CHECK (commission_basis_points BETWEEN 0 AND 10000),
  commission_paise bigint GENERATED ALWAYS AS (round(total_paise::numeric * commission_basis_points / 1000000) * 100) STORED NOT NULL,
  net_paise bigint GENERATED ALWAYS AS (total_paise - round(total_paise::numeric * commission_basis_points / 1000000) * 100) STORED NOT NULL,
  cash_handover_paise bigint GENERATED ALWAYS AS (cash_paise - round(total_paise::numeric * commission_basis_points / 1000000) * 100) STORED NOT NULL,
  commission_given boolean NOT NULL DEFAULT false,
  exceptions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(exceptions) = 'array' AND jsonb_array_length(exceptions) <= 1000),
  flag_reason_id uuid REFERENCES public.master_records(id) ON DELETE RESTRICT, flag_reason_en text NOT NULL DEFAULT '', flag_reason_ur text NOT NULL DEFAULT '', expected_paise bigint, found_paise bigint,
  remarks text NOT NULL DEFAULT '' CHECK (length(remarks) <= 1000), checked_by_name text NOT NULL,
  receipt_entry_status text NOT NULL DEFAULT 'PENDING' CHECK (receipt_entry_status IN ('PENDING','DRAFT','RECONCILED','FLAGGED')),
  operation_id uuid NOT NULL UNIQUE, operation_hash text NOT NULL CHECK (operation_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT, deleted_at timestamptz,
  CHECK (least(total_paise, cash_paise, digital_paise, receipt_sum_paise) >= 0
    AND greatest(total_paise, cash_paise, digital_paise, receipt_sum_paise) <= 999999999999),
  CHECK (cash_paise + digital_paise = total_paise), CHECK (net_paise >= 0),
  CHECK (last_used IS NULL OR last_used BETWEEN receipt_from AND receipt_to),
  CHECK (receipts_used <= receipt_to - receipt_from + 1),
  CHECK ((outcome = 'FLAGGED' AND flag_reason_id IS NOT NULL AND expected_paise IS NOT NULL AND found_paise IS NOT NULL
      AND expected_paise BETWEEN 0 AND 999999999999 AND found_paise BETWEEN 0 AND 999999999999 AND length(btrim(remarks)) > 0)
    OR (outcome <> 'FLAGGED' AND flag_reason_id IS NULL AND expected_paise IS NULL AND found_paise IS NULL))
);
CREATE TABLE IF NOT EXISTS public.book_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), return_id uuid NOT NULL UNIQUE REFERENCES public.book_returns(id) ON DELETE RESTRICT,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT, collector_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  reason_id uuid NOT NULL REFERENCES public.master_records(id) ON DELETE RESTRICT, reason_en text NOT NULL, reason_ur text NOT NULL,
  expected_paise bigint NOT NULL CHECK (expected_paise BETWEEN 0 AND 999999999999), found_paise bigint NOT NULL CHECK (found_paise BETWEEN 0 AND 999999999999),
  difference_paise bigint GENERATED ALWAYS AS (expected_paise - found_paise) STORED NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','RESOLVED')), remarks text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT, deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.leftover_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
  return_id uuid NOT NULL UNIQUE REFERENCES public.book_returns(id) ON DELETE RESTRICT, returned_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE, ordinal integer NOT NULL CHECK (ordinal > 0), receipt_from integer NOT NULL CHECK (receipt_from > 0),
  receipt_to integer NOT NULL CHECK (receipt_to >= receipt_from), status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','ASSIGNED','HELD')),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT, deleted_at timestamptz,
  UNIQUE(book_id, ordinal)
);
CREATE INDEX IF NOT EXISTS book_returns_book_idx ON public.book_returns(book_id);
CREATE INDEX IF NOT EXISTS book_returns_queue_idx ON public.book_returns(receipt_entry_status, created_at);
CREATE INDEX IF NOT EXISTS book_flags_status_idx ON public.book_flags(status, created_at);
CREATE INDEX IF NOT EXISTS leftover_books_status_idx ON public.leftover_books(status, book_id);
ALTER TABLE public.book_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_returns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.book_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_flags FORCE ROW LEVEL SECURITY;
ALTER TABLE public.leftover_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leftover_books FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.book_returns, public.book_flags, public.leftover_books FROM PUBLIC, dms_runtime;
GRANT SELECT, INSERT ON public.book_returns TO dms_runtime;
GRANT SELECT ON public.book_flags, public.leftover_books TO dms_runtime;
GRANT USAGE ON SEQUENCE public.return_number_seq TO dms_runtime;
DROP POLICY IF EXISTS returns_read ON public.book_returns;
CREATE POLICY returns_read ON public.book_returns FOR SELECT TO dms_runtime USING (current_setting('app.role', true) IN ('ADMIN','STAFF'));
DROP POLICY IF EXISTS returns_create ON public.book_returns;
CREATE POLICY returns_create ON public.book_returns FOR INSERT TO dms_runtime WITH CHECK (
  current_setting('app.role', true) IN ('ADMIN','STAFF') AND created_by::text = current_setting('app.person_id', true)
  AND created_by = updated_by AND deleted_at IS NULL AND receipt_entry_status = 'PENDING');
DROP POLICY IF EXISTS flags_read ON public.book_flags;
CREATE POLICY flags_read ON public.book_flags FOR SELECT TO dms_runtime USING (current_setting('app.role', true) IN ('ADMIN','STAFF'));
DROP POLICY IF EXISTS leftovers_read ON public.leftover_books;
CREATE POLICY leftovers_read ON public.leftover_books FOR SELECT TO dms_runtime USING (current_setting('app.role', true) = 'ADMIN');
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY['book_returns','book_flags','leftover_books'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS owner_maintenance ON public.%I', target);
    EXECUTE format('CREATE POLICY owner_maintenance ON public.%I TO %I USING (true) WITH CHECK (true)', target, current_user);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.prepare_book_return() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor public.people; current_case public.book_cases; stock public.books; assignment public.book_assignments;
  item jsonb; reason public.master_records; canonical jsonb := '[]'::jsonb; consumed integer; matched boolean; number_used integer;
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
  NEW.book_id := stock.id; NEW.assignment_id := assignment.id; NEW.book_number := stock.book_number; NEW.collector_name := assignment.collector_name;
  NEW.receipt_from := stock.receipt_from; NEW.receipt_to := stock.receipt_to;
  IF NEW.last_used IS NOT NULL AND NEW.last_used NOT BETWEEN NEW.receipt_from AND NEW.receipt_to THEN RAISE EXCEPTION 'Last receipt outside book range'; END IF;
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
  IF NEW.outcome = 'CLOSED' AND consumed <> stock.total_receipts THEN RAISE EXCEPTION 'Unused receipts require partly used outcome'; END IF;
  IF NEW.outcome = 'PARTLY_USED' AND consumed >= stock.total_receipts THEN RAISE EXCEPTION 'No receipts remain'; END IF;
  IF NEW.outcome = 'FLAGGED' THEN
    SELECT * INTO reason FROM public.master_records WHERE id = NEW.flag_reason_id AND kind = 'FLAG_REASON' AND active AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Select an active flag reason'; END IF;
    NEW.flag_reason_en := reason.name_en; NEW.flag_reason_ur := reason.name_ur;
  ELSE
    NEW.flag_reason_en := ''; NEW.flag_reason_ur := '';
  END IF;
  NEW.checked_by_name := actor.full_name; NEW.created_by := actor.id; NEW.updated_by := actor.id;
  NEW.created_at := now(); NEW.updated_at := now(); NEW.deleted_at := NULL; NEW.receipt_entry_status := 'PENDING';
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.finish_book_return() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE assignment public.book_assignments; reason public.master_records; next_ordinal integer; flag public.book_flags; leftover public.leftover_books;
BEGIN
  SELECT * INTO assignment FROM public.book_assignments WHERE id = NEW.assignment_id;
  UPDATE public.book_cases SET closed_at = now() WHERE id = NEW.case_id AND closed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book already returned'; END IF;
  UPDATE public.books SET status = NEW.outcome, updated_at = now(), updated_by = NEW.created_by WHERE id = NEW.book_id;
  UPDATE public.book_assignments SET updated_at = now(), updated_by = NEW.created_by WHERE id = NEW.assignment_id;
  IF NEW.outcome = 'FLAGGED' THEN
    SELECT * INTO reason FROM public.master_records WHERE id = NEW.flag_reason_id;
    INSERT INTO public.book_flags(return_id, book_id, collector_id, reason_id, reason_en, reason_ur, expected_paise, found_paise, remarks, created_by, updated_by)
      VALUES (NEW.id, NEW.book_id, assignment.collector_id, reason.id, reason.name_en, reason.name_ur, NEW.expected_paise, NEW.found_paise, NEW.remarks, NEW.created_by, NEW.created_by)
      RETURNING * INTO flag;
    INSERT INTO public.activity_log(actor_id, action, resource, record_id, new_values, reason, created_by, updated_by)
      VALUES (NEW.created_by, 'INSERT', 'book_flags', flag.id::text, to_jsonb(flag), NEW.remarks, NEW.created_by, NEW.created_by);
  ELSIF NEW.outcome = 'PARTLY_USED' THEN
    SELECT coalesce(max(ordinal), 0) + 1 INTO next_ordinal FROM public.leftover_books WHERE book_id = NEW.book_id;
    INSERT INTO public.leftover_books(book_id, return_id, returned_by, code, ordinal, receipt_from, receipt_to, created_by, updated_by)
      VALUES (NEW.book_id, NEW.id, assignment.collector_id, NEW.book_number || '-B' || next_ordinal::text, next_ordinal,
        coalesce(NEW.last_used + 1, NEW.receipt_from), NEW.receipt_to, NEW.created_by, NEW.created_by) RETURNING * INTO leftover;
    INSERT INTO public.activity_log(actor_id, action, resource, record_id, new_values, reason, created_by, updated_by)
      VALUES (NEW.created_by, 'INSERT', 'leftover_books', leftover.id::text, to_jsonb(leftover), 'Unused receipts retained in original book', NEW.created_by, NEW.created_by);
  END IF;
  INSERT INTO public.activity_log(actor_id, action, resource, record_id, new_values, reason, created_by, updated_by)
    VALUES (NEW.created_by, 'INSERT', 'book_returns', NEW.id::text, to_jsonb(NEW), 'Book return check', NEW.created_by, NEW.created_by);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prepare_book_return ON public.book_returns;
CREATE TRIGGER prepare_book_return BEFORE INSERT ON public.book_returns FOR EACH ROW EXECUTE FUNCTION public.prepare_book_return();
DROP TRIGGER IF EXISTS finish_book_return ON public.book_returns;
CREATE TRIGGER finish_book_return AFTER INSERT ON public.book_returns FOR EACH ROW EXECUTE FUNCTION public.finish_book_return();
REVOKE ALL ON FUNCTION public.prepare_book_return(), public.finish_book_return() FROM PUBLIC, dms_runtime;

CREATE OR REPLACE FUNCTION public.audit_book_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.activity_log(actor_id, action, resource, record_id, old_values, new_values, reason)
  VALUES (nullif(current_setting('app.person_id', true), '')::uuid, TG_OP, 'books', NEW.id::text,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW),
    CASE WHEN TG_OP = 'INSERT' THEN 'Book stock entry'
      WHEN NEW.status = 'ASSIGNED' THEN 'Book assignment'
      WHEN NEW.status IN ('CLOSED','PARTLY_USED','FLAGGED') THEN 'Book return check' ELSE 'Book status change' END);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_book_stock() FROM PUBLIC;
COMMIT;
