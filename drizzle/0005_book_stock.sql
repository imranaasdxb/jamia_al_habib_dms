-- Run this entire file manually after the Masters migrations.
BEGIN;
CREATE TABLE IF NOT EXISTS public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_number text NOT NULL UNIQUE CHECK (book_number = upper(btrim(book_number))
    AND book_number ~ '^[A-Z0-9][A-Z0-9/_-]{0,39}$'),
  stock_date date NOT NULL, edition_id uuid NOT NULL REFERENCES public.master_records(id) ON DELETE RESTRICT,
  edition_name_en text NOT NULL, edition_name_ur text NOT NULL,
  book_type text NOT NULL CHECK (book_type IN ('REGULAR','TOKEN')),
  token_value_paise integer,
  receipt_from integer NOT NULL CHECK (receipt_from >= 1),
  receipt_to integer NOT NULL CHECK (receipt_to >= receipt_from),
  total_receipts integer GENERATED ALWAYS AS (receipt_to - receipt_from + 1) STORED NOT NULL,
  face_value_paise bigint GENERATED ALWAYS AS (CASE WHEN book_type = 'TOKEN'
    THEN (receipt_to::bigint - receipt_from::bigint + 1) * token_value_paise::bigint ELSE NULL END) STORED,
  status text NOT NULL DEFAULT 'IN_STOCK' CHECK (status IN ('IN_STOCK','ASSIGNED','FLAGGED','CLOSED','PARTLY_USED','LEFTOVER_ASSIGNED','LOST')),
  remarks text NOT NULL DEFAULT '' CHECK (length(remarks) <= 1000), entry_by_name text NOT NULL,
  operation_id uuid NOT NULL, operation_hash text NOT NULL CHECK (operation_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CHECK ((book_type = 'REGULAR' AND token_value_paise IS NULL)
    OR (book_type = 'TOKEN' AND token_value_paise IS NOT NULL AND token_value_paise IN (1000,2000,5000))),
  CONSTRAINT books_receipt_range_excl EXCLUDE USING gist (
    int8range(receipt_from::bigint, receipt_to::bigint, '[]') WITH &&)
);
CREATE INDEX IF NOT EXISTS books_edition_type_idx ON public.books(edition_id, book_type);
CREATE INDEX IF NOT EXISTS books_operation_idx ON public.books(operation_id);
CREATE INDEX IF NOT EXISTS books_stock_date_idx ON public.books(stock_date);
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.books FROM PUBLIC;
-- Stock entry permits inserts and reads. Saved stock cannot be edited directly by Staff.
GRANT SELECT, INSERT ON public.books TO dms_runtime;
DROP POLICY IF EXISTS books_read ON public.books;
CREATE POLICY books_read ON public.books FOR SELECT TO dms_runtime USING (current_setting('app.role', true) IN ('ADMIN','STAFF'));
DROP POLICY IF EXISTS books_create ON public.books;
CREATE POLICY books_create ON public.books FOR INSERT TO dms_runtime WITH CHECK (
  current_setting('app.role', true) IN ('ADMIN','STAFF') AND status = 'IN_STOCK' AND deleted_at IS NULL
  AND created_by::text = current_setting('app.person_id', true) AND updated_by = created_by);
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS owner_maintenance ON public.books';
  EXECUTE format('CREATE POLICY owner_maintenance ON public.books TO %I USING (true) WITH CHECK (true)', current_user);
END $$;
CREATE OR REPLACE FUNCTION public.guard_book_stock() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE edition public.master_records; actor public.people;
BEGIN
  IF current_user <> 'dms_runtime' THEN RETURN NEW; END IF;
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Stock changes require an approved workflow'; END IF;
  SELECT * INTO actor FROM public.people WHERE id = nullif(current_setting('app.person_id', true), '')::uuid;
  IF NOT FOUND OR actor.status <> 'ACTIVE' OR actor.role NOT IN ('ADMIN','STAFF') THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO edition FROM public.master_records WHERE id = NEW.edition_id FOR SHARE;
  IF NOT FOUND OR edition.kind <> 'EDITION' OR NOT edition.active OR edition.deleted_at IS NOT NULL
    OR edition.effective_from > NEW.stock_date THEN RAISE EXCEPTION 'Select an active edition effective on the stock date'; END IF;
  PERFORM 1 FROM public.master_records WHERE kind = 'BOOK_TYPE' AND code = NEW.book_type AND active AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book type is inactive'; END IF;
  IF NEW.book_type = 'TOKEN' THEN
    PERFORM 1 FROM public.master_records WHERE kind = 'TOKEN_VALUE' AND token_value_rupees * 100 = NEW.token_value_paise
      AND active AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Token value is inactive'; END IF;
  END IF;
  NEW.edition_name_en := edition.name_en; NEW.edition_name_ur := edition.name_ur;
  NEW.entry_by_name := actor.full_name;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.audit_book_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.activity_log(actor_id, action, resource, record_id, old_values, new_values, reason)
  VALUES (nullif(current_setting('app.person_id', true), '')::uuid, TG_OP, 'books', NEW.id::text,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW), 'Book stock entry');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_book_stock(), public.audit_book_stock() FROM PUBLIC;
DROP TRIGGER IF EXISTS books_stock_guard ON public.books;
CREATE TRIGGER books_stock_guard BEFORE INSERT OR UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.guard_book_stock();
DROP TRIGGER IF EXISTS books_stock_audit ON public.books;
CREATE TRIGGER books_stock_audit AFTER INSERT OR UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.audit_book_stock();
COMMIT;
