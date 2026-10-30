-- Run the ENTIRE file as the Neon application table owner.
-- Requires the exact historical commission setup previously provided for Edition 6.
-- Edition 2 source: 3 rows / INR 6,930 collection / INR 2,410 commission.
-- Badal Kumar, original row 216, stays excluded: book condition is missing (INR 2,810).
-- Two eligible rows: INR 4,120 collection / INR 2,410 exact commission.
-- Hafiz Salim book 108 matches the continuous print range in existing Edition 2 stock.
-- Imtiyaz book 373 is outside that range and receives an explicitly assumed free book.
-- Original Excel data and book numbers are preserved; existing imports are skipped.
-- One fundraiser per allocated book. Imports remain unchecked historical review drafts.
-- All writes are atomic; safe to rerun.
DO $complete_edition2$
DECLARE
  target_edition uuid;
  original_match constant text := 'AND m.edition_number=s.edition_number AND b.edition_book_number=s.book_number';
  continuous_match constant text := $match$AND m.edition_number=s.edition_number
        AND (CASE
          WHEN s.book_type='REGULAR' AND s.edition_number BETWEEN 2 AND 5
            THEN (b.receipt_from-1)/50+1
          ELSE b.edition_book_number
        END)=s.book_number$match$;
  allocated_match constant text := 'AND m.edition_number=s.edition_number AND b.id=(SELECT allocated_book_id FROM pg_temp.edition2_repair_rows WHERE source_row=s.source_row)';
  definition text; previous_match text; matched integer; already_imported integer;
  allocated_id uuid; allocated_ordinal integer; allocated_note text;
  book_group record; import_payload jsonb; result jsonb; failure_details text;
