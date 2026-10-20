-- Phase 2. Apply this complete migration once, using your Neon owner connection.
-- Choose manual SQL execution OR db:migrate for a fresh database, not both.
-- Enable Neon Auth on this branch first. This does not modify managed auth tables.
-- Application queries drop to dms_runtime before reading or writing any records.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dms_runtime') THEN
    CREATE ROLE dms_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END;
$$;
GRANT dms_runtime TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO dms_runtime;
--> statement-breakpoint
CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES neon_auth."user"(id) ON DELETE RESTRICT,
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 100),
  email text UNIQUE CHECK (email = lower(btrim(email))),
  phone text UNIQUE CHECK (phone ~ '^[6-9][0-9]{9}$'),
  role text NOT NULL DEFAULT 'STAFF' CHECK (role IN ('ADMIN', 'STAFF', 'COLLECTOR')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'INACTIVE', 'BLOCKED')),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ur')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CHECK (role <> 'COLLECTOR' OR auth_user_id IS NULL),
  CHECK (role = 'COLLECTOR' OR email IS NOT NULL)
);
CREATE INDEX people_role_status_idx ON public.people(role, status) WHERE deleted_at IS NULL;
CREATE INDEX people_name_idx ON public.people(full_name);
CREATE INDEX people_created_by_idx ON public.people(created_by);
CREATE INDEX people_updated_by_idx ON public.people(updated_by);
--> statement-breakpoint
CREATE TABLE public.bootstrap_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot integer NOT NULL DEFAULT 1 UNIQUE CHECK (slot = 1),
  first_person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz CHECK (deleted_at IS NULL)
);
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot integer NOT NULL DEFAULT 1 UNIQUE CHECK (slot = 1),
  session_timeout_minutes integer NOT NULL DEFAULT 30 CHECK (session_timeout_minutes BETWEEN 5 AND 480),
  default_return_months integer NOT NULL DEFAULT 11 CHECK (default_return_months BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz CHECK (deleted_at IS NULL)
);
INSERT INTO public.bootstrap_state(slot) VALUES (1);
INSERT INTO public.app_settings(slot) VALUES (1);
--> statement-breakpoint
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  permission text NOT NULL,
  allowed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX user_permissions_person_key_idx ON public.user_permissions(person_id, permission);
CREATE TABLE public.app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);
CREATE INDEX app_sessions_person_idx ON public.app_sessions(person_id);
CREATE INDEX app_sessions_expiry_idx ON public.app_sessions(expires_at) WHERE revoked_at IS NULL;
CREATE TABLE public.auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);
CREATE INDEX auth_rate_limits_window_idx ON public.auth_rate_limits(window_started_at);
--> statement-breakpoint
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  action text NOT NULL,
  resource text NOT NULL,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz CHECK (deleted_at IS NULL)
);
CREATE INDEX activity_log_actor_date_idx ON public.activity_log(actor_id, created_at);
CREATE INDEX activity_log_resource_idx ON public.activity_log(resource, record_id);
--> statement-breakpoint
-- Metadata foreign keys are indexed consistently on every foundation table.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['bootstrap_state', 'app_settings', 'user_permissions',
    'app_sessions', 'auth_rate_limits', 'activity_log'] LOOP
    EXECUTE format('CREATE INDEX %I ON public.%I(created_by)', table_name || '_created_by_idx', table_name);
    EXECUTE format('CREATE INDEX %I ON public.%I(updated_by)', table_name || '_updated_by_idx', table_name);
  END LOOP;
