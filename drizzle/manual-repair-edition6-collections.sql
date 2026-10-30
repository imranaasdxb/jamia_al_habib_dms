-- FIRST run manual-exact-historical-commissions.sql as owner through COMMIT.
-- Then run this ENTIRE file as the Neon application table owner.
-- Completes 15 previously skipped Edition 6 rows: INR 242,402 / commission INR 88,870.
-- Already imported rows (including the earlier four-row repair) are left unchanged.
-- Each conflicting fundraiser receives a DISTINCT available book; profiles are not merged.
-- The confirmed Maulana Dilbar alias uses the existing Dilbar Raza profile.
-- Original Excel book numbers remain in the source ledger and allocation notes.
-- Missing/incomplete rows remain excluded. All new imports stay unchecked review drafts.
-- All writes are atomic; a failed row rolls back this repair. Safe to rerun.
DO $complete_edition6$
DECLARE
  target_edition constant uuid := '77a54de5-3ce5-4a54-a450-db895ff08877';
  original_match constant text := 'AND m.edition_number=s.edition_number AND b.edition_book_number=s.book_number';
  continuous_match constant text := $match$AND m.edition_number=s.edition_number
        AND (CASE
          WHEN s.book_type='REGULAR' AND s.edition_number BETWEEN 2 AND 5
            THEN (b.receipt_from-1)/50+1
          ELSE b.edition_book_number
        END)=s.book_number$match$;
  allocated_match constant text := 'AND m.edition_number=s.edition_number AND b.id=(SELECT allocated_book_id FROM pg_temp.edition6_repair_rows WHERE source_row=s.source_row)';
  definition text; previous_match text; matched integer; already_imported integer;
  canonical_area text; canonical_name text; canonical_profile integer := 23; allocated_id uuid; allocated_ordinal integer; allocated_note text;
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
    AND kind='EDITION' AND code='06-1443-2021' AND edition_number=6
    AND edition_book_type='REGULAR' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Expected Edition 6 was not found; no changes made';
  END IF;

  CREATE TEMP TABLE edition6_repair_rows (
    source_row integer PRIMARY KEY, original_book integer NOT NULL, data jsonb NOT NULL,
    allocated_book_id uuid, allocation_note text, needs_assumed boolean NOT NULL DEFAULT false
  ) ON COMMIT DROP;
  INSERT INTO pg_temp.edition6_repair_rows(source_row,original_book,data)
    SELECT (item->>'source_row')::integer,(item->>'book_number')::integer,item
    FROM jsonb_array_elements($edition6_payload$[{"source_row":57,"profile_source_id":95,"fundraiser_name":"Quari Bilal Ahmad","book_number":673,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2022-06-01","collection_date":"2022-05-26","collection_area":"Jajpur","book_condition":"Finished","amount_paise":1581000,"commission_paise":790500,"entry_by":"S R Hussain","amount_words":"Rupees Fifteen Thousand Eight Hundred Ten Only","problems":"","raw":{"Entry Date":"2022-06-01 00:00:00","Book No.":673,"Type":"Common","Edition":"6th","Fundraiser Name":"Quari Bilal Ahmad","Address":"Jajpur","District":"Jajpur","State":"Odisha","Collection Area":"Jajpur","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-05-26 00:00:00","Book Condition":"Finished","Collection Amount":15810,"Commission Amount":7905,"Entry by":"S R Hussain"}},{"source_row":58,"profile_source_id":95,"fundraiser_name":"Quari Bilal Ahmad","book_number":464,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2022-06-01","collection_date":"2022-05-26","collection_area":"Jajpur","book_condition":"Finished","amount_paise":4603300,"commission_paise":2301600,"entry_by":"S R Hussain","amount_words":"Rupees Forty Six Thousand Thirty Three Only","problems":"","raw":{"Entry Date":"2022-06-01 00:00:00","Book No.":464,"Type":"Common","Edition":"6th","Fundraiser Name":"Quari Bilal Ahmad","Address":"Jajpur","District":"Jajpur","State":"Odisha","Collection Area":"Jajpur","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-05-26 00:00:00","Book Condition":"Finished","Collection Amount":46033,"Commission Amount":23016,"Entry by":"S R Hussain"}},{"source_row":104,"profile_source_id":38,"fundraiser_name":"Haji Gholam Rabbani","book_number":661,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2023-05-03","collection_date":"2023-05-02","collection_area":"Rasulpur","book_condition":"Finished","amount_paise":1862800,"commission_paise":0,"entry_by":"M Ashiq","amount_words":"Rupees Eighteen Thousand Six Hundred Twenty Eight Only","problems":"","raw":{"Entry Date":"2023-05-03 00:00:00","Book No.":661,"Type":"Common","Edition":"6th","Fundraiser Name":"Haji Gholam Rabbani","Address":"Rasulpur","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Rasulpur","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-02 00:00:00","Book Condition":"Finished","Collection Amount":18628,"Commission Amount":0,"Entry by":"M Ashiq"}},{"source_row":112,"profile_source_id":126,"fundraiser_name":"Syed Mujahid","book_number":95,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2023-05-03","collection_date":"2023-04-26","collection_area":"Anjira","book_condition":"Continue","amount_paise":2750000,"commission_paise":1375000,"entry_by":"M Ashiq","amount_words":"Rupees Twenty Seven Thousand Five Hundred Only","problems":"","raw":{"Entry Date":"2023-05-03 00:00:00","Book No.":95,"Type":"Common","Edition":"6th","Fundraiser Name":"Syed Mujahid","Address":"Anjira","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Anjira","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-04-26 00:00:00","Book Condition":"Continue","Collection Amount":27500,"Commission Amount":13750,"Entry by":"M Ashiq"}},{"source_row":136,"profile_source_id":20,"fundraiser_name":"Bashirul Hasan","book_number":129,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2023-05-10","collection_date":"2023-05-05","collection_area":"Bengal","book_condition":"Finished","amount_paise":1100000,"commission_paise":600000,"entry_by":"S R Hussain","amount_words":"Rupees Eleven Thousand Only","problems":"","raw":{"Entry Date":"2023-05-10 00:00:00","Book No.":129,"Type":"Common","Edition":"6th","Fundraiser Name":"Bashirul Hasan","Address":"Bengal","District":null,"State":"Bengal","Collection Area":"Bengal","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-05 00:00:00","Book Condition":"Finished","Collection Amount":11000,"Commission Amount":6000,"Entry by":"S R Hussain"}},{"source_row":140,"profile_source_id":63,"fundraiser_name":"Maulana Ashique Misbahi","book_number":50,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2023-05-13","collection_date":"2023-05-05","collection_area":"Cuttack","book_condition":"Finished","amount_paise":1070000,"commission_paise":535000,"entry_by":"S R Hussain","amount_words":"Rupees Ten Thousand Seven Hundred Only","problems":"","raw":{"Entry Date":"2023-05-13 00:00:00","Book No.":50,"Type":"Common","Edition":"6th","Fundraiser Name":"Maulana Ashique Misbahi","Address":"Kalinag","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Cuttack","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-05 00:00:00","Book Condition":"Finished","Collection Amount":10700,"Commission Amount":5350,"Entry by":"S R Hussain"}},{"source_row":150,"profile_source_id":75,"fundraiser_name":"Meraj Ahmad","book_number":117,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2023-06-05","collection_date":"2023-05-05","collection_area":"Kanhupur","book_condition":"Finished","amount_paise":390000,"commission_paise":150000,"entry_by":"S R Hussain","amount_words":"Rupees Three Thousand Nine Hundred Only","problems":"","raw":{"Entry Date":"2023-06-05 00:00:00","Book No.":117,"Type":"Common","Edition":"6th","Fundraiser Name":"Meraj Ahmad","Address":"Kanhupur","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Kanhupur","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-05 00:00:00","Book Condition":"Finished","Collection Amount":3900,"Commission Amount":1500,"Entry by":"S R Hussain"}},{"source_row":157,"profile_source_id":87,"fundraiser_name":"Mujahid Raza","book_number":105,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2023-06-05","collection_date":"2023-05-07","collection_area":"Denga","book_condition":"Continue","amount_paise":1446000,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Fourteen Thousand Four Hundred Sixty Only","problems":"","raw":{"Entry Date":"2023-06-05 00:00:00","Book No.":105,"Type":"Common","Edition":"6th","Fundraiser Name":"Mujahid Raza","Address":"Denga","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Denga","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-07 00:00:00","Book Condition":"Continue","Collection Amount":14460,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":158,"profile_source_id":92,"fundraiser_name":"Nurul Qamar","book_number":117,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2023-06-05","collection_date":"2023-05-05","collection_area":"Pokharhuda","book_condition":"Finished","amount_paise":602200,"commission_paise":200000,"entry_by":"S R Hussain","amount_words":"Rupees Six Thousand Twenty Two Only","problems":"","raw":{"Entry Date":"2023-06-05 00:00:00","Book No.":117,"Type":"Common","Edition":"6th","Fundraiser Name":"Nurul Qamar","Address":"Pokharhuda","District":"Cuttack","State":"Odisha","Collection Area":"Pokharhuda","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-05 00:00:00","Book Condition":"Finished","Collection Amount":6022,"Commission Amount":2000,"Entry by":"S R Hussain"}},{"source_row":188,"profile_source_id":123,"fundraiser_name":"Subhani","book_number":689,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2023-06-20","collection_date":"2022-09-10","collection_area":"Jolashahi","book_condition":"Finished","amount_paise":432000,"commission_paise":216000,"entry_by":"S R Hussain","amount_words":"Rupees Four Thousand Three Hundred Twenty Only","problems":"","raw":{"Entry Date":"2023-06-20 00:00:00","Book No.":689,"Type":"Common","Edition":"6th","Fundraiser Name":"Subhani","Address":"Jolashahi","District":"Cuttack","State":"Odisha","Collection Area":"Jolashahi","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-09-10 00:00:00","Book Condition":"Finished","Collection Amount":4320,"Commission Amount":2160,"Entry by":"S R Hussain"}},{"source_row":200,"profile_source_id":65,"fundraiser_name":"Maulana Dilbar","book_number":67,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2023-08-06","collection_date":"2023-07-02","collection_area":"Balikuda","book_condition":"Continue","amount_paise":387600,"commission_paise":193800,"entry_by":"S R Hussain","amount_words":"Rupees Three Thousand Eight Hundred Seventy Six Only","problems":"","raw":{"Entry Date":"2023-08-06 00:00:00","Book No.":67,"Type":"Common","Edition":"6th","Fundraiser Name":"Maulana Dilbar","Address":"Balikuda","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Balikuda","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-07-02 00:00:00","Book Condition":"Continue","Collection Amount":3876,"Commission Amount":1938,"Entry by":"S R Hussain"}},{"source_row":208,"profile_source_id":59,"fundraiser_name":"Maulana Ashiq Khan","book_number":79,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2023-09-04","collection_date":"2023-06-23","collection_area":"Cuttack","book_condition":"Continue","amount_paise":705000,"commission_paise":350000,"entry_by":"S R Husain","amount_words":"Rupees Seven Thousand Fifty Only","problems":"","raw":{"Entry Date":"2023-09-04 00:00:00","Book No.":79,"Type":"Common","Edition":"6th","Fundraiser Name":"Maulana Ashiq Khan","Address":"Kalinag","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Cuttack","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-06-23 00:00:00","Book Condition":"Continue","Collection Amount":7050,"Commission Amount":3500,"Entry by":"S R Husain"}},{"source_row":221,"profile_source_id":51,"fundraiser_name":"M Ashiq Khan","book_number":158,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2023-12-13","collection_date":"2023-12-14","collection_area":"JAH","book_condition":"Finished","amount_paise":2960100,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Twenty Nine Thousand Six Hundred One Only","problems":"","raw":{"Entry Date":"2023-12-13 00:00:00","Book No.":158,"Type":"Common","Edition":"6th","Fundraiser Name":"M Ashiq Khan","Address":"JAH","District":"Jagatsinghpur","State":"Odisha","Collection Area":"JAH","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-12-14 00:00:00","Book Condition":"Finished","Collection Amount":29601,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":250,"profile_source_id":73,"fundraiser_name":"Maulana Saiyed Mujahid","book_number":95,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2024-04-30","collection_date":"2024-04-15","collection_area":"Jajpur","book_condition":"Continue","amount_paise":3800000,"commission_paise":1900000,"entry_by":"S R Husain","amount_words":"Rupees Thirty Eight Thousand Only","problems":"","raw":{"Entry Date":"2024-04-30 00:00:00","Book No.":95,"Type":"Common","Edition":"6th","Fundraiser Name":"Maulana Saiyed Mujahid","Address":"Jajpur","District":"Jajpur","State":"Odisha","Collection Area":"Jajpur","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2024-04-15 00:00:00","Book Condition":"Continue","Collection Amount":38000,"Commission Amount":19000,"Entry by":"S R Husain"}},{"source_row":304,"profile_source_id":22,"fundraiser_name":"Dilbar","book_number":67,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2024-05-14","collection_date":"2024-05-02","collection_area":"Balikuda","book_condition":"Finished","amount_paise":550200,"commission_paise":275100,"entry_by":"S R Husain","amount_words":"Rupees Five Thousand Five Hundred Two Only","problems":"","raw":{"Entry Date":"2024-05-14 00:00:00","Book No.":67,"Type":"Common","Edition":"6th","Fundraiser Name":"Dilbar","Address":"Balikuda","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Balikuda","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2024-05-02 00:00:00","Book Condition":"Finished","Collection Amount":5502,"Commission Amount":2751,"Entry by":"S R Husain"}}]$edition6_payload$::jsonb) AS payload(item);
  IF (SELECT count(*) FROM pg_temp.edition6_repair_rows)<>15 OR
    (SELECT sum((data->>'amount_paise')::bigint) FROM pg_temp.edition6_repair_rows)<>24240200 THEN
    RAISE EXCEPTION 'Unexpected repair payload; no changes made';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.edition6_repair_rows repair
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
  DELETE FROM pg_temp.edition6_repair_rows repair USING public.legacy_collection_imports imported
    WHERE imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text AND imported.status='IMPORTED';
  IF NOT EXISTS (SELECT 1 FROM pg_temp.edition6_repair_rows) THEN
    RAISE NOTICE 'All 15 Edition 6 repair rows are already imported; nothing changed';
    RETURN;
  END IF;
  -- Reuse the alias confirmed by the user in the Edition 5 repair, without deleting profiles.
  IF EXISTS (SELECT 1 FROM pg_temp.edition6_repair_rows WHERE source_row=200) THEN
    SELECT count(*),min(person.full_name) INTO matched,canonical_name
      FROM public.fundraisers fundraiser JOIN public.people person ON person.id=fundraiser.person_id
      WHERE fundraiser.legacy_import_key='Fundraisers_Data_v1:' || canonical_profile::text
        AND person.role='COLLECTOR' AND person.deleted_at IS NULL AND fundraiser.deleted_at IS NULL
        AND lower(regexp_replace(btrim(person.full_name),'\s+',' ','g'))='dilbar raza';
    IF matched<>1 THEN RAISE EXCEPTION 'Confirmed Dilbar Raza source profile was not uniquely found'; END IF;
    UPDATE pg_temp.edition6_repair_rows
      SET data=jsonb_set(jsonb_set(data,'{profile_source_id}',to_jsonb(canonical_profile)),
        '{fundraiser_name}',to_jsonb(canonical_name)) WHERE source_row=200;
  END IF;
  -- Resolve the spelling/case variant only to a uniquely named, existing active area.
  SELECT name_en INTO canonical_area FROM public.master_records
    WHERE kind='AREA' AND level='COLLECTION' AND active AND deleted_at IS NULL
      AND lower(btrim(name_en))='jah'
    GROUP BY name_en HAVING count(*)=1
    ORDER BY (name_en='JAH') DESC,(name_en='JaH') DESC,name_en LIMIT 1;
  IF canonical_area IS NULL THEN
    RAISE EXCEPTION 'No uniquely named active JAH collection area exists; no changes made';
  END IF;
  UPDATE pg_temp.edition6_repair_rows
    SET data=jsonb_set(data,'{collection_area}',to_jsonb(canonical_area)) WHERE source_row=221;

  -- Conflicting names do not establish shared identity. Allocate separate books per profile.
  UPDATE pg_temp.edition6_repair_rows repair SET needs_assumed=
    original_book NOT BETWEEN 1 AND 600 OR EXISTS (
      SELECT 1 FROM public.legacy_collection_imports other_source
      WHERE other_source.source_key LIKE 'Book3_v1:Sheet1:%'
        AND other_source.source_data->>'Edition'='6th' AND other_source.source_data->>'Type'='Common'
        AND other_source.source_data->>'Book No.'=repair.original_book::text
        AND nullif(btrim(other_source.source_data->>'Fundraiser Name'),'') IS NOT NULL
        AND other_source.source_data->>'Fundraiser Name' IS DISTINCT FROM repair.data->'raw'->>'Fundraiser Name'
    );
  FOR book_group IN
    SELECT original_book,(data->>'profile_source_id')::integer AS profile_id,bool_or(needs_assumed) AS assumed
      FROM pg_temp.edition6_repair_rows
      GROUP BY original_book,(data->>'profile_source_id')::integer
      ORDER BY original_book,(data->>'profile_source_id')::integer
  LOOP
    SELECT book.id,book.edition_book_number,
      CASE WHEN book_group.assumed THEN
        format('USER-AUTHORIZED ASSUMED BOOK ALLOCATION: original Excel book %s -> ED-06-Book%s/%s (receipts %s-%s); one fundraiser per allocated book',
          book_group.original_book,book.edition_book_number,book.receipt_from,book.receipt_from,book.receipt_to)
      ELSE format('Existing Edition 6 Book%s/%s; exact recorded historical commission retained',
        book.edition_book_number,book.receipt_from) END
      INTO allocated_id,allocated_ordinal,allocated_note
    FROM public.books book WHERE book.edition_id=target_edition AND book.book_type='REGULAR'
      AND book.deleted_at IS NULL AND book.status='IN_STOCK' AND book.total_receipts=50
      AND book.token_value_paise IS NULL
      AND (book_group.assumed OR book.edition_book_number=book_group.original_book)
      AND NOT EXISTS (SELECT 1 FROM public.book_cases WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM public.book_returns WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM public.book_receipts WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM pg_temp.edition6_repair_rows WHERE allocated_book_id=book.id)
      AND (NOT book_group.assumed OR NOT EXISTS (
        SELECT 1 FROM public.legacy_collection_imports historical
        WHERE historical.source_key LIKE 'Book3_v1:Sheet1:%'
          AND historical.source_data->>'Edition'='6th' AND historical.source_data->>'Type'='Common'
          AND historical.source_data->>'Book No.'=book.edition_book_number::text
      ))
    ORDER BY book.receipt_from,book.edition_book_number,book.id LIMIT 1;
    IF allocated_id IS NULL THEN
      RAISE EXCEPTION 'No eligible free Edition 6 book for historical book %, profile %; repair rolled back',
        book_group.original_book,book_group.profile_id;
    END IF;
    UPDATE pg_temp.edition6_repair_rows repair SET allocated_book_id=allocated_id,
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
    'pg_temp.import_book3_edition6_repair(');
  definition:=replace(definition,previous_match,allocated_match);
  definition:=replace(definition,'Historical import Book3.xlsx/Sheet1; source rows ',
    'Historical import Book3.xlsx/Sheet1; USER-AUTHORIZED ASSUMED BOOK ALLOCATION; original book numbers preserved in source ledger; source rows ');
  EXECUTE definition;
  SELECT jsonb_agg(data ORDER BY source_row) INTO import_payload FROM pg_temp.edition6_repair_rows;
  EXECUTE 'SELECT pg_temp.import_book3_edition6_repair($1)' INTO result USING import_payload;
  SELECT string_agg(format('Row %s: %s',repair.source_row,coalesce(imported.reason,'not imported')),'; '
    ORDER BY repair.source_row) INTO failure_details
    FROM pg_temp.edition6_repair_rows repair
    LEFT JOIN public.legacy_collection_imports imported
      ON imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text
    WHERE imported.status IS DISTINCT FROM 'IMPORTED';
  IF failure_details IS NOT NULL THEN
    RAISE EXCEPTION 'Repair rolled back. %',failure_details;
  END IF;
  UPDATE public.legacy_collection_imports imported
    SET reason=imported.reason || '; ' || repair.allocation_note ||
      CASE WHEN repair.source_row=200 THEN '; confirmed alias: Maulana Dilbar = Dilbar Raza' ELSE '' END ||
      CASE WHEN repair.source_row=221 THEN '; JAH resolved to existing collection area ' || canonical_area ELSE '' END
    FROM pg_temp.edition6_repair_rows repair
    WHERE imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text;
  DROP FUNCTION pg_temp.import_book3_edition6_repair(jsonb);
  RAISE NOTICE 'Imported every remaining eligible Edition 6 repair row with exact commission amounts. Refresh Edition 6 summary and Book Submission.';
END;
$complete_edition6$;

-- Expected complete historical source totals: 183 rows, INR 2,836,703 collection / INR 505,393 commission.
SELECT jsonb_build_object(
  'edition',6,
  'imported_historical_rows',(SELECT count(*) FROM public.legacy_collection_imports
    WHERE status='IMPORTED' AND source_key LIKE 'Book3_v1:Sheet1:%' AND source_data->>'Edition'='6th'),
  'collected_rupees',(SELECT coalesce(sum(receipt.amount_paise),0)::numeric/100
    FROM public.book_receipts receipt JOIN public.books book ON book.id=receipt.book_id
    WHERE book.edition_id='77a54de5-3ce5-4a54-a450-db895ff08877'::uuid
      AND book.deleted_at IS NULL AND receipt.deleted_at IS NULL AND receipt.status='VALID'),
  'commission_rupees',(SELECT coalesce(sum(returned.commission_paise),0)::numeric/100
    FROM public.book_returns returned JOIN public.books book ON book.id=returned.book_id
    WHERE book.edition_id='77a54de5-3ce5-4a54-a450-db895ff08877'::uuid
      AND book.deleted_at IS NULL AND returned.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM public.book_receipts receipt WHERE receipt.return_id=returned.id
        AND receipt.deleted_at IS NULL AND receipt.status='VALID')),
  'repair_allocations',(SELECT jsonb_agg(jsonb_build_object('excel_row',source_row,
    'original_book',source_data->>'Book No.','book_id',book_id,'receipt',assumed_receipt_number,
    'fundraiser_id',person_id,'note',reason) ORDER BY source_row)
    FROM public.legacy_collection_imports WHERE status='IMPORTED' AND source_key LIKE 'Book3_v1:Sheet1:%'
      AND source_row IN (57,58,104,112,136,140,150,157,158,188,200,208,221,250,304))
) AS result;
