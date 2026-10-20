-- Run this whole file manually as the database owner before using the new Users screen.
BEGIN;

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS profile_photo_key text,
  ADD COLUMN IF NOT EXISTS age integer CHECK (age BETWEEN 18 AND 80),
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'UNSPECIFIED'
    CHECK (gender IN ('UNSPECIFIED', 'MALE', 'FEMALE', 'OTHER')),
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '' CHECK (length(address) <= 1000),
  ADD COLUMN IF NOT EXISTS remarks text NOT NULL DEFAULT '' CHECK (length(remarks) <= 1000);

CREATE TABLE IF NOT EXISTS public.user_verification_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  target_email text NOT NULL CHECK (target_email = lower(target_email) AND length(target_email) <= 254),
  purpose text NOT NULL CHECK (purpose IN ('ONBOARD', 'EMAIL_CHANGE', 'PROFILE_CHANGE')),
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'
    AND NOT (details ?| ARRAY['password', 'confirmPassword', 'otp', 'token'])),
  prior_status text NOT NULL CHECK (prior_status IN ('PENDING', 'ACTIVE', 'INACTIVE', 'BLOCKED')),
  state text NOT NULL DEFAULT 'PREPARING' CHECK (state IN ('PREPARING', 'CODE_SENT', 'VERIFIED', 'COMPLETE')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  operation_id uuid,
  busy_until timestamptz,
  sent_at timestamptz,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS user_verification_flows_person_idx ON public.user_verification_flows(person_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_verification_flows_open_idx ON public.user_verification_flows(person_id)
  WHERE state <> 'COMPLETE' AND deleted_at IS NULL;
ALTER TABLE public.user_verification_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_verification_flows FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_verification_flows FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.user_verification_flows TO dms_runtime;
DROP POLICY IF EXISTS flows_admin ON public.user_verification_flows;
CREATE POLICY flows_admin ON public.user_verification_flows TO dms_runtime
  USING (current_setting('app.role', true) = 'ADMIN')
  WITH CHECK (current_setting('app.role', true) = 'ADMIN');
DO $$ BEGIN
  EXECUTE format('DROP POLICY IF EXISTS owner_maintenance ON public.user_verification_flows');
  EXECUTE format('CREATE POLICY owner_maintenance ON public.user_verification_flows TO %I USING (true) WITH CHECK (true)', current_user);
END $$;

-- Admin may read/revoke another user's app sessions, but cannot create them.
DROP POLICY IF EXISTS sessions_admin_read ON public.app_sessions;
CREATE POLICY sessions_admin_read ON public.app_sessions FOR SELECT TO dms_runtime
  USING (current_setting('app.role', true) = 'ADMIN');
DROP POLICY IF EXISTS sessions_admin_revoke ON public.app_sessions;
CREATE POLICY sessions_admin_revoke ON public.app_sessions FOR UPDATE TO dms_runtime
  USING (current_setting('app.role', true) = 'ADMIN')
  WITH CHECK (current_setting('app.role', true) = 'ADMIN');

CREATE OR REPLACE FUNCTION public.guard_admin_user_changes() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user <> 'dms_runtime' THEN RETURN NEW; END IF;
  IF current_setting('app.role', true) = 'ADMIN' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status <> 'PENDING' THEN RAISE EXCEPTION 'New login users require verification'; END IF;
      RETURN NEW;
    END IF;
    IF OLD.role = 'ADMIN' AND OLD.status = 'ACTIVE'
      AND (NEW.role <> 'ADMIN' OR NEW.status <> 'ACTIVE') THEN
      PERFORM pg_advisory_xact_lock(hashtext('dms:users:write'));
      IF OLD.id::text = current_setting('app.person_id', true) THEN
        RAISE EXCEPTION 'Administrators cannot disable their own access';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.people WHERE role = 'ADMIN' AND status = 'ACTIVE'
        AND deleted_at IS NULL AND id <> OLD.id) THEN
        RAISE EXCEPTION 'At least one active administrator is required';
      END IF;
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
DROP TRIGGER IF EXISTS people_admin_guard ON public.people;
CREATE TRIGGER people_admin_guard BEFORE INSERT OR UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.guard_admin_user_changes();

CREATE OR REPLACE FUNCTION public.revoke_changed_user_sessions() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user = 'dms_runtime' AND current_setting('app.role', true) = 'ADMIN'
    AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.email IS DISTINCT FROM OLD.email) THEN
    UPDATE public.app_sessions SET revoked_at = now(), updated_at = now(),
      updated_by = nullif(current_setting('app.person_id', true), '')::uuid
      WHERE person_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS people_revoke_sessions ON public.people;
CREATE TRIGGER people_revoke_sessions AFTER UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.revoke_changed_user_sessions();
REVOKE ALL ON FUNCTION public.guard_admin_user_changes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_changed_user_sessions() FROM PUBLIC;

-- Give existing, explicitly promoted app administrators access to Neon's Admin API.
-- No auth passwords, verification records or session tokens are edited by this SQL.
UPDATE neon_auth."user" SET role = 'admin'
WHERE id IN (SELECT auth_user_id FROM public.people
  WHERE role = 'ADMIN' AND status = 'ACTIVE' AND deleted_at IS NULL AND auth_user_id IS NOT NULL);
COMMIT;
