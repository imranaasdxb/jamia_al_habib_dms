-- ONE-TIME MANUAL CLEANUP. Run the entire file as the database owner.
-- Deletes only TEST_BOOK_01 and its dependent dummy book transactions.
-- Shared user/Fundraiser profiles and append-only audit history are retained.
-- Generates real edition 01-1435-2014 in the SAME transaction.
-- Any error rolls back the cleanup and stock generation together.
ROLLBACK;
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE public.master_records, public.books, public.book_assignments,
  public.book_cases, public.book_returns, public.book_receipts,
  public.receipt_edit_requests, public.receipt_issues, public.payment_references,
  public.book_flags, public.leftover_books, public.book_losses
  IN SHARE ROW EXCLUSIVE MODE;

DO $cleanup_dummy_edition$
DECLARE
  dummy_edition public.master_records;
  real_edition public.master_records;
  dummy_book_ids uuid[];
  dummy_case_ids uuid[];
  dummy_return_ids uuid[];
  dummy_receipt_ids uuid[];
  dummy_leftover_ids uuid[];
  affected_assignment_ids uuid[];
  removed integer;
  progress integer;
  generated integer;
BEGIN
  IF current_user = 'dms_runtime' THEN
    RAISE EXCEPTION 'Run this cleanup as the database owner';
  END IF;

  SELECT * INTO dummy_edition FROM public.master_records
    WHERE id = '2b2d47f3-6dd2-4ad6-93c3-429dadd5e81a'::uuid
      AND kind = 'EDITION' AND code = 'TEST_BOOK_01';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dummy edition UUID/code did not match. Nothing was deleted.';
  END IF;

  SELECT * INTO real_edition FROM public.master_records
    WHERE id = 'c6c79e80-7b63-4cfa-b5ac-7999506e50ef'::uuid
      AND kind = 'EDITION' AND code = '01-1435-2014' AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Real first edition UUID/code did not match. Nothing was deleted.';
  END IF;
  IF real_edition.edition_number IS DISTINCT FROM 1
    OR real_edition.edition_book_type IS DISTINCT FROM 'REGULAR'
    OR real_edition.pages_from IS DISTINCT FROM 1
    OR real_edition.pages_to IS DISTINCT FROM 3000
    OR real_edition.pages_per_book IS DISTINCT FROM 50
    OR real_edition.book_quantity IS DISTINCT FROM 60 THEN
    RAISE EXCEPTION 'Real edition must have 60 regular books, 50 pages each, receipts 1 to 3000. Nothing was deleted.';
  END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO dummy_book_ids
    FROM public.books WHERE edition_id = dummy_edition.id;
  IF cardinality(dummy_book_ids) > 5 THEN
    RAISE EXCEPTION 'Dummy edition has more than the five expected books. Nothing was deleted.';
  END IF;
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO dummy_case_ids
    FROM public.book_cases WHERE book_id = ANY(dummy_book_ids);
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO dummy_return_ids
    FROM public.book_returns WHERE book_id = ANY(dummy_book_ids);
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO dummy_leftover_ids
    FROM public.leftover_books WHERE book_id = ANY(dummy_book_ids);

  -- Stop if unexpected cross-book relationships could touch another edition.
  IF EXISTS (
    SELECT 1 FROM public.book_receipts br JOIN public.book_returns r ON r.id = br.return_id
    WHERE br.book_id <> r.book_id
      AND (br.book_id = ANY(dummy_book_ids) OR r.id = ANY(dummy_return_ids))
  ) OR EXISTS (
    SELECT 1 FROM public.book_returns r JOIN public.book_cases c ON c.id = r.case_id
    WHERE r.book_id <> c.book_id
      AND (r.id = ANY(dummy_return_ids) OR c.id = ANY(dummy_case_ids))
  ) OR EXISTS (
    SELECT 1 FROM public.leftover_books l JOIN public.book_returns r ON r.id = l.return_id
    WHERE l.book_id <> r.book_id
      AND (l.id = ANY(dummy_leftover_ids) OR r.id = ANY(dummy_return_ids))
  ) THEN
    RAISE EXCEPTION 'Unexpected cross-book relationship. Cleanup stopped without deleting anything.';
  END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO dummy_receipt_ids
    FROM public.book_receipts WHERE book_id = ANY(dummy_book_ids);
  SELECT coalesce(array_agg(a.id), ARRAY[]::uuid[]) INTO affected_assignment_ids
    FROM public.book_assignments a WHERE
      EXISTS (SELECT 1 FROM public.book_cases c WHERE c.assignment_id = a.id AND c.book_id = ANY(dummy_book_ids))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(a.book_ids) AS item(value)
        WHERE item.value::uuid = ANY(dummy_book_ids))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(a.leftover_ids) AS item(value)
        WHERE item.value::uuid = ANY(dummy_leftover_ids));

  DELETE FROM public.receipt_edit_requests
    WHERE receipt_id = ANY(dummy_receipt_ids) OR return_id = ANY(dummy_return_ids);
  DELETE FROM public.receipt_issues WHERE return_id = ANY(dummy_return_ids);
  DELETE FROM public.payment_references
    WHERE source_type = 'RECEIPT' AND source_id = ANY(dummy_receipt_ids);
  DELETE FROM public.book_receipts WHERE id = ANY(dummy_receipt_ids);
  DELETE FROM public.book_flags
    WHERE book_id = ANY(dummy_book_ids) OR return_id = ANY(dummy_return_ids);
  DELETE FROM public.book_losses
    WHERE book_id = ANY(dummy_book_ids) OR case_id = ANY(dummy_case_ids);

  -- Unwind reassignments from the newest leaf backwards, keeping all FKs enabled.
  -- A later case references a leftover; the leftover references an earlier return;
  -- that return references the earlier case.
  LOOP
    progress := 0;
    DELETE FROM public.book_cases c WHERE c.id = ANY(dummy_case_ids)
      AND NOT EXISTS (SELECT 1 FROM public.book_returns r WHERE r.case_id = c.id);
    GET DIAGNOSTICS removed = ROW_COUNT;
    progress := progress + removed;

    DELETE FROM public.leftover_books l WHERE l.id = ANY(dummy_leftover_ids)
      AND NOT EXISTS (SELECT 1 FROM public.book_cases c WHERE c.leftover_id = l.id);
    GET DIAGNOSTICS removed = ROW_COUNT;
    progress := progress + removed;

    DELETE FROM public.book_returns r WHERE r.id = ANY(dummy_return_ids)
      AND NOT EXISTS (SELECT 1 FROM public.leftover_books l WHERE l.return_id = r.id);
    GET DIAGNOSTICS removed = ROW_COUNT;
    progress := progress + removed;
    EXIT WHEN progress = 0;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.book_cases WHERE id = ANY(dummy_case_ids))
    OR EXISTS (SELECT 1 FROM public.book_returns WHERE id = ANY(dummy_return_ids))
    OR EXISTS (SELECT 1 FROM public.leftover_books WHERE id = ANY(dummy_leftover_ids)) THEN
    RAISE EXCEPTION 'An unexpected dependency remains. Entire cleanup was rolled back.';
  END IF;

  -- Delete dummy-only assignments. Preserve mixed assignments and their other books.
  DELETE FROM public.book_assignments a WHERE a.id = ANY(affected_assignment_ids)
    AND NOT EXISTS (SELECT 1 FROM public.book_cases c WHERE c.assignment_id = a.id)
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(a.book_ids) AS item(value)
      WHERE NOT (item.value::uuid = ANY(dummy_book_ids)));
  UPDATE public.book_assignments a SET
    book_ids = (SELECT coalesce(jsonb_agg(item.value ORDER BY item.position), '[]'::jsonb)
      FROM jsonb_array_elements(a.book_ids) WITH ORDINALITY AS item(value, position)
      WHERE NOT ((item.value #>> '{}')::uuid = ANY(dummy_book_ids))),
    leftover_ids = (SELECT coalesce(jsonb_agg(item.value ORDER BY item.position), '[]'::jsonb)
      FROM jsonb_array_elements(a.leftover_ids) WITH ORDINALITY AS item(value, position)
      WHERE NOT ((item.value #>> '{}')::uuid = ANY(dummy_leftover_ids))),
    updated_at = now()
    WHERE a.id = ANY(affected_assignment_ids);

  DELETE FROM public.books WHERE id = ANY(dummy_book_ids) AND edition_id = dummy_edition.id;
  DELETE FROM public.master_records WHERE id = dummy_edition.id AND code = 'TEST_BOOK_01';

  PERFORM public.materialize_edition_stock(real_edition.id);
  SELECT count(*)::integer INTO generated FROM public.books
    WHERE edition_id = real_edition.id AND deleted_at IS NULL
      AND edition_book_number BETWEEN 1 AND 60
      AND total_receipts = 50
      AND receipt_from = 1 + (edition_book_number - 1) * 50
      AND receipt_to = edition_book_number * 50;
  IF generated <> 60 THEN
    RAISE EXCEPTION 'Expected 60 real-edition books, found %. Entire cleanup rolled back.', generated;
  END IF;

  INSERT INTO public.activity_log(action, resource, record_id, old_values, new_values, reason)
  VALUES ('DELETE', 'master_records', dummy_edition.id::text,
    jsonb_build_object('edition', to_jsonb(dummy_edition), 'bookIds', to_jsonb(dummy_book_ids),
      'returnIds', to_jsonb(dummy_return_ids), 'receiptIds', to_jsonb(dummy_receipt_ids),
      'affectedAssignmentIds', to_jsonb(affected_assignment_ids)),
    jsonb_build_object('realEditionId', real_edition.id, 'realBooks', generated),
    'User-authorized removal of TEST_BOOK_01 dummy books and dependent transactions; generated real first-edition stock');
END;
$cleanup_dummy_edition$;

COMMIT;

SELECT count(*) AS book_count, min(receipt_from) AS receipt_from, max(receipt_to) AS receipt_to
FROM public.books
WHERE edition_id = 'c6c79e80-7b63-4cfa-b5ac-7999506e50ef'::uuid AND deleted_at IS NULL;
