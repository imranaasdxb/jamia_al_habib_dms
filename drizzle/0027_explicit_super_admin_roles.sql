-- Run this entire statement as the Neon database owner, after 0026.
-- The two requested accounts are configured below. Changes are atomic and safe to rerun.
-- App roles: SUPER_ADMIN = full access; ADMIN = former STAFF permissions.
-- Neon's built-in Auth provider still uses its own lowercase admin/user roles.
DO $rename_login_roles$
DECLARE
  promote_email text := 'askimranansari@gmail.com';
  admin_email text := 'ansimranyt@gmail.com';
  target_person uuid;
  admin_person uuid;
  role_checks jsonb;
  saved_check jsonb;
  object_row record;
  definition text;
  rewritten text;
  policy_using text;
  policy_check text;
  statement text;
BEGIN
  IF btrim(promote_email) = '' OR btrim(admin_email) = '' OR lower(promote_email) = lower(admin_email) THEN
    RAISE EXCEPTION 'Provide two distinct registered login emails';
  END IF;
  IF current_user = 'dms_runtime' THEN
    RAISE EXCEPTION 'Run this statement using the Neon database owner';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dms:role-names:v2'));
  LOCK TABLE public.people IN ACCESS EXCLUSIVE MODE;
  SELECT id INTO target_person FROM public.people
    WHERE lower(email) = promote_email AND role <> 'COLLECTOR'
      AND status = 'ACTIVE' AND auth_user_id IS NOT NULL AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active, registered login user matches the supplied email'; END IF;
  SELECT id INTO admin_person FROM public.people
    WHERE lower(email) = admin_email AND role <> 'COLLECTOR'
      AND auth_user_id IS NOT NULL AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'No registered login user matches the supplied Admin email'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'neon_auth."user"'::regclass AND attname = 'role' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Neon Auth role support is required';
  END IF;
  IF to_regprocedure('public.reopen_receipt_book(uuid,integer,text)') IS NULL THEN
    RAISE EXCEPTION 'Run 0026_reopen_book_submissions.sql before this migration';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.people'::regclass AND conname = 'people_role_names_v2_check') THEN

    -- Save and replace only checks that depend on people.role.
    SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.conname,
      'definition',pg_catalog.pg_get_constraintdef(c.oid))), '[]'::jsonb)
      INTO role_checks
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid
        AND a.attnum = ANY(c.conkey) AND a.attname = 'role'
      WHERE c.conrelid = 'public.people'::regclass AND c.contype = 'c';
    FOR saved_check IN SELECT value FROM jsonb_array_elements(role_checks) LOOP
      EXECUTE format('ALTER TABLE public.people DROP CONSTRAINT %I', saved_check->>'name');
    END LOOP;

    -- Keep existing function security, signatures, grants and unrelated validation.
    FOR object_row IN
      SELECT p.oid FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      WHERE n.nspname = 'public' AND p.prokind = 'f' AND l.lanname IN ('sql','plpgsql')
        AND (position(quote_literal('ADMIN') IN p.prosrc) > 0
          OR position(quote_literal('STAFF') IN p.prosrc) > 0)
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d
          WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    LOOP
      definition := pg_catalog.pg_get_functiondef(object_row.oid);
      rewritten := replace(replace(definition,quote_literal('ADMIN'),quote_literal('SUPER_ADMIN')),
        quote_literal('STAFF'),quote_literal('ADMIN'));
      IF rewritten IS DISTINCT FROM definition THEN EXECUTE rewritten; END IF;
    END LOOP;

    -- Rename literals inside the installed RLS predicates, preserving policy scope.
    FOR object_row IN
      SELECT p.polname,c.relname,
        pg_catalog.pg_get_expr(p.polqual,p.polrelid) AS using_expression,
        pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
      FROM pg_catalog.pg_policy p
      JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
    LOOP
      policy_using := replace(replace(object_row.using_expression,
        quote_literal('ADMIN'),quote_literal('SUPER_ADMIN')),quote_literal('STAFF'),quote_literal('ADMIN'));
      policy_check := replace(replace(object_row.check_expression,
        quote_literal('ADMIN'),quote_literal('SUPER_ADMIN')),quote_literal('STAFF'),quote_literal('ADMIN'));
      IF policy_using IS DISTINCT FROM object_row.using_expression
        OR policy_check IS DISTINCT FROM object_row.check_expression THEN
        statement := format('ALTER POLICY %I ON public.%I',object_row.polname,object_row.relname);
        IF policy_using IS NOT NULL THEN statement := statement || ' USING (' || policy_using || ')'; END IF;
        IF policy_check IS NOT NULL THEN statement := statement || ' WITH CHECK (' || policy_check || ')'; END IF;
        EXECUTE statement;
      END IF;
    END LOOP;

    -- Preserve permissions: legacy full-access ADMIN becomes SUPER_ADMIN;
    -- legacy limited STAFF becomes ADMIN. Fundraisers remain COLLECTOR.
    WITH changed AS (
      UPDATE public.people SET role = CASE role WHEN 'ADMIN' THEN 'SUPER_ADMIN' ELSE 'ADMIN' END,
        updated_at = now()
      WHERE role IN ('ADMIN','STAFF')
      RETURNING id,role
    )
    INSERT INTO public.activity_log(action,resource,record_id,old_values,new_values,reason)
      SELECT 'ROLE_RENAME','people',id::text,
        jsonb_build_object('role',CASE role WHEN 'SUPER_ADMIN' THEN 'ADMIN' ELSE 'STAFF' END),
        jsonb_build_object('role',role),'Rename login roles without changing access permissions'
      FROM changed;

    UPDATE public.user_verification_flows
      SET details = jsonb_set(details,'{role}',to_jsonb(
        CASE details->>'role' WHEN 'ADMIN' THEN 'SUPER_ADMIN' ELSE 'ADMIN' END)), updated_at = now()
      WHERE state <> 'COMPLETE' AND deleted_at IS NULL AND details->>'role' IN ('ADMIN','STAFF');

    ALTER TABLE public.people ALTER COLUMN role SET DEFAULT 'ADMIN';
    FOR saved_check IN SELECT value FROM jsonb_array_elements(role_checks) LOOP
      definition := replace(replace(saved_check->>'definition',
        quote_literal('ADMIN'),quote_literal('SUPER_ADMIN')),quote_literal('STAFF'),quote_literal('ADMIN'));
      EXECUTE format('ALTER TABLE public.people ADD CONSTRAINT %I %s', saved_check->>'name',definition);
    END LOOP;
    ALTER TABLE public.people ADD CONSTRAINT people_role_names_v2_check
      CHECK (role IN ('SUPER_ADMIN','ADMIN','COLLECTOR'));
  END IF;

  -- Manual edits in public.people remain compatible with Neon's account-management API.
  EXECUTE $create_sync$
