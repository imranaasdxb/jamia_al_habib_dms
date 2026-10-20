-- Manual setup part 7. Run in numeric order. Stop if any part reports an error.
-- These files contain the same SQL as 0000_auth_foundation.sql; choose one setup method.
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

