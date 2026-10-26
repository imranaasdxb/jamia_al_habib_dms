-- Run the ENTIRE file as database owner, after 0016, through COMMIT.
-- One Token edition record per denomination: 10, 50, or 100 rupees.
-- No existing books, assignments, submissions or receipts are deleted or renumbered.
BEGIN;
SELECT set_config('app.change_reason', 'Separate token print records and scope receipt numbers to books', true);
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.master_records
  ADD COLUMN IF NOT EXISTS edition_token_value_paise integer,
  ADD COLUMN IF NOT EXISTS edition_book_from integer;
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS edition_number integer,
  ADD COLUMN IF NOT EXISTS receipt_scope text NOT NULL DEFAULT 'REGULAR';

-- Do not silently convert historical 20-rupee or mixed-denomination editions.
DROP TRIGGER IF EXISTS edition_stock_sync ON public.master_records;
UPDATE public.master_records m SET
  edition_token_value_paise = coalesce(m.edition_token_value_paise,
    (SELECT min(b.token_value_paise) FROM public.books b WHERE b.edition_id = m.id
      HAVING count(DISTINCT b.token_value_paise) = 1),
    CASE
      WHEN coalesce((m.edition_token_books->>'10')::integer,0) = m.book_quantity THEN 1000
      WHEN coalesce((m.edition_token_books->>'50')::integer,0) = m.book_quantity THEN 5000
      ELSE NULL END),
  edition_book_from = coalesce(m.edition_book_from,
    (SELECT min(b.edition_book_number) FROM public.books b WHERE b.edition_id = m.id), 1)
WHERE m.kind = 'EDITION' AND m.edition_number IS NOT NULL AND m.edition_book_type = 'TOKEN';
UPDATE public.master_records SET edition_book_from = coalesce(edition_book_from,1)
WHERE kind = 'EDITION' AND edition_number IS NOT NULL AND edition_book_type = 'REGULAR';

DO $token_preflight$
DECLARE bad_code text;
BEGIN
  SELECT m.code INTO bad_code FROM public.master_records m
  WHERE m.kind = 'EDITION' AND m.edition_number IS NOT NULL AND m.edition_book_type = 'TOKEN'
    AND (m.edition_token_value_paise IS NULL OR m.edition_token_value_paise NOT IN (1000,5000,10000)
      OR m.pages_from <> 1 OR EXISTS (SELECT 1 FROM public.books b
        WHERE b.edition_id = m.id AND b.token_value_paise IS DISTINCT FROM m.edition_token_value_paise))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Existing Token edition % needs a separate data migration: mixed/20-rupee values or non-01 receipt range. No changes committed.', bad_code;
  END IF;
  IF EXISTS (SELECT 1 FROM public.books b JOIN public.master_records m ON m.id = b.edition_id
    WHERE b.book_type = 'TOKEN' AND (m.edition_number IS NULL OR b.token_value_paise NOT IN (1000,5000,10000))) THEN
    RAISE EXCEPTION 'Complete historical Token edition details before this migration. No changes committed.';
  END IF;
END;
$token_preflight$;

-- Keep legacy token master rows for history, but do not offer 20-rupee values.
ALTER TABLE public.master_records DROP CONSTRAINT IF EXISTS master_records_token_value_rupees_check;
ALTER TABLE public.master_records ADD CONSTRAINT master_records_token_value_rupees_check
  CHECK (token_value_rupees IN (10,20,50,100));
UPDATE public.master_records SET active = false WHERE kind = 'TOKEN_VALUE' AND token_value_rupees = 20 AND active;
INSERT INTO public.master_records(kind,code,name_en,name_ur,built_in,token_value_rupees)
VALUES ('TOKEN_VALUE','RS_100','₹100','₹100',true,100)
ON CONFLICT (kind,code) DO NOTHING;

