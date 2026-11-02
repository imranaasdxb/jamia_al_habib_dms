-- Run this entire file as the Neon database owner, after 0027.
-- PostgreSQL may check SELECT visibility for the updated row during an UPDATE.
-- Permit Super Admin to see a deleted login-user row without granting deletion
-- rights, restoring accounts, or exposing deleted rows to other users.
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

DROP POLICY IF EXISTS people_deleted_login_admin_read ON public.people;
CREATE POLICY people_deleted_login_admin_read ON public.people FOR SELECT TO dms_runtime
  USING (
    current_setting('app.role', true) = 'SUPER_ADMIN'
    AND nullif(current_setting('app.person_id', true), '') IS NOT NULL
    AND role IN ('SUPER_ADMIN', 'ADMIN') AND deleted_at IS NOT NULL
  );

COMMIT;
