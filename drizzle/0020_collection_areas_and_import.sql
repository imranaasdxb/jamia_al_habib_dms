-- Run this entire file as the Neon database owner, through COMMIT.
-- Existing geographic records, IDs, assignments and audit history are preserved.
-- Collection names are independent of the geographic hierarchy.
BEGIN;
SELECT set_config('app.change_reason', 'Enable independent collection areas and import supplied names', true);

LOCK TABLE public.master_records IN ACCESS EXCLUSIVE MODE;

-- Replace only the geographic level and AREA hierarchy checks, regardless of their generated names.
DO $$
DECLARE
  level_column smallint;
  existing_check record;
BEGIN
  SELECT attnum INTO level_column FROM pg_attribute
    WHERE attrelid = 'public.master_records'::regclass AND attname = 'level' AND NOT attisdropped;
  FOR existing_check IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.master_records'::regclass AND contype = 'c'
      AND (
        conkey = ARRAY[level_column]::smallint[]
        OR (
          position('AREA' IN pg_get_constraintdef(oid)) > 0
          AND position('parent_id' IN pg_get_constraintdef(oid)) > 0
          AND position('level' IN pg_get_constraintdef(oid)) > 0
        )
      )
  LOOP
    EXECUTE format('ALTER TABLE public.master_records DROP CONSTRAINT %I', existing_check.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.master_records ADD CONSTRAINT master_records_area_level_check
  CHECK (level IN ('COLLECTION','STATE','DISTRICT','BLOCK','VILLAGE'));
ALTER TABLE public.master_records ADD CONSTRAINT master_records_area_hierarchy_check
  CHECK (kind <> 'AREA' OR (
    level IS NOT NULL AND (
      level = 'COLLECTION'
      OR (level = 'STATE' AND parent_id IS NULL)
      OR (level IN ('DISTRICT','BLOCK','VILLAGE') AND parent_id IS NOT NULL)
    )
  ));

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
      IF NEW.level = 'COLLECTION' THEN
        IF parent_record.kind <> 'AREA' OR coalesce(parent_record.level, '') NOT IN ('STATE','DISTRICT','BLOCK','VILLAGE') THEN
          RAISE EXCEPTION 'Collection areas can link only to a geographic State, District, Block or Village';
        END IF;
      ELSE
        expected_level := CASE NEW.level WHEN 'DISTRICT' THEN 'STATE' WHEN 'BLOCK' THEN 'DISTRICT' WHEN 'VILLAGE' THEN 'BLOCK' END;
        IF parent_record.kind <> 'AREA' OR parent_record.level IS DISTINCT FROM expected_level THEN
          RAISE EXCEPTION 'Area hierarchy must be State, District, Block, Village';
        END IF;
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

-- English is also used as the Urdu fallback until an Urdu name is entered.
-- Case/spelling variants are preserved exactly, including JaH and JAH.
WITH source(name) AS (
  VALUES
    ('Adhang'),
    ('Anjira'),
    ('Balasore'),
    ('Balikuda'),
    ('Bani Kund'),
    ('Banikund'),
    ('Barabatia'),
    ('Basudevpur'),
    ('Bengal'),
    ('Bhadrak'),
    ('Bihar'),
    ('Chattisgarh'),
    ('Cuttack'),
    ('Denga'),
    ('Gadma'),
    ('Gobindpur'),
    ('Hyderabad'),
    ('Jagatsinghpur'),
    ('JaH'),
    ('JAH'),
    ('JaH Campus'),
    ('Jajpur'),
    ('Jaleswar'),
    ('Jamia'),
    ('Jharkhand'),
    ('Jharlhand'),
    ('Jolashahi'),
    ('Jonkot'),
    ('Kabir Patna'),
    ('Kabirpatna'),
    ('Kalahandi'),
    ('Kalinag'),
    ('Kanhupur'),
    ('Khajuria'),
    ('Khapra Bank'),
    ('Khorda'),
    ('Kodokanthi'),
    ('Korang'),
    ('Koraput'),
    ('Kornia'),
    ('Kujang'),
    ('Malisahara'),
    ('Malisara'),
    ('Mojrai'),
    ('Mujrai'),
    ('Nalibar'),
    ('Nawada'),
    ('Pahrajpur'),
    ('Panchpalli'),
    ('Paradeep'),
    ('Paradip'),
    ('Pokharhuda'),
    ('Puri'),
    ('Qadriyan'),
    ('Rasulpur'),
    ('Sablang'),
    ('Sambhalpur'),
    ('Singhpur'),
    ('Thoriapada'),
    ('Thoriapara'),
    ('Tiran'),
    ('Ujalpur')
)
INSERT INTO public.master_records(kind, code, name_en, name_ur, level, active)
SELECT 'AREA', 'AREA_' || upper(md5(source.name)), source.name, source.name, 'COLLECTION', true
FROM source
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_records existing
  WHERE existing.kind = 'AREA' AND existing.level = 'COLLECTION' AND existing.name_en = source.name
)
ON CONFLICT (kind, code) DO NOTHING;

COMMIT;
