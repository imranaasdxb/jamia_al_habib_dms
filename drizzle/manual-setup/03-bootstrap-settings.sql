-- Manual setup part 3. Run in numeric order. Stop if any part reports an error.
-- These files contain the same SQL as 0000_auth_foundation.sql; choose one setup method.
CREATE TABLE public.bootstrap_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot integer NOT NULL DEFAULT 1 UNIQUE CHECK (slot = 1),
  first_person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz CHECK (deleted_at IS NULL)
);
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot integer NOT NULL DEFAULT 1 UNIQUE CHECK (slot = 1),
  session_timeout_minutes integer NOT NULL DEFAULT 30 CHECK (session_timeout_minutes BETWEEN 5 AND 480),
  default_return_months integer NOT NULL DEFAULT 11 CHECK (default_return_months BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz CHECK (deleted_at IS NULL)
);
INSERT INTO public.bootstrap_state(slot) VALUES (1);
INSERT INTO public.app_settings(slot) VALUES (1);

