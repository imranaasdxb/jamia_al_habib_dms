-- Manual setup part 1. Run in numeric order. Stop if any part reports an error.
-- These files contain the same SQL as 0000_auth_foundation.sql; choose one setup method.
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

