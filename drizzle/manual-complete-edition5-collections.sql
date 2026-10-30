-- Run this ENTIRE file as the Neon application table owner.
-- Prerequisite: the seven mapped Edition 5 entries (INR 38,179) are imported.
-- User authorized assumed book allocation inside existing Edition 5 stock.
-- Imports 13 additional source rows / INR 72,686 as historical review drafts.
-- Original Excel data and book numbers remain unchanged in the source ledger.
-- Both Dilbar aliases use the existing Dilbar Raza profile; no profiles are deleted.
-- All writes are atomic. A failed import rolls back the whole repair. Safe to rerun.
DO $complete_edition5$
DECLARE
  target_edition constant uuid := 'b195f90f-925d-4c7d-985e-79a121396349';
  original_match constant text := 'AND m.edition_number=s.edition_number AND b.edition_book_number=s.book_number';
  continuous_match constant text := $match$AND m.edition_number=s.edition_number
        AND (CASE
          WHEN s.book_type='REGULAR' AND s.edition_number BETWEEN 2 AND 5
            THEN (b.receipt_from-1)/50+1
          ELSE b.edition_book_number
        END)=s.book_number$match$;
  allocated_match constant text := 'AND m.edition_number=s.edition_number AND b.id=(SELECT allocated_book_id FROM pg_temp.edition5_repair_rows WHERE source_row=s.source_row)';
  definition text; previous_match text; matched integer; already_imported integer;
  canonical_profile integer; canonical_name text; allocated_id uuid; allocated_note text;
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
  IF NOT EXISTS (SELECT 1 FROM public.master_records WHERE id=target_edition
    AND kind='EDITION' AND code='05-1440-2019' AND edition_number=5
    AND edition_book_type='REGULAR' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Expected Edition 5 was not found; no changes made';
  END IF;

  CREATE TEMP TABLE edition5_repair_rows (
    source_row integer PRIMARY KEY, original_book integer NOT NULL, data jsonb NOT NULL,
    allocated_book_id uuid, allocation_note text
  ) ON COMMIT DROP;
  INSERT INTO pg_temp.edition5_repair_rows(source_row,original_book,data)
    SELECT (item->>'source_row')::integer,(item->>'book_number')::integer,item
    FROM jsonb_array_elements($edition5_payload$[{"source_row":16,"profile_source_id":113,"fundraiser_name":"Shaikh Akmal Husain","book_number":443,"book_type":"REGULAR","edition_number":5,"token_paise":null,"entry_date":"2022-05-15","collection_date":"2022-05-11","collection_area":"Koraput","book_condition":"Finished","amount_paise":1940000,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Nineteen Thousand Four Hundred Only","problems":"","raw":{"Entry Date":"2022-05-15 00:00:00","Book No.":443,"Type":"Common","Edition":"5th","Fundraiser Name":"Shaikh Akmal Husain","Address":"Koraput","District":"Koraput","State":"Odisha","Collection Area":"Koraput","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-05-11 00:00:00","Book Condition":"Finished","Collection Amount":19400,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":33,"profile_source_id":132,"fundraiser_name":"Tauseef Raza/Salahuddin","book_number":499,"book_type":"REGULAR","edition_number":5,"token_paise":null,"entry_date":"2022-05-18","collection_date":"2022-05-02","collection_area":"Denga","book_condition":"Finished","amount_paise":319000,"commission_paise":159500,"entry_by":"S R Hussain","amount_words":"Rupees Three Thousand One Hundred Ninety Only","problems":"","raw":{"Entry Date":"2022-05-18 00:00:00","Book No.":499,"Type":"Common","Edition":"5th","Fundraiser Name":"Tauseef Raza/Salahuddin","Address":"Denga","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Denga","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-05-02 00:00:00","Book Condition":"Finished","Collection Amount":3190,"Commission Amount":1595,"Entry by":"S R Hussain"}},{"source_row":66,"profile_source_id":45,"fundraiser_name":"Imran","book_number":488,"book_type":"REGULAR","edition_number":5,"token_paise":null,"entry_date":"2022-06-14","collection_date":"2022-06-05","collection_area":"Malisara","book_condition":"Finished","amount_paise":1000000,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Ten Thousand Only","problems":"","raw":{"Entry Date":"2022-06-14 00:00:00","Book No.":488,"Type":"Common","Edition":"5th","Fundraiser Name":"Imran","Address":"Malisara","District":"Kendrapara","State":"Odisha","Collection Area":"Malisara","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-06-05 00:00:00","Book Condition":"Finished","Collection Amount":10000,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":67,"profile_source_id":45,"fundraiser_name":"Imran","book_number":489,"book_type":"REGULAR","edition_number":5,"token_paise":null,"entry_date":"2022-06-14","collection_date":"2022-06-05","collection_area":"Malisara","book_condition":"Finished","amount_paise":990000,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Nine Thousand Nine Hundred Only","problems":"","raw":{"Entry Date":"2022-06-14 00:00:00","Book No.":489,"Type":"Common","Edition":"5th","Fundraiser Name":"Imran","Address":"Malisara","District":"Kendrapara","State":"Odisha","Collection Area":"Malisara","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-06-05 00:00:00","Book Condition":"Finished","Collection Amount":9900,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":68,"profile_source_id":133,"fundraiser_name":"Wajid Khan","book_number":481,"book_type":"REGULAR","edition_number":5,"token_paise":null,"entry_date":"2022-06-14","collection_date":"2022-06-05","collection_area":"Kodokanthi","book_condition":"Finished","amount_paise":1816000,"commission_paise":671000,"entry_by":"S R Hussain","amount_words":"Rupees Eighteen Thousand One Hundred Sixty Only","problems":"","raw":{"Entry Date":"2022-06-14 00:00:00","Book No.":481,"Type":"Common","Edition":"5th","Fundraiser Name":"Wajid Khan","Address":"Kodokanthi","District":"Kendrapara","State":"Odisha","Collection Area":"Kodokanthi","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-06-05 00:00:00","Book Condition":"Finished","Collection Amount":18160,"Commission Amount":6710,"Entry by":"S R Hussain"}},{"source_row":69,"profile_source_id":133,"fundraiser_name":"Wajid Khan","book_number":482,"book_type":"REGULAR","edition_number":5,"token_paise":null,"entry_date":"2022-06-14","collection_date":"2022-06-05","collection_area":"Kodokanthi","book_condition":"Finished","amount_paise":55000,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Five Hundred Fifty Only","problems":"","raw":{"Entry Date":"2022-06-14 00:00:00","Book No.":482,"Type":"Common","Edition":"5th","Fundraiser Name":"Wajid Khan","Address":"Kodokanthi","District":"Kendrapara","State":"Odisha","Collection Area":"Kodokanthi","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-06-05 00:00:00","Book Condition":"Finished","Collection Amount":550,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":70,"profile_source_id":29,"fundraiser_name":"Ghulam Khaja","book_number":480,"book_type":"REGULAR","edition_number":5,"token_paise":null,"entry_date":"2022-06-14","collection_date":"2020-06-05","collection_area":"Gadma","book_condition":"Finished","amount_paise":390000,"commission_paise":190000,"entry_by":"S R Hussain","amount_words":"Rupees Three Thousand Nine Hundred Only","problems":"","raw":{"Entry Date":"2022-06-14 00:00:00","Book No.":480,"Type":"Common","Edition":"5th","Fundraiser Name":"Ghulam Khaja","Address":"Gadma","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Gadma","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2020-06-05 00:00:00","Book Condition":"Finished","Collection Amount":3900,"Commission Amount":1900,"Entry by":"S R Hussain"}},{"source_row":73,"profile_source_id":28,"fundraiser_name":"Firoz","book_number":484,"book_type":"REGULAR","edition_number":5,"token_paise":null,"entry_date":"2022-06-14","collection_date":"2022-06-05","collection_area":"Khorda","book_condition":"Not Used","amount_paise":0,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Zero Only","problems":"","raw":{"Entry Date":"2022-06-14 00:00:00","Book No.":484,"Type":"Common","Edition":"5th","Fundraiser Name":"Firoz","Address":"Khorda","District":"Khorda","State":"Odisha","Collection Area":"Khorda","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-06-05 00:00:00","Book Condition":"Not Used","Collection Amount":0,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":74,"profile_source_id":28,"fundraiser_name":"Firoz","book_number":485,"book_type":"REGULAR","edition_number":5,"token_paise":null,"entry_date":"2022-06-14","collection_date":"2022-06-05","collection_area":"Khorda","book_condition":"Not Used","amount_paise":0,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Zero Only","problems":"","raw":{"Entry Date":"2022-06-14 00:00:00","Book No.":485,"Type":"Common","Edition":"5th","Fundraiser Name":"Firoz","Address":"Khorda","District":"Khorda","State":"Odisha","Collection Area":"Khorda","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-06-05 00:00:00","Book Condition":"Not Used","Collection Amount":0,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":75,"profile_source_id":28,"fundraiser_name":"Firoz","book_number":487,"book_type":"REGULAR","edition_number":5,"token_paise":null,"entry_date":"2022-06-14","collection_date":"2022-06-05","collection_area":"Khorda","book_condition":"Not Used","amount_paise":0,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Zero Only","problems":"","raw":{"Entry Date":"2022-06-14 00:00:00","Book No.":487,"Type":"Common","Edition":"5th","Fundraiser Name":"Firoz","Address":"Khorda","District":"Khorda","State":"Odisha","Collection Area":"Khorda","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-06-05 00:00:00","Book Condition":"Not Used","Collection Amount":0,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":189,"profile_source_id":23,"fundraiser_name":"Dilbar Raza","book_number":430,"book_type":"REGULAR","edition_number":5,"token_paise":null,"entry_date":"2023-06-20","collection_date":"2022-09-15","collection_area":"Balikuda","book_condition":"Continue","amount_paise":439000,"commission_paise":219500,"entry_by":"S R Hussain","amount_words":"Rupees Four Thousand Three Hundred Ninety Only","problems":"","raw":{"Entry Date":"2023-06-20 00:00:00","Book No.":430,"Type":"Common","Edition":"5th","Fundraiser Name":"Dilbar Raza","Address":"Balikuda","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Balikuda","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-09-15 00:00:00","Book Condition":"Continue","Collection Amount":4390,"Commission Amount":2195,"Entry by":"S R Hussain"}},{"source_row":199,"profile_source_id":65,"fundraiser_name":"Maulana Dilbar","book_number":430,"book_type":"REGULAR","edition_number":5,"token_paise":null,"entry_date":"2023-08-06","collection_date":"2023-07-02","collection_area":"Balikuda","book_condition":"Finished","amount_paise":69600,"commission_paise":34800,"entry_by":"S R Hussain","amount_words":"Rupees Six Hundred Ninety Six Only","problems":"","raw":{"Entry Date":"2023-08-06 00:00:00","Book No.":430,"Type":"Common","Edition":"5th","Fundraiser Name":"Maulana Dilbar","Address":"Balikuda","District":"Jagatsinghpur","State":"odisha","Collection Area":"Balikuda","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-07-02 00:00:00","Book Condition":"Finished","Collection Amount":696,"Commission Amount":348,"Entry by":"S R Hussain"}},{"source_row":205,"profile_source_id":59,"fundraiser_name":"Maulana Ashiq Khan","book_number":442,"book_type":"REGULAR","edition_number":5,"token_paise":null,"entry_date":"2023-09-04","collection_date":"2023-06-23","collection_area":"Cuttack","book_condition":"Finished","amount_paise":250000,"commission_paise":125000,"entry_by":"S R Husain","amount_words":"Rupees Two Thousand Five Hundred Only","problems":"","raw":{"Entry Date":"2023-09-04 00:00:00","Book No.":442,"Type":"Common","Edition":"5th","Fundraiser Name":"Maulana Ashiq Khan","Address":"kalinag","District":"Jagatsinghpur","State":"odisha","Collection Area":"Cuttack","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-06-23 00:00:00","Book Condition":"Finished","Collection Amount":2500,"Commission Amount":1250,"Entry by":"S R Husain"}}]$edition5_payload$::jsonb) AS payload(item);
  IF (SELECT count(*) FROM pg_temp.edition5_repair_rows)<>13 OR
    (SELECT sum((data->>'amount_paise')::bigint) FROM pg_temp.edition5_repair_rows)<>7268600 THEN
    RAISE EXCEPTION 'Unexpected repair payload; no changes made';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.edition5_repair_rows repair
    LEFT JOIN public.legacy_collection_imports imported
      ON imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text
    WHERE imported.source_key IS NULL OR imported.source_hash IS DISTINCT FROM
      encode(sha256(convert_to((repair.data->'raw')::text,'UTF8')),'hex')
  ) THEN
    RAISE EXCEPTION 'Original staged Book3 source is missing or changed; no changes made';
  END IF;
  SELECT count(*) INTO already_imported FROM public.legacy_collection_imports imported
    JOIN pg_temp.edition5_repair_rows repair
      ON imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text
    WHERE imported.status='IMPORTED';
  IF already_imported=13 THEN
    RAISE NOTICE 'All 13 Edition 5 repair rows are already imported; nothing changed';
    RETURN;
  ELSIF already_imported<>0 THEN
    RAISE EXCEPTION 'Some repair rows were imported separately; review their existing allocations before continuing';
  END IF;
  IF (SELECT count(*) FROM public.legacy_collection_imports WHERE status='IMPORTED'
    AND source_key IN ('Book3_v1:Sheet1:2','Book3_v1:Sheet1:3','Book3_v1:Sheet1:4',
      'Book3_v1:Sheet1:10','Book3_v1:Sheet1:11','Book3_v1:Sheet1:31','Book3_v1:Sheet1:71')
    AND book_id IN (SELECT id FROM public.books WHERE edition_id=target_edition))<>7 THEN
    RAISE EXCEPTION 'Import the seven mapped Edition 5 entries first; no changes made';
  END IF;

  -- Explicit user-confirmed alias. Preserve both raw rows and their original identities.
  SELECT (data->>'profile_source_id')::integer INTO canonical_profile
    FROM pg_temp.edition5_repair_rows WHERE source_row=189;
  SELECT count(*),min(person.full_name) INTO matched,canonical_name
    FROM public.fundraisers fundraiser JOIN public.people person ON person.id=fundraiser.person_id
    WHERE fundraiser.legacy_import_key='Fundraisers_Data_v1:' || canonical_profile::text
      AND person.role='COLLECTOR' AND person.deleted_at IS NULL AND fundraiser.deleted_at IS NULL
      AND lower(regexp_replace(btrim(person.full_name),'\s+',' ','g'))='dilbar raza';
  IF matched<>1 THEN
    RAISE EXCEPTION 'Dilbar Raza original source profile does not identify one existing fundraiser';
  END IF;
  UPDATE pg_temp.edition5_repair_rows
    SET data=jsonb_set(jsonb_set(data,'{profile_source_id}',to_jsonb(canonical_profile)),
      '{fundraiser_name}',to_jsonb(canonical_name)) WHERE source_row IN (189,199);

  -- One free real book per distinct original book, in ascending receipt order.
  -- Reserve books matching other historical rows so incomplete entries can be repaired later.
  FOR book_group IN SELECT original_book FROM pg_temp.edition5_repair_rows
    GROUP BY original_book ORDER BY original_book LOOP
    SELECT book.id,format('USER-AUTHORIZED ASSUMED BOOK ALLOCATION: original Excel book %s -> ED-05-Book%s/%s (receipts %s-%s)',
      book_group.original_book,book.edition_book_number,book.receipt_from,book.receipt_from,book.receipt_to)
      INTO allocated_id,allocated_note
    FROM public.books book WHERE book.edition_id=target_edition AND book.book_type='REGULAR'
      AND book.deleted_at IS NULL AND book.status='IN_STOCK' AND book.total_receipts=50
      AND book.token_value_paise IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.book_cases WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM public.book_returns WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM public.book_receipts WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM pg_temp.edition5_repair_rows WHERE allocated_book_id=book.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.legacy_collection_imports historical
        WHERE historical.source_key LIKE 'Book3_v1:Sheet1:%'
          AND historical.source_data->>'Edition'='5th'
          AND historical.source_data->>'Type'='Common'
          AND historical.source_data->>'Book No.'=((book.receipt_from-1)/50+1)::text
      )
    ORDER BY book.receipt_from,book.edition_book_number,book.id LIMIT 1;
    IF allocated_id IS NULL THEN RAISE EXCEPTION 'Not enough unused Edition 5 books; no changes made'; END IF;
    UPDATE pg_temp.edition5_repair_rows repair SET allocated_book_id=allocated_id,
      allocation_note=allocated_note,
      data=jsonb_set(data,'{book_condition}',to_jsonb(coalesce(data->>'book_condition','') || '; ' || allocated_note))
      WHERE repair.original_book=book_group.original_book;
  END LOOP;

  -- Clone the INSTALLED importer temporarily, preserving current guards and role names.
  -- The public importer and application workflow remain unchanged after this operation.
  definition:=pg_catalog.pg_get_functiondef('public.import_book3_collection_drafts(jsonb)'::regprocedure);
  IF position(continuous_match IN definition)>0 THEN previous_match:=continuous_match;
  ELSIF position(original_match IN definition)>0 THEN previous_match:=original_match;
  ELSE RAISE EXCEPTION 'Installed importer has an unrecognized book matcher; no changes made'; END IF;
  IF (length(definition)-length(replace(definition,previous_match,'')))/length(previous_match)<>1
    OR position('public.import_book3_collection_drafts(' IN definition)=0
    OR position(quote_literal('SUPER_ADMIN') IN definition)=0 THEN
    RAISE EXCEPTION 'Installed importer version or Super Admin role setup differs; no changes made';
  END IF;
  definition:=replace(definition,'public.import_book3_collection_drafts(',
    'pg_temp.import_book3_edition5_repair(');
  definition:=replace(definition,previous_match,allocated_match);
  definition:=replace(definition,'Historical import Book3.xlsx/Sheet1; source rows ',
    'Historical import Book3.xlsx/Sheet1; USER-AUTHORIZED ASSUMED BOOK ALLOCATION; original book numbers preserved in source ledger; source rows ');
  EXECUTE definition;
  SELECT jsonb_agg(data ORDER BY source_row) INTO import_payload FROM pg_temp.edition5_repair_rows;
  EXECUTE 'SELECT pg_temp.import_book3_edition5_repair($1)' INTO result USING import_payload;
  SELECT string_agg(format('Row %s: %s',repair.source_row,coalesce(imported.reason,'not imported')),'; '
    ORDER BY repair.source_row) INTO failure_details
    FROM pg_temp.edition5_repair_rows repair
    LEFT JOIN public.legacy_collection_imports imported
      ON imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text
    WHERE imported.status IS DISTINCT FROM 'IMPORTED';
  IF failure_details IS NOT NULL THEN
    RAISE EXCEPTION 'Repair rolled back. %',failure_details;
  END IF;
  UPDATE public.legacy_collection_imports imported
    SET reason=imported.reason || '; ' || repair.allocation_note ||
      CASE WHEN repair.source_row IN (189,199)
        THEN '; user-confirmed alias: Dilbar Raza = Maulana Dilbar; canonical profile Dilbar Raza' ELSE '' END
    FROM pg_temp.edition5_repair_rows repair
    WHERE imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text;
  DROP FUNCTION pg_temp.import_book3_edition5_repair(jsonb);
  RAISE NOTICE 'Imported all 13 repair rows (INR 72,686). Refresh Edition 5 summary and Book Submission.';
