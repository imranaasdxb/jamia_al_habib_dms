-- Run this ENTIRE file as the Neon application table owner.
-- Requires manual-exact-historical-commissions.sql already applied (Edition 6 setup).
-- Edition 1 source: 22 rows / INR 37,589 collection / INR 5,385 commission.
-- Excluded: row 40 Khoraki (INR 7,300), row 214 invalid collection date (INR 2,500).
-- Eligible: 20 rows / INR 27,789 collection / INR 5,385 exact commission.
-- T50: INR 9,289 / commission INR 1,485. T100: INR 18,500 / commission INR 3,900.
-- Only matching TOKEN editions and denominations are used; regular stock is untouched.
-- Original book numbers/raw data are preserved. Unmatched books get explicit assumed allocations.
-- Each allocated book belongs to one fundraiser. Existing imports are skipped.
-- New records stay unchecked historical summary drafts; zero amounts consume no receipt.
-- All changes are atomic. Safe to rerun.
DO $repair_edition1$
DECLARE
  original_match constant text := 'AND m.edition_number=s.edition_number AND b.edition_book_number=s.book_number';
  continuous_match constant text := $match$AND m.edition_number=s.edition_number
        AND (CASE
          WHEN s.book_type='REGULAR' AND s.edition_number BETWEEN 2 AND 5
            THEN (b.receipt_from-1)/50+1
          ELSE b.edition_book_number
        END)=s.book_number$match$;
  allocated_match constant text := 'AND m.edition_number=s.edition_number AND b.id=(SELECT allocated_book_id FROM pg_temp.edition1_repair_rows WHERE source_row=s.source_row)';
  definition text; previous_match text; canonical_area text;
  allocated_id uuid; allocated_ordinal integer; allocated_note text;
  book_group record; import_payload jsonb; result jsonb; failure_details text;
