-- Manual setup part 6. Run in numeric order. Stop if any part reports an error.
-- These files contain the same SQL as 0000_auth_foundation.sql; choose one setup method.
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

