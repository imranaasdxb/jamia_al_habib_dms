-- Run once as the database owner, through COMMIT. Then run manual-import-book3-collections.sql.
-- No stock, profiles, receipts or financial totals are changed by this setup alone.
BEGIN;
CREATE TABLE IF NOT EXISTS public.legacy_collection_imports (
  source_key text PRIMARY KEY,
  source_row integer NOT NULL CHECK (source_row >= 2),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  source_data jsonb NOT NULL CHECK (jsonb_typeof(source_data) = 'object'),
  status text NOT NULL DEFAULT 'SKIPPED' CHECK (status IN ('IMPORTED','SKIPPED')),
  reason text NOT NULL DEFAULT '',
  person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  book_id uuid REFERENCES public.books(id) ON DELETE RESTRICT,
  assignment_id uuid REFERENCES public.book_assignments(id) ON DELETE RESTRICT,
  return_id uuid REFERENCES public.book_returns(id) ON DELETE RESTRICT,
  receipt_id uuid REFERENCES public.book_receipts(id) ON DELETE RESTRICT,
  assumed_receipt_number integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  imported_at timestamptz,
  CHECK (status <> 'IMPORTED' OR (person_id IS NOT NULL AND book_id IS NOT NULL
    AND assignment_id IS NOT NULL AND return_id IS NOT NULL AND imported_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS legacy_collection_imports_book_idx ON public.legacy_collection_imports(book_id);
ALTER TABLE public.legacy_collection_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_collection_imports FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_collection_imports FROM PUBLIC, dms_runtime;
GRANT SELECT ON public.legacy_collection_imports TO dms_runtime;
DROP POLICY IF EXISTS legacy_collections_admin_read ON public.legacy_collection_imports;
CREATE POLICY legacy_collections_admin_read ON public.legacy_collection_imports
  FOR SELECT TO dms_runtime USING (current_setting('app.role',true) = 'ADMIN');
DO $policy$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS owner_maintenance ON public.legacy_collection_imports');
  EXECUTE format('CREATE POLICY owner_maintenance ON public.legacy_collection_imports TO %I USING (true) WITH CHECK (true)',current_user);
END;
$policy$;

CREATE OR REPLACE FUNCTION public.import_book3_collection_drafts(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $import$
DECLARE
  actor public.people; stock public.books;
  s record; g record; r record; trigger_row record;
  matched integer; chosen_person uuid; chosen_book uuid; chosen_area uuid;
  assignment_uuid uuid; case_uuid uuid; return_uuid uuid; receipt_uuid uuid;
  group_person uuid; group_name text; group_code text;
  group_phone text; group_whatsapp text; group_address text;
  group_areas jsonb; staff_names text; row_remarks text; group_hash text;
  total_amount bigint; total_commission bigint; basis_points integer;
  used_count integer; next_number integer; assignment_day date; return_day date;
  first_entry_day date; last_entry_day date;
  previous_count integer; new_count integer := 0;
  problem text; failure_state text;
BEGIN
  IF current_user = 'dms_runtime' OR
    (SELECT relowner FROM pg_class WHERE oid='public.books'::regclass) <> current_user::regrole::oid THEN
    RAISE EXCEPTION 'Run this import as the owner of the application tables, never as dms_runtime' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'array' OR jsonb_array_length(payload) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Expected the complete Book3 import payload';
  END IF;
  IF to_regclass('public.fundraisers') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid='public.book_returns'::regclass
      AND attname='submission_pending' AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid='public.book_receipts'::regclass
      AND attname='checked' AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid='public.books'::regclass
      AND attname='edition_book_number' AND NOT attisdropped
  ) THEN RAISE EXCEPTION 'Apply the existing book submission, edition stock and fundraiser SQL first'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dms:import:Book3_v1'));
  -- No concurrent stock allocation or receipt writes can occur during this transaction.
  LOCK TABLE public.people,public.fundraisers,public.master_records,public.books,
    public.book_assignments,public.book_cases,public.book_returns,public.book_receipts,
    public.legacy_collection_imports IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO actor FROM public.people
    WHERE role='ADMIN' AND status='ACTIVE' AND deleted_at IS NULL
    ORDER BY created_at,id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'An active Super Admin is required'; END IF;
  PERFORM set_config('app.person_id',actor.id::text,true);
  PERFORM set_config('app.role','ADMIN',true);
  PERFORM set_config('app.auth_user_id',coalesce(actor.auth_user_id::text,''),true);
  PERFORM set_config('app.change_reason','Book3.xlsx historical collection draft import',true);

  CREATE TEMP TABLE book3_import_source ON COMMIT DROP AS
    SELECT x.*,NULL::uuid AS person_id,NULL::uuid AS book_id,NULL::uuid AS area_id,
      false AS eligible
    FROM jsonb_to_recordset(payload) AS x(
      source_row integer,profile_source_id integer,fundraiser_name text,
      book_number integer,book_type text,edition_number integer,token_paise integer,
      entry_date date,collection_date date,collection_area text,book_condition text,
      amount_paise bigint,commission_paise bigint,entry_by text,amount_words text,
      problems text,raw jsonb
    );
  IF EXISTS (SELECT 1 FROM pg_temp.book3_import_source WHERE source_row IS NULL OR source_row<2 OR raw IS NULL)
    OR (SELECT count(*)<>count(DISTINCT source_row) FROM pg_temp.book3_import_source) THEN
    RAISE EXCEPTION 'Invalid or duplicated source row identifiers';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.book3_import_source incoming_source JOIN public.legacy_collection_imports l
      ON l.source_key='Book3_v1:Sheet1:' || incoming_source.source_row::text
    WHERE l.source_hash<>encode(sha256(convert_to(incoming_source.raw::text,'UTF8')),'hex')
  ) THEN RAISE EXCEPTION 'A previously staged source row changed. Existing financial records were preserved; use a separately reviewed correction'; END IF;
  SELECT count(*) INTO previous_count FROM public.legacy_collection_imports
    WHERE source_key LIKE 'Book3_v1:Sheet1:%' AND status='IMPORTED';

  INSERT INTO public.legacy_collection_imports(source_key,source_row,source_hash,source_data,reason)
    SELECT 'Book3_v1:Sheet1:' || source_row::text,source_row,
      encode(sha256(convert_to(raw::text,'UTF8')),'hex'),raw,'Not yet processed'
    FROM pg_temp.book3_import_source
    ON CONFLICT(source_key) DO NOTHING;

  FOR s IN SELECT * FROM pg_temp.book3_import_source ORDER BY source_row LOOP
    IF EXISTS (SELECT 1 FROM public.legacy_collection_imports
      WHERE source_key='Book3_v1:Sheet1:' || s.source_row::text AND status='IMPORTED') THEN CONTINUE; END IF;
    problem:=nullif(s.problems,'');
    IF problem IS NULL AND (
      s.profile_source_id IS NULL OR coalesce(btrim(s.fundraiser_name),'')='' OR s.book_number IS NULL
      OR s.edition_number IS NULL OR s.book_type IS NULL OR s.book_type NOT IN ('REGULAR','TOKEN')
      OR (s.book_type='TOKEN' AND (s.token_paise IS NULL OR s.token_paise NOT IN (1000,5000,10000)))
      OR s.amount_paise IS NULL OR s.commission_paise IS NULL
      OR s.amount_paise NOT BETWEEN 0 AND 999999999999
      OR s.commission_paise NOT BETWEEN 0 AND s.amount_paise
      OR s.entry_date IS NULL OR s.collection_date IS NULL
      OR s.entry_date > (now() AT TIME ZONE 'Asia/Kolkata')::date
      OR s.collection_date > (now() AT TIME ZONE 'Asia/Kolkata')::date
      OR coalesce(btrim(s.collection_area),'')='' OR coalesce(btrim(s.entry_by),'')=''
    ) THEN problem:='Required historical fields are missing or invalid'; END IF;
    IF problem IS NULL AND EXISTS (
      SELECT 1 FROM pg_temp.book3_import_source other
      WHERE other.book_number=s.book_number AND other.edition_number=s.edition_number
        AND other.book_type=s.book_type AND other.token_paise IS NOT DISTINCT FROM s.token_paise
        AND other.profile_source_id IS NOT NULL AND other.profile_source_id<>s.profile_source_id
    ) THEN problem:='Same book and edition occur under different fundraiser profiles; confirm ownership manually'; END IF;
    chosen_person:=NULL; chosen_book:=NULL; chosen_area:=NULL;
    IF problem IS NULL THEN
      SELECT count(*),(array_agg(p.id))[1] INTO matched,chosen_person
      FROM public.fundraisers f JOIN public.people p ON p.id=f.person_id
      WHERE f.legacy_import_key='Fundraisers_Data_v1:' || s.profile_source_id::text
        AND p.role='COLLECTOR' AND p.deleted_at IS NULL AND f.deleted_at IS NULL
        AND lower(regexp_replace(btrim(p.full_name),'\s+',' ','g'))=
          lower(regexp_replace(btrim(s.fundraiser_name),'\s+',' ','g'));
      IF matched<>1 THEN problem:='Original fundraiser source ID and name do not identify exactly one existing profile'; END IF;
    END IF;
    IF problem IS NULL THEN
      SELECT count(*),(array_agg(b.id))[1] INTO matched,chosen_book
      FROM public.books b JOIN public.master_records m ON m.id=b.edition_id
      WHERE b.deleted_at IS NULL AND m.deleted_at IS NULL AND m.kind='EDITION'
        AND m.edition_number=s.edition_number AND b.edition_book_number=s.book_number
        AND b.book_type=s.book_type AND b.token_value_paise IS NOT DISTINCT FROM s.token_paise;
      IF matched<>1 THEN problem:='No unique existing book matches edition, type, token value and book number'; END IF;
    END IF;
    IF problem IS NULL THEN
      SELECT count(*),(array_agg(id))[1] INTO matched,chosen_area
      FROM public.master_records WHERE kind='AREA' AND level='COLLECTION' AND active AND deleted_at IS NULL
        AND btrim(name_en)=btrim(s.collection_area);
      IF matched=0 THEN
        SELECT count(*),(array_agg(id))[1] INTO matched,chosen_area
        FROM public.master_records WHERE kind='AREA' AND level='COLLECTION' AND active AND deleted_at IS NULL
          AND lower(regexp_replace(btrim(name_en),'\s+',' ','g'))=
            lower(regexp_replace(btrim(s.collection_area),'\s+',' ','g'));
      END IF;
      IF matched<>1 THEN problem:='Collection area is missing, inactive or ambiguous in Masters'; END IF;
    END IF;
    UPDATE public.legacy_collection_imports SET reason=coalesce(problem,'Ready for book group import')
      WHERE source_key='Book3_v1:Sheet1:' || s.source_row::text;
    IF problem IS NULL THEN
      UPDATE pg_temp.book3_import_source SET person_id=chosen_person,book_id=chosen_book,area_id=chosen_area,eligible=true
        WHERE source_row=s.source_row;
    END IF;
  END LOOP;

  -- These five workflow triggers rewrite historical dates, amounts and operator names.
  -- Disable only those triggers under an exclusive write lock, within this transaction.
  -- Foreign keys, CHECK constraints, RLS, receipt limits, receipt auditing and stock auditing remain enabled.
  -- On any uncaught error PostgreSQL rolls back both the data and trigger changes.
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='O'
        AND (c.relname,t.tgname) IN (
          ('book_assignments','prepare_book_assignment'),('book_assignments','allocate_assignment_books'),
          ('book_returns','prepare_book_return'),('book_returns','finish_book_return'),
          ('book_receipts','guard_book_receipt')))<>5 THEN
    RAISE EXCEPTION 'The five expected workflow triggers must exist and be enabled before importing';
  END IF;
  ALTER TABLE public.book_assignments DISABLE TRIGGER prepare_book_assignment;
  ALTER TABLE public.book_assignments DISABLE TRIGGER allocate_assignment_books;
  ALTER TABLE public.book_returns DISABLE TRIGGER prepare_book_return;
  ALTER TABLE public.book_returns DISABLE TRIGGER finish_book_return;
  ALTER TABLE public.book_receipts DISABLE TRIGGER guard_book_receipt;

  FOR g IN
    SELECT book_id,array_agg(source_row ORDER BY source_row) AS source_rows
    FROM pg_temp.book3_import_source WHERE eligible GROUP BY book_id ORDER BY book_id
  LOOP
    BEGIN
      SELECT * INTO stock FROM public.books WHERE id=g.book_id FOR UPDATE;
      IF stock.status<>'IN_STOCK' OR EXISTS (SELECT 1 FROM public.book_cases WHERE book_id=stock.id)
        OR EXISTS (SELECT 1 FROM public.book_returns WHERE book_id=stock.id)
        OR EXISTS (SELECT 1 FROM public.book_receipts WHERE book_id=stock.id) THEN
        RAISE EXCEPTION 'Book already has assignment or receipt history; existing records were preserved' USING ERRCODE='P3101';
      END IF;
      SELECT * INTO s FROM pg_temp.book3_import_source WHERE source_row=g.source_rows[1];
      group_person:=s.person_id;
      IF EXISTS (SELECT 1 FROM pg_temp.book3_import_source WHERE source_row=ANY(g.source_rows) AND person_id<>group_person) THEN
        RAISE EXCEPTION 'Conflicting fundraiser profiles for the same physical book' USING ERRCODE='P3101';
      END IF;
      SELECT sum(amount_paise),sum(commission_paise),count(*) FILTER(WHERE amount_paise>0),
        min(collection_date),max(collection_date),min(entry_date),max(entry_date),
        string_agg(DISTINCT entry_by,' / ' ORDER BY entry_by)
        INTO total_amount,total_commission,used_count,assignment_day,return_day,first_entry_day,last_entry_day,staff_names
      FROM pg_temp.book3_import_source WHERE source_row=ANY(g.source_rows);
      IF total_amount>999999999999 OR used_count>stock.total_receipts THEN
        RAISE EXCEPTION 'Collection total or assumed receipt count exceeds this book capacity' USING ERRCODE='P3101';
      END IF;
      basis_points:=NULL;
      IF total_amount=0 THEN
        IF total_commission<>0 THEN RAISE EXCEPTION 'Commission cannot exceed collected cash' USING ERRCODE='P3101'; END IF;
        basis_points:=0;
      ELSE
        SELECT bp INTO basis_points FROM generate_series(
          greatest(0,floor(total_commission::numeric*10000/total_amount)::integer-1),
          least(10000,ceil(total_commission::numeric*10000/total_amount)::integer+1)
        ) AS candidate(bp)
        WHERE round(total_amount::numeric*bp/1000000)*100=total_commission
        ORDER BY abs(bp-total_commission::numeric*10000/total_amount),bp LIMIT 1;
        IF basis_points IS NULL THEN
          RAISE EXCEPTION 'Exact recorded commission cannot be represented by the current percentage and rupee-rounding rule; manual review required' USING ERRCODE='P3101';
        END IF;
      END IF;
      SELECT p.full_name,f.code,coalesce(p.phone,''),f.whatsapp,
        concat_ws(', ',nullif(f.village,''),nullif(f.post_office,''),nullif(f.block,''),nullif(f.district,''),nullif(f.state,''),nullif(f.pin,''))
        INTO group_name,group_code,group_phone,group_whatsapp,group_address
      FROM public.people p JOIN public.fundraisers f ON f.person_id=p.id WHERE p.id=group_person;
      SELECT jsonb_agg(jsonb_build_object('id',a.id,'nameEn',a.name_en,'nameUr',a.name_ur) ORDER BY a.name_en,a.id)
        INTO group_areas FROM public.master_records a WHERE id IN (
          SELECT area_id FROM pg_temp.book3_import_source WHERE source_row=ANY(g.source_rows));
      assignment_uuid:=gen_random_uuid(); case_uuid:=gen_random_uuid(); return_uuid:=gen_random_uuid();
      group_hash:=encode(sha256(convert_to('Book3_v1:' || stock.id::text || ':' || array_to_string(g.source_rows,','),'UTF8')),'hex');
      row_remarks:='Historical import Book3.xlsx/Sheet1; source rows ' || array_to_string(g.source_rows,',') ||
        '. Draft only. Assignment date inferred from earliest recorded collection date. Receipt numbers assumed sequentially from book start; actual usage and book condition require physical review. Totals cover imported rows only.';
      INSERT INTO public.book_assignments(id,assignment_date,expected_return_date,collector_id,collector_name,
        collector_code,phone,whatsapp,address,areas,book_ids,remarks,assigned_by_name,operation_id,operation_hash,
        created_at,updated_at,created_by,updated_by)
      VALUES(assignment_uuid,assignment_day,(assignment_day+interval '11 months')::date,group_person,group_name,
        group_code,group_phone,group_whatsapp,group_address,group_areas,jsonb_build_array(stock.id),
        row_remarks,staff_names,gen_random_uuid(),group_hash,
        first_entry_day::timestamp AT TIME ZONE 'Asia/Kolkata',last_entry_day::timestamp AT TIME ZONE 'Asia/Kolkata',actor.id,actor.id);
      INSERT INTO public.book_cases(id,assignment_id,book_id,receipt_from,receipt_to,source,source_code,created_at)
      VALUES(case_uuid,assignment_uuid,stock.id,stock.receipt_from,stock.receipt_to,'NEW',stock.book_number,
        first_entry_day::timestamp AT TIME ZONE 'Asia/Kolkata');
      UPDATE public.books SET status='ASSIGNED',updated_at=now(),updated_by=actor.id WHERE id=stock.id;
      INSERT INTO public.book_returns(id,case_id,source_code,submission_pending,book_id,assignment_id,
        book_number,collector_name,return_date,outcome,total_paise,cash_paise,digital_paise,receipt_sum_paise,
        receipt_from,receipt_to,receipts_used,last_used,commission_basis_points,commission_given,
        remarks,checked_by_name,receipt_entry_status,operation_id,operation_hash,
        created_at,updated_at,created_by,updated_by)
      VALUES(return_uuid,case_uuid,stock.book_number,true,stock.id,assignment_uuid,
        stock.book_number,group_name,return_day,CASE WHEN used_count=stock.total_receipts THEN 'CLOSED' ELSE 'PARTLY_USED' END,
        total_amount,total_amount,0,total_amount,stock.receipt_from,stock.receipt_to,used_count,
        CASE WHEN used_count=0 THEN NULL ELSE stock.receipt_from+used_count-1 END,basis_points,total_commission>0,
        row_remarks,staff_names,'DRAFT',gen_random_uuid(),group_hash,
        first_entry_day::timestamp AT TIME ZONE 'Asia/Kolkata',last_entry_day::timestamp AT TIME ZONE 'Asia/Kolkata',actor.id,actor.id);

      next_number:=stock.receipt_from;
      FOR r IN SELECT * FROM pg_temp.book3_import_source WHERE source_row=ANY(g.source_rows) ORDER BY source_row LOOP
        receipt_uuid:=NULL;
        IF r.amount_paise>0 THEN
          receipt_uuid:=gen_random_uuid();
          row_remarks:='HISTORICAL SUMMARY, not a verified physical receipt. Receipt number ASSUMED from book start. Source: Book3.xlsx/Sheet1 row ' ||
            r.source_row::text || '. Reported book condition: ' || coalesce(r.book_condition,'unknown') ||
            '. Collection area: ' || r.collection_area || '. Recorded commission INR ' ||
            to_char(r.commission_paise::numeric/100,'FM999999999990.00') ||
            '. Donor and donation head unknown. Cash assumed as requested. Review against the original record before checking.';
          INSERT INTO public.book_receipts(id,return_id,book_id,receipt_number,checked,data,labels,status,
            amount_paise,phone,entry_by_name,created_at,updated_at,created_by,updated_by)
          VALUES(receipt_uuid,return_uuid,stock.id,next_number,false,jsonb_build_object(
            'status','VALID','date',r.collection_date::text,'reasonId','','anonymous',false,
            'donorName','','parentage','S/O','parentName','','phone','','email','','marhoomName','','pan','',
            'village','','postOffice','','block','','district','','state','','pin','',
            'amountPaise',r.amount_paise,'amountWords',r.amount_words,'paymentMode','CASH',
            'upiAppId','','reference','','transactionDate','','chequeNumber','','bankId','','branch','','chequeDate','',
            'heads','[]'::jsonb,'receiverName',group_name,'responsibility','',
            'donorSigned',false,'receiverSigned',false,'remarks',row_remarks
          ),'{}'::jsonb,'VALID',r.amount_paise,'',r.entry_by,
            r.entry_date::timestamp AT TIME ZONE 'Asia/Kolkata',
            r.entry_date::timestamp AT TIME ZONE 'Asia/Kolkata',actor.id,actor.id);
        END IF;
        UPDATE public.legacy_collection_imports SET status='IMPORTED',
          reason=CASE WHEN r.amount_paise>0 THEN 'Unchecked historical summary; receipt number assumed'
            ELSE 'Zero collection preserved on draft submission; no receipt consumed' END,
          person_id=group_person,book_id=stock.id,assignment_id=assignment_uuid,return_id=return_uuid,
          receipt_id=receipt_uuid,assumed_receipt_number=CASE WHEN receipt_uuid IS NULL THEN NULL ELSE next_number END,
          imported_at=now()
        WHERE source_key='Book3_v1:Sheet1:' || r.source_row::text;
        IF receipt_uuid IS NOT NULL THEN next_number:=next_number+1; END IF;
      END LOOP;
      -- The receipt audit trigger increments the version; keep its normal behavior.
      UPDATE public.book_returns SET receipt_entry_status='DRAFT',updated_at=now(),updated_by=actor.id WHERE id=return_uuid;
      INSERT INTO public.activity_log(actor_id,action,resource,record_id,new_values,reason,created_by,updated_by)
        SELECT actor.id,'INSERT','book_assignments',id::text,to_jsonb(a),'Historical collection import; inferred assignment date',actor.id,actor.id
        FROM public.book_assignments a WHERE id=assignment_uuid;
      INSERT INTO public.activity_log(actor_id,action,resource,record_id,new_values,reason,created_by,updated_by)
        SELECT actor.id,'INSERT','book_returns',id::text,to_jsonb(b),'Historical draft import; cash assumed; receipt numbers unverified',actor.id,actor.id
        FROM public.book_returns b WHERE id=return_uuid;
      new_count:=new_count+cardinality(g.source_rows);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS problem=MESSAGE_TEXT,failure_state=RETURNED_SQLSTATE;
      IF failure_state NOT IN ('P3101','23505','23P01') THEN RAISE; END IF;
      -- This entire book group's inserts are rolled back before recording the skip.
      UPDATE public.legacy_collection_imports SET status='SKIPPED',reason=problem
        WHERE source_key IN (SELECT 'Book3_v1:Sheet1:' || n::text FROM unnest(g.source_rows) AS source_numbers(n));
    END;
  END LOOP;

  ALTER TABLE public.book_assignments ENABLE TRIGGER prepare_book_assignment;
  ALTER TABLE public.book_assignments ENABLE TRIGGER allocate_assignment_books;
  ALTER TABLE public.book_returns ENABLE TRIGGER prepare_book_return;
  ALTER TABLE public.book_returns ENABLE TRIGGER finish_book_return;
  ALTER TABLE public.book_receipts ENABLE TRIGGER guard_book_receipt;

  RETURN jsonb_build_object(
    'source_rows',jsonb_array_length(payload),'newly_imported_rows',new_count,
    'previously_imported_rows',previous_count,
    'imported_rows',(SELECT count(*) FROM public.legacy_collection_imports WHERE source_key LIKE 'Book3_v1:Sheet1:%' AND status='IMPORTED'),
    'skipped_rows',(SELECT count(*) FROM public.legacy_collection_imports WHERE source_key LIKE 'Book3_v1:Sheet1:%' AND status='SKIPPED'),
    'draft_submissions',(SELECT count(DISTINCT return_id) FROM public.legacy_collection_imports WHERE source_key LIKE 'Book3_v1:Sheet1:%' AND status='IMPORTED'),
    'imported_collection_paise',(SELECT coalesce(sum((source_data->>'Collection Amount')::numeric*100),0)
      FROM public.legacy_collection_imports WHERE source_key LIKE 'Book3_v1:Sheet1:%' AND status='IMPORTED'),
    'skipped_details',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'excel_row',source_row,'fundraiser',source_data->>'Fundraiser Name',
      'edition',source_data->>'Edition','type',source_data->>'Type','book',source_data->>'Book No.','reason',reason)
      ORDER BY source_row),'[]'::jsonb) FROM public.legacy_collection_imports
      WHERE source_key LIKE 'Book3_v1:Sheet1:%' AND status='SKIPPED')
  );
END;
$import$;
REVOKE ALL ON FUNCTION public.import_book3_collection_drafts(jsonb) FROM PUBLIC, dms_runtime;
COMMIT;
