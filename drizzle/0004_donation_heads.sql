-- Run this whole file manually after 0003_masters.sql, then refresh Donation heads.
-- Existing records and audit history are retained. Superseded heads become inactive.
BEGIN;
SELECT set_config('app.change_reason', 'Final donation categories and heads approved by project owner', true);
ALTER TABLE public.master_records ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 1000;
ALTER TABLE public.master_records DROP CONSTRAINT IF EXISTS master_records_kind_check;
ALTER TABLE public.master_records ADD CONSTRAINT master_records_kind_check CHECK (
  kind IN ('EDITION','BOOK_TYPE','TOKEN_VALUE','DONATION_CATEGORY','DONATION_HEAD','RESPONSIBILITY','AREA',
    'PAYMENT_MODE','UPI_APP','BANK','BANK_ACCOUNT','RECEIPT_REASON','FLAG_REASON'));

CREATE OR REPLACE FUNCTION public.guard_master_record() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE parent_record public.master_records; expected_level text;
BEGIN
  IF current_user = 'dms_runtime' THEN
    IF current_setting('app.role', true) <> 'ADMIN' THEN RAISE EXCEPTION 'Only administrators manage masters'; END IF;
    IF TG_OP = 'INSERT' AND NEW.kind IN ('BOOK_TYPE','TOKEN_VALUE','PAYMENT_MODE','DONATION_CATEGORY') THEN
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
  IF NEW.kind = 'DONATION_HEAD' AND NEW.active AND NEW.parent_id IS NULL THEN
    RAISE EXCEPTION 'An active donation head requires a donation category';
  END IF;
  IF NEW.kind = 'DONATION_CATEGORY' AND NEW.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Donation categories are root records';
  END IF;
  IF NEW.kind = 'DONATION_HEAD' AND NEW.code IN ('OTHER_OBLIGATORY','OTHER_VOLUNTARY','OTHER_SPECIFIED') THEN
    NEW.needs_detail := true;
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO parent_record FROM public.master_records WHERE id = NEW.parent_id FOR SHARE;
    IF NOT FOUND OR parent_record.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Parent record is unavailable'; END IF;
    IF NEW.active AND NOT parent_record.active THEN RAISE EXCEPTION 'An active record requires an active parent'; END IF;
    IF NEW.kind = 'BANK_ACCOUNT' AND parent_record.kind <> 'BANK' THEN RAISE EXCEPTION 'Select a bank'; END IF;
    IF NEW.kind = 'DONATION_HEAD' AND parent_record.kind <> 'DONATION_CATEGORY' THEN
      RAISE EXCEPTION 'Select a donation category';
    END IF;
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
REVOKE ALL ON FUNCTION public.guard_master_record() FROM PUBLIC;

INSERT INTO public.master_records(kind, code, name_en, name_ur, notes, built_in, active, sort_order) VALUES
  ('DONATION_CATEGORY','SADAQAT_WAJIBA','Sadaqat-e-Wajiba (Obligatory Charitable Donations)',
    'صدقات واجبہ (لازمی خیراتی عطیات)','Obligatory Charitable Donations',true,true,1),
  ('DONATION_CATEGORY','SADAQAT_NAFILAH','Sadaqat-e-Nafilah (Voluntary Charitable Donations)',
    'صدقات نافلہ (نفلی خیراتی عطیات)','Voluntary Charitable Donations',true,true,2),
  ('DONATION_CATEGORY','MADAT_MAKHSUSAH','Madat-e-Makhsusah (Specified/Designated Donations)',
    'مدات مخصوصہ (مخصوص عطیات)','Specified/Designated Donations',true,true,3)
ON CONFLICT (kind, code) DO UPDATE SET name_en = EXCLUDED.name_en, name_ur = EXCLUDED.name_ur,
  notes = EXCLUDED.notes, active = true, sort_order = EXCLUDED.sort_order;

-- Reuse existing Zakat, Fitra, Ushr and Hadia IDs, preserving references and audit history.
WITH final_heads(category_code, code, name_en, name_ur, needs_detail, sort_order) AS (VALUES
  ('SADAQAT_WAJIBA','ZAKAT','Zakat','زکوٰۃ',false,1),
  ('SADAQAT_WAJIBA','FITRA','Fitrah (Zakat al-Fitr)','فطرہ (زکوٰۃ الفطر)',false,2),
  ('SADAQAT_WAJIBA','USHR','Ushr','عشر',false,3),
  ('SADAQAT_WAJIBA','KAFFARAH','Kaffarah','کفارہ',false,4),
  ('SADAQAT_WAJIBA','FIDYA','Fidya','فدیہ',false,5),
  ('SADAQAT_WAJIBA','OTHER_OBLIGATORY','Other Obligatory Donations','دیگر واجب صدقات',true,6),
  ('SADAQAT_NAFILAH','HADIA','Hadiyyah (Gift Donation)','ہدیہ (تحفہ)',false,1),
  ('SADAQAT_NAFILAH','KHAIRAT','Khairat (General Charity)','خیرات (عام صدقہ)',false,2),
  ('SADAQAT_NAFILAH','OTHER_VOLUNTARY','Other Voluntary Donations','دیگر نفلی صدقات',true,3),
  ('MADAT_MAKHSUSAH','BOOKS','Books','کتابیں',false,1),
  ('MADAT_MAKHSUSAH','GROCERIES','Groceries','راشن',false,2),
  ('MADAT_MAKHSUSAH','OTHER_SPECIFIED','Other Specified Donations','دیگر مخصوص عطیات',true,3)
)
INSERT INTO public.master_records(kind, code, name_en, name_ur, needs_detail, sort_order, parent_id, built_in, active)
SELECT 'DONATION_HEAD', h.code, h.name_en, h.name_ur, h.needs_detail, h.sort_order, c.id, true, true
FROM final_heads h JOIN public.master_records c ON c.kind = 'DONATION_CATEGORY' AND c.code = h.category_code
ON CONFLICT (kind, code) DO UPDATE SET name_en = EXCLUDED.name_en, name_ur = EXCLUDED.name_ur,
  parent_id = EXCLUDED.parent_id, needs_detail = EXCLUDED.needs_detail, sort_order = EXCLUDED.sort_order, active = true;

UPDATE public.master_records SET active = false
WHERE kind = 'DONATION_HEAD' AND active AND code NOT IN (
  'ZAKAT','FITRA','USHR','KAFFARAH','FIDYA','OTHER_OBLIGATORY','HADIA','KHAIRAT','OTHER_VOLUNTARY','BOOKS','GROCERIES','OTHER_SPECIFIED');

ALTER TABLE public.master_records DROP CONSTRAINT IF EXISTS master_donation_head_parent_check;
ALTER TABLE public.master_records ADD CONSTRAINT master_donation_head_parent_check
  CHECK (kind <> 'DONATION_HEAD' OR NOT active OR parent_id IS NOT NULL);
ALTER TABLE public.master_records DROP CONSTRAINT IF EXISTS master_donation_category_root_check;
ALTER TABLE public.master_records ADD CONSTRAINT master_donation_category_root_check
  CHECK (kind <> 'DONATION_CATEGORY' OR parent_id IS NULL);
COMMIT;
