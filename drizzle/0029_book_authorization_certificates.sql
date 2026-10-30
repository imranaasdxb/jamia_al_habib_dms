-- Run this entire statement once as the Neon database owner, after 0027.
-- Existing assignments receive certificates; no collection or receipt data is changed.
DO $certificate_setup$
BEGIN
  IF current_user = 'dms_runtime' THEN
    RAISE EXCEPTION 'Run this setup as the database owner';
  END IF;
  LOCK TABLE public.book_cases IN SHARE ROW EXCLUSIVE MODE;

  CREATE TABLE IF NOT EXISTS public.book_authorization_certificates (
    case_id uuid PRIMARY KEY REFERENCES public.book_cases(id) ON DELETE CASCADE,
    certificate_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    end_reason text,
    CONSTRAINT certificate_end_check CHECK (
      (ended_at IS NULL AND end_reason IS NULL)
      OR (ended_at IS NOT NULL AND end_reason IS NOT NULL AND end_reason IN ('CLOSED', 'LOST'))
    )
  );
  ALTER TABLE public.book_authorization_certificates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.book_authorization_certificates FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON public.book_authorization_certificates FROM PUBLIC, dms_runtime;
  GRANT SELECT ON public.book_authorization_certificates TO dms_runtime;
  EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, dms_runtime',
    pg_get_serial_sequence('public.book_authorization_certificates', 'certificate_sequence'));

  DROP POLICY IF EXISTS certificates_read ON public.book_authorization_certificates;
  CREATE POLICY certificates_read ON public.book_authorization_certificates
    FOR SELECT TO dms_runtime USING (
      current_setting('app.role', true) IN ('SUPER_ADMIN', 'ADMIN')
      AND EXISTS (SELECT 1 FROM public.book_cases c
        JOIN public.book_assignments a ON a.id = c.assignment_id
        WHERE c.id = case_id AND a.deleted_at IS NULL)
    );
  DROP POLICY IF EXISTS owner_maintenance ON public.book_authorization_certificates;
  EXECUTE format('CREATE POLICY owner_maintenance ON public.book_authorization_certificates TO %I USING (true) WITH CHECK (true)', current_user);

  CREATE OR REPLACE FUNCTION public.issue_book_authorization_certificate() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $certificate_trigger$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.book_authorization_certificates(case_id, ended_at, end_reason)
        VALUES (NEW.id, NEW.closed_at, CASE WHEN NEW.closed_at IS NOT NULL THEN
          CASE WHEN EXISTS (SELECT 1 FROM public.book_losses WHERE case_id = NEW.id AND deleted_at IS NULL)
            THEN 'LOST' ELSE 'CLOSED' END END)
        ON CONFLICT (case_id) DO NOTHING;
    ELSIF NEW.closed_at IS NOT NULL THEN
      -- Reopening a submission for corrections never reactivates its old authorization.
      UPDATE public.book_authorization_certificates
        SET ended_at = NEW.closed_at,
          end_reason = CASE WHEN EXISTS (SELECT 1 FROM public.book_losses WHERE case_id = NEW.id AND deleted_at IS NULL)
            THEN 'LOST' ELSE 'CLOSED' END
        WHERE case_id = NEW.id AND (ended_at IS NULL OR NEW.closed_at < ended_at);
    END IF;
    RETURN NEW;
  END;
  $certificate_trigger$;
  REVOKE ALL ON FUNCTION public.issue_book_authorization_certificate() FROM PUBLIC, dms_runtime;
  DROP TRIGGER IF EXISTS issue_book_authorization_certificate ON public.book_cases;
  CREATE TRIGGER issue_book_authorization_certificate AFTER INSERT OR UPDATE OF closed_at
    ON public.book_cases FOR EACH ROW EXECUTE FUNCTION public.issue_book_authorization_certificate();

  -- Stable chronological backfill. Rerunning preserves every previously issued number.
  INSERT INTO public.book_authorization_certificates(case_id, ended_at, end_reason)
    SELECT c.id, c.closed_at, CASE WHEN c.closed_at IS NOT NULL THEN
      CASE WHEN EXISTS (SELECT 1 FROM public.book_losses l WHERE l.case_id = c.id AND l.deleted_at IS NULL)
        THEN 'LOST' ELSE 'CLOSED' END END
    FROM public.book_cases c JOIN public.book_assignments a ON a.id = c.assignment_id
    WHERE NOT EXISTS (SELECT 1 FROM public.book_authorization_certificates cert WHERE cert.case_id = c.id)
    ORDER BY a.assignment_date, a.created_at, a.id, c.receipt_from, c.id;
  RAISE NOTICE 'Certificates are ready for existing assignments and will be issued automatically for new assignments.';
END;
$certificate_setup$;