END;
$$;
CREATE INDEX bootstrap_first_person_idx ON public.bootstrap_state(first_person_id);
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['people', 'bootstrap_state', 'app_settings', 'user_permissions',
    'app_sessions', 'auth_rate_limits', 'activity_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    -- Explicit owner maintenance is for manual console administration only.
    EXECUTE format('CREATE POLICY owner_maintenance ON public.%I TO %I USING (true) WITH CHECK (true)',
      table_name, current_user);
  END LOOP;
END;
$$;
GRANT SELECT, INSERT, UPDATE ON public.people, public.user_permissions, public.app_sessions,
  public.auth_rate_limits TO dms_runtime;
GRANT SELECT, UPDATE ON public.bootstrap_state, public.app_settings TO dms_runtime;
GRANT SELECT, INSERT ON public.activity_log TO dms_runtime;
--> statement-breakpoint
CREATE POLICY people_read ON public.people FOR SELECT TO dms_runtime USING (
  deleted_at IS NULL AND (
    auth_user_id = nullif(current_setting('app.auth_user_id', true), '')::uuid
    OR email = current_setting('app.email', true)
    OR current_setting('app.role', true) = 'ADMIN'
  )
);
CREATE POLICY people_create ON public.people FOR INSERT TO dms_runtime WITH CHECK (
  current_setting('app.role', true) = 'ADMIN'
  OR (role = 'STAFF' AND status = 'PENDING' AND auth_user_id IS NULL
    AND email = current_setting('app.email', true)
    AND NOT EXISTS (SELECT 1 FROM public.bootstrap_state WHERE first_person_id IS NOT NULL))
);
CREATE POLICY people_update ON public.people FOR UPDATE TO dms_runtime USING (
  deleted_at IS NULL AND (current_setting('app.role', true) = 'ADMIN'
    OR (email = current_setting('app.email', true)
      AND (auth_user_id IS NULL OR auth_user_id = nullif(current_setting('app.auth_user_id', true), '')::uuid)))
) WITH CHECK (
  current_setting('app.role', true) = 'ADMIN'
  OR (email = current_setting('app.email', true)
    AND auth_user_id = nullif(current_setting('app.auth_user_id', true), '')::uuid)
);
CREATE POLICY bootstrap_read ON public.bootstrap_state FOR SELECT TO dms_runtime USING (true);
CREATE POLICY bootstrap_claim ON public.bootstrap_state FOR UPDATE TO dms_runtime
  USING (first_person_id IS NULL) WITH CHECK (first_person_id IS NOT NULL);
CREATE POLICY settings_read ON public.app_settings FOR SELECT TO dms_runtime USING (deleted_at IS NULL);
CREATE POLICY settings_update ON public.app_settings FOR UPDATE TO dms_runtime
  USING (current_setting('app.role', true) = 'ADMIN')
  WITH CHECK (current_setting('app.role', true) = 'ADMIN');
CREATE POLICY permissions_read ON public.user_permissions FOR SELECT TO dms_runtime USING (
  deleted_at IS NULL AND (person_id::text = current_setting('app.person_id', true)
    OR current_setting('app.role', true) = 'ADMIN')
);
CREATE POLICY permissions_admin ON public.user_permissions FOR ALL TO dms_runtime
  USING (current_setting('app.role', true) = 'ADMIN')
  WITH CHECK (current_setting('app.role', true) = 'ADMIN');
CREATE POLICY sessions_own ON public.app_sessions FOR ALL TO dms_runtime
  USING (person_id::text = current_setting('app.person_id', true))
  WITH CHECK (person_id::text = current_setting('app.person_id', true));
CREATE POLICY rate_limits_runtime ON public.auth_rate_limits FOR ALL TO dms_runtime
  USING (true) WITH CHECK (true);
CREATE POLICY audit_read ON public.activity_log FOR SELECT TO dms_runtime
  USING (current_setting('app.role', true) = 'ADMIN');
CREATE POLICY audit_append ON public.activity_log FOR INSERT TO dms_runtime WITH CHECK (
  actor_id::text = current_setting('app.person_id', true)
);
--> statement-breakpoint
CREATE FUNCTION public.guard_person_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user = 'dms_runtime' AND current_setting('app.role', true) IS DISTINCT FROM 'ADMIN' THEN
    IF (to_jsonb(NEW) - ARRAY['auth_user_id', 'updated_at', 'updated_by'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['auth_user_id', 'updated_at', 'updated_by'])
      OR OLD.auth_user_id IS NOT NULL
      OR NEW.auth_user_id IS DISTINCT FROM nullif(current_setting('app.auth_user_id', true), '')::uuid THEN
      RAISE EXCEPTION 'Person changes require administrator approval';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER people_guard BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.guard_person_update();
CREATE FUNCTION public.audit_person_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.activity_log(actor_id, action, resource, record_id, old_values, new_values, reason)
  VALUES (nullif(current_setting('app.person_id', true), '')::uuid, TG_OP, 'people', NEW.id::text,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW),
    CASE WHEN nullif(current_setting('app.person_id', true), '') IS NULL
      THEN 'Account setup or manual Neon administration' ELSE NULL END);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_person_change() FROM PUBLIC;
CREATE TRIGGER people_audit AFTER INSERT OR UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.audit_person_change();
CREATE FUNCTION public.protect_activity_log() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Activity log is append-only';
END;
$$;
CREATE TRIGGER activity_log_immutable BEFORE UPDATE OR DELETE ON public.activity_log
  FOR EACH ROW EXECUTE FUNCTION public.protect_activity_log();
