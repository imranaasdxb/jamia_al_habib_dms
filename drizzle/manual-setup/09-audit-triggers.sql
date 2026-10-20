-- Manual setup part 9. Run in numeric order. Stop if any part reports an error.
-- These files contain the same SQL as 0000_auth_foundation.sql; choose one setup method.
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

