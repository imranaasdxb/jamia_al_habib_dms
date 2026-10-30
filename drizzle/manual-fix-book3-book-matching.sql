-- Book3 historical regular books use continuous print numbers in editions 2-5.
-- Example: edition 5, printed book 666 -> local Book 57, receipts 33251-33300.
-- Edition 6 onward uses edition-local numbers; token matching stays unchanged.
-- Run this entire statement as the database owner, then rerun the unchanged
-- manual-import-book3-collections.sql payload. Already imported rows are skipped.
-- This statement changes only the importer; it does not write collection data.
DO $fix_book3_matching$
DECLARE
  import_function regprocedure := to_regprocedure('public.import_book3_collection_drafts(jsonb)');
  definition text;
  original_match text := 'AND m.edition_number=s.edition_number AND b.edition_book_number=s.book_number';
  corrected_match text := $match$AND m.edition_number=s.edition_number
        AND (CASE
          WHEN s.book_type='REGULAR' AND s.edition_number BETWEEN 2 AND 5
            THEN (b.receipt_from-1)/50+1
          ELSE b.edition_book_number
        END)=s.book_number$match$;
BEGIN
  IF import_function IS NULL THEN
    RAISE EXCEPTION 'The existing Book3 import function is missing; no changes made';
  END IF;
  IF current_user='dms_runtime' OR
    (SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.books'::regclass)
      <> current_user::regrole::oid THEN
    RAISE EXCEPTION 'Run this correction as the application table owner' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dms:import:Book3_v1'));
  definition := pg_catalog.pg_get_functiondef(import_function);
  IF position(corrected_match IN definition)>0 THEN
    RAISE NOTICE 'Book3 historical book matching is already corrected';
    RETURN;
  END IF;
  IF (length(definition)-length(replace(definition,original_match,'')))
      / length(original_match) <> 1 THEN
    RAISE EXCEPTION 'The installed importer differs from the expected version; no changes made';
  END IF;
  -- Keep installed role names, permissions, validation and financial logic intact.
  EXECUTE replace(definition,original_match,corrected_match);
END;
$fix_book3_matching$;
