-- Import only Fundraisers_Data.xlsx / Fundraisers!A2:H139 (138 profile records).
-- Run this entire file as the database owner, through COMMIT.
-- Apply 0019_fundraiser_jah_profile_codes.sql and 0020_collection_areas_and_import.sql first.
-- Missing historical facts stay blank/NULL/UNSPECIFIED. New app submissions remain strict.
-- Re-running skips already imported source IDs; existing profiles are never overwritten.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('dms:fundraisers:legacy-import'));
SELECT set_config('app.change_reason', 'Legacy Fundraisers_Data.xlsx profile import', true);
LOCK TABLE public.people, public.collectors IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.collectors ADD COLUMN IF NOT EXISTS legacy_import_key text;
ALTER TABLE public.collectors ADD COLUMN IF NOT EXISTS collection_area_id uuid
  REFERENCES public.master_records(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS collectors_legacy_import_key_idx
  ON public.collectors(legacy_import_key) WHERE legacy_import_key IS NOT NULL;

-- Replace only the five required address checks. Allow blanks exclusively on tagged legacy records.
DO $$
DECLARE existing_check record;
BEGIN
  FOR existing_check IN
    SELECT constraint_row.conname
    FROM pg_constraint constraint_row
    JOIN pg_attribute attribute_row ON attribute_row.attrelid = constraint_row.conrelid
      AND constraint_row.conkey = ARRAY[attribute_row.attnum]::smallint[]
    WHERE constraint_row.conrelid = 'public.collectors'::regclass AND constraint_row.contype = 'c'
      AND attribute_row.attname IN ('village','post_office','district','state','pin')
  LOOP
    EXECUTE format('ALTER TABLE public.collectors DROP CONSTRAINT %I', existing_check.conname);
  END LOOP;
END;
$$;
ALTER TABLE public.collectors DROP CONSTRAINT IF EXISTS collectors_imported_profile_details_check;
ALTER TABLE public.collectors ADD CONSTRAINT collectors_imported_profile_details_check CHECK (
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
DROP TRIGGER IF EXISTS collectors_legacy_guard ON public.collectors;
CREATE TRIGGER collectors_legacy_guard BEFORE INSERT OR UPDATE ON public.collectors
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
        OR NOT EXISTS (SELECT 1 FROM public.collectors c WHERE c.person_id = OLD.id AND c.legacy_import_key IS NOT NULL)
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

CREATE TEMP TABLE legacy_fundraiser_import (
  source_id integer PRIMARY KEY,
  full_name text NOT NULL, address text NOT NULL, district text NOT NULL, state text NOT NULL,
  collection_area text NOT NULL, mobile text NOT NULL, whatsapp text NOT NULL
) ON COMMIT DROP;
INSERT INTO legacy_fundraiser_import VALUES
  ('1', 'Abdul Hafiz', 'Kalabedi', 'Jagatsinghpur', 'Odisha', '', '', ''),
  ('2', 'Abdul Rahim', 'Sablang', 'Kendrapara', 'Odisha', 'Sablang', '', ''),
  ('3', 'Abu Salik', 'Anjira', 'Jagatsinghpur', 'Odisha', 'Anjira', '', ''),
  ('4', 'Abu Sufyan', 'Anjira', 'Jagatsinghpur', 'Odisha', 'Anjira', '', ''),
  ('5', 'Ahmad Raza', 'Daryapur', 'Cuttack', 'Odisha', 'Sablang', '', ''),
  ('6', 'Akmal Husain', 'Koraput', 'Koraput', 'Odisha', 'Koraput', '', ''),
  ('7', 'Alauddin', 'Denga', 'Jagatsinghpur', 'Odisha', 'Denga', '', ''),
  ('8', 'Alhaj Ghulam Rabbani', 'Rasulpur', 'Jagatsinghpur', 'Odisha', 'Rasulpur', '', ''),
  ('9', 'Amanatullah', 'Jajpur', 'Jajpur', 'Odisha', '', '', ''),
  ('10', 'Arif Hussain', 'Kornia', 'Jagatsinghpur', 'Odisha', 'Jagatsinghpur', '', ''),
  ('11', 'Arshad', '', '', '', '', '', ''),
  ('12', 'Arshad Mullah', 'Cuttack', 'Cuttack', 'Odisha', 'Cuttack', '', ''),
  ('13', 'Ashiq Misbahi', 'Kalinag', 'Jagatsinghpur', 'Odisha', 'Cuttack', '', ''),
  ('14', 'Ashique Khan Misbahi', 'JaH', 'Jagatsinghpur', 'Odisha', 'JaH', '', ''),
  ('15', 'Ashique Misbahi', 'Jamia', 'Jagatsinghpur', 'Odisha', 'Jamia', '', ''),
  ('16', 'Asique Misbahi', 'Jamia', 'Jagatsinghpur', 'Odisha', 'Jamia', '', ''),
  ('17', 'Asrar Ahmad', 'Cuttack', 'Cuttack', 'Odisha', 'Cuttack', '', ''),
  ('18', 'Badal Kumar', 'Jamia', 'Jagatsinghpur', 'Odisha', 'Jamia', '', ''),
  ('19', 'Bani Kund Imam', 'Banikund', 'Jagatsinghpur', 'Odisha', 'Bani Kund', '', ''),
  ('20', 'Bashirul Hasan', 'Bengal', '', 'Bengal', 'Bengal', '', ''),
  ('21', 'Danish Raza', 'Sompur', 'Cuttack', 'Odisha', '', '', ''),
  ('22', 'Dilbar', 'Balikuda', 'Jagatsinghpur', 'Odisha', 'Balikuda', '', ''),
  ('23', 'Dilbar Raza', 'Balikuda', 'Jagatsinghpur', 'Odisha', 'Balikuda', '', ''),
  ('24', 'Ershad Naimi', 'Jagatsinghpur', 'Jagatsinghpur', 'Odisha', 'Jagatsinghpur', '', ''),
  ('25', 'Faisal', 'Bihar', '', 'Bihar', 'Bihar', '', ''),
  ('26', 'Faizan', 'Balasore', 'Balasore', 'Odisha', 'Balasore', '', ''),
  ('27', 'Faizan Raza', 'Balasore', 'Balasore', 'Odisha', 'Balasore', '', ''),
  ('28', 'Firoz', 'Khorda', 'Khorda', 'Odisha', 'Khorda', '', ''),
  ('29', 'Ghulam Khaja', 'Gadma', 'Jagatsinghpur', 'Odisha', 'Gadma', '', ''),
  ('30', 'Gulzar Ahmad', 'Kornia', 'Jagatsinghpur', 'Odisha', 'Kornia', '', ''),
  ('31', 'Hafiz Abul Imdad', 'Nalibar', 'Jagatsinghpur', 'Odisha', 'Nalibar', '', ''),
  ('32', 'Hafiz Azhar', 'Sompur', 'Cuttack', 'Odisha', '', '', ''),
  ('33', 'Hafiz Imdad', 'Nalibar', 'Jagatsinghpur', 'Odisha', 'Nalibar', '', ''),
  ('34', 'Hafiz Imdad Alam', 'Nalibar', 'Jagatsinghpur', 'Odisha', 'Nalibar', '', ''),
  ('35', 'Hafiz Moez Uddin', 'Korang', 'Cuttack', 'Odisha', 'Korang', '7008356566', '7008356566'),
  ('36', 'Hafiz Qasim', 'Denga', 'Jagatsinghpur', 'Odisha', 'Denga', '', ''),
  ('37', 'Hafiz Salim', 'Nawada', 'Jagatsinghpur', 'Odisha', 'Nawada', '', ''),
  ('38', 'Haji Gholam Rabbani', 'Rasulpur', 'Jagatsinghpur', 'Odisha', 'Rasulpur', '', ''),
  ('39', 'Haji Ghoma Rabbani', 'Rasulpur', 'Jagatsinghpur', 'Odisha', 'Rasulpur', '', ''),
  ('40', 'Haji Shaikh Gholam Rabbani', 'Rasulpur', 'Jagatsinghpur', 'Odisha', 'Rasulpur', '', ''),
  ('41', 'Hasnain', 'Korang', '', 'Odisha', 'Korang', '', ''),
  ('42', 'Hasnain Raza', 'Korang', '', 'Odisha', 'Korang', '', ''),
  ('43', 'Iftekhar', 'Kujang', 'Jagatsinghpur', 'Odisha', 'Kujang', '', ''),
  ('44', 'Imdad Alam', 'Nalibar', 'Jagatsinghpur', 'Odisha', 'Nalibar', '', ''),
  ('45', 'Imran', 'Malisara', 'Kendrapara', 'Odisha', 'Malisara', '', ''),
  ('46', 'Imran Raza', 'Malisahara', 'Kendrapara', 'Odisha', 'Malisahara', '', ''),
  ('47', 'Imtiyaz', 'Jonkot', 'Jagatsinhgpur', 'Odisha', 'Jonkot', '', ''),
  ('48', 'Irfan', 'Jagatsinghpur', 'Jagatsinghpur', 'Odisha', 'Jagatsinghpur', '', ''),
  ('49', 'Irfan Raza', 'Jagatsinghpur', 'Jagatsinghpur', 'Odisha', 'Jagatsinghpur', '', ''),
  ('50', 'Khwaja', 'Gadma', 'Cuttack', '', 'Gadma', '', ''),
  ('51', 'M Ashiq Khan', 'JaH', 'Jagatsinghpur', 'Odisha', 'JaH', '', ''),
  ('52', 'M Ashiq Khan Misbahi', 'Jamia', 'Jagatsinghpur', 'Odisha', 'Jamia', '', ''),
  ('53', 'M Ashiqu Misbahi', 'Kalinag', 'Jagatsinghpur', 'Odisha', 'Cuttack', '', ''),
  ('54', 'M Saiyed Manzar Husain', 'Adhang', 'Jagatsinghpur', 'Odisha', 'Adhang', '', ''),
  ('55', 'Mahboob Alam', 'Sompur', 'Cuttack', 'Odisha', '', '', ''),
  ('56', 'Maulana Abdullah', 'Jajpur', 'Jajpur', 'Odisha', 'Jajpur', '', ''),
  ('57', 'Maulana Abu Tahir', 'Kalahandi', 'Kalahandi', 'Odisha', 'Kalahandi', '', ''),
  ('58', 'Maulana Ahmad Raza', 'Thoriapara', 'Jagatsinghpur', 'Odisha', 'Thoriapara', '', ''),
  ('59', 'Maulana Ashiq Khan', 'Kalinag', 'Jagatsinghpur', 'Odisha', 'Kalinag', '', ''),
  ('60', 'Maulana Ashiqu Misbahi', 'Kalinag', 'Jagatsinghpur', 'Odisha', 'Kalinag', '', ''),
  ('61', 'Maulana Ashique', 'Kalinag', 'Jagatsinghpur', 'Odisha', 'JaH', '', ''),
  ('62', 'Maulana Ashique Khan', 'Kalinag', 'Jagatsinghpur', 'Odisha', 'Anjira', '7735174893', '9853932322'),
  ('63', 'Maulana Ashique Misbahi', 'Kalinag', 'Jagatsinghpur', 'Odisha', 'Cuttack', '', ''),
  ('64', 'Maulana Azizul Karim', 'Kabirpatna', 'Jagatsinghpur', 'Odisha', 'Kabirpatna', '', ''),
  ('65', 'Maulana Dilbar', 'Balikuda', 'Jagatsinghpur', 'Odisha', 'Balikuda', '', ''),
  ('66', 'Maulana Gholam Ahmad Raza', 'Thoriapara', 'Cuttack', 'Odisha', 'Cuttack', '', ''),
  ('67', 'Maulana Ilyas', 'Jharkhand', '', 'Jharkhand', 'Jharkhand', '', ''),
  ('68', 'Maulana Ilyas Misbahi', 'Jharlhand', '', 'Jharlhand', 'Jharlhand', '', ''),
  ('69', 'Maulana Qasim Ali', 'Panchpalli', 'Jagatsinghpur', 'Odisha', 'Panchpalli', '', ''),
  ('70', 'Maulana Raunaq', 'Ujalpur', 'Jagatsinghpur', 'Odisha', 'Ujalpur', '', ''),
  ('71', 'Maulana Raunaque', 'Ujalpur', 'Jagatsinghpur', 'Odisha', 'Ujalpur', '', ''),
  ('72', 'Maulana Rawnaque', 'Ujalpur', 'Jagatsinghpur', 'Odisha', 'Ujalpur', '', ''),
  ('73', 'Maulana Saiyed Mujahid', 'Jajpur', 'Jajpur', 'Odisha', 'Jajpur', '', ''),
  ('74', 'Meraj', 'Kanupur', 'Jagatsinghpur', 'Odisha', '', '', ''),
  ('75', 'Meraj Ahmad', 'Kanhupur', 'Jagatsinghpur', 'Odisha', 'Kanhupur', '', ''),
  ('76', 'Modassir', 'Barabatia', 'Jagatsinghpur', 'Odisha', 'Barabatia', '', ''),
  ('77', 'Modassir Husain', 'Tiran', 'Jagatsinghpur', 'Odisha', 'Tiran', '', ''),
  ('78', 'Mohammad Arshad Mulla', 'Cuttack', 'Cuttack', 'Odisha', 'Cuttack', '', ''),
  ('79', 'Mohammad Imteyaz', 'Goda', 'Jagatsinghpur', 'Odisha', '', '', ''),
  ('80', 'Mohammad Raza', 'Jaleswar', 'Balasore', 'Odisha', 'Jaleswar', '', ''),
  ('81', 'Mohammad Yasin', '', '', '', '', '', ''),
  ('82', 'Moiz Aalam', 'Korang', 'Cuttack', 'Odisha', '', '', ''),
  ('83', 'Moiz Alam', 'Korang', 'Cuttack', 'Odisha', '', '', ''),
  ('84', 'Mufti Tanveer Markazi', '', '', '', '', '', ''),
  ('85', 'Mujahid', 'Denga', 'Jagatsinghpur', 'Odisha', 'Denga', '', ''),
  ('86', 'Mujahid Husain', 'Denga', 'Jagatsinghpur', 'Odisha', 'Denga', '', ''),
  ('87', 'Mujahid Raza', 'Denga', 'Jagatsinghpur', 'Odisha', 'Denga', '', ''),
  ('88', 'Mujeem', 'Bihar', '', 'Bihar', '', '', ''),
  ('89', 'Muslim Raza', 'Chattisgarh', '', 'Chattisgarh', 'Chattisgarh', '', ''),
  ('90', 'Naimuddin', 'Bhagatpur Tangi', 'Cuttack', 'Odisha', '', '', ''),
  ('91', 'Nizami', 'Denga', 'Jagatsinghpur', 'Odisha', 'Denga', '', ''),
  ('92', 'Nurul Qamar', 'Pokharhuda', 'Cuttack', 'Odisha', 'Pokharhuda', '', ''),
  ('93', 'Qamrul Islam', 'Qadriyan', 'Balasore', 'Odisha', 'Qadriyan', '9348831298', ''),
  ('94', 'Qasim', 'Panchpalli', 'Jagatsinghpur', 'Odisha', 'Panchpalli', '', ''),
  ('95', 'Quari Bilal Ahmad', 'Jajpur', 'Jajpur', 'Odisha', 'Jajpur', '', ''),
  ('96', 'Quari Faizan Raza', 'Jamia', 'Jagatsinghpur', 'Odisha', 'Jamia', '', ''),
  ('97', 'Quari Gholam Ghaus', 'Cuttack', 'Cuttack', 'Odisha', 'Cuttack', '', ''),
  ('98', 'Quari Ghulam Ghaus', 'Shahpur', 'Jagatsingh[ur', 'Odisha', 'Cuttack', '', ''),
  ('99', 'Ramzani', 'Cuttack', 'Cuttack', 'Odisha', 'Cuttack', '', ''),
  ('100', 'Rehan', 'Koraput', 'Koraput', 'Odisha', 'Koraput', '', ''),
  ('101', 'Rehan Raza', 'Koraput', 'Jagatsinghpur', 'Odisha', 'Koraput', '', ''),
  ('102', 'Riyazat Husain', 'Rasulpur', 'Jagatsinghpur', 'Odisha', 'JaH', '', ''),
  ('103', 'S G Rabbani', 'Rasulpur', 'Jagatsinghpur', 'Odisha', 'Rasulpur', '9438139687', ''),
  ('104', 'S R Hussain', 'Rasulpur', 'Jagatisnghpur', 'Odisha', 'JAH', '', ''),
  ('105', 'Sahil', 'Sambhalpur', 'Sambhalpur', 'Odisha', 'Sambhalpur', '', ''),
  ('106', 'Saiyed Abdul Aziz', 'Basudevpur', 'Bhadrak', 'Odisha', 'Basudevpur', '', ''),
  ('107', 'Salim', 'Chattisgarh', 'Chattisgarh', 'Chattisgarh', 'Chattisgarh', '', ''),
  ('108', 'Salman', 'Kalahandi', 'Kalahandi', 'Odisha', 'Kalahandi', '', ''),
  ('109', 'Salman Raza', 'Denga', 'Jagatsinghpur', 'Odisha', 'Denga', '', ''),
  ('110', 'Sarfaraz', 'Cuttack', 'Cuttack', 'Odisha', 'Cuttack', '', ''),
  ('111', 'Sayed Abdul Aziz', 'Bhadrak', 'Bhadrak', 'Odisha', 'Bhadrak', '', ''),
  ('112', 'Shahid', 'Sambhalpur', 'Sambhalpur', 'Odisha', 'Sambhalpur', '', ''),
  ('113', 'Shaikh Akmal Husain', 'Koraput', 'Koraput', 'Odisha', 'Koraput', '', ''),
  ('114', 'Shaikh Gholam Rabbani', 'Rasulpur', 'Jagatsinghpur', 'Odisha', 'Rasulpur', '', ''),
  ('115', 'Shaikh Riyajat Hussain', 'Rasulpur', 'Jagatsinghpur', 'Odisha', 'JaH', '9938287320', ''),
  ('116', 'Shaikh Riyazat Hussain', 'Rasulpur', 'Jagatsinghpur', 'Odisha', '', '', ''),
  ('117', 'Shamsher Bhai', 'Khajuria', 'Jagatsinghpur', 'Odisha', 'Khajuria', '', ''),
  ('118', 'Sharafat', 'Barabatia', 'Jagatsinghpur', 'Odisha', 'Barabatia', '', ''),
  ('119', 'Shoaib Alam', 'Shadipur', 'Jagatsinghpur', 'Odisha', '', '', ''),
  ('120', 'Shoib Alam', 'Shadipur', 'Jagatsinghpur', 'Odisha', '', '', ''),
  ('121', 'Sona Bhai', 'Tiran', 'Jagatsinghpur', 'Odisha', 'Tiran', '', ''),
  ('122', 'Soroor Ali', 'Singhpur', 'Jagatsinghpur', 'Odisha', 'Singhpur', '', ''),
  ('123', 'Subhani', 'Jolashahi', 'Cuttack', 'Odisha', 'Jolashahi', '', ''),
  ('124', 'Sufyan', 'Anjira', 'Jagatsinghpur', 'Odisha', 'Anjira', '', ''),
  ('125', 'Sufyan Raza', 'Anjira', 'Jagatsinghpur', 'Odisha', 'Anjira', '', ''),
  ('126', 'Syed Mujahid', 'Anjira', 'Jagatsinghpur', 'Odisha', 'Anjira', '', ''),
  ('127', 'Tabrez/Wasim', 'Balasore', 'Balasore', 'Odisha', '', '', ''),
  ('128', 'Tahir Raza', 'Khapra Bank', 'Jagatsinghpur', 'Odisha', 'Khapra Bank', '', ''),
  ('129', 'Tajuddin Khan', 'Talpatak', 'Jagatsinghpur', 'Odisha', '', '', ''),
  ('130', 'Tanweer', 'Puri', 'Puri', 'Odisha', 'Puri', '', ''),
  ('131', 'Tauseef Raza', 'Denga', 'Jagatsinghpur', 'Odisha', 'Denga', '', ''),
  ('132', 'Tauseef Raza/Salahuddin', 'Denga', 'Jagatsinghpur', 'Odisha', 'Denga', '', ''),
  ('133', 'Wajid Khan', 'Kodokanthi', 'Kendrapara', 'Odisha', 'Kodokanthi', '', ''),
  ('134', 'Yasin', 'Pahrajpur', 'Cuttack', 'Odisha', 'Pahrajpur', '', ''),
  ('135', 'Zahir', 'Gobindpur', '', 'Odisha', 'Gobindpur', '', ''),
  ('136', 'Zahiruddin', 'Balasore', 'Balasore', 'Odisha', '', '', ''),
  ('137', 'Ziauddin', 'Paradip', 'Jagatsinghpur', 'Odisha', 'Paradip', '', ''),
  ('138', 'Ziauddin Shaikh', 'Paradeep', 'Jagatsinghpur', 'Odisha', 'Paradeep', '', '');

-- Ensure every supplied nonblank collection-area name has an independent master record.
INSERT INTO public.master_records(kind, code, name_en, name_ur, level, active)
SELECT 'AREA', 'AREA_' || upper(md5(source.collection_area)), source.collection_area,
  source.collection_area, 'COLLECTION', true
FROM (SELECT DISTINCT collection_area FROM legacy_fundraiser_import WHERE collection_area <> '') source
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_records existing WHERE existing.kind = 'AREA'
    AND existing.level = 'COLLECTION' AND existing.name_en = source.collection_area
)
ON CONFLICT (kind, code) DO NOTHING;

DO $$
DECLARE
  source_row record;
  imported_person_id uuid;
  import_actor_id uuid;
  area_id uuid;
  import_key text;
BEGIN
  IF current_user = 'dms_runtime' THEN
    RAISE EXCEPTION 'Run this import using the database owner account';
  END IF;
  SELECT id INTO import_actor_id FROM public.people
    WHERE role = 'ADMIN' AND status = 'ACTIVE' AND deleted_at IS NULL ORDER BY created_at, id LIMIT 1;
  IF import_actor_id IS NULL THEN RAISE EXCEPTION 'An active Super Admin is required before importing'; END IF;
  IF to_regprocedure('public.next_fundraiser_profile_code()') IS NULL THEN
    RAISE EXCEPTION 'Run 0019_fundraiser_jah_profile_codes.sql first';
  END IF;
  PERFORM set_config('app.person_id', import_actor_id::text, true);

  FOR source_row IN SELECT * FROM legacy_fundraiser_import ORDER BY source_id LOOP
    import_key := 'Fundraisers_Data_v1:' || source_row.source_id::text;
    IF EXISTS (SELECT 1 FROM public.collectors WHERE legacy_import_key = import_key) THEN CONTINUE; END IF;
    IF source_row.mobile <> '' AND EXISTS (SELECT 1 FROM public.people WHERE phone = source_row.mobile) THEN
      RAISE EXCEPTION 'Mobile number already belongs to another profile: spreadsheet fundraiser ID % (%)',
        source_row.source_id, source_row.full_name;
    END IF;

    area_id := NULL;
    IF source_row.collection_area <> '' THEN
      SELECT id INTO area_id FROM public.master_records
        WHERE kind = 'AREA' AND level = 'COLLECTION' AND name_en = source_row.collection_area
          AND active AND deleted_at IS NULL ORDER BY created_at, id LIMIT 1;
      IF area_id IS NULL THEN
        RAISE EXCEPTION 'Collection area is missing or inactive for spreadsheet fundraiser ID %', source_row.source_id;
      END IF;
    END IF;

    INSERT INTO public.people(full_name, phone, email, role, status, language, age, gender, address, remarks, created_by, updated_by)
    VALUES (source_row.full_name, nullif(source_row.mobile, ''), NULL, 'COLLECTOR', 'ACTIVE', 'en', NULL, 'UNSPECIFIED',
      concat_ws(', ', nullif(source_row.address, ''), nullif(source_row.district, ''), nullif(source_row.state, '')),
      'Legacy import: Fundraisers_Data.xlsx / source fundraiser ID ' || source_row.source_id::text,
      import_actor_id, import_actor_id)
    RETURNING id INTO imported_person_id;

    INSERT INTO public.collectors(person_id, code, legacy_import_key, collection_area_id, father_name, whatsapp,
      id_proof_name, commission_basis_points, leftover_eligible, village, post_office, block, district, state, pin,
      created_by, updated_by)
    VALUES (imported_person_id, public.next_fundraiser_profile_code(), import_key, area_id, '', source_row.whatsapp,
      '', NULL, false, source_row.address, '', '', source_row.district, source_row.state, '',
      import_actor_id, import_actor_id);
  END LOOP;
END;
$$;

COMMIT;
