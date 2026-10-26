-- Run this entire setup file first as the Neon database owner, through COMMIT.
-- Then run manual-import-138-fundraisers.sql (one SELECT statement).
BEGIN;

DO $rename$
DECLARE old_kind "char"; new_kind "char";
BEGIN
  SELECT relkind INTO old_kind FROM pg_class WHERE oid = to_regclass('public.collectors');
  SELECT relkind INTO new_kind FROM pg_class WHERE oid = to_regclass('public.fundraisers');
  IF new_kind IS NULL AND old_kind IN ('r','p') THEN
    ALTER TABLE public.collectors RENAME TO fundraisers;
  ELSIF new_kind IN ('r','p') AND (old_kind IS NULL OR old_kind = 'v') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Expected one fundraiser table. Existing tables were preserved; apply the original People setup first or resolve duplicate tables.';
  END IF;
END;
$rename$;

LOCK TABLE public.fundraisers IN SHARE ROW EXCLUSIVE MODE;
CREATE SEQUENCE IF NOT EXISTS public.fundraiser_jah_number_seq
  AS bigint START WITH 1 MINVALUE 1 NO CYCLE;

-- A first installation starts at 001. Re-running never reuses issued JAH numbers.
DO $$
DECLARE
  existing_max bigint;
  sequence_value bigint;
  sequence_used boolean;
  next_number bigint;
