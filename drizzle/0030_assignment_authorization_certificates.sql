-- Run this entire statement as the Neon database owner after 0029.
-- This replaces per-book issuance. Do not rerun 0029 after this migration.
-- Existing per-book certificates stay archived; the earliest number in each
-- assignment becomes its combined certificate number. No receipt data changes.
DO $assignment_certificates$
DECLARE
  certificate_sequence_name text;
  sequence_value bigint;
  sequence_called boolean;
  highest_issued bigint;
BEGIN
  IF current_user = 'dms_runtime' THEN RAISE EXCEPTION 'Run as the database owner'; END IF;
  IF to_regclass('public.book_authorization_certificates') IS NULL THEN
    RAISE EXCEPTION 'Run 0029_book_authorization_certificates.sql first';
  END IF;
  LOCK TABLE public.book_cases IN SHARE ROW EXCLUSIVE MODE;
  DROP TRIGGER IF EXISTS issue_book_authorization_certificate ON public.book_cases;
  DROP TRIGGER IF EXISTS issue_assignment_authorization_certificate ON public.book_cases;
  DROP TRIGGER IF EXISTS track_book_authorization_end ON public.book_cases;

  ALTER TABLE public.book_cases ADD COLUMN IF NOT EXISTS authorization_ended_at timestamptz;
  ALTER TABLE public.book_cases ADD COLUMN IF NOT EXISTS authorization_end_reason text;
  UPDATE public.book_cases c SET
    authorization_ended_at = coalesce(c.authorization_ended_at, old.ended_at, c.closed_at),
    authorization_end_reason = CASE WHEN coalesce(c.authorization_ended_at, old.ended_at, c.closed_at) IS NULL THEN NULL
      ELSE coalesce(c.authorization_end_reason, old.end_reason,
        CASE WHEN EXISTS (SELECT 1 FROM public.book_losses l WHERE l.case_id = c.id AND l.deleted_at IS NULL)
          THEN 'LOST' ELSE 'CLOSED' END) END
    FROM public.book_authorization_certificates old WHERE old.case_id = c.id;
  UPDATE public.book_cases c SET authorization_ended_at = c.closed_at,
    authorization_end_reason = CASE WHEN EXISTS (SELECT 1 FROM public.book_losses l WHERE l.case_id = c.id AND l.deleted_at IS NULL)
      THEN 'LOST' ELSE 'CLOSED' END
    WHERE c.authorization_ended_at IS NULL AND c.closed_at IS NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.book_cases'::regclass
    AND conname = 'book_cases_authorization_end_check') THEN
    ALTER TABLE public.book_cases ADD CONSTRAINT book_cases_authorization_end_check CHECK (
      (authorization_ended_at IS NULL AND authorization_end_reason IS NULL)
      OR (authorization_ended_at IS NOT NULL AND authorization_end_reason IS NOT NULL AND authorization_end_reason IN ('CLOSED','LOST'))
    );
  END IF;

  CREATE TABLE IF NOT EXISTS public.assignment_authorization_certificates (
    assignment_id uuid PRIMARY KEY REFERENCES public.book_assignments(id) ON DELETE CASCADE,
    certificate_sequence bigint NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.assignment_authorization_certificates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.assignment_authorization_certificates FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON public.assignment_authorization_certificates FROM PUBLIC, dms_runtime;
  GRANT SELECT ON public.assignment_authorization_certificates TO dms_runtime;
  DROP POLICY IF EXISTS certificates_read ON public.assignment_authorization_certificates;
  CREATE POLICY certificates_read ON public.assignment_authorization_certificates FOR SELECT TO dms_runtime USING (
    current_setting('app.role',true) IN ('SUPER_ADMIN','ADMIN') AND EXISTS (
      SELECT 1 FROM public.book_assignments a WHERE a.id = assignment_id AND a.deleted_at IS NULL
    )
  );
  DROP POLICY IF EXISTS owner_maintenance ON public.assignment_authorization_certificates;
  EXECUTE format('CREATE POLICY owner_maintenance ON public.assignment_authorization_certificates TO %I USING (true) WITH CHECK (true)', current_user);

  certificate_sequence_name := pg_get_serial_sequence('public.book_authorization_certificates','certificate_sequence');
  IF certificate_sequence_name IS NULL THEN RAISE EXCEPTION 'The 0029 certificate sequence is missing'; END IF;
  INSERT INTO public.assignment_authorization_certificates(assignment_id, certificate_sequence, created_at)
    SELECT c.assignment_id, coalesce(min(old.certificate_sequence), nextval(certificate_sequence_name::regclass)),
      coalesce(min(old.created_at), now())
    FROM public.book_cases c JOIN public.book_assignments a ON a.id = c.assignment_id
    LEFT JOIN public.book_authorization_certificates old ON old.case_id = c.id
    WHERE NOT EXISTS (SELECT 1 FROM public.assignment_authorization_certificates cert WHERE cert.assignment_id = c.assignment_id)
    GROUP BY c.assignment_id, a.assignment_date, a.created_at ORDER BY a.assignment_date, a.created_at, c.assignment_id;
  SELECT greatest(coalesce((SELECT max(certificate_sequence) FROM public.book_authorization_certificates),0),
    coalesce((SELECT max(certificate_sequence) FROM public.assignment_authorization_certificates),0)) INTO highest_issued;
  EXECUTE format('SELECT last_value, is_called FROM %s', certificate_sequence_name) INTO sequence_value, sequence_called;
  PERFORM setval(certificate_sequence_name::regclass, greatest(sequence_value, highest_issued), sequence_called OR highest_issued > 0);

  CREATE OR REPLACE FUNCTION public.track_book_authorization_end() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $track_end$
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      NEW.authorization_ended_at := OLD.authorization_ended_at;
      NEW.authorization_end_reason := OLD.authorization_end_reason;
    END IF;
    IF NEW.closed_at IS NOT NULL AND (NEW.authorization_ended_at IS NULL OR NEW.closed_at < NEW.authorization_ended_at) THEN
      NEW.authorization_ended_at := NEW.closed_at;
      NEW.authorization_end_reason := CASE WHEN EXISTS (
        SELECT 1 FROM public.book_losses WHERE case_id = NEW.id AND deleted_at IS NULL
      ) THEN 'LOST' ELSE 'CLOSED' END;
    END IF;
    RETURN NEW;
  END;
  $track_end$;
  CREATE OR REPLACE FUNCTION public.issue_assignment_authorization_certificate() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $issue_assignment$
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('dms:assignment-certificate:' || NEW.assignment_id::text));
    IF NOT EXISTS (SELECT 1 FROM public.assignment_authorization_certificates WHERE assignment_id = NEW.assignment_id) THEN
      INSERT INTO public.assignment_authorization_certificates(assignment_id, certificate_sequence)
        VALUES (NEW.assignment_id, nextval(pg_get_serial_sequence('public.book_authorization_certificates','certificate_sequence')::regclass));
    END IF;
    RETURN NEW;
  END;
  $issue_assignment$;
  REVOKE ALL ON FUNCTION public.track_book_authorization_end(), public.issue_assignment_authorization_certificate() FROM PUBLIC, dms_runtime;
  CREATE TRIGGER track_book_authorization_end BEFORE INSERT OR UPDATE OF closed_at ON public.book_cases
    FOR EACH ROW EXECUTE FUNCTION public.track_book_authorization_end();
  CREATE TRIGGER issue_assignment_authorization_certificate AFTER INSERT ON public.book_cases
    FOR EACH ROW EXECUTE FUNCTION public.issue_assignment_authorization_certificate();
  RAISE NOTICE 'One certificate per assignment is ready; each book retains its individual authorization end date.';
END;
$assignment_certificates$;
