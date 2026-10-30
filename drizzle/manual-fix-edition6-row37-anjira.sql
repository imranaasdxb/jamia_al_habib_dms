-- Run this ENTIRE file as the Neon application table owner.
-- User confirmed: Book3 row 37, Edition 6 Book 30 collection area is Anjira.
-- Adds INR 41,500 collection / INR 20,750 commission as an unchecked review draft.
-- Preserves original Excel data and hash; stores the confirmed correction separately.
-- Uses Book 30's starting receipt. Existing imports are preserved. Safe to rerun.
DO $repair_anjira$
DECLARE
  payload jsonb := $row37_payload${"source_row":37,"profile_source_id":62,"fundraiser_name":"Maulana Ashique Khan","book_number":30,"book_type":"REGULAR","edition_number":6,"token_paise":null,"entry_date":"2022-05-18","collection_date":"2022-05-04","collection_area":"2022-05-04 00:00:00","book_condition":"Finished","amount_paise":4150000,"commission_paise":2075000,"entry_by":"S R Hussain","amount_words":"Rupees Forty One Thousand Five Hundred Only","problems":"","raw":{"Entry Date":"2022-05-18 00:00:00","Book No.":30,"Type":"Common","Edition":"6th","Fundraiser Name":"Maulana Ashique Khan","Address":"Kalinag","District":"Jagatsinghpur","State":"Odisha","Collection Area":"2022-05-04 00:00:00","Mobile No":9853932322,"WhatsApp No.":null,"Collection Date":"2022-05-04 00:00:00","Book Condition":"Finished","Collection Amount":41500,"Commission Amount":20750,"Entry by":"S R Hussain"}}$row37_payload$::jsonb;
  source_key_value constant text := 'Book3_v1:Sheet1:37';
  target_edition constant uuid := '77a54de5-3ce5-4a54-a450-db895ff08877';
  source_record record;
  helper_definition text;
  old_projection constant text := 'SELECT imported.source_data INTO original_source';
  new_projection constant text := 'SELECT imported.source_data || coalesce(to_jsonb(imported)->''source_corrections'',''{}''::jsonb) INTO original_source';
  matched integer; result jsonb; operator_id uuid;
BEGIN
  IF current_user='dms_runtime' OR
    (SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.books'::regclass)
      <> current_user::regrole::oid THEN
    RAISE EXCEPTION 'Run this repair as the application table owner' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dms:import:Book3_v1'));
  SELECT * INTO source_record FROM public.legacy_collection_imports WHERE source_key=source_key_value;
  IF NOT FOUND OR source_record.source_data IS DISTINCT FROM payload->'raw'
    OR source_record.source_hash IS DISTINCT FROM encode(sha256(convert_to((payload->'raw')::text,'UTF8')),'hex') THEN
    RAISE EXCEPTION 'Original Book3 row 37 is missing or changed; no changes made';
  END IF;
  IF source_record.status='IMPORTED' THEN
    RAISE NOTICE 'Row 37 is already imported; no duplicate entry created';
    RETURN;
  END IF;
  SELECT count(*) INTO matched FROM public.master_records
    WHERE kind='AREA' AND level='COLLECTION' AND active AND deleted_at IS NULL AND btrim(name_en)='Anjira';
  IF matched<>1 THEN
    RAISE EXCEPTION 'Anjira must identify exactly one active collection area in Masters';
  END IF;
  SELECT count(*) INTO matched FROM public.books book
    WHERE book.edition_id=target_edition AND book.edition_book_number=30 AND book.book_type='REGULAR'
      AND book.deleted_at IS NULL AND book.status='IN_STOCK'
      AND NOT EXISTS (SELECT 1 FROM public.book_cases WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM public.book_returns WHERE book_id=book.id)
      AND NOT EXISTS (SELECT 1 FROM public.book_receipts WHERE book_id=book.id);
  IF matched<>1 THEN
    RAISE EXCEPTION 'Edition 6 Book 30 is not uniquely available; existing assignments and receipts were preserved';
  END IF;

  ALTER TABLE public.legacy_collection_imports
    ADD COLUMN IF NOT EXISTS source_corrections jsonb NOT NULL DEFAULT '{}'::jsonb
      CHECK (jsonb_typeof(source_corrections)='object');
  -- Receipt UI reads the confirmed area while the untouched raw spreadsheet remains auditable.
  helper_definition:=replace(pg_get_functiondef('public.receipt_historical_location(uuid)'::regprocedure),E'\r\n',E'\n');
  IF position(new_projection IN helper_definition)=0 THEN
    IF (length(helper_definition)-length(replace(helper_definition,old_projection,'')))/length(old_projection)<>1 THEN
      RAISE EXCEPTION 'Installed historical location helper differs; repair rolled back';
    END IF;
    EXECUTE replace(helper_definition,old_projection,new_projection);
  END IF;
  UPDATE public.legacy_collection_imports
    SET source_corrections=source_corrections || jsonb_build_object('Collection Area','Anjira')
    WHERE source_key=source_key_value;
  payload:=jsonb_set(payload,'{collection_area}',to_jsonb('Anjira'::text));
  payload:=jsonb_set(payload,'{book_condition}',to_jsonb((payload->>'book_condition') ||
    '; USER-CONFIRMED CORRECTION: collection area Anjira; original area cell contained a date'));
  SELECT public.import_book3_collection_drafts(jsonb_build_array(payload)) INTO result;
  SELECT * INTO source_record FROM public.legacy_collection_imports WHERE source_key=source_key_value;
  IF source_record.status IS DISTINCT FROM 'IMPORTED' THEN
    RAISE EXCEPTION 'Row 37 repair rolled back: %',source_record.reason;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.books book WHERE book.id=source_record.book_id
    AND book.edition_id=target_edition AND book.edition_book_number=30) THEN
    RAISE EXCEPTION 'Imported book identity differs from Edition 6 Book 30; repair rolled back';
  END IF;
  UPDATE public.legacy_collection_imports
    SET reason=reason || '; User confirmed Collection Area = Anjira; original date-valued cell preserved'
    WHERE source_key=source_key_value;
  SELECT created_by INTO operator_id FROM public.book_returns WHERE id=source_record.return_id;
  INSERT INTO public.activity_log(actor_id,action,resource,record_id,new_values,reason,created_by,updated_by)
    VALUES(operator_id,'UPDATE','legacy_collection_imports',source_key_value,
      jsonb_build_object('sourceCorrections',jsonb_build_object('Collection Area','Anjira')),
      'User confirmed Anjira for Book3 row 37; original spreadsheet preserved',operator_id,operator_id);
  RAISE NOTICE 'Imported row 37: INR 41,500 collection / INR 20,750 commission. Refresh Edition 6 summary.';
END;
$repair_anjira$;

SELECT imported.source_row,imported.status,book.book_number,imported.assumed_receipt_number,
  to_jsonb(imported)->'source_corrections' AS confirmed_corrections,
  receipt.amount_paise::numeric/100 AS collected_rupees,
  returned.commission_paise::numeric/100 AS commission_rupees
FROM public.legacy_collection_imports imported
LEFT JOIN public.books book ON book.id=imported.book_id
LEFT JOIN public.book_returns returned ON returned.id=imported.return_id
LEFT JOIN public.book_receipts receipt ON receipt.id=imported.receipt_id
WHERE imported.source_key='Book3_v1:Sheet1:37';
