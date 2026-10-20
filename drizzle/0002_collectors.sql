-- Run this entire file manually in the Neon SQL editor, after 0001_user_onboarding.sql.
BEGIN;
CREATE SEQUENCE IF NOT EXISTS public.collector_number_seq;
CREATE TABLE IF NOT EXISTS public.collectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL UNIQUE REFERENCES public.people(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE DEFAULT ('COL-' || lpad(nextval('public.collector_number_seq')::text, 6, '0')),
  father_name text NOT NULL DEFAULT '' CHECK (length(father_name) <= 100),
  whatsapp text NOT NULL DEFAULT '' CHECK (whatsapp = '' OR whatsapp ~ '^[6-9][0-9]{9}$'),
  id_proof_name text NOT NULL DEFAULT '' CHECK (length(id_proof_name) <= 160),
  commission_basis_points integer CHECK (commission_basis_points BETWEEN 0 AND 10000),
  village text NOT NULL CHECK (length(btrim(village)) BETWEEN 2 AND 120),
  post_office text NOT NULL CHECK (length(btrim(post_office)) BETWEEN 2 AND 120),
  block text NOT NULL DEFAULT '' CHECK (length(block) <= 120),
  district text NOT NULL CHECK (length(btrim(district)) BETWEEN 2 AND 120),
  state text NOT NULL DEFAULT 'Odisha' CHECK (length(btrim(state)) BETWEEN 2 AND 120),
  pin text NOT NULL CHECK (pin ~ '^[0-9]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS collectors_area_idx ON public.collectors(district, village);
CREATE TABLE IF NOT EXISTS public.collector_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  version text NOT NULL,
  old_values jsonb NOT NULL CHECK (jsonb_typeof(old_values) = 'object'),
  new_values jsonb NOT NULL CHECK (jsonb_typeof(new_values) = 'object'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  photo_changed boolean NOT NULL DEFAULT false,
  proposed_photo_key text,
  old_has_photo boolean NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  review_note text NOT NULL DEFAULT '' CHECK (length(review_note) <= 500),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CHECK ((status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status <> 'PENDING' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND length(btrim(review_note)) >= 3))
);
CREATE INDEX IF NOT EXISTS collector_requests_status_idx ON public.collector_edit_requests(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS collector_requests_pending_idx ON public.collector_edit_requests(collector_id)
  WHERE status = 'PENDING' AND deleted_at IS NULL;

ALTER TABLE public.collectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collectors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.collector_edit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collector_edit_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.collectors, public.collector_edit_requests FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.collectors, public.collector_edit_requests TO dms_runtime;
GRANT USAGE ON SEQUENCE public.collector_number_seq TO dms_runtime;

DROP POLICY IF EXISTS collectors_read ON public.collectors;
CREATE POLICY collectors_read ON public.collectors FOR SELECT TO dms_runtime USING (
  deleted_at IS NULL AND current_setting('app.role', true) IN ('ADMIN', 'STAFF'));
DROP POLICY IF EXISTS collectors_create ON public.collectors;
CREATE POLICY collectors_create ON public.collectors FOR INSERT TO dms_runtime WITH CHECK (
  current_setting('app.role', true) IN ('ADMIN', 'STAFF')
  AND created_by::text = current_setting('app.person_id', true)
  AND EXISTS (SELECT 1 FROM public.people p WHERE p.id = person_id AND p.role = 'COLLECTOR'
    AND p.auth_user_id IS NULL AND p.deleted_at IS NULL));
DROP POLICY IF EXISTS collectors_update ON public.collectors;
CREATE POLICY collectors_update ON public.collectors FOR UPDATE TO dms_runtime
  USING (current_setting('app.role', true) = 'ADMIN') WITH CHECK (current_setting('app.role', true) = 'ADMIN');
DROP POLICY IF EXISTS collector_requests_read ON public.collector_edit_requests;
CREATE POLICY collector_requests_read ON public.collector_edit_requests FOR SELECT TO dms_runtime USING (
  deleted_at IS NULL AND (current_setting('app.role', true) = 'ADMIN'
    OR requested_by::text = current_setting('app.person_id', true)));
DROP POLICY IF EXISTS collector_requests_create ON public.collector_edit_requests;
CREATE POLICY collector_requests_create ON public.collector_edit_requests FOR INSERT TO dms_runtime WITH CHECK (
  current_setting('app.role', true) = 'STAFF' AND status = 'PENDING' AND reviewed_by IS NULL
  AND requested_by::text = current_setting('app.person_id', true)
  AND EXISTS (SELECT 1 FROM public.people p WHERE p.id = collector_id AND p.role = 'COLLECTOR'
    AND p.auth_user_id IS NULL AND p.deleted_at IS NULL));
DROP POLICY IF EXISTS collector_requests_review ON public.collector_edit_requests;
CREATE POLICY collector_requests_review ON public.collector_edit_requests FOR UPDATE TO dms_runtime
  USING (current_setting('app.role', true) = 'ADMIN') WITH CHECK (current_setting('app.role', true) = 'ADMIN');
DROP POLICY IF EXISTS people_collectors_read ON public.people;
CREATE POLICY people_collectors_read ON public.people FOR SELECT TO dms_runtime USING (
  deleted_at IS NULL AND role = 'COLLECTOR' AND current_setting('app.role', true) = 'STAFF');
DROP POLICY IF EXISTS people_collectors_create ON public.people;
CREATE POLICY people_collectors_create ON public.people FOR INSERT TO dms_runtime WITH CHECK (
  role = 'COLLECTOR' AND auth_user_id IS NULL AND status IN ('ACTIVE', 'INACTIVE', 'BLOCKED')
  AND current_setting('app.role', true) IN ('ADMIN', 'STAFF')
  AND created_by::text = current_setting('app.person_id', true));

-- Preserve login-user verification protections, while allowing record-only collectors.
CREATE OR REPLACE FUNCTION public.guard_admin_user_changes() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user <> 'dms_runtime' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.role = 'COLLECTOR' AND NEW.role <> 'COLLECTOR' THEN
    RAISE EXCEPTION 'Collectors cannot be converted to login users';
  END IF;
  IF NEW.role = 'COLLECTOR' THEN
    IF NEW.auth_user_id IS NOT NULL OR NEW.status = 'PENDING'
      OR NEW.age IS NULL OR NEW.age NOT BETWEEN 18 AND 80 OR NEW.gender = 'UNSPECIFIED'
      OR NEW.phone IS NULL THEN RAISE EXCEPTION 'Invalid collector profile'; END IF;
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

CREATE OR REPLACE FUNCTION public.audit_collector_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.activity_log(actor_id, action, resource, record_id, old_values, new_values, reason)
  VALUES (nullif(current_setting('app.person_id', true), '')::uuid, TG_OP, TG_TABLE_NAME, NEW.id::text,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW),
    nullif(current_setting('app.change_reason', true), ''));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_collector_change() FROM PUBLIC;
DROP TRIGGER IF EXISTS collectors_audit ON public.collectors;
CREATE TRIGGER collectors_audit AFTER INSERT OR UPDATE ON public.collectors
  FOR EACH ROW EXECUTE FUNCTION public.audit_collector_change();
DROP TRIGGER IF EXISTS collector_requests_audit ON public.collector_edit_requests;
CREATE TRIGGER collector_requests_audit AFTER INSERT OR UPDATE ON public.collector_edit_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_collector_change();
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['collectors', 'collector_edit_requests'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS owner_maintenance ON public.%I', table_name);
    EXECUTE format('CREATE POLICY owner_maintenance ON public.%I TO %I USING (true) WITH CHECK (true)', table_name, current_user);
  END LOOP;
END $$;
COMMIT;