BEGIN
  IF current_user='dms_runtime' OR
    (SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.books'::regclass)
      <> current_user::regrole::oid THEN
    RAISE EXCEPTION 'Run this repair as the application table owner' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dms:import:Book3_v1'));
  LOCK TABLE public.people,public.fundraisers,public.master_records,public.books,
    public.book_assignments,public.book_cases,public.book_returns,public.book_receipts,
    public.legacy_collection_imports IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.book_returns'::regclass
    AND attname='historical_commission_paise' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Run manual-exact-historical-commissions.sql first; no changes made';
  END IF;
  CREATE TEMP TABLE edition1_repair_rows (
    source_row integer PRIMARY KEY, original_book integer NOT NULL, data jsonb NOT NULL,
    target_edition_id uuid, allocated_book_id uuid, allocation_note text
  ) ON COMMIT DROP;
  INSERT INTO pg_temp.edition1_repair_rows(source_row,original_book,data)
    SELECT (item->>'source_row')::integer,(item->>'book_number')::integer,item
    FROM jsonb_array_elements($edition1_payload$[{"source_row":39,"profile_source_id":138,"fundraiser_name":"Ziauddin Shaikh","book_number":200,"book_type":"TOKEN","edition_number":1,"token_paise":10000,"entry_date":"2022-05-18","collection_date":"2022-05-01","collection_area":"Paradeep","book_condition":"Finished","amount_paise":50000,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Five Hundred Only","problems":"","raw":{"Entry Date":"2022-05-18 00:00:00","Book No.":200,"Type":"T100","Edition":"1st","Fundraiser Name":"Ziauddin Shaikh","Address":"Paradeep","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Paradeep","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2022-05-01 00:00:00","Book Condition":"Finished","Collection Amount":500,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":121,"profile_source_id":34,"fundraiser_name":"Hafiz Imdad Alam","book_number":211,"book_type":"TOKEN","edition_number":1,"token_paise":10000,"entry_date":"2023-05-03","collection_date":"2023-04-26","collection_area":"Nalibar","book_condition":"Continue","amount_paise":140000,"commission_paise":70000,"entry_by":"M Ashiq","amount_words":"Rupees One Thousand Four Hundred Only","problems":"","raw":{"Entry Date":"2023-05-03 00:00:00","Book No.":211,"Type":"T100","Edition":"1st","Fundraiser Name":"Hafiz Imdad Alam","Address":"Nalibar","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Nalibar","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-04-26 00:00:00","Book Condition":"Continue","Collection Amount":1400,"Commission Amount":700,"Entry by":"M Ashiq"}},{"source_row":124,"profile_source_id":34,"fundraiser_name":"Hafiz Imdad Alam","book_number":104,"book_type":"TOKEN","edition_number":1,"token_paise":5000,"entry_date":"2023-05-03","collection_date":"2023-04-26","collection_area":"Nalibar","book_condition":"Continue","amount_paise":30000,"commission_paise":15000,"entry_by":"M Ashiq","amount_words":"Rupees Three Hundred Only","problems":"","raw":{"Entry Date":"2023-05-03 00:00:00","Book No.":104,"Type":"T50","Edition":"1st","Fundraiser Name":"Hafiz Imdad Alam","Address":"Nalibar","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Nalibar","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-04-26 00:00:00","Book Condition":"Continue","Collection Amount":300,"Commission Amount":150,"Entry by":"M Ashiq"}},{"source_row":129,"profile_source_id":4,"fundraiser_name":"Abu Sufyan","book_number":219,"book_type":"TOKEN","edition_number":1,"token_paise":10000,"entry_date":"2023-05-10","collection_date":"2023-05-07","collection_area":"Anjira","book_condition":"Finished","amount_paise":120000,"commission_paise":60000,"entry_by":"S R Hussain","amount_words":"Rupees One Thousand Two Hundred Only","problems":"","raw":{"Entry Date":"2023-05-10 00:00:00","Book No.":219,"Type":"T100","Edition":"1st","Fundraiser Name":"Abu Sufyan","Address":"Anjira","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Anjira","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-07 00:00:00","Book Condition":"Finished","Collection Amount":1200,"Commission Amount":600,"Entry by":"S R Hussain"}},{"source_row":130,"profile_source_id":4,"fundraiser_name":"Abu Sufyan","book_number":119,"book_type":"TOKEN","edition_number":1,"token_paise":5000,"entry_date":"2023-05-10","collection_date":"2023-05-07","collection_area":"Anjira","book_condition":"Finished","amount_paise":80000,"commission_paise":40000,"entry_by":"S R Hussain","amount_words":"Rupees Eight Hundred Only","problems":"","raw":{"Entry Date":"2023-05-10 00:00:00","Book No.":119,"Type":"T50","Edition":"1st","Fundraiser Name":"Abu Sufyan","Address":"Anjira","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Anjira","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-07 00:00:00","Book Condition":"Finished","Collection Amount":800,"Commission Amount":400,"Entry by":"S R Hussain"}},{"source_row":135,"profile_source_id":134,"fundraiser_name":"Yasin","book_number":115,"book_type":"TOKEN","edition_number":1,"token_paise":5000,"entry_date":"2023-05-10","collection_date":"2023-05-05","collection_area":"Pahrajpur","book_condition":"Finished","amount_paise":60000,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Six Hundred Only","problems":"","raw":{"Entry Date":"2023-05-10 00:00:00","Book No.":115,"Type":"T50","Edition":"1st","Fundraiser Name":"Yasin","Address":"Pahrajpur","District":"Cuttack","State":"Odisha","Collection Area":"Pahrajpur","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-05 00:00:00","Book Condition":"Finished","Collection Amount":600,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":143,"profile_source_id":125,"fundraiser_name":"Sufyan Raza","book_number":215,"book_type":"TOKEN","edition_number":1,"token_paise":10000,"entry_date":"2023-05-13","collection_date":"2023-05-05","collection_area":"Anjira","book_condition":"Finished","amount_paise":200000,"commission_paise":100000,"entry_by":"S R Hussain","amount_words":"Rupees Two Thousand Only","problems":"","raw":{"Entry Date":"2023-05-13 00:00:00","Book No.":215,"Type":"T100","Edition":"1st","Fundraiser Name":"Sufyan Raza","Address":"Anjira","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Anjira","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-05 00:00:00","Book Condition":"Finished","Collection Amount":2000,"Commission Amount":1000,"Entry by":"S R Hussain"}},{"source_row":144,"profile_source_id":124,"fundraiser_name":"Sufyan","book_number":114,"book_type":"TOKEN","edition_number":1,"token_paise":5000,"entry_date":"2023-05-13","collection_date":"2023-05-05","collection_area":"Anjira","book_condition":"Finished","amount_paise":158200,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees One Thousand Five Hundred Eighty Two Only","problems":"","raw":{"Entry Date":"2023-05-13 00:00:00","Book No.":114,"Type":"T50","Edition":"1st","Fundraiser Name":"Sufyan ","Address":"Anjira","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Anjira","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-05 00:00:00","Book Condition":"Finished","Collection Amount":1582,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":145,"profile_source_id":109,"fundraiser_name":"Salman Raza","book_number":113,"book_type":"TOKEN","edition_number":1,"token_paise":5000,"entry_date":"2023-05-13","collection_date":"2023-05-05","collection_area":"Denga","book_condition":"Finished","amount_paise":15000,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees One Hundred Fifty Only","problems":"","raw":{"Entry Date":"2023-05-13 00:00:00","Book No.":113,"Type":"T50","Edition":"1st","Fundraiser Name":"Salman Raza","Address":"Denga","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Denga","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-05 00:00:00","Book Condition":"Finished","Collection Amount":150,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":153,"profile_source_id":30,"fundraiser_name":"Gulzar Ahmad","book_number":120,"book_type":"TOKEN","edition_number":1,"token_paise":5000,"entry_date":"2023-06-05","collection_date":"2023-05-09","collection_area":"Kornia","book_condition":"Finished","amount_paise":35000,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Three Hundred Fifty Only","problems":"","raw":{"Entry Date":"2023-06-05 00:00:00","Book No.":120,"Type":"T50","Edition":"1st","Fundraiser Name":"Gulzar Ahmad","Address":"Kornia","District":"Jagatsinghpur","State":"Odisha","Collection Area":"Kornia","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-09 00:00:00","Book Condition":"Finished","Collection Amount":350,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":173,"profile_source_id":110,"fundraiser_name":"Sarfaraz","book_number":217,"book_type":"TOKEN","edition_number":1,"token_paise":10000,"entry_date":"2023-06-19","collection_date":"2023-06-08","collection_area":"Cuttack","book_condition":"Finished","amount_paise":20000,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Two Hundred Only","problems":"","raw":{"Entry Date":"2023-06-19 00:00:00","Book No.":217,"Type":"T100","Edition":"1st","Fundraiser Name":"Sarfaraz","Address":"Cuttack","District":"Cuttack","State":"Odisha","Collection Area":"Cuttack","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-06-08 00:00:00","Book Condition":"Finished","Collection Amount":200,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":174,"profile_source_id":12,"fundraiser_name":"Arshad Mullah","book_number":116,"book_type":"TOKEN","edition_number":1,"token_paise":5000,"entry_date":"2023-06-19","collection_date":"2023-06-06","collection_area":"Cuttack","book_condition":"Finished","amount_paise":10000,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees One Hundred Only","problems":"","raw":{"Entry Date":"2023-06-19 00:00:00","Book No.":116,"Type":"T50","Edition":"1st","Fundraiser Name":"Arshad Mullah","Address":"Cuttack","District":"Cuttack","State":"Odisha","Collection Area":"Cuttack","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-06-06 00:00:00","Book Condition":"Finished","Collection Amount":100,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":175,"profile_source_id":110,"fundraiser_name":"Sarfaraz","book_number":117,"book_type":"TOKEN","edition_number":1,"token_paise":5000,"entry_date":"2023-06-19","collection_date":"2023-06-06","collection_area":"Cuttack","book_condition":"Finished","amount_paise":10000,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees One Hundred Only","problems":"","raw":{"Entry Date":"2023-06-19 00:00:00","Book No.":117,"Type":"T50","Edition":"1st","Fundraiser Name":"Sarfaraz","Address":"Cuttack","District":"Cuttack","State":"Odisha","Collection Area":"Cuttack","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-06-06 00:00:00","Book Condition":"Finished","Collection Amount":100,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":176,"profile_source_id":99,"fundraiser_name":"Ramzani","book_number":118,"book_type":"TOKEN","edition_number":1,"token_paise":5000,"entry_date":"2023-06-19","collection_date":"2023-05-10","collection_area":"Cuttack","book_condition":"Finished","amount_paise":343700,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Three Thousand Four Hundred Thirty Seven Only","problems":"","raw":{"Entry Date":"2023-06-19 00:00:00","Book No.":118,"Type":"T50","Edition":"1st","Fundraiser Name":"Ramzani","Address":"Cuttack","District":"Cuttack","State":"Odisha","Collection Area":"Cuttack","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-10 00:00:00","Book Condition":"Finished","Collection Amount":3437,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":177,"profile_source_id":99,"fundraiser_name":"Ramzani","book_number":218,"book_type":"TOKEN","edition_number":1,"token_paise":10000,"entry_date":"2023-06-19","collection_date":"2023-05-19","collection_area":"Cuttack","book_condition":"Finished","amount_paise":500000,"commission_paise":0,"entry_by":"S R Hussain","amount_words":"Rupees Five Thousand Only","problems":"","raw":{"Entry Date":"2023-06-19 00:00:00","Book No.":218,"Type":"T100","Edition":"1st","Fundraiser Name":"Ramzani","Address":"Cuttack","District":"Cuttack","State":"Odisha","Collection Area":"Cuttack","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-05-19 00:00:00","Book Condition":"Finished","Collection Amount":5000,"Commission Amount":0,"Entry by":"S R Hussain"}},{"source_row":192,"profile_source_id":102,"fundraiser_name":"Riyazat Husain","book_number":201,"book_type":"TOKEN","edition_number":1,"token_paise":10000,"entry_date":"2023-07-11","collection_date":"2023-07-11","collection_area":"JaH","book_condition":"Finished","amount_paise":500000,"commission_paise":0,"entry_by":"S R Husain","amount_words":"Rupees Five Thousand Only","problems":"","raw":{"Entry Date":"2023-07-11 00:00:00","Book No.":201,"Type":"T100","Edition":"1st","Fundraiser Name":"Riyazat Husain","Address":"Rasulpur","District":"Jagatsinghpur","State":"Odisha","Collection Area":"JaH","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-07-11 00:00:00","Book Condition":"Finished","Collection Amount":5000,"Commission Amount":0,"Entry by":"S R Husain"}},{"source_row":201,"profile_source_id":112,"fundraiser_name":"Shahid","book_number":8,"book_type":"TOKEN","edition_number":1,"token_paise":5000,"entry_date":"2023-08-06","collection_date":"2023-07-03","collection_area":"Sambhalpur","book_condition":"Finished","amount_paise":187000,"commission_paise":93500,"entry_by":"S R Hussain","amount_words":"Rupees One Thousand Eight Hundred Seventy Only","problems":"","raw":{"Entry Date":"2023-08-06 00:00:00","Book No.":8,"Type":"T50","Edition":"1st","Fundraiser Name":"Shahid","Address":"Sambhalpur","District":"Sambhalpur","State":"Odisha","Collection Area":"Sambhalpur","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-07-03 00:00:00","Book Condition":"Finished","Collection Amount":1870,"Commission Amount":935,"Entry by":"S R Hussain"}},{"source_row":202,"profile_source_id":112,"fundraiser_name":"Shahid","book_number":233,"book_type":"TOKEN","edition_number":1,"token_paise":10000,"entry_date":"2023-08-06","collection_date":"2023-07-03","collection_area":"Sambhalpur","book_condition":"Finished","amount_paise":320000,"commission_paise":160000,"entry_by":"S R Hussain","amount_words":"Rupees Three Thousand Two Hundred Only","problems":"","raw":{"Entry Date":"2023-08-06 00:00:00","Book No.":233,"Type":"T100","Edition":"1st","Fundraiser Name":"Shahid","Address":"Sambhalpur","District":"Sambhalpur","State":"Odisha","Collection Area":"Sambhalpur","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-07-03 00:00:00","Book Condition":"Finished","Collection Amount":3200,"Commission Amount":1600,"Entry by":"S R Hussain"}},{"source_row":211,"profile_source_id":130,"fundraiser_name":"Tanweer","book_number":212,"book_type":"TOKEN","edition_number":1,"token_paise":10000,"entry_date":"2023-09-04","collection_date":"2023-03-20","collection_area":"Puri","book_condition":"Not Used","amount_paise":0,"commission_paise":0,"entry_by":"S R Husain","amount_words":"Rupees Zero Only","problems":"","raw":{"Entry Date":"2023-09-04 00:00:00","Book No.":212,"Type":"T100","Edition":"1st","Fundraiser Name":"Tanweer","Address":"Puri","District":"Puri","State":"Odisha","Collection Area":"Puri","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-03-20 00:00:00","Book Condition":"Not Used","Collection Amount":0,"Commission Amount":0,"Entry by":"S R Husain"}},{"source_row":212,"profile_source_id":130,"fundraiser_name":"Tanweer","book_number":111,"book_type":"TOKEN","edition_number":1,"token_paise":5000,"entry_date":"2023-09-04","collection_date":"2023-06-20","collection_area":"Puri","book_condition":"Not Used","amount_paise":0,"commission_paise":0,"entry_by":"S R Husain","amount_words":"Rupees Zero Only","problems":"","raw":{"Entry Date":"2023-09-04 00:00:00","Book No.":111,"Type":"T50","Edition":"1st","Fundraiser Name":"Tanweer","Address":"Puri","District":"Puri","State":"Odisha","Collection Area":"Puri","Mobile No":null,"WhatsApp No.":null,"Collection Date":"2023-06-20 00:00:00","Book Condition":"Not Used","Collection Amount":0,"Commission Amount":0,"Entry by":"S R Husain"}}]$edition1_payload$::jsonb) AS payload(item);
  IF (SELECT count(*) FROM pg_temp.edition1_repair_rows)<>20
    OR (SELECT sum((data->>'amount_paise')::bigint) FROM pg_temp.edition1_repair_rows)<>2778900
    OR (SELECT sum((data->>'commission_paise')::bigint) FROM pg_temp.edition1_repair_rows)<>538500 THEN
    RAISE EXCEPTION 'Unexpected Edition 1 source payload; no changes made';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.edition1_repair_rows repair
    LEFT JOIN public.legacy_collection_imports imported
      ON imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text
    WHERE imported.source_key IS NULL OR imported.source_hash IS DISTINCT FROM
      encode(sha256(convert_to((repair.data->'raw')::text,'UTF8')),'hex')
  ) THEN
    RAISE EXCEPTION 'Original staged Edition 1 source is missing or changed; no changes made';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (SELECT DISTINCT (data->>'token_paise')::integer AS token_paise
      FROM pg_temp.edition1_repair_rows) required
    LEFT JOIN public.master_records edition ON edition.kind='EDITION' AND edition.edition_number=1
      AND edition.edition_book_type='TOKEN' AND edition.edition_token_value_paise=required.token_paise
      AND edition.deleted_at IS NULL
    GROUP BY required.token_paise HAVING count(edition.id)<>1
  ) THEN
    RAISE EXCEPTION 'Each required Edition 1 token value must identify exactly one existing token edition';
  END IF;
  UPDATE pg_temp.edition1_repair_rows repair SET target_edition_id=edition.id
    FROM public.master_records edition WHERE edition.kind='EDITION' AND edition.edition_number=1
      AND edition.edition_book_type='TOKEN' AND edition.deleted_at IS NULL
      AND edition.edition_token_value_paise=(repair.data->>'token_paise')::integer;
  IF EXISTS (
    SELECT 1 FROM pg_temp.edition1_repair_rows repair
    JOIN public.legacy_collection_imports imported ON imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text
    LEFT JOIN public.books book ON book.id=imported.book_id
    WHERE imported.status='IMPORTED' AND (book.edition_id IS DISTINCT FROM repair.target_edition_id
      OR book.token_value_paise IS DISTINCT FROM (repair.data->>'token_paise')::integer)
  ) THEN
    RAISE EXCEPTION 'An existing import belongs to a different token edition; existing records were preserved';
  END IF;
  DELETE FROM pg_temp.edition1_repair_rows repair USING public.legacy_collection_imports imported
    WHERE imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text AND imported.status='IMPORTED';
  IF NOT EXISTS (SELECT 1 FROM pg_temp.edition1_repair_rows) THEN
    RAISE NOTICE 'All 20 eligible Edition 1 source rows are already imported; nothing changed';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_temp.edition1_repair_rows WHERE lower(btrim(data->>'collection_area'))='jah') THEN
    SELECT name_en INTO canonical_area FROM public.master_records
      WHERE kind='AREA' AND level='COLLECTION' AND active AND deleted_at IS NULL AND lower(btrim(name_en))='jah'
      GROUP BY name_en HAVING count(*)=1
      ORDER BY (name_en='JAH') DESC,(name_en='JaH') DESC,name_en LIMIT 1;
    IF canonical_area IS NULL THEN RAISE EXCEPTION 'No uniquely named active JAH collection area exists'; END IF;
    UPDATE pg_temp.edition1_repair_rows SET data=jsonb_set(data,'{collection_area}',to_jsonb(canonical_area))
      WHERE lower(btrim(data->>'collection_area'))='jah';
  END IF;

  FOR book_group IN
    SELECT target_edition_id,original_book,(data->>'token_paise')::integer AS token_paise,
      (data->>'profile_source_id')::integer AS profile_id
    FROM pg_temp.edition1_repair_rows
    GROUP BY target_edition_id,original_book,(data->>'token_paise')::integer,(data->>'profile_source_id')::integer
    ORDER BY (data->>'token_paise')::integer,original_book,(data->>'profile_source_id')::integer
  LOOP
    SELECT book.id,book.edition_book_number,
      CASE WHEN book.edition_book_number=book_group.original_book THEN
        format('Existing Edition 1 T%s-Book%s/%s; original token denomination retained',
          book_group.token_paise/100,book.edition_book_number,book.receipt_from)
      ELSE format('USER-AUTHORIZED ASSUMED BOOK ALLOCATION: original Excel T%s book %s -> Edition 1 T%s-Book%s/%s (receipts %s-%s)',
        book_group.token_paise/100,book_group.original_book,book_group.token_paise/100,
        book.edition_book_number,book.receipt_from,book.receipt_from,book.receipt_to) END
      INTO allocated_id,allocated_ordinal,allocated_note
    FROM public.books book WHERE book.edition_id=book_group.target_edition_id
      AND book.book_type='TOKEN' AND book.token_value_paise=book_group.token_paise
      AND book.deleted_at IS NULL AND book.status='IN_STOCK' AND book.total_receipts=50
      AND NOT EXISTS (SELECT 1 FROM public.book_cases WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM public.book_returns WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM public.book_receipts WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM pg_temp.edition1_repair_rows WHERE allocated_book_id=book.id)
      AND (book.edition_book_number=book_group.original_book OR NOT EXISTS (
        SELECT 1 FROM public.legacy_collection_imports historical
        WHERE historical.source_key LIKE 'Book3_v1:Sheet1:%' AND historical.source_data->>'Edition'='1st'
          AND historical.source_data->>'Type'='T' || (book_group.token_paise/100)::text
          AND historical.source_data->>'Book No.'=book.edition_book_number::text
      ))
    ORDER BY (book.edition_book_number=book_group.original_book) DESC,book.receipt_from,book.edition_book_number,book.id LIMIT 1;
    IF allocated_id IS NULL THEN
      RAISE EXCEPTION 'No free Edition 1 T% book for historical book %; repair rolled back',book_group.token_paise/100,book_group.original_book;
    END IF;
    UPDATE pg_temp.edition1_repair_rows repair SET allocated_book_id=allocated_id,allocation_note=allocated_note,
      data=jsonb_set(jsonb_set(data,'{book_number}',to_jsonb(allocated_ordinal)),
        '{book_condition}',to_jsonb(coalesce(data->>'book_condition','') || '; ' || allocated_note))
      WHERE repair.target_edition_id=book_group.target_edition_id AND repair.original_book=book_group.original_book
        AND (repair.data->>'profile_source_id')::integer=book_group.profile_id;
  END LOOP;

  definition:=replace(pg_get_functiondef('public.import_book3_collection_drafts(jsonb)'::regprocedure),E'\r\n',E'\n');
  IF position(continuous_match IN definition)>0 THEN previous_match:=continuous_match;
  ELSIF position(original_match IN definition)>0 THEN previous_match:=original_match;
  ELSE RAISE EXCEPTION 'Installed importer has an unrecognized book matcher'; END IF;
  IF (length(definition)-length(replace(definition,previous_match,'')))/length(previous_match)<>1
    OR position('public.import_book3_collection_drafts(' IN definition)=0
    OR position(quote_literal('SUPER_ADMIN') IN definition)=0
    OR position('last_used,commission_basis_points,historical_commission_paise,commission_given,' IN definition)=0 THEN
    RAISE EXCEPTION 'Installed importer or exact commission setup differs; no changes made';
  END IF;
  definition:=replace(definition,'public.import_book3_collection_drafts(','pg_temp.import_book3_edition1_repair(');
  definition:=replace(definition,previous_match,allocated_match);
  definition:=replace(definition,'Historical import Book3.xlsx/Sheet1; source rows ',
    'Historical import Book3.xlsx/Sheet1; token value preserved; original book references in source ledger; source rows ');
  EXECUTE definition;
  SELECT jsonb_agg(data ORDER BY source_row) INTO import_payload FROM pg_temp.edition1_repair_rows;
  EXECUTE 'SELECT pg_temp.import_book3_edition1_repair($1)' INTO result USING import_payload;
  SELECT string_agg(format('Row %s: %s',repair.source_row,coalesce(imported.reason,'not imported')),'; '
    ORDER BY repair.source_row) INTO failure_details
    FROM pg_temp.edition1_repair_rows repair LEFT JOIN public.legacy_collection_imports imported
      ON imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text
    WHERE imported.status IS DISTINCT FROM 'IMPORTED';
  IF failure_details IS NOT NULL THEN RAISE EXCEPTION 'Repair rolled back. %',failure_details; END IF;
  UPDATE public.legacy_collection_imports imported SET reason=imported.reason || '; ' || repair.allocation_note
    FROM pg_temp.edition1_repair_rows repair WHERE imported.source_key='Book3_v1:Sheet1:' || repair.source_row::text;
  DROP FUNCTION pg_temp.import_book3_edition1_repair(jsonb);
  RAISE NOTICE 'Imported all remaining eligible Edition 1 token rows. Refresh both T50 and T100 edition summaries.';