BEGIN
  SELECT coalesce(max(substring(code FROM 4)::bigint), 0)
    INTO existing_max FROM public.fundraisers WHERE code ~ '^JAH[0-9]+$';
  SELECT last_value, is_called INTO sequence_value, sequence_used
    FROM public.fundraiser_jah_number_seq;
  next_number := greatest(existing_max + 1,
    sequence_value + CASE WHEN sequence_used THEN 1 ELSE 0 END);
  EXECUTE format('ALTER SEQUENCE public.fundraiser_jah_number_seq RESTART WITH %s', next_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.next_fundraiser_profile_code()
RETURNS text
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public
AS $$
DECLARE
  profile_number text;
BEGIN
  profile_number := nextval('public.fundraiser_jah_number_seq'::regclass)::text;
  RETURN 'JAH' || lpad(profile_number, greatest(3, length(profile_number)), '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_fundraiser_profile_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_fundraiser_profile_code() TO dms_runtime;
GRANT USAGE ON SEQUENCE public.fundraiser_jah_number_seq TO dms_runtime;

ALTER TABLE public.fundraisers ALTER COLUMN code
  SET DEFAULT public.next_fundraiser_profile_code();



SELECT pg_advisory_xact_lock(hashtext('dms:fundraisers:legacy-import'));
SELECT set_config('app.change_reason', 'Legacy Fundraisers_Data.xlsx profile import', true);
LOCK TABLE public.people, public.fundraisers IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.fundraisers ADD COLUMN IF NOT EXISTS legacy_import_key text;
ALTER TABLE public.fundraisers ADD COLUMN IF NOT EXISTS collection_area_id uuid
  REFERENCES public.master_records(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS collectors_legacy_import_key_idx
  ON public.fundraisers(legacy_import_key) WHERE legacy_import_key IS NOT NULL;

-- Replace only the five required address checks. Allow blanks exclusively on tagged legacy records.
DO $$
DECLARE existing_check record;
BEGIN
  FOR existing_check IN
    SELECT constraint_row.conname
    FROM pg_constraint constraint_row
    JOIN pg_attribute attribute_row ON attribute_row.attrelid = constraint_row.conrelid
      AND constraint_row.conkey = ARRAY[attribute_row.attnum]::smallint[]
    WHERE constraint_row.conrelid = 'public.fundraisers'::regclass AND constraint_row.contype = 'c'
      AND attribute_row.attname IN ('village','post_office','district','state','pin')
  LOOP
    EXECUTE format('ALTER TABLE public.fundraisers DROP CONSTRAINT %I', existing_check.conname);
  END LOOP;
END;
$$;
ALTER TABLE public.fundraisers DROP CONSTRAINT IF EXISTS collectors_imported_profile_details_check;
ALTER TABLE public.fundraisers ADD CONSTRAINT collectors_imported_profile_details_check CHECK (
  length(village) <= 120 AND length(post_office) <= 120 AND length(district) <= 120 AND length(state) <= 120
  AND (pin = '' OR pin ~ '^[0-9]{6}$')
  AND (
    legacy_import_key IS NOT NULL
    OR (
      length(btrim(village)) BETWEEN 2 AND 120 AND length(btrim(post_office)) BETWEEN 2 AND 120
      AND length(btrim(district)) BETWEEN 2 AND 120 AND length(btrim(state)) BETWEEN 2 AND 120
      AND pin ~ '^[0-9]{6}$'
    )
  )
);

CREATE OR REPLACE FUNCTION public.guard_legacy_collector_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user = 'dms_runtime' THEN
    IF TG_OP = 'INSERT' AND NEW.legacy_import_key IS NOT NULL THEN
      RAISE EXCEPTION 'Legacy profiles can only be imported by the database owner';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.legacy_import_key IS DISTINCT FROM OLD.legacy_import_key OR NEW.code <> OLD.code THEN
        RAISE EXCEPTION 'Profile code and legacy provenance cannot be changed';
      END IF;
      IF NEW.legacy_import_key IS NOT NULL
        AND (
          length(btrim(NEW.village)) < 2 OR length(btrim(NEW.post_office)) < 2
          OR length(btrim(NEW.district)) < 2 OR length(btrim(NEW.state)) < 2 OR NEW.pin = ''
        )
        AND ROW(NEW.village, NEW.post_office, NEW.district, NEW.state, NEW.pin)
          IS DISTINCT FROM ROW(OLD.village, OLD.post_office, OLD.district, OLD.state, OLD.pin) THEN
        RAISE EXCEPTION 'Complete the required profile details before saving address changes';
      END IF;
    END IF;
  END IF;
  IF NEW.collection_area_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      IF NOT EXISTS (SELECT 1 FROM public.master_records WHERE id = NEW.collection_area_id
        AND kind = 'AREA' AND level = 'COLLECTION' AND active AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Select an active collection area';
      END IF;
    ELSIF NEW.collection_area_id IS DISTINCT FROM OLD.collection_area_id THEN
      IF NOT EXISTS (SELECT 1 FROM public.master_records WHERE id = NEW.collection_area_id
        AND kind = 'AREA' AND level = 'COLLECTION' AND active AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Select an active collection area';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_legacy_collector_fields() FROM PUBLIC;
DROP TRIGGER IF EXISTS collectors_legacy_guard ON public.fundraisers;
CREATE TRIGGER collectors_legacy_guard BEFORE INSERT OR UPDATE ON public.fundraisers
  FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_collector_fields();

-- Preserve the existing login-user guards. Only unchanged missing historical profile facts are exempt.
CREATE OR REPLACE FUNCTION public.guard_admin_user_changes() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user <> 'dms_runtime' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.role = 'COLLECTOR' AND NEW.role <> 'COLLECTOR' THEN
    RAISE EXCEPTION 'Collectors cannot be converted to login users';
  END IF;
  IF NEW.role = 'COLLECTOR' THEN
    IF NEW.auth_user_id IS NOT NULL OR NEW.status = 'PENDING' THEN
      RAISE EXCEPTION 'Invalid collector profile';
    END IF;
    IF NEW.age IS NULL OR NEW.age NOT BETWEEN 18 AND 80 OR NEW.gender = 'UNSPECIFIED' OR NEW.phone IS NULL THEN
      IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Invalid collector profile'; END IF;
      IF OLD.role <> 'COLLECTOR'
        OR NOT EXISTS (SELECT 1 FROM public.fundraisers c WHERE c.person_id = OLD.id AND c.legacy_import_key IS NOT NULL)
        OR ROW(NEW.age, NEW.gender, NEW.phone) IS DISTINCT FROM ROW(OLD.age, OLD.gender, OLD.phone) THEN
        RAISE EXCEPTION 'Complete required collector profile details';
      END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND (OLD.role <> 'COLLECTOR' OR current_setting('app.role', true) <> 'ADMIN') THEN
      RAISE EXCEPTION 'Collector changes require administrator approval';
    END IF;
    RETURN NEW;
  END IF;
  IF current_setting('app.role', true) = 'ADMIN' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status <> 'PENDING' THEN RAISE EXCEPTION 'New login users require verification'; END IF;
      RETURN NEW;
    END IF;
    IF OLD.role = 'ADMIN' AND OLD.status = 'ACTIVE' AND (NEW.role <> 'ADMIN' OR NEW.status <> 'ACTIVE') THEN
      PERFORM pg_advisory_xact_lock(hashtext('dms:users:write'));
      IF OLD.id::text = current_setting('app.person_id', true) THEN
        RAISE EXCEPTION 'Administrators cannot disable their own access';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.people WHERE role = 'ADMIN' AND status = 'ACTIVE'
        AND deleted_at IS NULL AND id <> OLD.id) THEN RAISE EXCEPTION 'At least one active administrator is required'; END IF;
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email OR (OLD.status = 'PENDING' AND NEW.status = 'ACTIVE') THEN
      IF NOT EXISTS (SELECT 1 FROM public.user_verification_flows f WHERE f.person_id = OLD.id
        AND f.target_email = NEW.email AND f.state = 'VERIFIED' AND f.verified_at IS NOT NULL
        AND f.actor_id::text = current_setting('app.person_id', true) AND f.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'A verified email workflow is required';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;


REVOKE ALL ON FUNCTION public.guard_admin_user_changes() FROM PUBLIC;



ALTER TABLE public.fundraisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fundraisers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.fundraisers FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.fundraisers TO dms_runtime;

DROP POLICY IF EXISTS collectors_read ON public.fundraisers;
DROP POLICY IF EXISTS fundraisers_read ON public.fundraisers;
CREATE POLICY fundraisers_read ON public.fundraisers FOR SELECT TO dms_runtime
  USING (deleted_at IS NULL AND current_setting('app.role', true) IN ('ADMIN','STAFF'));

DROP POLICY IF EXISTS collectors_create ON public.fundraisers;
DROP POLICY IF EXISTS fundraisers_create ON public.fundraisers;
CREATE POLICY fundraisers_create ON public.fundraisers FOR INSERT TO dms_runtime WITH CHECK (
  current_setting('app.role', true) IN ('ADMIN','STAFF')
  AND created_by::text = current_setting('app.person_id', true)
  AND EXISTS (SELECT 1 FROM public.people p WHERE p.id = person_id AND p.role = 'COLLECTOR'
    AND p.auth_user_id IS NULL AND p.deleted_at IS NULL));
DROP POLICY IF EXISTS collectors_update ON public.fundraisers;
DROP POLICY IF EXISTS fundraisers_update ON public.fundraisers;
CREATE POLICY fundraisers_update ON public.fundraisers FOR UPDATE TO dms_runtime
  USING (current_setting('app.role', true) = 'ADMIN') WITH CHECK (current_setting('app.role', true) = 'ADMIN');

DROP POLICY IF EXISTS people_collectors_read ON public.people;
CREATE POLICY people_collectors_read ON public.people FOR SELECT TO dms_runtime
  USING (deleted_at IS NULL AND role = 'COLLECTOR' AND current_setting('app.role', true) = 'STAFF');

DO $owner$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS owner_maintenance ON public.fundraisers';
  EXECUTE format('CREATE POLICY owner_maintenance ON public.fundraisers TO %I USING (true) WITH CHECK (true)', current_user);
END;
$owner$;

-- This updatable compatibility view shares the same rows and enforces the caller's underlying RLS.
-- Existing book/submission/deletion SQL that references "collectors" continues to work.
CREATE OR REPLACE VIEW public.collectors WITH (security_invoker = true) AS SELECT * FROM public.fundraisers;
REVOKE ALL ON public.collectors FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.collectors TO dms_runtime;

CREATE OR REPLACE FUNCTION public.import_legacy_fundraiser_batch(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $import$
DECLARE
  source_row record;
  expected_count integer;
  distinct_count integer;
  smallest_id integer;
  largest_id integer;
  created_count integer := 0;
  existing_count integer := 0;
  linked_count integer;
  orphan_count integer;
  person_id_value uuid;
  actor_id_value uuid;
  area_id_value uuid;
  source_key text;
  source_note text;
BEGIN
  IF current_user = 'dms_runtime' THEN RAISE EXCEPTION 'Run this import as the database owner'; END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Expected a JSON array of fundraiser profiles'; END IF;
  SELECT count(*), count(DISTINCT source_id), min(source_id), max(source_id)
    INTO expected_count, distinct_count, smallest_id, largest_id
    FROM jsonb_to_recordset(payload) AS s(source_id integer);
  IF expected_count <> 138 OR distinct_count <> 138 OR smallest_id <> 1 OR largest_id <> 138 THEN
    RAISE EXCEPTION 'Expected all 138 spreadsheet profiles, source IDs 1 to 138; received % profiles', expected_count;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dms:fundraisers:legacy-import'));
  SELECT id INTO actor_id_value FROM public.people WHERE role = 'ADMIN' AND status = 'ACTIVE' AND deleted_at IS NULL
    ORDER BY created_at, id LIMIT 1;
  IF actor_id_value IS NULL THEN RAISE EXCEPTION 'An active Super Admin is required'; END IF;
  PERFORM set_config('app.person_id', actor_id_value::text, true);
  PERFORM set_config('app.change_reason', 'Import 138 historical Fundraisers_Data.xlsx profiles', true);

  FOR source_row IN
    SELECT * FROM jsonb_to_recordset(payload) AS s(source_id integer, full_name text, address text,
      district text, state text, collection_area text, mobile text, whatsapp text)
    ORDER BY source_id
  LOOP
    source_key := 'Fundraisers_Data_v1:' || source_row.source_id::text;
    IF EXISTS (SELECT 1 FROM public.fundraisers WHERE legacy_import_key = source_key) THEN
      existing_count := existing_count + 1;
      CONTINUE;
    END IF;
    IF source_row.full_name IS NULL OR length(btrim(source_row.full_name)) < 2 THEN
      RAISE EXCEPTION 'Full name missing for spreadsheet source ID %', source_row.source_id;
    END IF;

    area_id_value := NULL;
    IF coalesce(source_row.collection_area, '') <> '' THEN
      IF NOT EXISTS (SELECT 1 FROM public.master_records WHERE kind = 'AREA' AND level = 'COLLECTION'
        AND name_en = source_row.collection_area) THEN
        INSERT INTO public.master_records(kind, code, name_en, name_ur, level, active, created_by, updated_by)
        VALUES ('AREA', 'AREA_' || upper(md5(source_row.collection_area)), source_row.collection_area,
          source_row.collection_area, 'COLLECTION', true, actor_id_value, actor_id_value);
      END IF;
      SELECT id INTO area_id_value FROM public.master_records WHERE kind = 'AREA' AND level = 'COLLECTION'
        AND name_en = source_row.collection_area AND active AND deleted_at IS NULL ORDER BY created_at, id LIMIT 1;
      IF area_id_value IS NULL THEN RAISE EXCEPTION 'Collection area is inactive for spreadsheet source ID %', source_row.source_id; END IF;
    END IF;

    -- Repair only orphan rows carrying this exact prior import provenance; never merge by name.
    source_note := 'Legacy import: Fundraisers_Data.xlsx / source fundraiser ID ' || source_row.source_id::text;
    SELECT count(*) INTO orphan_count FROM public.people p WHERE p.role = 'COLLECTOR' AND p.remarks = source_note
      AND p.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM public.fundraisers f WHERE f.person_id = p.id);
    IF orphan_count > 1 THEN RAISE EXCEPTION 'Multiple orphan import rows for source ID %; existing data preserved', source_row.source_id; END IF;
    person_id_value := NULL;
    IF orphan_count = 1 THEN
      SELECT p.id INTO person_id_value FROM public.people p WHERE p.role = 'COLLECTOR' AND p.remarks = source_note
        AND p.full_name = source_row.full_name AND p.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.fundraisers f WHERE f.person_id = p.id);
      IF person_id_value IS NULL THEN RAISE EXCEPTION 'Existing orphan profile differs for source ID %', source_row.source_id; END IF;
    END IF;
    IF coalesce(source_row.mobile, '') <> '' AND EXISTS (
      SELECT 1 FROM public.people WHERE phone = source_row.mobile AND id IS DISTINCT FROM person_id_value
    ) THEN RAISE EXCEPTION 'Mobile number is already used by another profile; spreadsheet source ID %', source_row.source_id; END IF;

    IF person_id_value IS NULL THEN
      INSERT INTO public.people(full_name, phone, email, role, status, language, age, gender, address, remarks, created_by, updated_by)
      VALUES (source_row.full_name, nullif(source_row.mobile, ''), NULL, 'COLLECTOR', 'ACTIVE', 'en', NULL, 'UNSPECIFIED',
        concat_ws(', ', nullif(source_row.address, ''), nullif(source_row.district, ''), nullif(source_row.state, '')),
        source_note, actor_id_value, actor_id_value) RETURNING id INTO person_id_value;
    END IF;
    INSERT INTO public.fundraisers(person_id, code, legacy_import_key, collection_area_id, father_name, whatsapp,
      id_proof_name, commission_basis_points, leftover_eligible, village, post_office, block, district, state, pin, created_by, updated_by)
    VALUES (person_id_value, public.next_fundraiser_profile_code(), source_key, area_id_value, '', coalesce(source_row.whatsapp, ''),
      '', NULL, false, coalesce(source_row.address, ''), '', '', coalesce(source_row.district, ''), coalesce(source_row.state, ''), '',
      actor_id_value, actor_id_value);
    created_count := created_count + 1;
  END LOOP;

  SELECT count(*) INTO linked_count FROM public.fundraisers f JOIN public.people p ON p.id = f.person_id
  WHERE p.role = 'COLLECTOR' AND p.deleted_at IS NULL AND f.deleted_at IS NULL
    AND f.legacy_import_key IN (
      SELECT 'Fundraisers_Data_v1:' || s.source_id::text FROM jsonb_to_recordset(payload) AS s(source_id integer)
    );
  IF linked_count <> 138 THEN
    RAISE EXCEPTION 'Import incomplete: expected 138 visible linked profiles, found %. No changes from this import were committed.', linked_count;
  END IF;
  RETURN jsonb_build_object('status', 'complete', 'database', current_database(), 'table', 'public.fundraisers',
    'expected_profiles', 138, 'created_profiles', created_count, 'already_imported', existing_count, 'imported_profiles', linked_count);
END;
$import$;
REVOKE ALL ON FUNCTION public.import_legacy_fundraiser_batch(jsonb) FROM PUBLIC, dms_runtime;

COMMIT;
