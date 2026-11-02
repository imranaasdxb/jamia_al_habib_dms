-- Run the ENTIRE file as the Neon database owner, through COMMIT.
-- Renumbers existing regular books; IDs, receipt ranges and finances stay unchanged.
-- Token editions and original historical import/audit evidence are not rewritten.
BEGIN;

DO $regular_book_numbers$
DECLARE
  edition_row public.master_records%ROWTYPE;
  expected record;
  item record;
  matched integer;
  stock_count integer;
  definition text;
  old_fragment text;
  new_fragment text;
BEGIN
  IF current_user = 'dms_runtime' OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid IN ('public.master_records'::regclass, 'public.books'::regclass,
      'public.book_cases'::regclass, 'public.leftover_books'::regclass,
      'public.book_returns'::regclass, 'public.book_losses'::regclass)
      AND relowner <> current_user::regrole::oid
  ) THEN
    RAISE EXCEPTION 'Run this file as the application table owner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.people'::regclass AND conname = 'people_role_names_v2_check') THEN
    RAISE EXCEPTION 'Apply 0027_explicit_super_admin_roles.sql first';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dms:book-stock:write'));
  LOCK TABLE public.master_records, public.books, public.book_assignments,
    public.book_cases, public.leftover_books, public.book_returns, public.book_losses
    IN SHARE ROW EXCLUSIVE MODE;

  CREATE TEMP TABLE dms_regular_editions (
    edition_number integer PRIMARY KEY, quantity integer NOT NULL, book_from integer NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO dms_regular_editions VALUES
    (1,60,1), (2,100,61), (3,235,161), (4,214,396),
    (5,112,610), (6,600,722), (7,500,1322);

  -- Stop rather than renumber an unexpected edition or incomplete stock silently.
  IF EXISTS (
    SELECT 1 FROM public.master_records m
    WHERE m.kind = 'EDITION' AND m.edition_book_type = 'REGULAR'
      AND m.edition_number IS NOT NULL AND m.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM dms_regular_editions e WHERE e.edition_number = m.edition_number)
  ) OR EXISTS (
    SELECT 1 FROM public.books b LEFT JOIN public.master_records m ON m.id = b.edition_id
    WHERE b.book_type = 'REGULAR' AND (m.id IS NULL OR m.kind <> 'EDITION'
      OR m.edition_book_type IS DISTINCT FROM 'REGULAR' OR m.edition_number IS NULL
      OR m.edition_number NOT BETWEEN 1 AND 7 OR m.deleted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Unexpected regular editions or legacy stock exist. No numbering changes committed.';
  END IF;

  FOR expected IN SELECT * FROM dms_regular_editions ORDER BY edition_number LOOP
    SELECT count(*) INTO matched FROM public.master_records m
    WHERE m.kind = 'EDITION' AND m.edition_book_type = 'REGULAR'
      AND m.edition_number = expected.edition_number AND m.deleted_at IS NULL;
    IF matched <> 1 THEN
      RAISE EXCEPTION 'Expected exactly one regular Edition %, found %', expected.edition_number, matched;
    END IF;
    SELECT m.* INTO STRICT edition_row FROM public.master_records m
    WHERE m.kind = 'EDITION' AND m.edition_book_type = 'REGULAR'
      AND m.edition_number = expected.edition_number AND m.deleted_at IS NULL;
    IF edition_row.book_quantity IS DISTINCT FROM expected.quantity
      OR edition_row.pages_per_book IS DISTINCT FROM 50
      OR edition_row.pages_from IS NULL OR edition_row.pages_to IS NULL
      OR edition_row.pages_to::bigint - edition_row.pages_from + 1 <> expected.quantity::bigint * 50 THEN
      RAISE EXCEPTION 'Edition % printing details do not match % books of 50 receipts',
        expected.edition_number, expected.quantity;
    END IF;
    SELECT count(*) INTO stock_count FROM public.books b WHERE b.edition_id = edition_row.id;
    IF stock_count <> expected.quantity OR EXISTS (
      SELECT 1 FROM public.books b WHERE b.edition_id = edition_row.id AND (
        b.book_type <> 'REGULAR' OR b.deleted_at IS NOT NULL
        OR b.edition_number IS DISTINCT FROM expected.edition_number
        OR b.receipt_from < edition_row.pages_from OR b.receipt_to > edition_row.pages_to
        OR b.total_receipts <> 50 OR (b.receipt_from - edition_row.pages_from) % 50 <> 0
        OR (b.edition_book_number IS NOT NULL AND b.edition_book_number NOT IN (
          1 + (b.receipt_from - edition_row.pages_from) / 50,
          expected.book_from + (b.receipt_from - edition_row.pages_from) / 50
        ))
      )
    ) THEN
      RAISE EXCEPTION 'Edition % stock does not match the expected complete receipt ranges. No changes committed.',
        expected.edition_number;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.master_records'::regclass
      AND tgname IN ('edition_stock_guard','edition_stock_sync') AND tgenabled = 'O') <> 2 THEN
    RAISE EXCEPTION 'Expected enabled edition stock triggers from 0017. No changes committed.';
  END IF;

  CREATE TEMP TABLE dms_regular_book_changes ON COMMIT DROP AS
    SELECT b.id, b.edition_id,
      e.book_from + (b.receipt_from - m.pages_from) / 50 AS new_ordinal,
      'BOOK' || (e.book_from + (b.receipt_from - m.pages_from) / 50)::text
        || '/' || b.receipt_from::text AS new_number,
      to_jsonb(b) - ARRAY['edition_book_number','book_number','updated_at'] AS preserved
    FROM public.books b JOIN public.master_records m ON m.id = b.edition_id
      JOIN dms_regular_editions e ON e.edition_number = m.edition_number
    WHERE b.book_type = 'REGULAR' AND m.edition_book_type = 'REGULAR';
  CREATE UNIQUE INDEX ON dms_regular_book_changes(id);
  CREATE UNIQUE INDEX ON dms_regular_book_changes(new_ordinal);

  CREATE TEMP TABLE dms_regular_return_snapshot ON COMMIT DROP AS
    SELECT r.id, to_jsonb(r) - ARRAY['book_number','source_code','updated_at'] AS preserved
    FROM public.book_returns r JOIN dms_regular_book_changes c ON c.id = r.book_id;

  -- Patch only the two installed numbering expressions, retaining current roles,
  -- permissions, receipt validation and token-generation rules.
  SELECT pg_catalog.pg_get_functiondef('public.guard_edition_stock_details()'::regprocedure)
    INTO definition;
  old_fragment := 'ELSE next_book := 1;';
  new_fragment := $regular_next$ELSE
      -- dms:continuous-regular-books
      SELECT coalesce(max(edition_book_number),0)::bigint + 1 INTO next_book
      FROM public.books WHERE book_type = 'REGULAR' AND edition_id <> NEW.id;
    $regular_next$;
  IF position(old_fragment IN definition) > 0 THEN
    EXECUTE replace(definition, old_fragment, new_fragment);
  ELSIF position('dms:continuous-regular-books' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unrecognized edition numbering function. No changes committed.';
  END IF;

  SELECT pg_catalog.pg_get_functiondef('public.materialize_edition_stock(uuid)'::regprocedure)
    INTO definition;
  old_fragment := $old_regular_label$ELSE 'BOOK' || n::text || '/'$old_regular_label$;
  new_fragment := $new_regular_label$ELSE 'BOOK' || (edition.edition_book_from+(n-1))::text || '/'$new_regular_label$;
  IF position(old_fragment IN definition) > 0 THEN
    EXECUTE replace(definition, old_fragment, new_fragment);
  ELSIF position(new_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'Unrecognized regular book label generator. No changes committed.';
  END IF;

  -- Suppress only stock regeneration/immutable-offset checks for this owner-run
  -- metadata correction. Normal validation and audit triggers remain enabled.
  ALTER TABLE public.master_records DISABLE TRIGGER edition_stock_guard;
  ALTER TABLE public.master_records DISABLE TRIGGER edition_stock_sync;
  UPDATE public.master_records m SET edition_book_from = e.book_from, updated_at = now()
  FROM dms_regular_editions e
  WHERE m.kind = 'EDITION' AND m.edition_book_type = 'REGULAR'
    AND m.edition_number = e.edition_number AND m.deleted_at IS NULL
    AND m.edition_book_from IS DISTINCT FROM e.book_from;
  ALTER TABLE public.master_records ENABLE TRIGGER edition_stock_guard;
  ALTER TABLE public.master_records ENABLE TRIGGER edition_stock_sync;

  -- Update highest numbers first to avoid transient collisions in the existing
  -- unique (edition_id, edition_book_number) index. IDs never change.
  FOR item IN SELECT * FROM dms_regular_book_changes ORDER BY new_ordinal DESC LOOP
    UPDATE public.books SET edition_book_number = item.new_ordinal,
      book_number = item.new_number, updated_at = now()
    WHERE id = item.id AND (edition_book_number IS DISTINCT FROM item.new_ordinal
      OR book_number IS DISTINCT FROM item.new_number);
  END LOOP;
  CREATE UNIQUE INDEX IF NOT EXISTS books_regular_print_number_idx
    ON public.books(edition_book_number)
    WHERE book_type = 'REGULAR' AND edition_book_number IS NOT NULL;

  -- Refresh only live display labels, following book IDs and leftover IDs.
  UPDATE public.leftover_books l SET code = c.new_number || '-B' || l.ordinal::text, updated_at = now()
  FROM dms_regular_book_changes c WHERE l.book_id = c.id
    AND l.code IS DISTINCT FROM c.new_number || '-B' || l.ordinal::text;
  UPDATE public.book_cases k SET source_code = c.new_number
  FROM dms_regular_book_changes c WHERE k.book_id = c.id AND k.source = 'NEW'
    AND k.source_code IS DISTINCT FROM c.new_number;
  UPDATE public.book_cases k SET source_code = l.code
  FROM public.leftover_books l, dms_regular_book_changes c
  WHERE k.book_id = c.id AND k.source = 'LEFTOVER' AND k.leftover_id = l.id
    AND k.source_code IS DISTINCT FROM l.code;
  UPDATE public.book_returns r SET book_number = c.new_number, source_code = k.source_code, updated_at = now()
  FROM dms_regular_book_changes c, public.book_cases k
  WHERE r.book_id = c.id AND r.case_id = k.id
    AND (r.book_number IS DISTINCT FROM c.new_number OR r.source_code IS DISTINCT FROM k.source_code);
  UPDATE public.book_losses l SET source_code = k.source_code, updated_at = now()
  FROM public.book_cases k, dms_regular_book_changes c
  WHERE l.book_id = c.id AND l.case_id = k.id AND l.source_code IS DISTINCT FROM k.source_code;

  -- Abort atomically if any trigger changed receipt ranges, assignment links,
  -- collected amounts, exact historical commissions or submission state.
  IF EXISTS (SELECT 1 FROM public.books b JOIN dms_regular_book_changes c ON c.id = b.id
    WHERE (to_jsonb(b) - ARRAY['edition_book_number','book_number','updated_at']) IS DISTINCT FROM c.preserved)
    OR EXISTS (SELECT 1 FROM public.book_returns r JOIN dms_regular_return_snapshot s ON s.id = r.id
    WHERE (to_jsonb(r) - ARRAY['book_number','source_code','updated_at']) IS DISTINCT FROM s.preserved) THEN
    RAISE EXCEPTION 'Unrelated book or submission data changed; the entire renumbering is rolled back';
  END IF;
END;
$regular_book_numbers$;

COMMIT;

-- The final result should show the seven ranges listed in the request.
SELECT m.edition_number AS edition, count(*) AS total_books,
  min(b.edition_book_number) AS first_book, max(b.edition_book_number) AS last_book,
  min(b.receipt_from) AS first_receipt, max(b.receipt_to) AS last_receipt
FROM public.books b JOIN public.master_records m ON m.id = b.edition_id
WHERE b.book_type = 'REGULAR' AND m.edition_book_type = 'REGULAR'
  AND m.edition_number BETWEEN 1 AND 7 AND b.deleted_at IS NULL AND m.deleted_at IS NULL
GROUP BY m.edition_number ORDER BY m.edition_number;
