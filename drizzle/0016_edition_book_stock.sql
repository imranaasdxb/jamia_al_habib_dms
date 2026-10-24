-- Run this entire file as the database owner, through COMMIT.
-- Existing books, assignments, submissions and receipts are never deleted.
-- Schema installation commits first. Backfill is a separate atomic transaction.
-- If stock overlaps an edition, backfill stops with its book number; schema stays installed.
BEGIN;
SELECT set_config('app.change_reason', 'Create book stock from edition printing details', true);

ALTER TABLE public.books ADD COLUMN IF NOT EXISTS edition_book_number integer;
ALTER TABLE public.master_records ADD COLUMN IF NOT EXISTS edition_token_books jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS books_edition_number_idx
  ON public.books(edition_id, edition_book_number) WHERE edition_book_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS books_receipt_order_idx ON public.books(receipt_from, id)
  WHERE deleted_at IS NULL;
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_edition_number_check;
ALTER TABLE public.books ADD CONSTRAINT books_edition_number_check
  CHECK (edition_book_number IS NULL OR (edition_book_number > 0 AND total_receipts = 50));

CREATE OR REPLACE FUNCTION public.materialize_edition_stock(target_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $edition_stock$
DECLARE
  edition public.master_records; actor public.people; conflict public.books;
  ten integer := 0; twenty integer := 0; fifty integer := 0;
  context_actor uuid; previous_end bigint; next_start bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('dms:book-stock:write'));
  SELECT * INTO edition FROM public.master_records WHERE id = target_id FOR SHARE;
  IF NOT FOUND OR edition.kind <> 'EDITION' OR edition.edition_number IS NULL OR edition.deleted_at IS NOT NULL THEN RETURN; END IF;
  context_actor := nullif(current_setting('app.person_id', true), '')::uuid;
  SELECT * INTO actor FROM public.people WHERE id = coalesce(context_actor, edition.updated_by, edition.created_by);
  IF NOT FOUND OR (context_actor IS NOT NULL AND (actor.role <> 'ADMIN' OR actor.status <> 'ACTIVE' OR actor.deleted_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Only an active administrator can create edition stock' USING ERRCODE = '42501';
  END IF;
  IF edition.pages_per_book <> 50 OR edition.book_quantity IS NULL OR edition.book_quantity < 1
    OR edition.pages_from IS NULL OR edition.pages_to IS NULL
    OR edition.pages_to::bigint - edition.pages_from::bigint + 1 <> edition.book_quantity::bigint * 50 THEN
    RAISE EXCEPTION 'Complete the edition page range in groups of 50' USING ERRCODE = 'P2002';
  END IF;

  IF edition.edition_book_type = 'TOKEN' THEN
    IF edition.edition_token_books IS NULL OR jsonb_typeof(edition.edition_token_books) <> 'object'
      OR coalesce(edition.edition_token_books->>'10', '') !~ '^[0-9]{1,8}$'
      OR coalesce(edition.edition_token_books->>'20', '') !~ '^[0-9]{1,8}$'
      OR coalesce(edition.edition_token_books->>'50', '') !~ '^[0-9]{1,8}$' THEN
      RAISE EXCEPTION 'Enter quantities for 10, 20 and 50 rupee token books for edition %', edition.code USING ERRCODE = 'P2003';
    END IF;
    ten := (edition.edition_token_books->>'10')::integer;
    twenty := (edition.edition_token_books->>'20')::integer;
    fifty := (edition.edition_token_books->>'50')::integer;
    IF ten::bigint + twenty::bigint + fifty::bigint <> edition.book_quantity THEN
      RAISE EXCEPTION 'Token book quantities must equal the edition book quantity' USING ERRCODE = 'P2003';
    END IF;
  END IF;

  -- Global receipt numbers continue across editions, irrespective of book type.
  SELECT max(pages_to) INTO previous_end FROM public.master_records
    WHERE kind = 'EDITION' AND edition_number IS NOT NULL AND deleted_at IS NULL
      AND edition_number < edition.edition_number AND id <> edition.id;
  SELECT min(pages_from) INTO next_start FROM public.master_records
    WHERE kind = 'EDITION' AND edition_number IS NOT NULL AND deleted_at IS NULL
      AND edition_number > edition.edition_number AND id <> edition.id;
  IF (previous_end IS NOT NULL AND edition.pages_from::bigint <> previous_end + 1)
    OR (next_start IS NOT NULL AND edition.pages_to::bigint + 1 <> next_start)
    OR EXISTS (SELECT 1 FROM public.master_records m WHERE m.kind = 'EDITION'
      AND m.edition_number IS NOT NULL AND m.deleted_at IS NULL AND m.id <> edition.id
      AND (m.edition_number = edition.edition_number
        OR int8range(m.pages_from::bigint, m.pages_to::bigint, '[]')
          && int8range(edition.pages_from::bigint, edition.pages_to::bigint, '[]'))) THEN
    RAISE EXCEPTION 'Edition % must continue the previous edition receipt range without overlap', edition.code USING ERRCODE = 'P2004';
  END IF;

  -- Accept an existing exact 50-page book only when it already belongs to this edition.
  SELECT b.* INTO conflict FROM public.books b
    WHERE (b.edition_id = edition.id OR
      int8range(b.receipt_from::bigint, b.receipt_to::bigint, '[]')
        && int8range(edition.pages_from::bigint, edition.pages_to::bigint, '[]'))
    AND NOT (
      b.edition_id = edition.id AND b.deleted_at IS NULL
      AND b.book_type = edition.edition_book_type AND b.total_receipts = 50
      AND b.receipt_from >= edition.pages_from AND b.receipt_to <= edition.pages_to
      AND (b.receipt_from - edition.pages_from) % 50 = 0
      AND (b.edition_book_number IS NULL OR b.edition_book_number = (b.receipt_from - edition.pages_from) / 50 + 1)
      AND b.token_value_paise IS NOT DISTINCT FROM CASE WHEN edition.edition_book_type = 'TOKEN' THEN
        CASE WHEN (b.receipt_from - edition.pages_from) / 50 + 1 <= ten THEN 1000
          WHEN (b.receipt_from - edition.pages_from) / 50 + 1 <= ten + twenty THEN 2000 ELSE 5000 END
        ELSE NULL::integer END
    ) ORDER BY b.receipt_from LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Edition % conflicts with existing book % (receipts % to %). Existing records were preserved.',
      edition.code, conflict.book_number, conflict.receipt_from, conflict.receipt_to USING ERRCODE = 'P2002';
  END IF;

  UPDATE public.books SET edition_book_number = (receipt_from - edition.pages_from) / 50 + 1
    WHERE edition_id = edition.id AND edition_book_number IS NULL;

  INSERT INTO public.books (
    book_number, edition_book_number, stock_date, edition_id, edition_name_en, edition_name_ur,
    book_type, token_value_paise, receipt_from, receipt_to,
    entry_by_name, operation_id, operation_hash, created_by, updated_by
  )
  SELECT 'BOOK' || n::text || '/' || (edition.pages_from::bigint + (n::bigint - 1) * 50)::text,
    n, (edition.created_at AT TIME ZONE 'Asia/Kolkata')::date, edition.id, edition.name_en, edition.name_ur,
    edition.edition_book_type,
    CASE WHEN edition.edition_book_type = 'TOKEN' THEN CASE WHEN n <= ten THEN 1000 WHEN n <= ten + twenty THEN 2000 ELSE 5000 END ELSE NULL END,
    (edition.pages_from::bigint + (n::bigint - 1) * 50)::integer,
    (edition.pages_from::bigint + n::bigint * 50 - 1)::integer,
    actor.full_name, edition.id, repeat(md5(edition.id::text || ':' || n::text), 2), actor.id, actor.id
  FROM generate_series(1, edition.book_quantity) AS series(n)
  WHERE NOT EXISTS (SELECT 1 FROM public.books b WHERE b.edition_id = edition.id AND b.edition_book_number = n);
END;
$edition_stock$;

CREATE OR REPLACE FUNCTION public.guard_edition_stock_details() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $edition_stock_guard$
BEGIN
  IF NEW.kind <> 'EDITION' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dms:book-stock:write'));
  IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.books WHERE edition_id = OLD.id)
    AND ROW(NEW.edition_number, NEW.edition_book_type, NEW.pages_from, NEW.pages_to, NEW.edition_token_books, NEW.deleted_at)
      IS DISTINCT FROM ROW(OLD.edition_number, OLD.edition_book_type, OLD.pages_from, OLD.pages_to, OLD.edition_token_books, OLD.deleted_at)
    AND OLD.edition_number IS NOT NULL THEN
    RAISE EXCEPTION 'Edition stock already exists. Its numbering, page range and token quantities cannot change.'
      USING ERRCODE = 'P2001';
  END IF;
  RETURN NEW;
END;
$edition_stock_guard$;

CREATE OR REPLACE FUNCTION public.sync_edition_book_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $edition_stock_sync$
BEGIN
  IF NEW.kind = 'EDITION' AND NEW.edition_number IS NOT NULL AND NEW.deleted_at IS NULL THEN
    PERFORM public.materialize_edition_stock(NEW.id);
  END IF;
  RETURN NEW;
END;
$edition_stock_sync$;

DROP TRIGGER IF EXISTS edition_stock_guard ON public.master_records;
CREATE TRIGGER edition_stock_guard BEFORE INSERT OR UPDATE ON public.master_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_edition_stock_details();
DROP TRIGGER IF EXISTS edition_stock_sync ON public.master_records;
CREATE TRIGGER edition_stock_sync AFTER INSERT OR UPDATE ON public.master_records
  FOR EACH ROW EXECUTE FUNCTION public.sync_edition_book_stock();

-- Only edition triggers owned by the database owner may create stock.
REVOKE INSERT ON public.books FROM dms_runtime;
REVOKE ALL ON FUNCTION public.materialize_edition_stock(uuid),
  public.guard_edition_stock_details(), public.sync_edition_book_stock() FROM PUBLIC, dms_runtime;

COMMIT;

-- Idempotent backfill of complete saved editions. Legacy incomplete editions are retained.
-- A conflict rolls back only this backfill; existing books and installed columns remain intact.
BEGIN;
SELECT set_config('app.change_reason', 'Backfill edition book stock', true);
DO $backfill_edition_stock$
DECLARE item record;
BEGIN
  FOR item IN SELECT id FROM public.master_records
    WHERE kind = 'EDITION' AND edition_number IS NOT NULL AND deleted_at IS NULL
    ORDER BY edition_number, id
  LOOP
    PERFORM public.materialize_edition_stock(item.id);
  END LOOP;
END;
$backfill_edition_stock$;
COMMIT;
