-- Run the entire file manually after 0008_leftover_assignments.sql.
BEGIN;
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
COMMIT;
