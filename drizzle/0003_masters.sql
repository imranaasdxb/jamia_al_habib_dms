-- Run the whole file once in Neon's SQL editor. No existing records are deleted.
BEGIN;
CREATE TABLE IF NOT EXISTS public.master_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('EDITION','BOOK_TYPE','TOKEN_VALUE','DONATION_HEAD','RESPONSIBILITY','AREA',
    'PAYMENT_MODE','UPI_APP','BANK','BANK_ACCOUNT','RECEIPT_REASON','FLAG_REASON')),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
  name_en text NOT NULL CHECK (length(btrim(name_en)) BETWEEN 2 AND 120),
  name_ur text NOT NULL CHECK (length(btrim(name_ur)) BETWEEN 2 AND 120),
  active boolean NOT NULL DEFAULT true, built_in boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  effective_from date, needs_detail boolean NOT NULL DEFAULT false,
  level text CHECK (level IN ('STATE','DISTRICT','BLOCK','VILLAGE')),
  parent_id uuid REFERENCES public.master_records(id) ON DELETE RESTRICT,
  token_value_rupees integer CHECK (token_value_rupees IN (10,20,50)),
  account_name text NOT NULL DEFAULT '' CHECK (length(account_name) <= 120),
  last_four text NOT NULL DEFAULT '' CHECK (last_four = '' OR last_four ~ '^[0-9]{4}$'),
  upi_id text NOT NULL DEFAULT '' CHECK (length(upi_id) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz CHECK (deleted_at IS NULL),
  CHECK (parent_id IS DISTINCT FROM id),
  CHECK (kind <> 'EDITION' OR effective_from IS NOT NULL),
  CHECK (kind <> 'TOKEN_VALUE' OR token_value_rupees IS NOT NULL),
  CHECK (kind <> 'AREA' OR (level IS NOT NULL AND ((level = 'STATE' AND parent_id IS NULL) OR (level <> 'STATE' AND parent_id IS NOT NULL)))),
  CHECK (kind <> 'BANK_ACCOUNT' OR (parent_id IS NOT NULL AND length(btrim(account_name)) >= 2 AND last_four ~ '^[0-9]{4}$'))
);
CREATE UNIQUE INDEX IF NOT EXISTS master_records_kind_code_idx ON public.master_records(kind, code);
CREATE INDEX IF NOT EXISTS master_records_kind_active_idx ON public.master_records(kind, active);
CREATE INDEX IF NOT EXISTS master_records_parent_idx ON public.master_records(parent_id);

INSERT INTO public.master_records(kind, code, name_en, name_ur, built_in, token_value_rupees, needs_detail) VALUES
  ('BOOK_TYPE','REGULAR','Regular','عام',true,NULL,false),
  ('BOOK_TYPE','TOKEN','Token','ٹوکن',true,NULL,false),
  ('TOKEN_VALUE','RS_10','₹10','₹10',true,10,false),
  ('TOKEN_VALUE','RS_20','₹20','₹20',true,20,false),
  ('TOKEN_VALUE','RS_50','₹50','₹50',true,50,false),
  ('DONATION_HEAD','ZAKAT','Zakat','زکوٰۃ',true,NULL,false),
  ('DONATION_HEAD','FITRA','Fitra','فطرہ',true,NULL,false),
  ('DONATION_HEAD','USHR','Ushr','عشر',true,NULL,false),
  ('DONATION_HEAD','SADAQAT_NAFILA','Sadaqat-e-Nafila','صدقات نافلہ',true,NULL,false),
  ('DONATION_HEAD','HADIA','Hadia','ہدیہ',true,NULL,false),
  ('DONATION_HEAD','JAMIA_AIMS','Jamia Aims','جامعہ کے مقاصد',true,NULL,false),
  ('DONATION_HEAD','MEMBERSHIP','Membership','رکنیت',true,NULL,false),
  ('DONATION_HEAD','OTHER','Other','دیگر',true,NULL,true),
  ('RESPONSIBILITY','HALQA_NIGRAN','Halqa Nigran','حلقہ نگران',true,NULL,false),
  ('PAYMENT_MODE','CASH','Cash','نقد',true,NULL,false),
  ('PAYMENT_MODE','DIGITAL','Digital','ڈیجیٹل',true,NULL,false),
  ('PAYMENT_MODE','CHEQUE','Cheque','چیک',true,NULL,false),
  ('UPI_APP','PHONEPE','PhonePe','فون پے',true,NULL,false),
  ('UPI_APP','PAYTM','Paytm','پے ٹی ایم',true,NULL,false),
  ('UPI_APP','OTHER','Other','دیگر',true,NULL,true),
  ('RECEIPT_REASON','CANCELLED','Cancelled receipt','منسوخ رسید',true,NULL,false),
  ('RECEIPT_REASON','TORN','Torn receipt','پھٹی رسید',true,NULL,false),
  ('RECEIPT_REASON','LOST','Lost receipt','گم شدہ رسید',true,NULL,false),
  ('FLAG_REASON','CASH_SHORT','Cash short','نقد رقم کم',true,NULL,false),
  ('FLAG_REASON','CASH_EXCESS','Cash excess','نقد رقم زیادہ',true,NULL,false),
  ('FLAG_REASON','RECEIPT_MISSING','Receipt missing','رسید غائب',true,NULL,false),
  ('FLAG_REASON','COUNT_DIFFERS','Receipt count differs','رسیدوں کی تعداد میں فرق',true,NULL,false),
  ('FLAG_REASON','AMOUNT_DIFFERS','Amount differs','رقم میں فرق',true,NULL,false),
  ('FLAG_REASON','TORN_LOST','Torn or lost receipt','پھٹی یا گم شدہ رسید',true,NULL,false),
  ('FLAG_REASON','OTHER','Other','دیگر',true,NULL,true)