BEGIN
  IF current_user='dms_runtime' OR
    (SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.books'::regclass)
      <> current_user::regrole::oid THEN
    RAISE EXCEPTION 'Run this correction as the application table owner' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dms:import:Book3_v1'));
  LOCK TABLE public.people,public.fundraisers,public.master_records,public.books,
    public.book_assignments,public.book_cases,public.book_returns,public.book_receipts,
    public.legacy_collection_imports IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*),(array_agg(id))[1] INTO matched,target_edition
    FROM public.master_records WHERE kind='EDITION' AND code='02-1437-2016'
      AND edition_number=2 AND edition_book_type='REGULAR' AND deleted_at IS NULL;
  IF matched<>1 THEN RAISE EXCEPTION 'Edition 2 must identify exactly one existing regular edition'; END IF;

  CREATE TEMP TABLE edition2_repair_rows (
    source_row integer PRIMARY KEY, original_book integer NOT NULL, data jsonb NOT NULL,
    allocated_book_id uuid, allocation_note text, needs_assumed boolean NOT NULL DEFAULT false
  ) ON COMMIT DROP;
  INSERT INTO pg_temp.edition2_repair_rows(source_row,original_book,data)
    SELECT (item->>'source_row')::integer,(item->>'book_number')::integer,item
    FROM jsonb_array_elements($edition2_payload$[{"source_row":18,"profile_source_id":37,"fundraiser_name":"Hafiz Salim","book_number":108,"book_type":"REGULAR","edition_number":2,"token_paise":null,"entry_date":"2022-05-15","collection_date":"2022-05-10","collection_area":"Nawada","book_condition":"Finished","amount_paise":342000,"commission_paise":171000,"entry_by":"S R Hussain","amount_words":"Rupees Three Thousand Four Hundred Twenty Only","problems":"","raw":{"Entry Date":"2022-05-15 00:00:00","Book No.":108,"Type":"Common","Edition":"2nd","Fundraiser Name":"Hafiz Salim","Address":"Nawada","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Nawada","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-05-10 00:00:00","Book Condition":"Finished","Collection Amount":3420,"Commission Amount":1710,"Entry by":"S R Hussain"}},{"source_row":113,"profile_source_id":47,"fundraiser_name":"Imtiyaz","book_number":373,"book_type":"REGULAR","edition_number":2,"token_paise":null,"entry_date":"2023-05-03","collection_date":"2023-03-10","collection_area":"Jonkot","book_condition":"Finished","amount_paise":70000,"commission_paise":70000,"entry_by":"M Ashiq","amount_words":"Rupees Seven Hundred Only","problems":"","raw":{"Entry Date":"2023-05-03 00:00:00","Book No.":373,"Type":"Common","Edition":"2nd","Fundraiser Name":"Imtiyaz","Address":"Jonkot","District":"Jagatsinhgpur","State":"Odisha","Collection Area":"Jonkot","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-03-10 00:00:00","Book Condition":"Finished","Collection Amount":700,"Commission Amount":700,"Entry by":"M Ashiq"}}]$edition2_payload$::jsonb) AS payload(item);
  IF (SELECT count(*) FROM pg_temp.edition2_repair_rows)<>2 OR
    (SELECT sum((data->>'amount_paise')::bigint) FROM pg_temp.edition2_repair_rows)<>412000 THEN
    RAISE EXCEPTION 'Unexpected repair payload; no changes made';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.edition2_repair_rows repair
    LEFT JOIN public.legacy_collection_imports imported
      ON imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text
    WHERE imported.source_key IS NULL OR imported.source_hash IS DISTINCT FROM
      encode(sha256(convert_to((repair.data->'raw')::text,'UTF8')),'hex')
  ) THEN
    RAISE EXCEPTION 'Original staged Book3 source is missing or changed; no changes made';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.book_returns'::regclass
    AND attname='historical_commission_paise' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Run manual-exact-historical-commissions.sql first; no changes made';
  END IF;
  DELETE FROM pg_temp.edition2_repair_rows repair USING public.legacy_collection_imports imported
    WHERE imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text AND imported.status='IMPORTED';
  IF NOT EXISTS (SELECT 1 FROM pg_temp.edition2_repair_rows) THEN
    RAISE NOTICE 'All 2 Edition 2 repair rows are already imported; nothing changed';
    RETURN;
  END IF;
  -- Conflicting names do not establish shared identity. Allocate separate books per profile.
  UPDATE pg_temp.edition2_repair_rows repair SET needs_assumed=
    original_book NOT BETWEEN 61 AND 160 OR EXISTS (
      SELECT 1 FROM public.legacy_collection_imports other_source
      WHERE other_source.source_key LIKE 'Book3_v1:Sheet1:%'
        AND other_source.source_data->>'Edition'='2nd' AND other_source.source_data->>'Type'='Common'
        AND other_source.source_data->>'Book No.'=repair.original_book::text
        AND nullif(btrim(other_source.source_data->>'Fundraiser Name'),'') IS NOT NULL
        AND other_source.source_data->>'Fundraiser Name' IS DISTINCT FROM repair.data->'raw'->>'Fundraiser Name'
    );
  FOR book_group IN
    SELECT original_book,(data->>'profile_source_id')::integer AS profile_id,bool_or(needs_assumed) AS assumed
      FROM pg_temp.edition2_repair_rows
      GROUP BY original_book,(data->>'profile_source_id')::integer
      ORDER BY original_book,(data->>'profile_source_id')::integer
  LOOP
    SELECT book.id,book.edition_book_number,
      CASE WHEN book_group.assumed THEN
        format('USER-AUTHORIZED ASSUMED BOOK ALLOCATION: original Excel book %s -> ED-02-Book%s/%s (receipts %s-%s); one fundraiser per allocated book',
          book_group.original_book,book.edition_book_number,book.receipt_from,book.receipt_from,book.receipt_to)
      ELSE format('Existing Edition 2 Book%s/%s; exact recorded historical commission retained',
        book.edition_book_number,book.receipt_from) END
      INTO allocated_id,allocated_ordinal,allocated_note
    FROM public.books book WHERE book.edition_id=target_edition AND book.book_type='REGULAR'
      AND book.deleted_at IS NULL AND book.status='IN_STOCK' AND book.total_receipts=50
      AND book.token_value_paise IS NULL
      AND (book_group.assumed OR (book.receipt_from-1)/50+1=book_group.original_book)
      AND NOT EXISTS (SELECT 1 FROM public.book_cases WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM public.book_returns WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM public.book_receipts WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM pg_temp.edition2_repair_rows WHERE allocated_book_id=book.id)
      AND (NOT book_group.assumed OR NOT EXISTS (
        SELECT 1 FROM public.legacy_collection_imports historical
        WHERE historical.source_key LIKE 'Book3_v1:Sheet1:%'
          AND historical.source_data->>'Edition'='2nd' AND historical.source_data->>'Type'='Common'
          AND historical.source_data->>'Book No.'=((book.receipt_from-1)/50+1)::text
      ))
    ORDER BY book.receipt_from,book.edition_book_number,book.id LIMIT 1;
    IF allocated_id IS NULL THEN
      RAISE EXCEPTION 'No eligible free Edition 2 book for historical book %, profile %; repair rolled back',
        book_group.original_book,book_group.profile_id;
    END IF;
    UPDATE pg_temp.edition2_repair_rows repair SET allocated_book_id=allocated_id,
      allocation_note=allocated_note,
      data=jsonb_set(jsonb_set(data,'{book_number}',to_jsonb(allocated_ordinal)),
        '{book_condition}',to_jsonb(coalesce(data->>'book_condition','') || '; ' || allocated_note))
      WHERE repair.original_book=book_group.original_book
        AND (repair.data->>'profile_source_id')::integer=book_group.profile_id;
  END LOOP;

  -- Clone the INSTALLED importer temporarily, preserving current guards and role names.
  -- The public importer and application workflow remain unchanged after this operation.
  definition:=replace(pg_catalog.pg_get_functiondef('public.import_book3_collection_drafts(jsonb)'::regprocedure),E'\r\n',E'\n');
  IF position(continuous_match IN definition)>0 THEN previous_match:=continuous_match;
  ELSIF position(original_match IN definition)>0 THEN previous_match:=original_match;
  ELSE RAISE EXCEPTION 'Installed importer has an unrecognized book matcher; no changes made'; END IF;
  IF (length(definition)-length(replace(definition,previous_match,'')))/length(previous_match)<>1
    OR position('public.import_book3_collection_drafts(' IN definition)=0
    OR position(quote_literal('SUPER_ADMIN') IN definition)=0
    OR position('last_used,commission_basis_points,historical_commission_paise,commission_given,' IN definition)=0 THEN
    RAISE EXCEPTION 'Installed importer version or Super Admin role setup differs; no changes made';
  END IF;
  definition:=replace(definition,'public.import_book3_collection_drafts(',
    'pg_temp.import_book3_edition2_repair(');
  definition:=replace(definition,previous_match,allocated_match);
  definition:=replace(definition,'Historical import Book3.xlsx/Sheet1; source rows ',
    'Historical import Book3.xlsx/Sheet1; USER-AUTHORIZED ASSUMED BOOK ALLOCATION; original book numbers preserved in source ledger; source rows ');
  EXECUTE definition;
  SELECT jsonb_agg(data ORDER BY source_row) INTO import_payload FROM pg_temp.edition2_repair_rows;
  EXECUTE 'SELECT pg_temp.import_book3_edition2_repair($1)' INTO result USING import_payload;
  SELECT string_agg(format('Row %s: %s',repair.source_row,coalesce(imported.reason,'not imported')),'; '
    ORDER BY repair.source_row) INTO failure_details
    FROM pg_temp.edition2_repair_rows repair
    LEFT JOIN public.legacy_collection_imports imported
      ON imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text
    WHERE imported.status IS DISTINCT FROM 'IMPORTED';
  IF failure_details IS NOT NULL THEN
    RAISE EXCEPTION 'Repair rolled back. %',failure_details;
  END IF;
  UPDATE public.legacy_collection_imports imported
    SET reason=imported.reason || '; ' || repair.allocation_note
    FROM pg_temp.edition2_repair_rows repair
    WHERE imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text;
  DROP FUNCTION pg_temp.import_book3_edition2_repair(jsonb);
  RAISE NOTICE 'Imported every remaining eligible Edition 2 repair row with exact commission amounts. Refresh Edition 2 summary and Book Submission.';
