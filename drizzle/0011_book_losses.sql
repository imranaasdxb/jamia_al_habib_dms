DO $book_loss_setup$
BEGIN
  CREATE TABLE IF NOT EXISTS public.book_losses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL UNIQUE REFERENCES public.book_cases(id) ON DELETE RESTRICT,
    book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
    assignment_id uuid NOT NULL REFERENCES public.book_assignments(id) ON DELETE RESTRICT,
    collector_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
    receipt_from integer NOT NULL CHECK (receipt_from > 0),
    receipt_to integer NOT NULL CHECK (receipt_to >= receipt_from),
    source_code text NOT NULL,
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
    reported_by_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
    deleted_at timestamptz
  );
  CREATE INDEX IF NOT EXISTS book_losses_book_idx ON public.book_losses(book_id);
  CREATE INDEX IF NOT EXISTS book_losses_collector_idx ON public.book_losses(collector_id);
  ALTER TABLE public.book_losses ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.book_losses FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON public.book_losses FROM PUBLIC, dms_runtime;
  GRANT SELECT ON public.book_losses TO dms_runtime;
  DROP POLICY IF EXISTS book_losses_read ON public.book_losses;
  CREATE POLICY book_losses_read ON public.book_losses FOR SELECT TO dms_runtime
    USING (current_setting('app.role', true) IN ('ADMIN','STAFF'));
  DROP POLICY IF EXISTS owner_maintenance ON public.book_losses;
  EXECUTE format('CREATE POLICY owner_maintenance ON public.book_losses TO %I USING (true) WITH CHECK (true)', current_user);

  CREATE OR REPLACE FUNCTION public.mark_assigned_book_lost(target uuid, loss_reason text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $loss_function$
  DECLARE
    actor public.people;
    current_case public.book_cases;
    stock public.books;
    assignment public.book_assignments;
    loss public.book_losses;
  BEGIN
    actor := public.receipt_workflow_actor();
    IF loss_reason IS NULL OR length(btrim(loss_reason)) NOT BETWEEN 3 AND 1000 THEN
      RAISE EXCEPTION 'A loss reason of 3 to 1000 characters is required' USING ERRCODE = '23514';
    END IF;
    -- Submission creation locks the same case, book and assignment in this order.
    SELECT * INTO current_case FROM public.book_cases WHERE id = target FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assigned book unavailable'; END IF;
    SELECT * INTO loss FROM public.book_losses WHERE case_id = target;
    IF FOUND THEN
      RETURN jsonb_build_object('caseId', loss.case_id, 'bookId', loss.book_id, 'assignmentId', loss.assignment_id);
    END IF;
    IF current_case.closed_at IS NOT NULL THEN RAISE EXCEPTION 'This assignment is already closed'; END IF;
    SELECT * INTO stock FROM public.books WHERE id = current_case.book_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND OR stock.status NOT IN ('ASSIGNED','LEFTOVER_ASSIGNED') THEN
      RAISE EXCEPTION 'Book is no longer with a Fundraiser';
    END IF;
    SELECT * INTO assignment FROM public.book_assignments
      WHERE id = current_case.assignment_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assignment unavailable'; END IF;
    IF EXISTS (SELECT 1 FROM public.book_returns WHERE case_id = target) THEN
      RAISE EXCEPTION 'A submission already exists; the book cannot be marked lost';
    END IF;
    INSERT INTO public.book_losses(case_id, book_id, assignment_id, collector_id,
      receipt_from, receipt_to, source_code, reason, reported_by_name, created_by, updated_by)
    VALUES (current_case.id, stock.id, assignment.id, assignment.collector_id,
      current_case.receipt_from, current_case.receipt_to, current_case.source_code,
      btrim(loss_reason), actor.full_name, actor.id, actor.id)
    RETURNING * INTO loss;
    UPDATE public.book_cases SET closed_at = now() WHERE id = current_case.id;
    UPDATE public.books SET status = 'LOST', updated_at = now(), updated_by = actor.id WHERE id = stock.id;
    UPDATE public.book_assignments SET updated_at = now(), updated_by = actor.id WHERE id = assignment.id;
    UPDATE public.leftover_books SET status = 'HELD', updated_at = now(), updated_by = actor.id
      WHERE book_id = stock.id AND status = 'AVAILABLE' AND deleted_at IS NULL;
    INSERT INTO public.activity_log(actor_id, action, resource, record_id, old_values, new_values, reason, created_by, updated_by)
    VALUES (actor.id, 'MARK_LOST', 'book_losses', loss.id::text,
      jsonb_build_object('caseId', current_case.id, 'bookStatus', stock.status),
      to_jsonb(loss) || jsonb_build_object('bookStatus', 'LOST'), btrim(loss_reason), actor.id, actor.id);
    RETURN jsonb_build_object('caseId', loss.case_id, 'bookId', loss.book_id, 'assignmentId', loss.assignment_id);
  END;
  $loss_function$;
  REVOKE ALL ON FUNCTION public.mark_assigned_book_lost(uuid, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.mark_assigned_book_lost(uuid, text) TO dms_runtime;
END;
$book_loss_setup$;