ON CONFLICT (kind, code) DO NOTHING;
INSERT INTO public.master_records(kind, code, name_en, name_ur, level, built_in)
  VALUES ('AREA','ODISHA','Odisha','اوڈیشہ','STATE',true) ON CONFLICT (kind, code) DO NOTHING;
INSERT INTO public.master_records(kind, code, name_en, name_ur, level, parent_id, built_in)
  SELECT 'AREA','JAGATSINGHPUR','Jagatsinghpur','جگت سنگھ پور','DISTRICT',id,true FROM public.master_records
  WHERE kind = 'AREA' AND code = 'ODISHA' ON CONFLICT (kind, code) DO NOTHING;

ALTER TABLE public.master_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_records FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.master_records FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.master_records TO dms_runtime;
DROP POLICY IF EXISTS masters_read ON public.master_records;
CREATE POLICY masters_read ON public.master_records FOR SELECT TO dms_runtime USING (
  deleted_at IS NULL AND (current_setting('app.role', true) = 'ADMIN'
    OR (current_setting('app.role', true) = 'STAFF' AND active)));
DROP POLICY IF EXISTS masters_create ON public.master_records;
CREATE POLICY masters_create ON public.master_records FOR INSERT TO dms_runtime WITH CHECK (
  current_setting('app.role', true) = 'ADMIN' AND created_by::text = current_setting('app.person_id', true));
DROP POLICY IF EXISTS masters_update ON public.master_records;
CREATE POLICY masters_update ON public.master_records FOR UPDATE TO dms_runtime
  USING (current_setting('app.role', true) = 'ADMIN')
  WITH CHECK (current_setting('app.role', true) = 'ADMIN' AND updated_by::text = current_setting('app.person_id', true));
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS owner_maintenance ON public.master_records';
  EXECUTE format('CREATE POLICY owner_maintenance ON public.master_records TO %I USING (true) WITH CHECK (true)', current_user);
END $$;

CREATE OR REPLACE FUNCTION public.guard_master_record() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE parent_record public.master_records; expected_level text;
BEGIN
  IF current_user = 'dms_runtime' THEN
    IF current_setting('app.role', true) <> 'ADMIN' THEN RAISE EXCEPTION 'Only administrators manage masters'; END IF;
    IF TG_OP = 'INSERT' AND NEW.kind IN ('BOOK_TYPE','TOKEN_VALUE','PAYMENT_MODE') THEN
      RAISE EXCEPTION 'These options are provided by the system';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.kind <> OLD.kind OR NEW.code <> OLD.code OR NEW.built_in <> OLD.built_in OR NEW.level IS DISTINCT FROM OLD.level
        OR NEW.token_value_rupees IS DISTINCT FROM OLD.token_value_rupees THEN
        RAISE EXCEPTION 'Record identity and fixed token values cannot change';
      END IF;
      IF length(btrim(coalesce(current_setting('app.change_reason', true), ''))) < 3 THEN
        RAISE EXCEPTION 'A reason is required for changes';
      END IF;
    END IF;
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO parent_record FROM public.master_records WHERE id = NEW.parent_id FOR SHARE;
    IF NOT FOUND OR parent_record.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Parent record is unavailable'; END IF;
    IF NEW.active AND NOT parent_record.active THEN RAISE EXCEPTION 'An active record requires an active parent'; END IF;
    IF NEW.kind = 'BANK_ACCOUNT' AND parent_record.kind <> 'BANK' THEN RAISE EXCEPTION 'Select a bank'; END IF;
    IF NEW.kind = 'AREA' THEN
      expected_level := CASE NEW.level WHEN 'DISTRICT' THEN 'STATE' WHEN 'BLOCK' THEN 'DISTRICT' WHEN 'VILLAGE' THEN 'BLOCK' END;
      IF parent_record.kind <> 'AREA' OR parent_record.level IS DISTINCT FROM expected_level THEN
        RAISE EXCEPTION 'Area hierarchy must be State, District, Block, Village';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.active AND NOT NEW.active AND EXISTS (
    SELECT 1 FROM public.master_records WHERE parent_id = NEW.id AND active AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Deactivate child records first'; END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.audit_master_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.activity_log(actor_id, action, resource, record_id, old_values, new_values, reason)
  VALUES (nullif(current_setting('app.person_id', true), '')::uuid, TG_OP, 'master_records', NEW.id::text,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW),
    coalesce(nullif(current_setting('app.change_reason', true), ''), 'Master record creation'));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_master_record(), public.audit_master_record() FROM PUBLIC;
DROP TRIGGER IF EXISTS masters_guard ON public.master_records;
CREATE TRIGGER masters_guard BEFORE INSERT OR UPDATE ON public.master_records FOR EACH ROW EXECUTE FUNCTION public.guard_master_record();
DROP TRIGGER IF EXISTS masters_audit ON public.master_records;
CREATE TRIGGER masters_audit AFTER INSERT OR UPDATE ON public.master_records FOR EACH ROW EXECUTE FUNCTION public.audit_master_record();
COMMIT;
