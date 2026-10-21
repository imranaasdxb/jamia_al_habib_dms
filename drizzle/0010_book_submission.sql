-- Run this complete single statement on the same Neon branch/database as DATABASE_URL. Existing records are retained.
DO $book_submission_setup$
BEGIN
-- Includes idempotent 0009 setup to recover an earlier partially applied migration.
-- Run the entire file manually after 0008_leftover_assignments.sql.

ALTER TABLE public.book_returns ADD COLUMN IF NOT EXISTS receipt_entry_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.book_returns ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE public.book_flags ADD COLUMN IF NOT EXISTS reconciliation jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS public.book_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), return_id uuid NOT NULL REFERENCES public.book_returns(id) ON DELETE RESTRICT,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT, receipt_number integer NOT NULL UNIQUE CHECK (receipt_number > 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 65536), labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('VALID','CANCELLED','TORN','LOST','BLANK')), amount_paise bigint CHECK (amount_paise BETWEEN 0 AND 999999999999),
  phone text NOT NULL DEFAULT '', reference text, photo_key text, version integer NOT NULL DEFAULT 1 CHECK (version > 0), entry_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT, deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS book_receipts_return_idx ON public.book_receipts(return_id, receipt_number);
CREATE INDEX IF NOT EXISTS book_receipts_phone_idx ON public.book_receipts(phone);
-- Direct donations will use this same registry; a UTR is unique across both modules.
CREATE TABLE IF NOT EXISTS public.payment_references (
  reference text PRIMARY KEY CHECK (reference = upper(btrim(reference)) AND reference ~ '^[A-Z0-9/_-]{3,100}$'),
  source_type text NOT NULL CHECK (source_type IN ('RECEIPT','DONATION')), source_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_type, source_id)
);
ALTER TABLE public.book_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_references FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.book_receipts, public.payment_references FROM PUBLIC, dms_runtime;
GRANT SELECT, INSERT, UPDATE ON public.book_receipts TO dms_runtime;
DROP POLICY IF EXISTS receipts_read ON public.book_receipts;
CREATE POLICY receipts_read ON public.book_receipts FOR SELECT TO dms_runtime USING (current_setting('app.role', true) IN ('ADMIN','STAFF'));
DROP POLICY IF EXISTS receipts_create ON public.book_receipts;
CREATE POLICY receipts_create ON public.book_receipts FOR INSERT TO dms_runtime WITH CHECK (current_setting('app.role', true) IN ('ADMIN','STAFF')
  AND created_by::text = current_setting('app.person_id', true) AND updated_by = created_by AND deleted_at IS NULL);