CREATE OR REPLACE FUNCTION public.sync_login_provider_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $sync$
DECLARE provider_role text;
BEGIN
  IF NEW.auth_user_id IS NULL THEN RETURN NEW; END IF;
  provider_role := CASE WHEN NEW.role = 'SUPER_ADMIN' AND NEW.status = 'ACTIVE'
    AND NEW.deleted_at IS NULL THEN 'admin' ELSE 'user' END;
  UPDATE neon_auth."user" SET role = provider_role
    WHERE id::text = NEW.auth_user_id::text AND role IS DISTINCT FROM provider_role;
  RETURN NEW;
END;
$sync$;
$create_sync$;
  REVOKE ALL ON FUNCTION public.sync_login_provider_role() FROM PUBLIC,dms_runtime;
  DROP TRIGGER IF EXISTS people_sync_login_provider_role ON public.people;
  CREATE TRIGGER people_sync_login_provider_role
    AFTER INSERT OR UPDATE OF role,status,auth_user_id,deleted_at ON public.people
    FOR EACH ROW EXECUTE FUNCTION public.sync_login_provider_role();

  WITH requested(person_id,new_role) AS (
    VALUES (target_person,'SUPER_ADMIN'::text),(admin_person,'ADMIN'::text)
  ), previous AS MATERIALIZED (
    SELECT person.id,person.role FROM public.people person
      JOIN requested ON requested.person_id = person.id
      WHERE person.role IS DISTINCT FROM requested.new_role
  ), assigned AS (
    UPDATE public.people person SET role = requested.new_role, updated_at = now()
      FROM requested,previous
      WHERE person.id = requested.person_id AND person.id = previous.id
      RETURNING person.id,person.role
  )
  INSERT INTO public.activity_log(action,resource,record_id,old_values,new_values,reason)
    SELECT 'ROLE_ASSIGNMENT','people',assigned.id::text,jsonb_build_object('role',previous.role),
      jsonb_build_object('role',assigned.role),'Manual database owner role assignment by registered email'
    FROM assigned JOIN previous ON previous.id = assigned.id;

  -- An unfinished verification must not restore an earlier role for either account.
  UPDATE public.user_verification_flows flow
    SET details = jsonb_set(flow.details,'{role}',to_jsonb(person.role)), updated_at = now()
    FROM public.people person
    WHERE flow.person_id = person.id AND person.id IN (target_person,admin_person)
      AND flow.state <> 'COMPLETE' AND flow.deleted_at IS NULL;

  UPDATE neon_auth."user" identity_user SET role = CASE
      WHEN person.role = 'SUPER_ADMIN' AND person.status = 'ACTIVE' AND person.deleted_at IS NULL
        THEN 'admin' ELSE 'user' END
    FROM public.people person
    WHERE identity_user.id::text = person.auth_user_id::text
      AND person.role IN ('SUPER_ADMIN','ADMIN')
      AND identity_user.role IS DISTINCT FROM CASE
        WHEN person.role = 'SUPER_ADMIN' AND person.status = 'ACTIVE' AND person.deleted_at IS NULL
          THEN 'admin' ELSE 'user' END;
END;
$rename_login_roles$;