END;
$complete_edition5$;

-- Result: existing + repaired source rows should total INR 110,865, in review drafts.
SELECT jsonb_build_object(
  'edition',5,
  'imported_historical_rows',(SELECT count(*) FROM public.legacy_collection_imports
    WHERE status='IMPORTED' AND source_key LIKE 'Book3_v1:Sheet1:%' AND source_data->>'Edition'='5th'),
  'collected_rupees',(SELECT coalesce(sum(receipt.amount_paise),0)::numeric/100
    FROM public.book_receipts receipt JOIN public.books book ON book.id=receipt.book_id
    WHERE book.edition_id='b195f90f-925d-4c7d-985e-79a121396349'::uuid
      AND book.deleted_at IS NULL AND receipt.deleted_at IS NULL AND receipt.status='VALID'),
  'repair_allocations',(SELECT jsonb_agg(jsonb_build_object('excel_row',source_row,
    'original_book',source_data->>'Book No.','book_id',book_id,'receipt',assumed_receipt_number,
    'fundraiser_id',person_id,'note',reason) ORDER BY source_row)
    FROM public.legacy_collection_imports WHERE status='IMPORTED' AND source_key LIKE 'Book3_v1:Sheet1:%'
      AND source_row IN (16,33,66,67,68,69,70,73,74,75,189,199,205))
) AS result;