DROP POLICY IF EXISTS receipts_update ON public.book_receipts;
CREATE POLICY receipts_update ON public.book_receipts FOR UPDATE TO dms_runtime USING (current_setting('app.role', true) IN ('ADMIN','STAFF') AND deleted_at IS NULL)
  WITH CHECK (updated_by::text = current_setting('app.person_id', true) AND deleted_at IS NULL);
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY['book_receipts','payment_references'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS owner_maintenance ON public.%I', target);
    EXECUTE format('CREATE POLICY owner_maintenance ON public.%I TO %I USING (true) WITH CHECK (true)', target, current_user);
  END LOOP;
END $$;
INSERT INTO public.master_records(kind, code, name_en, name_ur, active, built_in, created_by, updated_by)
  SELECT 'FLAG_REASON', 'RECEIPT_RECONCILIATION', 'Receipt entry reconciliation', 'رسیدوں کے حساب میں فرق', true, true, id, id
  FROM public.people WHERE role = 'ADMIN' AND status = 'ACTIVE' AND deleted_at IS NULL ORDER BY created_at LIMIT 1
  ON CONFLICT (kind, code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.validate_receipt_data(d jsonb, complete boolean, start_day date, end_day date, token_paise integer) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE head jsonb; master public.master_records; category public.master_records; head_total bigint := 0; amount bigint;
BEGIN
  IF jsonb_typeof(d) <> 'object' OR coalesce(d->>'status','') NOT IN ('VALID','CANCELLED','TORN','LOST','BLANK')
    OR jsonb_typeof(d->'heads') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'heads') > 20 THEN RAISE EXCEPTION 'Invalid receipt'; END IF;
  IF coalesce(d->>'date','') <> '' AND ((d->>'date')::date < start_day OR (d->>'date')::date > end_day) THEN RAISE EXCEPTION 'Receipt date outside assignment and return dates'; END IF;
  amount := (d->>'amountPaise')::bigint;
  IF amount < 0 OR amount > 999999999999 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF d->>'status' <> 'VALID' AND coalesce(amount,0) <> 0 THEN RAISE EXCEPTION 'Money-bearing receipts cannot be blank or cancelled'; END IF;
  FOR head IN SELECT value FROM jsonb_array_elements(d->'heads') LOOP
    IF (head->>'amountPaise')::bigint < 0 OR (head->>'amountPaise')::bigint > 999999999999 THEN RAISE EXCEPTION 'Invalid head amount'; END IF;
    IF coalesce(head->>'categoryId','') <> '' THEN
      SELECT * INTO category FROM public.master_records WHERE id = (head->>'categoryId')::uuid AND kind = 'DONATION_CATEGORY' AND deleted_at IS NULL FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid category'; END IF;
    END IF;
    IF coalesce(head->>'headId','') <> '' THEN
      SELECT * INTO master FROM public.master_records WHERE id = (head->>'headId')::uuid AND kind = 'DONATION_HEAD' AND deleted_at IS NULL FOR SHARE;
      IF NOT FOUND OR master.parent_id IS DISTINCT FROM nullif(head->>'categoryId','')::uuid THEN RAISE EXCEPTION 'Head does not belong to category'; END IF;
      IF complete AND master.needs_detail AND length(btrim(coalesce(head->>'purpose',''))) = 0 THEN RAISE EXCEPTION 'Other donation head requires a detail'; END IF;
    END IF;
    IF complete AND d->>'status' = 'VALID' AND (coalesce(head->>'categoryId','') = '' OR coalesce(head->>'headId','') = '' OR coalesce((head->>'amountPaise')::bigint,0) <= 0)
      THEN RAISE EXCEPTION 'Complete each donation head'; END IF;
    head_total := head_total + coalesce((head->>'amountPaise')::bigint,0);
  END LOOP;
  IF NOT complete THEN RETURN; END IF;
  IF coalesce(d->>'date','') = '' THEN RAISE EXCEPTION 'Receipt date required'; END IF;
  IF d->>'status' <> 'VALID' THEN
    IF amount IS NULL OR amount <> 0 OR jsonb_array_length(d->'heads') <> 0 THEN RAISE EXCEPTION 'Non-valid receipts must have zero amount and no donation heads'; END IF;
    PERFORM 1 FROM public.master_records WHERE id = nullif(d->>'reasonId','')::uuid AND kind = 'RECEIPT_REASON' AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Receipt reason required'; END IF;
    RETURN;
  END IF;
  IF amount IS NULL OR amount <= 0 OR length(btrim(coalesce(d->>'amountWords',''))) = 0 OR length(btrim(coalesce(d->>'receiverName',''))) < 2
    OR coalesce(d->>'paymentMode','') NOT IN ('CASH','DIGITAL','CHEQUE') THEN RAISE EXCEPTION 'Receipt amount and receiver details required'; END IF;
  IF NOT coalesce((d->>'anonymous')::boolean,false) AND (length(btrim(coalesce(d->>'donorName',''))) < 2
    OR length(btrim(coalesce(d->>'parentName',''))) < 2 OR coalesce(d->>'phone','') !~ '^[6-9][0-9]{9}$') THEN RAISE EXCEPTION 'Donor details required'; END IF;
  IF coalesce(d->>'phone','') <> '' AND d->>'phone' !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Invalid donor phone'; END IF;
  IF length(btrim(coalesce(d->>'village',''))) < 2 OR length(btrim(coalesce(d->>'postOffice',''))) < 2
    OR length(btrim(coalesce(d->>'district',''))) < 2 OR length(btrim(coalesce(d->>'state',''))) < 2 OR coalesce(d->>'pin','') !~ '^[0-9]{6}$'
    THEN RAISE EXCEPTION 'Donor address required'; END IF;
  IF token_paise IS NOT NULL AND amount <> token_paise THEN RAISE EXCEPTION 'Token receipt amount is fixed'; END IF;
  IF jsonb_array_length(d->'heads') = 0 OR head_total <> amount THEN RAISE EXCEPTION 'Head total must equal receipt amount'; END IF;
  IF d->>'paymentMode' = 'DIGITAL' THEN
    IF upper(btrim(coalesce(d->>'reference',''))) !~ '^[A-Z0-9/_-]{3,100}$' THEN RAISE EXCEPTION 'UTR required'; END IF;
    PERFORM 1 FROM public.master_records WHERE id = nullif(d->>'upiAppId','')::uuid AND kind = 'UPI_APP' AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'UPI app required'; END IF;
  ELSIF d->>'paymentMode' = 'CHEQUE' THEN
    IF coalesce(d->>'chequeNumber','') !~ '^[0-9]{6}$' OR length(btrim(coalesce(d->>'branch',''))) < 2 OR coalesce(d->>'chequeDate','') = ''
      THEN RAISE EXCEPTION 'Cheque details required'; END IF;
    PERFORM 1 FROM public.master_records WHERE id = nullif(d->>'bankId','')::uuid AND kind = 'BANK' AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cheque bank required'; END IF;
    PERFORM (d->>'chequeDate')::date;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.validate_receipt_data(jsonb, boolean, date, date, integer) FROM PUBLIC, dms_runtime;

CREATE OR REPLACE FUNCTION public.guard_book_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor public.people; returned public.book_returns; stock public.books; start_day date; item record; master public.master_records;
  old_labels jsonb := '{}'::jsonb; canonical jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO actor FROM public.people WHERE id = nullif(current_setting('app.person_id',true),'')::uuid
    AND auth_user_id = nullif(current_setting('app.auth_user_id',true),'')::uuid AND role = current_setting('app.role',true)
    AND role IN ('ADMIN','STAFF') AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.return_id <> OLD.return_id OR NEW.book_id <> OLD.book_id OR NEW.receipt_number <> OLD.receipt_number
      OR NEW.created_at <> OLD.created_at OR NEW.created_by <> OLD.created_by OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN RAISE EXCEPTION 'Receipt identity is immutable'; END IF;
    old_labels := OLD.labels; NEW.version := OLD.version + 1;
  ELSE NEW.version := 1; NEW.created_by := actor.id; NEW.created_at := now(); END IF;
  SELECT * INTO returned FROM public.book_returns WHERE id = NEW.return_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR returned.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'Book is finalized or unavailable'; END IF;
  IF returned.last_used IS NULL OR NEW.receipt_number NOT BETWEEN returned.receipt_from AND returned.last_used THEN RAISE EXCEPTION 'Receipt outside used range'; END IF;
  SELECT * INTO stock FROM public.books WHERE id = returned.book_id;
  SELECT assignment_date INTO start_day FROM public.book_assignments WHERE id = returned.assignment_id;
  FOR item IN SELECT DISTINCT x.id, x.kind FROM (
    SELECT value->>'categoryId' AS id, 'DONATION_CATEGORY' AS kind FROM jsonb_array_elements(NEW.data->'heads')
    UNION ALL SELECT value->>'headId', 'DONATION_HEAD' FROM jsonb_array_elements(NEW.data->'heads')
    UNION ALL SELECT NEW.data->>'reasonId', 'RECEIPT_REASON'
    UNION ALL SELECT NEW.data->>'upiAppId', 'UPI_APP'
    UNION ALL SELECT NEW.data->>'bankId', 'BANK') x WHERE coalesce(x.id,'') <> '' ORDER BY x.id LOOP
    SELECT * INTO master FROM public.master_records WHERE id = item.id::uuid AND kind = item.kind AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND OR (NOT master.active AND NOT (old_labels ? item.id)) THEN RAISE EXCEPTION 'Master option is inactive'; END IF;
    canonical := canonical || jsonb_build_object(item.id, jsonb_build_object('nameEn',master.name_en,'nameUr',master.name_ur,'needsDetail',master.needs_detail));
  END LOOP;
  PERFORM public.validate_receipt_data(NEW.data, false, start_day, returned.return_date, stock.token_value_paise);
  NEW.labels := canonical; NEW.book_id := returned.book_id; NEW.status := NEW.data->>'status'; NEW.amount_paise := (NEW.data->>'amountPaise')::bigint;
  IF (SELECT coalesce(sum(amount_paise),0) FROM public.book_receipts WHERE return_id = NEW.return_id AND id <> NEW.id AND status = 'VALID' AND deleted_at IS NULL)
    + (CASE WHEN NEW.status = 'VALID' THEN coalesce(NEW.amount_paise,0) ELSE 0 END) > 999999999999 THEN RAISE EXCEPTION 'Book amount exceeds supported limit'; END IF;
  NEW.phone := coalesce(NEW.data->>'phone',''); NEW.reference := CASE WHEN NEW.status = 'VALID' AND NEW.data->>'paymentMode' = 'DIGITAL'
    THEN nullif(upper(btrim(NEW.data->>'reference')),'') ELSE NULL END;
  IF NEW.photo_key IS NOT NULL AND NEW.photo_key !~ ('^receipts/' || NEW.id::text || '/[0-9a-f-]{36}\.jpg$') THEN RAISE EXCEPTION 'Invalid receipt photo'; END IF;
  NEW.entry_by_name := actor.full_name; NEW.updated_by := actor.id; NEW.updated_at := now(); NEW.deleted_at := NULL;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.after_book_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.reference IS DISTINCT FROM NEW.reference THEN
    DELETE FROM public.payment_references WHERE source_type = 'RECEIPT' AND source_id = NEW.id;
    IF NEW.reference IS NOT NULL THEN INSERT INTO public.payment_references(reference, source_type, source_id) VALUES (NEW.reference,'RECEIPT',NEW.id); END IF;
  END IF;
  UPDATE public.book_returns SET receipt_entry_status = 'DRAFT', receipt_entry_version = receipt_entry_version + 1,
    updated_at = now(), updated_by = NEW.updated_by WHERE id = NEW.return_id;
  INSERT INTO public.activity_log(actor_id, action, resource, record_id, old_values, new_values, reason, created_by, updated_by)
    VALUES (NEW.updated_by,TG_OP,'book_receipts',NEW.id::text,CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
      to_jsonb(NEW),'Receipt draft saved',NEW.updated_by,NEW.updated_by);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_book_receipt ON public.book_receipts;
CREATE TRIGGER guard_book_receipt BEFORE INSERT OR UPDATE ON public.book_receipts FOR EACH ROW EXECUTE FUNCTION public.guard_book_receipt();
DROP TRIGGER IF EXISTS after_book_receipt ON public.book_receipts;
CREATE TRIGGER after_book_receipt AFTER INSERT OR UPDATE ON public.book_receipts FOR EACH ROW EXECUTE FUNCTION public.after_book_receipt();
REVOKE ALL ON FUNCTION public.guard_book_receipt(), public.after_book_receipt() FROM PUBLIC, dms_runtime;

CREATE OR REPLACE FUNCTION public.finalize_receipt_book(target uuid, expected_version integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor public.people; returned public.book_returns; stock public.books; start_day date; receipt_row public.book_receipts;
  expected_count integer; saved_count integer; valid_total bigint; cash_total bigint; digital_total bigint; cheque_total bigint;
  issue boolean; result_status text; reason public.master_records; existing public.book_flags; recon_data jsonb; previous_return jsonb;
BEGIN
  SELECT * INTO actor FROM public.people WHERE id = nullif(current_setting('app.person_id',true),'')::uuid
    AND auth_user_id = nullif(current_setting('app.auth_user_id',true),'')::uuid AND role = current_setting('app.role',true)
    AND role IN ('ADMIN','STAFF') AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO returned FROM public.book_returns WHERE id = target AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return unavailable'; END IF;
  IF returned.finalized_at IS NOT NULL THEN RETURN; END IF;
  IF returned.receipt_entry_version <> expected_version THEN RAISE EXCEPTION 'Receipt book changed' USING ERRCODE = '40001'; END IF;
  previous_return := to_jsonb(returned);
  SELECT * INTO stock FROM public.books WHERE id = returned.book_id;
  SELECT assignment_date INTO start_day FROM public.book_assignments WHERE id = returned.assignment_id;
  expected_count := CASE WHEN returned.last_used IS NULL THEN 0 ELSE returned.last_used - returned.receipt_from + 1 END;
  SELECT count(*) INTO saved_count FROM public.book_receipts WHERE return_id = target AND deleted_at IS NULL;
  IF saved_count <> expected_count THEN RAISE EXCEPTION 'Every receipt in the used range must be entered'; END IF;
  FOR receipt_row IN SELECT * FROM public.book_receipts WHERE return_id = target AND deleted_at IS NULL ORDER BY receipt_number LOOP
    BEGIN PERFORM public.validate_receipt_data(receipt_row.data, true, start_day, returned.return_date, stock.token_value_paise);
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Incomplete receipt %', receipt_row.receipt_number USING ERRCODE = 'P0002'; END;
  END LOOP;
  SELECT coalesce(sum(amount_paise) FILTER (WHERE status = 'VALID'),0),
    coalesce(sum(amount_paise) FILTER (WHERE status = 'VALID' AND data->>'paymentMode' = 'CASH'),0),
    coalesce(sum(amount_paise) FILTER (WHERE status = 'VALID' AND data->>'paymentMode' = 'DIGITAL'),0),
    coalesce(sum(amount_paise) FILTER (WHERE status = 'VALID' AND data->>'paymentMode' = 'CHEQUE'),0)
    INTO valid_total, cash_total, digital_total, cheque_total FROM public.book_receipts WHERE return_id = target AND deleted_at IS NULL;
  issue := valid_total <> returned.total_paise OR valid_total <> returned.receipt_sum_paise OR cash_total <> returned.cash_paise
    OR digital_total <> returned.digital_paise OR cheque_total > 0 OR expected_count <> returned.receipts_used
    OR EXISTS (SELECT 1 FROM public.book_receipts WHERE return_id = target AND status IN ('TORN','LOST','BLANK') AND deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(returned.exceptions) e LEFT JOIN public.book_receipts r
      ON r.return_id = target AND r.receipt_number = (e.value->>'receiptNumber')::integer WHERE r.status IS DISTINCT FROM e.value->>'status');
  recon_data := jsonb_build_object('expectedTotal',returned.total_paise,'foundTotal',valid_total,'expectedCash',returned.cash_paise,
    'foundCash',cash_total,'expectedDigital',returned.digital_paise,'foundDigital',digital_total,'cheque',cheque_total,
    'reportedUsed',returned.receipts_used,'entered',saved_count,'checkedBy',actor.id,'checkedAt',now());
  SELECT * INTO existing FROM public.book_flags WHERE return_id = target FOR UPDATE;
  IF issue THEN
    IF existing.id IS NULL THEN
      SELECT * INTO reason FROM public.master_records WHERE kind = 'FLAG_REASON' AND code = 'RECEIPT_RECONCILIATION';
      IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation reason missing'; END IF;
      INSERT INTO public.book_flags(return_id,book_id,collector_id,reason_id,reason_en,reason_ur,expected_paise,found_paise,remarks,reconciliation,created_by,updated_by)
        SELECT target,returned.book_id,collector_id,reason.id,reason.name_en,reason.name_ur,returned.total_paise,valid_total,
          'Receipt entry totals or receipt statuses require review',recon_data,actor.id,actor.id FROM public.book_assignments WHERE id = returned.assignment_id;
    ELSE
      UPDATE public.book_flags SET reconciliation = recon_data, status = CASE WHEN status = 'RESOLVED' THEN 'OPEN' ELSE status END,
        updated_at = now(), updated_by = actor.id WHERE id = existing.id;
    END IF;
    INSERT INTO public.activity_log(actor_id,action,resource,record_id,old_values,new_values,reason,created_by,updated_by)
      SELECT actor.id,CASE WHEN existing.id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,'book_flags',f.id::text,
        CASE WHEN existing.id IS NULL THEN NULL ELSE to_jsonb(existing) END,to_jsonb(f),'Receipt reconciliation linked to flag',actor.id,actor.id
        FROM public.book_flags f WHERE f.return_id = target;
    UPDATE public.leftover_books SET status = 'HELD',updated_at = now(),updated_by = actor.id WHERE book_id = returned.book_id AND status = 'AVAILABLE';
    UPDATE public.books SET status = 'FLAGGED',updated_at = now(),updated_by = actor.id WHERE id = returned.book_id
      AND NOT EXISTS (SELECT 1 FROM public.book_cases WHERE book_id = returned.book_id AND closed_at IS NULL);
  END IF;
  result_status := CASE WHEN issue OR EXISTS (SELECT 1 FROM public.book_flags WHERE return_id = target AND status <> 'RESOLVED' AND deleted_at IS NULL) THEN 'FLAGGED' ELSE 'RECONCILED' END;
  UPDATE public.book_returns SET receipt_entry_status = result_status,finalized_at = now(),receipt_entry_version = receipt_entry_version + 1,
    updated_at = now(),updated_by = actor.id WHERE id = target;
  INSERT INTO public.activity_log(actor_id,action,resource,record_id,old_values,new_values,reason,created_by,updated_by)
    VALUES (actor.id,'FINALIZE','book_returns',target::text,previous_return,recon_data || jsonb_build_object('status',result_status),'Receipt book finalized',actor.id,actor.id);
END $$;
REVOKE ALL ON FUNCTION public.finalize_receipt_book(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_receipt_book(uuid,integer) TO dms_runtime;


ALTER TABLE public.book_returns ADD COLUMN IF NOT EXISTS submission_pending boolean NOT NULL DEFAULT false;
ALTER TABLE public.book_receipts ADD COLUMN IF NOT EXISTS checked boolean NOT NULL DEFAULT false;
ALTER TABLE public.book_receipts DISABLE TRIGGER guard_book_receipt;
ALTER TABLE public.book_receipts DISABLE TRIGGER after_book_receipt;
UPDATE public.book_receipts r SET checked = true FROM public.book_returns b WHERE b.id = r.return_id AND b.finalized_at IS NOT NULL;
ALTER TABLE public.book_receipts ENABLE TRIGGER guard_book_receipt;
ALTER TABLE public.book_receipts ENABLE TRIGGER after_book_receipt;
CREATE TABLE IF NOT EXISTS public.receipt_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), return_id uuid NOT NULL REFERENCES public.book_returns(id),
  receipt_id uuid NOT NULL REFERENCES public.book_receipts(id), receipt_number integer NOT NULL,
  requested_by uuid NOT NULL REFERENCES public.people(id), requested_by_name text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000), base_version integer NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','USED')),
  review_note text NOT NULL DEFAULT '', reviewed_by uuid REFERENCES public.people(id), reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS receipt_edit_active_idx ON public.receipt_edit_requests(receipt_id, requested_by) WHERE status IN ('PENDING','APPROVED');
CREATE INDEX IF NOT EXISTS receipt_edit_return_idx ON public.receipt_edit_requests(return_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.receipt_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), return_id uuid NOT NULL REFERENCES public.book_returns(id), receipt_number integer NOT NULL,
  raised_by uuid NOT NULL REFERENCES public.people(id), raised_by_name text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')), resolution text NOT NULL DEFAULT '',
  resolved_by uuid REFERENCES public.people(id), resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receipt_issues_return_idx ON public.receipt_issues(return_id, status);
ALTER TABLE public.receipt_edit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_edit_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_issues FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.receipt_edit_requests, public.receipt_issues FROM PUBLIC, dms_runtime;
GRANT SELECT ON public.receipt_edit_requests, public.receipt_issues TO dms_runtime;
DROP POLICY IF EXISTS receipt_edits_read ON public.receipt_edit_requests;
CREATE POLICY receipt_edits_read ON public.receipt_edit_requests FOR SELECT TO dms_runtime USING (
  current_setting('app.role',true) = 'ADMIN' OR (current_setting('app.role',true) = 'STAFF' AND requested_by::text = current_setting('app.person_id',true)));
DROP POLICY IF EXISTS receipt_issues_read ON public.receipt_issues;
CREATE POLICY receipt_issues_read ON public.receipt_issues FOR SELECT TO dms_runtime USING (current_setting('app.role',true) IN ('ADMIN','STAFF'));
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY['receipt_edit_requests','receipt_issues'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS owner_maintenance ON public.%I',target);
    EXECUTE format('CREATE POLICY owner_maintenance ON public.%I TO %I USING (true) WITH CHECK (true)',target,current_user);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.prepare_book_return() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor public.people; current_case public.book_cases; stock public.books; assignment public.book_assignments;
  item jsonb; reason public.master_records; canonical jsonb := '[]'::jsonb; consumed integer; matched boolean; number_used integer; assigned_count integer;
BEGIN
  SELECT * INTO actor FROM public.people WHERE id = nullif(current_setting('app.person_id', true), '')::uuid
    AND auth_user_id = nullif(current_setting('app.auth_user_id', true), '')::uuid AND role IN ('ADMIN','STAFF')
    AND role = current_setting('app.role', true) AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO current_case FROM public.book_cases WHERE id = NEW.case_id AND closed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book already returned or case unavailable'; END IF;
  SELECT * INTO stock FROM public.books WHERE id = current_case.book_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR stock.status NOT IN ('ASSIGNED','LEFTOVER_ASSIGNED') THEN RAISE EXCEPTION 'Book is not with a Fundraiser'; END IF;
  SELECT * INTO assignment FROM public.book_assignments WHERE id = current_case.assignment_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NEW.return_date < assignment.assignment_date OR NEW.return_date > (now() AT TIME ZONE 'Asia/Kolkata')::date
    THEN RAISE EXCEPTION 'Invalid return date'; END IF;
  IF current_case.receipt_from < stock.receipt_from OR current_case.receipt_to > stock.receipt_to THEN RAISE EXCEPTION 'Invalid assigned range'; END IF;
  NEW.book_id := stock.id; NEW.assignment_id := assignment.id; NEW.book_number := stock.book_number; NEW.collector_name := assignment.collector_name;
  NEW.source_code := current_case.source_code; NEW.receipt_from := current_case.receipt_from; NEW.receipt_to := current_case.receipt_to;
  assigned_count := NEW.receipt_to - NEW.receipt_from + 1;
  IF NEW.last_used IS NOT NULL AND NEW.last_used NOT BETWEEN NEW.receipt_from AND NEW.receipt_to THEN RAISE EXCEPTION 'Last receipt outside assigned range'; END IF;
  IF NEW.last_used IS NULL AND NEW.receipts_used <> 0 THEN RAISE EXCEPTION 'Last used receipt is required'; END IF;
  IF jsonb_typeof(NEW.exceptions) <> 'array' OR jsonb_array_length(NEW.exceptions) > 1000
    OR jsonb_array_length(NEW.exceptions) > NEW.receipts_used THEN RAISE EXCEPTION 'Invalid receipt exceptions'; END IF;
  IF (SELECT count(DISTINCT (value->>'receiptNumber')::integer) FROM jsonb_array_elements(NEW.exceptions)) <> jsonb_array_length(NEW.exceptions)
    THEN RAISE EXCEPTION 'Duplicate receipt exception'; END IF;
  PERFORM 1 FROM public.master_records WHERE id IN (SELECT (value->>'reasonId')::uuid FROM jsonb_array_elements(NEW.exceptions)) ORDER BY id FOR SHARE;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.exceptions) LOOP
    number_used := (item->>'receiptNumber')::integer;
    IF NEW.last_used IS NULL OR number_used IS NULL OR number_used NOT BETWEEN NEW.receipt_from AND NEW.last_used
      OR coalesce(item->>'status','') NOT IN ('CANCELLED','TORN','LOST') THEN RAISE EXCEPTION 'Invalid receipt exception'; END IF;
    SELECT * INTO reason FROM public.master_records WHERE id = (item->>'reasonId')::uuid AND kind = 'RECEIPT_REASON' AND active AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Select an active receipt reason'; END IF;
    canonical := canonical || jsonb_build_array(jsonb_build_object('receiptNumber', number_used, 'status', item->>'status',
      'reasonId', reason.id, 'reasonEn', reason.name_en, 'reasonUr', reason.name_ur));
  END LOOP;
  NEW.exceptions := canonical;
  consumed := CASE WHEN NEW.last_used IS NULL THEN 0 ELSE NEW.last_used - NEW.receipt_from + 1 END;
  matched := NEW.total_paise = NEW.receipt_sum_paise AND NEW.receipts_used = consumed
    AND ((NEW.total_paise = 0 AND NEW.receipt_sum_paise = 0) OR (consumed > 0 AND NEW.receipts_used > 0))
    AND (stock.book_type = 'REGULAR' OR NEW.receipt_sum_paise = (NEW.receipts_used::bigint - jsonb_array_length(canonical)) * stock.token_value_paise)
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(canonical) WHERE value->>'status' IN ('TORN','LOST'));
  NEW.submission_pending := true;
  SELECT coalesce(commission_basis_points,0) INTO NEW.commission_basis_points FROM public.collectors WHERE person_id = assignment.collector_id AND deleted_at IS NULL FOR SHARE;
  IF NEW.commission_basis_points IS NULL THEN RAISE EXCEPTION 'Fundraiser profile unavailable'; END IF;
  IF NEW.outcome <> 'FLAGGED' AND NOT NEW.submission_pending AND NOT matched THEN RAISE EXCEPTION 'Mismatch requires a flag'; END IF;
  IF NEW.outcome = 'CLOSED' AND consumed <> assigned_count THEN RAISE EXCEPTION 'Unused receipts require partly used outcome'; END IF;
  IF NEW.outcome = 'PARTLY_USED' AND consumed >= assigned_count THEN RAISE EXCEPTION 'No receipts remain'; END IF;
  IF NEW.outcome = 'FLAGGED' THEN
    SELECT * INTO reason FROM public.master_records WHERE id = NEW.flag_reason_id AND kind = 'FLAG_REASON' AND active AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Select an active flag reason'; END IF;
    NEW.flag_reason_en := reason.name_en; NEW.flag_reason_ur := reason.name_ur;
  ELSE NEW.flag_reason_en := ''; NEW.flag_reason_ur := ''; END IF;
  NEW.checked_by_name := actor.full_name; NEW.created_by := actor.id; NEW.updated_by := actor.id;
  NEW.created_at := now(); NEW.updated_at := now(); NEW.deleted_at := NULL; NEW.receipt_entry_status := 'PENDING';
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.finish_book_return() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE assignment public.book_assignments; reason public.master_records; next_ordinal integer; flag public.book_flags; leftover public.leftover_books;
BEGIN
  IF NEW.submission_pending THEN
    INSERT INTO public.activity_log(actor_id,action,resource,record_id,new_values,reason,created_by,updated_by)
      VALUES(NEW.created_by,'INSERT','book_returns',NEW.id::text,to_jsonb(NEW),'Book submission started; assignment remains open',NEW.created_by,NEW.created_by);
    RETURN NEW;
  END IF;
  SELECT * INTO assignment FROM public.book_assignments WHERE id = NEW.assignment_id;
  UPDATE public.book_cases SET closed_at = now() WHERE id = NEW.case_id AND closed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book already returned'; END IF;
  UPDATE public.books SET status = NEW.outcome, updated_at = now(), updated_by = NEW.created_by WHERE id = NEW.book_id;
  UPDATE public.book_assignments SET updated_at = now(), updated_by = NEW.created_by WHERE id = NEW.assignment_id;
  IF NEW.outcome = 'FLAGGED' THEN
    SELECT * INTO reason FROM public.master_records WHERE id = NEW.flag_reason_id;
    INSERT INTO public.book_flags(return_id, book_id, collector_id, reason_id, reason_en, reason_ur, expected_paise, found_paise, remarks, created_by, updated_by)
      VALUES (NEW.id, NEW.book_id, assignment.collector_id, reason.id, reason.name_en, reason.name_ur, NEW.expected_paise, NEW.found_paise, NEW.remarks, NEW.created_by, NEW.created_by)
      RETURNING * INTO flag;
    INSERT INTO public.activity_log(actor_id, action, resource, record_id, new_values, reason, created_by, updated_by)
      VALUES (NEW.created_by, 'INSERT', 'book_flags', flag.id::text, to_jsonb(flag), NEW.remarks, NEW.created_by, NEW.created_by);
  ELSIF NEW.outcome = 'PARTLY_USED' THEN
    SELECT coalesce(max(ordinal), 0) + 1 INTO next_ordinal FROM public.leftover_books WHERE book_id = NEW.book_id;
    INSERT INTO public.leftover_books(book_id, return_id, returned_by, code, ordinal, receipt_from, receipt_to, created_by, updated_by)
      VALUES (NEW.book_id, NEW.id, assignment.collector_id, NEW.book_number || '-B' || next_ordinal::text, next_ordinal,
        coalesce(NEW.last_used + 1, NEW.receipt_from), NEW.receipt_to, NEW.created_by, NEW.created_by) RETURNING * INTO leftover;
    INSERT INTO public.activity_log(actor_id, action, resource, record_id, new_values, reason, created_by, updated_by)
      VALUES (NEW.created_by, 'INSERT', 'leftover_books', leftover.id::text, to_jsonb(leftover), 'Unused receipts retained in original book', NEW.created_by, NEW.created_by);
  END IF;
  INSERT INTO public.activity_log(actor_id, action, resource, record_id, new_values, reason, created_by, updated_by)
    VALUES (NEW.created_by, 'INSERT', 'book_returns', NEW.id::text, to_jsonb(NEW), 'Book return check', NEW.created_by, NEW.created_by);
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_book_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor public.people; returned public.book_returns; stock public.books; start_day date; item record; master public.master_records;
  old_labels jsonb := '{}'::jsonb; canonical jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO actor FROM public.people WHERE id = nullif(current_setting('app.person_id',true),'')::uuid
    AND auth_user_id = nullif(current_setting('app.auth_user_id',true),'')::uuid AND role = current_setting('app.role',true)
    AND role IN ('ADMIN','STAFF') AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.return_id <> OLD.return_id OR NEW.book_id <> OLD.book_id OR NEW.receipt_number <> OLD.receipt_number
      OR NEW.created_at <> OLD.created_at OR NEW.created_by <> OLD.created_by OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN RAISE EXCEPTION 'Receipt identity is immutable'; END IF;
    old_labels := OLD.labels; NEW.version := OLD.version + 1;
  ELSE NEW.version := 1; NEW.created_by := actor.id; NEW.created_at := now(); END IF;
  SELECT * INTO returned FROM public.book_returns WHERE id = NEW.return_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book unavailable'; END IF;
  IF returned.finalized_at IS NOT NULL THEN
    IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Book is finalized'; END IF;
    PERFORM 1 FROM public.receipt_edit_requests WHERE receipt_id = OLD.id AND requested_by = actor.id
      AND status = 'APPROVED' AND base_version = OLD.version FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'An approved edit request is required' USING ERRCODE = '42501'; END IF;
    NEW.checked := true;
  END IF;
  IF returned.last_used IS NULL OR NEW.receipt_number NOT BETWEEN returned.receipt_from AND returned.last_used THEN RAISE EXCEPTION 'Receipt outside used range'; END IF;
  SELECT * INTO stock FROM public.books WHERE id = returned.book_id;
  SELECT assignment_date INTO start_day FROM public.book_assignments WHERE id = returned.assignment_id;
  FOR item IN SELECT DISTINCT x.id, x.kind FROM (
    SELECT value->>'categoryId' AS id, 'DONATION_CATEGORY' AS kind FROM jsonb_array_elements(NEW.data->'heads')
    UNION ALL SELECT value->>'headId', 'DONATION_HEAD' FROM jsonb_array_elements(NEW.data->'heads')
    UNION ALL SELECT NEW.data->>'reasonId', 'RECEIPT_REASON'
    UNION ALL SELECT NEW.data->>'upiAppId', 'UPI_APP'
    UNION ALL SELECT NEW.data->>'bankId', 'BANK') x WHERE coalesce(x.id,'') <> '' ORDER BY x.id LOOP
    SELECT * INTO master FROM public.master_records WHERE id = item.id::uuid AND kind = item.kind AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND OR (NOT master.active AND NOT (old_labels ? item.id)) THEN RAISE EXCEPTION 'Master option is inactive'; END IF;
    canonical := canonical || jsonb_build_object(item.id, jsonb_build_object('nameEn',master.name_en,'nameUr',master.name_ur,'needsDetail',master.needs_detail));
  END LOOP;
  PERFORM public.validate_receipt_data(NEW.data, NEW.checked, start_day, returned.return_date, stock.token_value_paise);
  NEW.labels := canonical; NEW.book_id := returned.book_id; NEW.status := NEW.data->>'status'; NEW.amount_paise := (NEW.data->>'amountPaise')::bigint;
  IF (SELECT coalesce(sum(amount_paise),0) FROM public.book_receipts WHERE return_id = NEW.return_id AND id <> NEW.id AND status = 'VALID' AND deleted_at IS NULL)
    + (CASE WHEN NEW.status = 'VALID' THEN coalesce(NEW.amount_paise,0) ELSE 0 END) > 999999999999 THEN RAISE EXCEPTION 'Book amount exceeds supported limit'; END IF;
  NEW.phone := coalesce(NEW.data->>'phone',''); NEW.reference := CASE WHEN NEW.status = 'VALID' AND NEW.data->>'paymentMode' = 'DIGITAL'
    THEN nullif(upper(btrim(NEW.data->>'reference')),'') ELSE NULL END;
  IF NEW.photo_key IS NOT NULL AND NEW.photo_key !~ ('^receipts/' || NEW.id::text || '/[0-9a-f-]{36}\.jpg$') THEN RAISE EXCEPTION 'Invalid receipt photo'; END IF;
  NEW.entry_by_name := actor.full_name; NEW.updated_by := actor.id; NEW.updated_at := now(); NEW.deleted_at := NULL;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.after_book_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE was_finalized boolean; next_version integer;
