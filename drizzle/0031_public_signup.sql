-- Run the entire file in Neon as the database owner, after 0027.
-- Public accounts remain pending ADMIN users until email verification and approval.
BEGIN;

DO $$
BEGIN
  IF current_user = 'dms_runtime' THEN
    RAISE EXCEPTION 'Run this file using the Neon database owner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.people'::regclass AND conname = 'people_role_names_v2_check') THEN
    RAISE EXCEPTION 'Apply 0027_explicit_super_admin_roles.sql first';
  END IF;
END $$;

DROP POLICY IF EXISTS people_public_signup ON public.people;
CREATE POLICY people_public_signup ON public.people FOR INSERT TO dms_runtime
  WITH CHECK (
    role = 'ADMIN' AND status = 'PENDING' AND auth_user_id IS NULL
    AND email = nullif(current_setting('app.email', true), '')
    AND created_by IS NULL AND updated_by IS NULL AND deleted_at IS NULL
    AND coalesce(current_setting('app.role', true), '') = ''
  );

COMMIT;
