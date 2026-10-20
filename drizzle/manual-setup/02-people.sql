-- Manual setup part 2. Run in numeric order. Stop if any part reports an error.
-- These files contain the same SQL as 0000_auth_foundation.sql; choose one setup method.
CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES neon_auth."user"(id) ON DELETE RESTRICT,
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 100),
  email text UNIQUE CHECK (email = lower(btrim(email))),
  phone text UNIQUE CHECK (phone ~ '^[6-9][0-9]{9}$'),
  role text NOT NULL DEFAULT 'STAFF' CHECK (role IN ('ADMIN', 'STAFF', 'COLLECTOR')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'INACTIVE', 'BLOCKED')),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ur')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CHECK (role <> 'COLLECTOR' OR auth_user_id IS NULL),
  CHECK (role = 'COLLECTOR' OR email IS NOT NULL)
);
CREATE INDEX people_role_status_idx ON public.people(role, status) WHERE deleted_at IS NULL;
CREATE INDEX people_name_idx ON public.people(full_name);
CREATE INDEX people_created_by_idx ON public.people(created_by);
CREATE INDEX people_updated_by_idx ON public.people(updated_by);

