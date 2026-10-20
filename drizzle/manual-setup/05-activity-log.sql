-- Manual setup part 5. Run in numeric order. Stop if any part reports an error.
-- These files contain the same SQL as 0000_auth_foundation.sql; choose one setup method.
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  action text NOT NULL,
  resource text NOT NULL,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz CHECK (deleted_at IS NULL)
);
CREATE INDEX activity_log_actor_date_idx ON public.activity_log(actor_id, created_at);
CREATE INDEX activity_log_resource_idx ON public.activity_log(resource, record_id);

