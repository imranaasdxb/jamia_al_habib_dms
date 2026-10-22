DO $leftover_eligibility_setup$
BEGIN
  ALTER TABLE public.collectors ADD COLUMN IF NOT EXISTS leftover_eligible boolean NOT NULL DEFAULT false;

  CREATE OR REPLACE FUNCTION public.guard_collector_leftover_eligibility() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, public AS $eligibility_guard$
  BEGIN
    IF current_user <> 'dms_runtime' THEN RETURN NEW; END IF;
    IF TG_OP = 'INSERT' THEN
      IF NOT NEW.leftover_eligible THEN RETURN NEW; END IF;
    ELSIF NEW.leftover_eligible IS NOT DISTINCT FROM OLD.leftover_eligible THEN
      RETURN NEW;
    END IF;
    IF current_setting('app.role', true) IS DISTINCT FROM 'ADMIN' THEN
      RAISE EXCEPTION 'Only Super Admin can change leftover book eligibility' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.people
      WHERE id::text = current_setting('app.person_id', true)
        AND auth_user_id::text = current_setting('app.auth_user_id', true)
        AND role = 'ADMIN' AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  END;
  $eligibility_guard$;
  REVOKE ALL ON FUNCTION public.guard_collector_leftover_eligibility() FROM PUBLIC, dms_runtime;
  DROP TRIGGER IF EXISTS collector_leftover_eligibility_guard ON public.collectors;
  CREATE TRIGGER collector_leftover_eligibility_guard BEFORE INSERT OR UPDATE ON public.collectors
    FOR EACH ROW EXECUTE FUNCTION public.guard_collector_leftover_eligibility();

  CREATE OR REPLACE FUNCTION public.guard_leftover_assignment_fundraiser() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $assignment_guard$
  DECLARE eligible boolean;
  BEGIN
    IF NEW.source <> 'LEFTOVER' THEN RETURN NEW; END IF;
    PERFORM 1 FROM public.people
      WHERE id::text = current_setting('app.person_id', true)
        AND auth_user_id::text = current_setting('app.auth_user_id', true)
        AND role = 'ADMIN' AND role = current_setting('app.role', true)
        AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('dms:collector:' || NEW.collector_id::text));
    SELECT leftover_eligible INTO eligible FROM public.collectors
      WHERE person_id = NEW.collector_id AND deleted_at IS NULL FOR SHARE;
    IF NOT coalesce(eligible, false) THEN
      RAISE EXCEPTION 'Fundraiser is not enabled for leftover books' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END;
  $assignment_guard$;
  REVOKE ALL ON FUNCTION public.guard_leftover_assignment_fundraiser() FROM PUBLIC, dms_runtime;
  DROP TRIGGER IF EXISTS zz_leftover_fundraiser_guard ON public.book_assignments;
  CREATE TRIGGER zz_leftover_fundraiser_guard BEFORE INSERT ON public.book_assignments
    FOR EACH ROW EXECUTE FUNCTION public.guard_leftover_assignment_fundraiser();
END;
$leftover_eligibility_setup$;