END;
$complete_edition2$;

-- Expected eligible historical totals after success: 2 source rows / INR 4,120 collection / INR 2,410 commission.
SELECT jsonb_build_object(
  'edition',2,
  'imported_historical_rows',(SELECT count(*) FROM public.legacy_collection_imports
    WHERE status='IMPORTED' AND source_key LIKE 'Book3_v1:Sheet1:%' AND source_data->>'Edition'='2nd'),
  'collected_rupees',(SELECT coalesce(sum(receipt.amount_paise),0)::numeric/100
    FROM public.book_receipts receipt JOIN public.books book ON book.id=receipt.book_id
    WHERE book.edition_id=(SELECT id FROM public.master_records WHERE kind='EDITION' AND code='02-1437-2016' AND edition_number=2 AND edition_book_type='REGULAR' AND deleted_at IS NULL)
      AND book.deleted_at IS NULL AND receipt.deleted_at IS NULL AND receipt.status='VALID'),
  'commission_rupees',(SELECT coalesce(sum(returned.commission_paise),0)::numeric/100
    FROM public.book_returns returned JOIN public.books book ON book.id=returned.book_id
    WHERE book.edition_id=(SELECT id FROM public.master_records WHERE kind='EDITION' AND code='02-1437-2016' AND edition_number=2 AND edition_book_type='REGULAR' AND deleted_at IS NULL)
      AND book.deleted_at IS NULL AND returned.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM public.book_receipts receipt WHERE receipt.return_id=returned.id
        AND receipt.deleted_at IS NULL AND receipt.status='VALID')),
  'repair_allocations',(SELECT jsonb_agg(jsonb_build_object('excel_row',source_row,
    'original_book',source_data->>'Book No.','book_id',book_id,'receipt',assumed_receipt_number,
    'fundraiser_id',person_id,'note',reason) ORDER BY source_row)
    FROM public.legacy_collection_imports WHERE status='IMPORTED' AND source_key LIKE 'Book3_v1:Sheet1:%'
      AND source_row IN (18,113))
) AS result;