BEGIN
  SELECT finalized_at IS NOT NULL INTO was_finalized FROM public.book_returns WHERE id = NEW.return_id;
  IF TG_OP = 'INSERT' OR OLD.reference IS DISTINCT FROM NEW.reference THEN
    DELETE FROM public.payment_references WHERE source_type = 'RECEIPT' AND source_id = NEW.id;
    IF NEW.reference IS NOT NULL THEN INSERT INTO public.payment_references(reference,source_type,source_id) VALUES(NEW.reference,'RECEIPT',NEW.id); END IF;
  END IF;
  UPDATE public.book_returns SET receipt_entry_status = 'DRAFT', receipt_entry_version = receipt_entry_version + 1,
    finalized_at = CASE WHEN was_finalized THEN NULL ELSE finalized_at END, updated_at = now(), updated_by = NEW.updated_by
    WHERE id = NEW.return_id RETURNING receipt_entry_version INTO next_version;
  IF was_finalized THEN
    UPDATE public.receipt_edit_requests SET status = 'USED' WHERE receipt_id = NEW.id AND requested_by = NEW.updated_by AND status = 'APPROVED' AND base_version = OLD.version;
    PERFORM public.finalize_receipt_book(NEW.return_id,next_version);
  END IF;
  INSERT INTO public.activity_log(actor_id,action,resource,record_id,old_values,new_values,reason,created_by,updated_by)
    VALUES(NEW.updated_by,TG_OP,'book_receipts',NEW.id::text,CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
      to_jsonb(NEW),CASE WHEN was_finalized THEN 'Approved receipt correction; totals reconciled again' WHEN NEW.checked THEN 'Receipt checked against physical copy' ELSE 'Receipt draft saved' END,NEW.updated_by,NEW.updated_by);
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.finalize_receipt_book(target uuid, expected_version integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor public.people; returned public.book_returns; stock public.books; start_day date; receipt_row public.book_receipts;
  expected_count integer; saved_count integer; valid_total bigint; cash_total bigint; digital_total bigint; cheque_total bigint;
  issue boolean; result_status text; reason public.master_records; existing public.book_flags; recon_data jsonb; previous_return jsonb; next_ordinal integer; assignment public.book_assignments; leftover public.leftover_books;
BEGIN
  SELECT * INTO actor FROM public.people WHERE id = nullif(current_setting('app.person_id',true),'')::uuid
    AND auth_user_id = nullif(current_setting('app.auth_user_id',true),'')::uuid AND role = current_setting('app.role',true)
    AND role IN ('ADMIN','STAFF') AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO returned FROM public.book_returns WHERE id = target AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return unavailable'; END IF;
  IF returned.finalized_at IS NOT NULL THEN RETURN; END IF;
  IF returned.receipt_entry_version <> expected_version THEN RAISE EXCEPTION 'Receipt book changed' USING ERRCODE = '40001'; END IF;
  previous_return := to_jsonb(returned);
  SELECT * INTO stock FROM public.books WHERE id = returned.book_id;
  SELECT assignment_date INTO start_day FROM public.book_assignments WHERE id = returned.assignment_id;
  expected_count := CASE WHEN returned.last_used IS NULL THEN 0 ELSE returned.last_used - returned.receipt_from + 1 END;
  SELECT count(*) INTO saved_count FROM public.book_receipts WHERE return_id = target AND deleted_at IS NULL;
  IF saved_count <> expected_count THEN RAISE EXCEPTION 'Every receipt in the used range must be entered'; END IF;
  FOR receipt_row IN SELECT * FROM public.book_receipts WHERE return_id = target AND deleted_at IS NULL ORDER BY receipt_number LOOP
    IF NOT receipt_row.checked THEN RAISE EXCEPTION 'Incomplete receipt %', receipt_row.receipt_number USING ERRCODE = 'P0002'; END IF;
    BEGIN PERFORM public.validate_receipt_data(receipt_row.data, true, start_day, returned.return_date, stock.token_value_paise);
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Incomplete receipt %', receipt_row.receipt_number USING ERRCODE = 'P0002'; END;
  END LOOP;
  SELECT coalesce(sum(amount_paise) FILTER (WHERE status = 'VALID'),0),
    coalesce(sum(amount_paise) FILTER (WHERE status = 'VALID' AND data->>'paymentMode' = 'CASH'),0),
    coalesce(sum(amount_paise) FILTER (WHERE status = 'VALID' AND data->>'paymentMode' = 'DIGITAL'),0),
    coalesce(sum(amount_paise) FILTER (WHERE status = 'VALID' AND data->>'paymentMode' = 'CHEQUE'),0)
    INTO valid_total, cash_total, digital_total, cheque_total FROM public.book_receipts WHERE return_id = target AND deleted_at IS NULL;
  issue := EXISTS (SELECT 1 FROM public.receipt_issues WHERE return_id = target AND status = 'OPEN') OR valid_total <> returned.total_paise OR valid_total <> returned.receipt_sum_paise OR cash_total <> returned.cash_paise
    OR digital_total <> returned.digital_paise OR cheque_total > 0 OR expected_count <> returned.receipts_used
    OR EXISTS (SELECT 1 FROM public.book_receipts WHERE return_id = target AND status IN ('TORN','LOST','BLANK') AND deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(returned.exceptions) e LEFT JOIN public.book_receipts r
      ON r.return_id = target AND r.receipt_number = (e.value->>'receiptNumber')::integer WHERE r.status IS DISTINCT FROM e.value->>'status');
  recon_data := jsonb_build_object('expectedTotal',returned.total_paise,'foundTotal',valid_total,'expectedCash',returned.cash_paise,
    'foundCash',cash_total,'expectedDigital',returned.digital_paise,'foundDigital',digital_total,'cheque',cheque_total,
    'reportedUsed',returned.receipts_used,'entered',saved_count,'checkedBy',actor.id,'checkedAt',now());
  SELECT * INTO existing FROM public.book_flags WHERE return_id = target FOR UPDATE;
  IF issue THEN
    IF existing.id IS NULL THEN
      SELECT * INTO reason FROM public.master_records WHERE kind = 'FLAG_REASON' AND code = 'RECEIPT_RECONCILIATION';
      IF NOT FOUND THEN RAISE EXCEPTION 'Reconciliation reason missing'; END IF;
      INSERT INTO public.book_flags(return_id,book_id,collector_id,reason_id,reason_en,reason_ur,expected_paise,found_paise,remarks,reconciliation,created_by,updated_by)
        SELECT target,returned.book_id,collector_id,reason.id,reason.name_en,reason.name_ur,returned.total_paise,valid_total,
          'Receipt entry totals or receipt statuses require review',recon_data,actor.id,actor.id FROM public.book_assignments WHERE id = returned.assignment_id;
    ELSE
      UPDATE public.book_flags SET reconciliation = recon_data, status = CASE WHEN status = 'RESOLVED' THEN 'OPEN' ELSE status END,
        updated_at = now(), updated_by = actor.id WHERE id = existing.id;
    END IF;
    INSERT INTO public.activity_log(actor_id,action,resource,record_id,old_values,new_values,reason,created_by,updated_by)
      SELECT actor.id,CASE WHEN existing.id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,'book_flags',f.id::text,
        CASE WHEN existing.id IS NULL THEN NULL ELSE to_jsonb(existing) END,to_jsonb(f),'Receipt reconciliation linked to flag',actor.id,actor.id
        FROM public.book_flags f WHERE f.return_id = target;
    UPDATE public.leftover_books SET status = 'HELD',updated_at = now(),updated_by = actor.id WHERE book_id = returned.book_id AND status = 'AVAILABLE';
    UPDATE public.books SET status = 'FLAGGED',updated_at = now(),updated_by = actor.id WHERE id = returned.book_id
      AND NOT EXISTS (SELECT 1 FROM public.book_cases WHERE book_id = returned.book_id AND closed_at IS NULL);
  END IF;
  result_status := CASE WHEN issue OR EXISTS (SELECT 1 FROM public.book_flags WHERE return_id = target AND status <> 'RESOLVED' AND deleted_at IS NULL) THEN 'FLAGGED' ELSE 'RECONCILED' END;
  IF returned.submission_pending THEN
    SELECT * INTO stock FROM public.books WHERE id = returned.book_id FOR UPDATE;
    SELECT * INTO assignment FROM public.book_assignments WHERE id = returned.assignment_id;
    UPDATE public.book_cases SET closed_at = now() WHERE id = returned.case_id AND closed_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assignment is no longer open'; END IF;
    UPDATE public.books SET status = CASE WHEN result_status = 'FLAGGED' THEN 'FLAGGED' WHEN returned.remaining_receipts > 0 THEN 'PARTLY_USED' ELSE 'CLOSED' END,
      updated_at = now(), updated_by = actor.id WHERE id = returned.book_id;
    UPDATE public.book_assignments SET updated_at = now(),updated_by = actor.id WHERE id = returned.assignment_id;
    IF returned.remaining_receipts > 0 THEN
      SELECT coalesce(max(ordinal),0) + 1 INTO next_ordinal FROM public.leftover_books WHERE book_id = returned.book_id;
      INSERT INTO public.leftover_books(book_id,return_id,returned_by,code,ordinal,receipt_from,receipt_to,status,created_by,updated_by)
        VALUES(returned.book_id,target,assignment.collector_id,returned.book_number || '-B' || next_ordinal::text,next_ordinal,
          coalesce(returned.last_used + 1,returned.receipt_from),returned.receipt_to,CASE WHEN result_status = 'FLAGGED' THEN 'HELD' ELSE 'AVAILABLE' END,actor.id,actor.id)
        RETURNING * INTO leftover;
      INSERT INTO public.activity_log(actor_id,action,resource,record_id,new_values,reason,created_by,updated_by)
        VALUES(actor.id,'INSERT','leftover_books',leftover.id::text,to_jsonb(leftover),'Submission finalized; only unused tail retained',actor.id,actor.id);
    END IF;
  END IF;
  IF result_status = 'RECONCILED' AND NOT EXISTS(SELECT 1 FROM public.book_flags WHERE book_id = returned.book_id AND status <> 'RESOLVED' AND deleted_at IS NULL) THEN
    UPDATE public.leftover_books SET status = 'AVAILABLE', updated_at = now(), updated_by = actor.id WHERE return_id = target AND status = 'HELD';
  END IF;
  UPDATE public.book_returns SET submission_pending = false, receipt_entry_status = result_status,finalized_at = now(),receipt_entry_version = receipt_entry_version + 1,
    updated_at = now(),updated_by = actor.id WHERE id = target;
  INSERT INTO public.activity_log(actor_id,action,resource,record_id,old_values,new_values,reason,created_by,updated_by)
    VALUES (actor.id,'FINALIZE','book_returns',target::text,previous_return,recon_data || jsonb_build_object('status',result_status),'Receipt book finalized',actor.id,actor.id);
END $$;
REVOKE ALL ON FUNCTION public.prepare_book_return(), public.finish_book_return(), public.guard_book_receipt(), public.after_book_receipt() FROM PUBLIC, dms_runtime;
REVOKE ALL ON FUNCTION public.finalize_receipt_book(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_receipt_book(uuid,integer) TO dms_runtime;

-- Old unfinished returns must also finish receipt checking before leftover allocation.
UPDATE public.leftover_books l SET status = 'HELD', updated_at = now() FROM public.book_returns r
  WHERE r.id = l.return_id AND r.finalized_at IS NULL AND l.status = 'AVAILABLE';
CREATE OR REPLACE FUNCTION public.receipt_workflow_actor() RETURNS public.people
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor public.people;
BEGIN
  SELECT * INTO actor FROM public.people WHERE id = nullif(current_setting('app.person_id',true),'')::uuid
    AND auth_user_id = nullif(current_setting('app.auth_user_id',true),'')::uuid
    AND role = current_setting('app.role',true) AND role IN ('ADMIN','STAFF') AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION public.receipt_workflow_actor() FROM PUBLIC, dms_runtime;

CREATE OR REPLACE FUNCTION public.request_receipt_workflow(target uuid, receipt_no integer, operation text, request_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor public.people; returned public.book_returns; receipt_row public.book_receipts; record_id uuid;
BEGIN
  actor := public.receipt_workflow_actor();
  IF length(btrim(request_reason)) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Reason required'; END IF;
  SELECT * INTO returned FROM public.book_returns WHERE id = target AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR returned.last_used IS NULL OR receipt_no NOT BETWEEN returned.receipt_from AND returned.last_used THEN RAISE EXCEPTION 'Receipt outside submitted range'; END IF;
  IF operation = 'REQUEST_EDIT' THEN
    IF returned.finalized_at IS NULL THEN RAISE EXCEPTION 'Unfinalized receipts can be edited directly'; END IF;
    SELECT * INTO receipt_row FROM public.book_receipts WHERE return_id = target AND receipt_number = receipt_no AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not saved'; END IF;
    UPDATE public.receipt_edit_requests SET status = 'REJECTED', review_note = 'Superseded by a newer receipt version', reviewed_at = now()
      WHERE receipt_id = receipt_row.id AND requested_by = actor.id AND status IN ('PENDING','APPROVED') AND base_version <> receipt_row.version;
    INSERT INTO public.receipt_edit_requests(return_id,receipt_id,receipt_number,requested_by,requested_by_name,reason,base_version)
      VALUES(target,receipt_row.id,receipt_no,actor.id,actor.full_name,btrim(request_reason),receipt_row.version) RETURNING id INTO record_id;
  ELSIF operation = 'RAISE_ISSUE' THEN
    INSERT INTO public.receipt_issues(return_id,receipt_number,raised_by,raised_by_name,reason)
      VALUES(target,receipt_no,actor.id,actor.full_name,btrim(request_reason)) RETURNING id INTO record_id;
    IF returned.finalized_at IS NOT NULL THEN
      UPDATE public.book_returns SET finalized_at = NULL, receipt_entry_version = receipt_entry_version + 1 WHERE id = target;
      PERFORM public.finalize_receipt_book(target, returned.receipt_entry_version + 1);
    END IF;
  ELSE RAISE EXCEPTION 'Invalid operation'; END IF;
  INSERT INTO public.activity_log(actor_id,action,resource,record_id,new_values,reason,created_by,updated_by)
    VALUES(actor.id,operation,'book_receipts',record_id::text,jsonb_build_object('returnId',target,'receiptNumber',receipt_no),btrim(request_reason),actor.id,actor.id);
END $$;
CREATE OR REPLACE FUNCTION public.review_receipt_workflow(target uuid, operation text, decision text, review_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor public.people; edit_row public.receipt_edit_requests; issue_row public.receipt_issues; flag_row public.book_flags; returned public.book_returns;
BEGIN
  actor := public.receipt_workflow_actor();
  IF actor.role <> 'ADMIN' THEN RAISE EXCEPTION 'Only Super Admin can review' USING ERRCODE = '42501'; END IF;
  IF length(btrim(review_reason)) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Review reason required'; END IF;
  IF operation = 'REVIEW_EDIT' AND decision IN ('APPROVED','REJECTED') THEN
    SELECT * INTO edit_row FROM public.receipt_edit_requests WHERE id = target FOR UPDATE;
    IF NOT FOUND OR edit_row.status <> 'PENDING' THEN RAISE EXCEPTION 'Request already reviewed'; END IF;
    IF decision = 'APPROVED' AND NOT EXISTS (SELECT 1 FROM public.book_receipts WHERE id = edit_row.receipt_id AND version = edit_row.base_version AND deleted_at IS NULL)
      THEN RAISE EXCEPTION 'Receipt changed; request again' USING ERRCODE = '40001'; END IF;
    UPDATE public.receipt_edit_requests SET status = decision, review_note = btrim(review_reason), reviewed_by = actor.id, reviewed_at = now() WHERE id = target;
  ELSIF operation = 'RESOLVE_ISSUE' AND decision = 'RESOLVED' THEN
    SELECT * INTO issue_row FROM public.receipt_issues WHERE id = target FOR UPDATE;
    IF NOT FOUND OR issue_row.status <> 'OPEN' THEN RAISE EXCEPTION 'Issue already resolved'; END IF;
    UPDATE public.receipt_issues SET status = 'RESOLVED', resolution = btrim(review_reason), resolved_by = actor.id, resolved_at = now() WHERE id = target;
  ELSIF operation = 'RESOLVE_BOOK_FLAG' AND decision = 'RESOLVED' THEN
    SELECT * INTO returned FROM public.book_returns WHERE id = (SELECT return_id FROM public.book_flags WHERE id = target AND deleted_at IS NULL) FOR UPDATE;
    SELECT * INTO flag_row FROM public.book_flags WHERE id = target AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND OR flag_row.status = 'RESOLVED' THEN RAISE EXCEPTION 'Flag unavailable or already resolved'; END IF;
    SELECT * INTO returned FROM public.book_returns WHERE id = flag_row.return_id FOR UPDATE;
    IF returned.finalized_at IS NULL OR returned.submission_pending THEN RAISE EXCEPTION 'Finalize the submission first'; END IF;
    IF EXISTS(SELECT 1 FROM public.receipt_issues WHERE return_id = returned.id AND status = 'OPEN') THEN RAISE EXCEPTION 'Resolve receipt issues first'; END IF;
    PERFORM 1 FROM public.books WHERE id = returned.book_id FOR UPDATE;
    UPDATE public.book_flags SET status = 'RESOLVED', remarks = left(remarks || E'\nResolution: ' || btrim(review_reason),1000), updated_by = actor.id, updated_at = now() WHERE id = target;
    UPDATE public.book_returns SET receipt_entry_status = 'RECONCILED', receipt_entry_version = receipt_entry_version + 1, updated_by = actor.id, updated_at = now() WHERE id = returned.id;
    IF NOT EXISTS(SELECT 1 FROM public.book_flags WHERE book_id = returned.book_id AND status <> 'RESOLVED' AND deleted_at IS NULL) THEN
      UPDATE public.leftover_books SET status = 'AVAILABLE', updated_by = actor.id, updated_at = now() WHERE book_id = returned.book_id AND status = 'HELD';
      UPDATE public.books SET status = CASE WHEN EXISTS(SELECT 1 FROM public.leftover_books WHERE book_id = returned.book_id AND status = 'AVAILABLE') THEN 'PARTLY_USED' ELSE 'CLOSED' END,
        updated_by = actor.id, updated_at = now() WHERE id = returned.book_id AND NOT EXISTS(SELECT 1 FROM public.book_cases WHERE book_id = returned.book_id AND closed_at IS NULL);
    END IF;
  ELSE RAISE EXCEPTION 'Invalid review'; END IF;
  INSERT INTO public.activity_log(actor_id,action,resource,record_id,new_values,reason,created_by,updated_by)
    VALUES(actor.id,operation,'book_receipts',target::text,jsonb_build_object('decision',decision),btrim(review_reason),actor.id,actor.id);
END $$;
REVOKE ALL ON FUNCTION public.request_receipt_workflow(uuid,integer,text,text), public.review_receipt_workflow(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_receipt_workflow(uuid,integer,text,text), public.review_receipt_workflow(uuid,text,text,text) TO dms_runtime;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.book_returns'::regclass AND attname = 'submission_pending' AND NOT attisdropped
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.book_receipts'::regclass AND attname = 'checked' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'Book Submission setup incomplete; no changes have been applied';
  END IF;
  RAISE NOTICE 'Book Submission setup completed on database %', current_database();
END;
$book_submission_setup$;