END;
$repair_edition1$;

-- Actual saved source totals and locations, grouped by token value. No double-counted commissions.
SELECT imported.source_data->>'Type' AS token_type,count(*) AS imported_source_rows,
  sum((imported.source_data->>'Collection Amount')::numeric) AS source_collection_rupees,
  sum((imported.source_data->>'Commission Amount')::numeric) AS source_commission_rupees,
  sum(coalesce(receipt.amount_paise,0))::numeric/100 AS saved_collection_rupees,
  jsonb_agg(jsonb_build_object('excel_row',imported.source_row,'fundraiser',imported.source_data->>'Fundraiser Name',
    'original_book',imported.source_data->>'Book No.','book',book.book_number,
    'receipt',imported.assumed_receipt_number,'note',imported.reason) ORDER BY imported.source_row) AS allocations
FROM public.legacy_collection_imports imported
LEFT JOIN public.books book ON book.id=imported.book_id
LEFT JOIN public.book_receipts receipt ON receipt.id=imported.receipt_id AND receipt.deleted_at IS NULL AND receipt.status='VALID'
WHERE imported.source_key LIKE 'Book3_v1:Sheet1:%' AND imported.status='IMPORTED'
  AND imported.source_data->>'Edition'='1st'
GROUP BY imported.source_data->>'Type' ORDER BY imported.source_data->>'Type';