ALTER TABLE public.master_records DROP CONSTRAINT IF EXISTS edition_single_token_check;
ALTER TABLE public.master_records ADD CONSTRAINT edition_single_token_check CHECK (
  kind <> 'EDITION' OR edition_number IS NULL OR (
    edition_book_from IS NOT NULL AND edition_book_from > 0
    AND edition_book_from::bigint + book_quantity::bigint - 1 <= 2147483647
    AND ((edition_book_type = 'REGULAR' AND edition_token_value_paise IS NULL)
      OR (edition_book_type = 'TOKEN' AND edition_token_value_paise IS NOT NULL
        AND edition_token_value_paise IN (1000,5000,10000) AND pages_from = 1))
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS edition_print_identity_idx
  ON public.master_records(edition_book_type, edition_number, coalesce(edition_token_value_paise,0))
  WHERE kind = 'EDITION' AND edition_number IS NOT NULL AND deleted_at IS NULL;

UPDATE public.books b SET edition_number = m.edition_number,
  receipt_scope = CASE WHEN b.book_type = 'TOKEN'
    THEN 'TOKEN:' || m.edition_number::text || ':' || b.token_value_paise::text ELSE 'REGULAR' END
FROM public.master_records m WHERE m.id = b.edition_id AND (
  b.edition_number IS DISTINCT FROM m.edition_number OR b.receipt_scope IS DISTINCT FROM
    CASE WHEN b.book_type = 'TOKEN' THEN 'TOKEN:' || m.edition_number::text || ':' || b.token_value_paise::text ELSE 'REGULAR' END);

-- Replace only book checks involving the denomination; preserve all other checks.
DO $token_book_checks$
DECLARE item record;
BEGIN
  FOR item IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.books'::regclass AND contype = 'c'
      AND position('token_value_paise' in pg_get_constraintdef(oid)) > 0
  LOOP
    EXECUTE format('ALTER TABLE public.books DROP CONSTRAINT %I', item.conname);
  END LOOP;
END;
$token_book_checks$;
ALTER TABLE public.books ADD CONSTRAINT books_token_value_check CHECK (
  (book_type = 'REGULAR' AND token_value_paise IS NULL)
  OR (book_type = 'TOKEN' AND token_value_paise IS NOT NULL AND token_value_paise IN (1000,5000,10000))
);
ALTER TABLE public.books ADD CONSTRAINT books_receipt_scope_check CHECK (
  (book_type = 'REGULAR' AND receipt_scope = 'REGULAR')
  OR (book_type = 'TOKEN' AND edition_number IS NOT NULL AND edition_number > 0
    AND receipt_scope = 'TOKEN:' || edition_number::text || ':' || token_value_paise::text)
);
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_receipt_range_excl;
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_receipt_scope_excl;
ALTER TABLE public.books ADD CONSTRAINT books_receipt_scope_excl EXCLUDE USING gist (
  receipt_scope WITH =,
  int8range(receipt_from::bigint,receipt_to::bigint,'[]') WITH &&
);
CREATE UNIQUE INDEX IF NOT EXISTS books_token_print_number_idx
  ON public.books(edition_number,edition_book_number) WHERE book_type = 'TOKEN' AND edition_book_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS books_print_order_idx
  ON public.books(book_type,edition_number,edition_book_number,receipt_from,id) WHERE deleted_at IS NULL;

-- A receipt is unique in its ORIGINAL book, including after leftover reassignment.
ALTER TABLE public.book_receipts DROP CONSTRAINT IF EXISTS book_receipts_receipt_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS book_receipts_book_number_idx ON public.book_receipts(book_id,receipt_number);

CREATE OR REPLACE FUNCTION public.guard_edition_details() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $edition_details$
DECLARE page_count bigint; suffix text;
BEGIN
  IF NEW.kind <> 'EDITION' THEN RETURN NEW; END IF;
  NEW.edition_code := upper(btrim(coalesce(NEW.edition_code,NEW.code)));
  NEW.pages_per_book := 50;
  IF NEW.edition_number IS NULL THEN
    IF current_user = 'dms_runtime' THEN RAISE EXCEPTION 'Edition printing details are required'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.edition_number NOT BETWEEN 1 AND 9999
    OR NEW.edition_book_type IS NULL OR NEW.edition_book_type NOT IN ('REGULAR','TOKEN')
    OR NEW.printing_year IS NULL OR NEW.printing_year NOT BETWEEN 1900 AND 2100
    OR NEW.edition_code IS NULL OR NEW.edition_code !~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'
    OR NEW.pages_from IS NULL OR NEW.pages_from < 1 OR NEW.pages_to IS NULL OR NEW.pages_to < NEW.pages_from
    OR length(btrim(coalesce(NEW.designed_printed_by,''))) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Complete the edition printing fields';
  END IF;
  IF NEW.edition_book_type = 'TOKEN' THEN
    IF NEW.edition_token_value_paise IS NULL OR NEW.edition_token_value_paise NOT IN (1000,5000,10000)
      OR NEW.pages_from <> 1 THEN
      RAISE EXCEPTION 'Choose a 10, 50 or 100 rupee value and start token receipts at 01' USING ERRCODE = 'P2003';
    END IF;
  ELSE
    NEW.edition_token_value_paise := NULL;
  END IF;
  page_count := NEW.pages_to::bigint - NEW.pages_from::bigint + 1;
  IF page_count % 50 <> 0 THEN RAISE EXCEPTION 'Edition range must contain complete 50-page books'; END IF;
  NEW.book_quantity := (page_count / 50)::integer;
  NEW.designed_printed_by := btrim(NEW.designed_printed_by); NEW.code := NEW.edition_code;
  suffix := CASE WHEN NEW.edition_number % 100 BETWEEN 11 AND 13 THEN 'th'
    WHEN NEW.edition_number % 10 = 1 THEN 'st' WHEN NEW.edition_number % 10 = 2 THEN 'nd'
    WHEN NEW.edition_number % 10 = 3 THEN 'rd' ELSE 'th' END;
  NEW.name_en := NEW.edition_number::text || suffix || ' edition';
  NEW.name_ur := 'ایڈیشن ' || NEW.edition_number::text;
  IF NEW.edition_book_type = 'TOKEN' THEN
    NEW.name_en := NEW.name_en || ' · ₹' || (NEW.edition_token_value_paise/100)::text || ' token';
    NEW.name_ur := NEW.name_ur || ' · ₹' || (NEW.edition_token_value_paise/100)::text || ' ٹوکن';
  END IF;
  RETURN NEW;
END;
$edition_details$;

CREATE OR REPLACE FUNCTION public.guard_edition_stock_details() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $stock_details$
DECLARE has_stock boolean; next_book bigint;
BEGIN
  IF NEW.kind <> 'EDITION' OR NEW.edition_number IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dms:book-stock:write'));
  SELECT EXISTS(SELECT 1 FROM public.books WHERE edition_id = NEW.id) INTO has_stock;
  IF TG_OP = 'UPDATE' AND has_stock AND OLD.edition_number IS NOT NULL THEN
    IF ROW(NEW.edition_number,NEW.edition_book_type,NEW.edition_token_value_paise,NEW.pages_from,NEW.pages_to,NEW.edition_book_from,NEW.deleted_at)
      IS DISTINCT FROM ROW(OLD.edition_number,OLD.edition_book_type,OLD.edition_token_value_paise,OLD.pages_from,OLD.pages_to,OLD.edition_book_from,OLD.deleted_at) THEN
      RAISE EXCEPTION 'Generated edition numbering, token value and receipt range cannot change' USING ERRCODE = 'P2001';
    END IF;
    NEW.edition_book_from := OLD.edition_book_from;
  ELSE
    IF NEW.edition_book_type = 'TOKEN' THEN
      SELECT coalesce(max(edition_book_number),0)::bigint + 1 INTO next_book
      FROM public.books WHERE book_type = 'TOKEN' AND edition_number = NEW.edition_number AND edition_id <> NEW.id;
    ELSE next_book := 1;
    END IF;
    IF next_book + NEW.book_quantity::bigint - 1 > 2147483647 THEN
      RAISE EXCEPTION 'Book numbering exceeds the supported range' USING ERRCODE = 'P2002';
    END IF;
    NEW.edition_book_from := next_book::integer;
  END IF;
  RETURN NEW;
END;
$stock_details$;

CREATE OR REPLACE FUNCTION public.materialize_edition_stock(target_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $edition_stock$
DECLARE
  edition public.master_records; actor public.people; conflict public.books;
  context_actor uuid; previous_end bigint; next_start bigint; scope_name text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('dms:book-stock:write'));
  SELECT * INTO edition FROM public.master_records WHERE id = target_id FOR SHARE;
  IF NOT FOUND OR edition.kind <> 'EDITION' OR edition.edition_number IS NULL OR edition.deleted_at IS NOT NULL THEN RETURN; END IF;
  context_actor := nullif(current_setting('app.person_id',true),'')::uuid;
  SELECT * INTO actor FROM public.people WHERE id = coalesce(context_actor,edition.updated_by,edition.created_by);
  IF NOT FOUND OR (context_actor IS NOT NULL AND (actor.role <> 'ADMIN' OR actor.status <> 'ACTIVE' OR actor.deleted_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Only an active administrator can generate stock' USING ERRCODE = '42501';
  END IF;
  IF edition.book_quantity IS NULL OR edition.book_quantity < 1 OR edition.pages_per_book <> 50
    OR edition.edition_book_from IS NULL OR edition.edition_book_from < 1
    OR edition.pages_to::bigint - edition.pages_from::bigint + 1 <> edition.book_quantity::bigint * 50 THEN
    RAISE EXCEPTION 'Complete the edition printing range' USING ERRCODE = 'P2002';
  END IF;
  IF edition.edition_book_type = 'TOKEN' THEN
    IF edition.edition_token_value_paise IS NULL OR edition.edition_token_value_paise NOT IN (1000,5000,10000)
      OR edition.pages_from <> 1 THEN
      RAISE EXCEPTION 'Choose a 10, 50 or 100 rupee token value; receipts start at 01' USING ERRCODE = 'P2003';
    END IF;
    scope_name := 'TOKEN:' || edition.edition_number::text || ':' || edition.edition_token_value_paise::text;
  ELSE
    scope_name := 'REGULAR';
    SELECT max(pages_to) INTO previous_end FROM public.master_records
      WHERE kind = 'EDITION' AND edition_book_type = 'REGULAR' AND edition_number IS NOT NULL AND deleted_at IS NULL
        AND edition_number < edition.edition_number AND id <> edition.id;
    SELECT min(pages_from) INTO next_start FROM public.master_records
      WHERE kind = 'EDITION' AND edition_book_type = 'REGULAR' AND edition_number IS NOT NULL AND deleted_at IS NULL
        AND edition_number > edition.edition_number AND id <> edition.id;
    IF (previous_end IS NOT NULL AND edition.pages_from::bigint <> previous_end + 1)
      OR (next_start IS NOT NULL AND edition.pages_to::bigint + 1 <> next_start) THEN
      RAISE EXCEPTION 'Continue the previous regular edition receipt range' USING ERRCODE = 'P2004';
    END IF;
  END IF;
  SELECT b.* INTO conflict FROM public.books b
    WHERE (b.edition_id = edition.id OR (b.receipt_scope = scope_name
      AND int8range(b.receipt_from::bigint,b.receipt_to::bigint,'[]')
        && int8range(edition.pages_from::bigint,edition.pages_to::bigint,'[]')))
    AND NOT (b.edition_id = edition.id AND b.deleted_at IS NULL AND b.book_type = edition.edition_book_type
      AND b.total_receipts = 50 AND b.receipt_from >= edition.pages_from AND b.receipt_to <= edition.pages_to
      AND (b.receipt_from - edition.pages_from) % 50 = 0
      AND (b.edition_book_number IS NULL OR b.edition_book_number = edition.edition_book_from + (b.receipt_from-edition.pages_from)/50)
      AND b.token_value_paise IS NOT DISTINCT FROM edition.edition_token_value_paise)
    ORDER BY b.receipt_from LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Edition % conflicts with book % (receipts % to %). Existing records preserved.',
      edition.code,conflict.book_number,conflict.receipt_from,conflict.receipt_to USING ERRCODE = 'P2002';
  END IF;
  UPDATE public.books SET edition_book_number = edition.edition_book_from + (receipt_from-edition.pages_from)/50
    WHERE edition_id = edition.id AND edition_book_number IS NULL;
  INSERT INTO public.books(book_number,edition_book_number,edition_number,receipt_scope,stock_date,
    edition_id,edition_name_en,edition_name_ur,book_type,token_value_paise,receipt_from,receipt_to,
    entry_by_name,operation_id,operation_hash,created_by,updated_by)
  SELECT CASE WHEN edition.edition_book_type = 'TOKEN'
      THEN 'T' || edition.edition_number::text || '-' || (edition.edition_token_value_paise/100)::text || '-B'
        || (edition.edition_book_from+(n-1))::text || '/' || (edition.pages_from::bigint+(n::bigint-1)*50)::text
      ELSE 'BOOK' || n::text || '/' || (edition.pages_from::bigint+(n::bigint-1)*50)::text END,
    edition.edition_book_from+(n-1),edition.edition_number,scope_name,(edition.created_at AT TIME ZONE 'Asia/Kolkata')::date,
    edition.id,edition.name_en,edition.name_ur,edition.edition_book_type,edition.edition_token_value_paise,
    (edition.pages_from::bigint+(n::bigint-1)*50)::integer,(edition.pages_from::bigint+n::bigint*50-1)::integer,
    actor.full_name,edition.id,repeat(md5(edition.id::text || ':' || n::text),2),actor.id,actor.id
  FROM generate_series(1,edition.book_quantity) AS series(n)
  WHERE NOT EXISTS (SELECT 1 FROM public.books b WHERE b.edition_id = edition.id
    AND b.edition_book_number = edition.edition_book_from+(n-1));
END;
$edition_stock$;

CREATE OR REPLACE FUNCTION public.sync_edition_book_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $stock_sync$
BEGIN
  IF NEW.kind = 'EDITION' AND NEW.edition_number IS NOT NULL AND NEW.deleted_at IS NULL THEN
    PERFORM public.materialize_edition_stock(NEW.id);
  END IF;
  RETURN NEW;
END;
$stock_sync$;
CREATE TRIGGER edition_stock_sync AFTER INSERT OR UPDATE ON public.master_records
  FOR EACH ROW EXECUTE FUNCTION public.sync_edition_book_stock();
REVOKE ALL ON FUNCTION public.guard_edition_details(),public.guard_edition_stock_details(),
  public.materialize_edition_stock(uuid),public.sync_edition_book_stock() FROM PUBLIC,dms_runtime;

-- Refresh generated labels and fill any missing stock. Existing IDs/numbers are retained.
DO $backfill_single_token_records$
DECLARE item record;
BEGIN
  FOR item IN SELECT id FROM public.master_records WHERE kind = 'EDITION'
    AND edition_number IS NOT NULL AND deleted_at IS NULL
    ORDER BY edition_book_type,edition_number,edition_token_value_paise NULLS FIRST,id
  LOOP
    UPDATE public.master_records SET edition_book_from = edition_book_from WHERE id = item.id;
  END LOOP;
END;
$backfill_single_token_records$;
COMMIT;
