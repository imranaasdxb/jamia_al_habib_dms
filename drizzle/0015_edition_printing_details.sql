-- Run the entire file as the database owner, through COMMIT.
-- Existing edition IDs and their book links are retained.
BEGIN;
SELECT set_config('app.change_reason', 'Add edition printing details and retire effective-from date', true);

ALTER TABLE public.master_records
  ADD COLUMN IF NOT EXISTS edition_code text,
  ADD COLUMN IF NOT EXISTS edition_number integer,
  ADD COLUMN IF NOT EXISTS edition_book_type text,
  ADD COLUMN IF NOT EXISTS printing_year integer,
  ADD COLUMN IF NOT EXISTS pages_from integer,
  ADD COLUMN IF NOT EXISTS pages_to integer,
  ADD COLUMN IF NOT EXISTS pages_per_book integer,
  ADD COLUMN IF NOT EXISTS book_quantity integer,
  ADD COLUMN IF NOT EXISTS designed_printed_by text;

-- Other master kinds and historical book labels still use shared code/name fields.
-- Unknown printing details of legacy editions are left empty rather than invented.
UPDATE public.master_records SET edition_code = code, pages_per_book = 50
WHERE kind = 'EDITION' AND (edition_code IS NULL OR pages_per_book IS NULL);

-- Preserve later workflow/security changes to the installed book guard.
DO $retire_edition_date$
DECLARE definition text; updated_definition text;
BEGIN
  IF to_regprocedure('public.guard_book_stock()') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.guard_book_stock()'::regprocedure) INTO definition;
    IF position('edition.effective_from' in lower(definition)) > 0 THEN
      updated_definition := regexp_replace(definition,
        '\s+OR\s+edition\.effective_from\s*>\s*NEW\.stock_date', '', 'gi');
      IF position('edition.effective_from' in lower(updated_definition)) > 0 THEN
        RAISE EXCEPTION 'Book stock guard has an unexpected effective-date expression; no changes committed';
      END IF;
      updated_definition := replace(updated_definition,
        'Select an active edition effective on the stock date', 'Select an active edition');
      EXECUTE updated_definition;
    END IF;
  END IF;
END;
$retire_edition_date$;

-- PostgreSQL also removes the column's own old CHECK constraint.
ALTER TABLE public.master_records DROP COLUMN IF EXISTS effective_from;

CREATE OR REPLACE FUNCTION public.guard_edition_details() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $edition_details$
DECLARE page_count bigint; suffix text;
BEGIN
  IF NEW.kind <> 'EDITION' THEN RETURN NEW; END IF;
  NEW.edition_code := upper(btrim(coalesce(NEW.edition_code, NEW.code)));
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
  page_count := NEW.pages_to::bigint - NEW.pages_from::bigint + 1;
  IF page_count % 50 <> 0 THEN RAISE EXCEPTION 'Edition page range must contain complete 50-page books'; END IF;
  NEW.book_quantity := (page_count / 50)::integer;
  NEW.designed_printed_by := btrim(NEW.designed_printed_by);
  NEW.code := NEW.edition_code;
  suffix := CASE WHEN NEW.edition_number % 100 BETWEEN 11 AND 13 THEN 'th'
    WHEN NEW.edition_number % 10 = 1 THEN 'st' WHEN NEW.edition_number % 10 = 2 THEN 'nd'
    WHEN NEW.edition_number % 10 = 3 THEN 'rd' ELSE 'th' END;
  NEW.name_en := NEW.edition_number::text || suffix || ' edition';
  NEW.name_ur := 'ایڈیشن ' || NEW.edition_number::text;
  RETURN NEW;
END;
$edition_details$;

-- Existing masters_guard continues enforcing administrator access, immutable
-- identity, edit reasons, parent hierarchy and active-child protections.
DROP TRIGGER IF EXISTS edition_details_guard ON public.master_records;
CREATE TRIGGER edition_details_guard BEFORE INSERT OR UPDATE ON public.master_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_edition_details();
REVOKE ALL ON FUNCTION public.guard_edition_details() FROM PUBLIC, dms_runtime;

ALTER TABLE public.master_records DROP CONSTRAINT IF EXISTS master_records_edition_printing_check;
ALTER TABLE public.master_records ADD CONSTRAINT master_records_edition_printing_check CHECK (
  kind <> 'EDITION' OR (
    edition_code IS NOT NULL AND edition_code = code AND pages_per_book IS NOT NULL AND pages_per_book = 50
    AND (edition_number IS NULL OR (
      edition_number BETWEEN 1 AND 9999
      AND edition_code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'
      AND edition_book_type IS NOT NULL AND edition_book_type IN ('REGULAR','TOKEN')
      AND printing_year IS NOT NULL AND printing_year BETWEEN 1900 AND 2100
      AND pages_from IS NOT NULL AND pages_from >= 1 AND pages_to IS NOT NULL AND pages_to >= pages_from
      AND (pages_to::bigint - pages_from::bigint + 1) % 50 = 0
      AND book_quantity IS NOT NULL AND book_quantity = (pages_to::bigint - pages_from::bigint + 1) / 50
      AND designed_printed_by IS NOT NULL AND length(btrim(designed_printed_by)) BETWEEN 2 AND 160
    ))
  )
);

COMMIT;
