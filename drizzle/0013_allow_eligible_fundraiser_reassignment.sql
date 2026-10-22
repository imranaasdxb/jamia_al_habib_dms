DO $allow_eligible_reassignment$
DECLARE definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.book_assignments'::regclass
      AND tgname = 'zz_leftover_fundraiser_guard' AND NOT tgisinternal AND tgenabled IN ('O','A')
  ) THEN
    RAISE EXCEPTION 'Run 0012_leftover_fundraiser_eligibility.sql before this query';
  END IF;

  -- Preserve the installed allocation function and all of its other checks.
  definition := pg_catalog.pg_get_functiondef('public.allocate_assignment_books()'::regprocedure);
  IF position(' OR leftover.returned_by = NEW.collector_id' IN definition) > 0 THEN
    definition := replace(definition, ' OR leftover.returned_by = NEW.collector_id', '');
    definition := replace(definition, 'Leftover unavailable or same Fundraiser selected', 'Leftover unavailable');
    EXECUTE definition;
  ELSIF position('leftover.returned_by = NEW.collector_id' IN definition) > 0 THEN
    RAISE EXCEPTION 'Unexpected allocation function format; the existing function was not changed';
  END IF;
  REVOKE ALL ON FUNCTION public.allocate_assignment_books() FROM PUBLIC, dms_runtime;
END;
$allow_eligible_reassignment$;
