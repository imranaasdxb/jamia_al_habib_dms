-- Run this whole file manually after 0005_book_stock.sql. No existing stock is changed by this migration.
BEGIN;
CREATE SEQUENCE IF NOT EXISTS public.assignment_number_seq;
CREATE TABLE IF NOT EXISTS public.book_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE DEFAULT ('ASN-' || extract(year from current_date)::text || '-' || lpad(nextval('public.assignment_number_seq')::text, 6, '0')),
  assignment_date date NOT NULL, expected_return_date date NOT NULL CHECK (expected_return_date >= assignment_date),
  collector_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  collector_name text NOT NULL, collector_code text NOT NULL, phone text NOT NULL, whatsapp text NOT NULL, address text NOT NULL,
  areas jsonb NOT NULL CHECK (jsonb_typeof(areas) = 'array' AND jsonb_array_length(areas) BETWEEN 1 AND 50),
  book_ids jsonb NOT NULL CHECK (jsonb_typeof(book_ids) = 'array' AND jsonb_array_length(book_ids) BETWEEN 1 AND 150),
  remarks text NOT NULL DEFAULT '' CHECK (length(remarks) <= 1000), assigned_by_name text NOT NULL,
  operation_id uuid NOT NULL UNIQUE, operation_hash text NOT NULL CHECK (operation_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.book_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id uuid NOT NULL REFERENCES public.book_assignments(id) ON DELETE RESTRICT,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
  closed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(assignment_id, book_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS book_cases_open_book_idx ON public.book_cases(book_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS book_assignments_collector_idx ON public.book_assignments(collector_id);
CREATE INDEX IF NOT EXISTS book_assignments_return_idx ON public.book_assignments(expected_return_date);
CREATE INDEX IF NOT EXISTS book_cases_assignment_idx ON public.book_cases(assignment_id);
ALTER TABLE public.book_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.book_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_cases FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.book_assignments, public.book_cases FROM PUBLIC, dms_runtime;
GRANT SELECT, INSERT ON public.book_assignments TO dms_runtime;
GRANT SELECT ON public.book_cases TO dms_runtime;
GRANT USAGE ON SEQUENCE public.assignment_number_seq TO dms_runtime;
DROP POLICY IF EXISTS assignments_read ON public.book_assignments;
CREATE POLICY assignments_read ON public.book_assignments FOR SELECT TO dms_runtime USING (current_setting('app.role', true) IN ('ADMIN','STAFF'));
DROP POLICY IF EXISTS assignments_create ON public.book_assignments;
CREATE POLICY assignments_create ON public.book_assignments FOR INSERT TO dms_runtime WITH CHECK (
  current_setting('app.role', true) IN ('ADMIN','STAFF') AND created_by::text = current_setting('app.person_id', true)
  AND updated_by = created_by AND deleted_at IS NULL);
DROP POLICY IF EXISTS cases_read ON public.book_cases;
CREATE POLICY cases_read ON public.book_cases FOR SELECT TO dms_runtime USING (current_setting('app.role', true) IN ('ADMIN','STAFF'));
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY['book_assignments','book_cases'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS owner_maintenance ON public.%I', target);
    EXECUTE format('CREATE POLICY owner_maintenance ON public.%I TO %I USING (true) WITH CHECK (true)', target, current_user);
  END LOOP;
END $$;

-- This narrowly scoped trigger is the only application path allowed to allocate stock.
-- The runtime role receives no UPDATE privilege on books and no writes to cases.
CREATE OR REPLACE FUNCTION public.prepare_book_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE actor public.people; fundraiser public.people; details public.collectors; canonical_areas jsonb; area_count integer;
BEGIN
  SELECT * INTO actor FROM public.people WHERE id = nullif(current_setting('app.person_id', true), '')::uuid
    AND auth_user_id = nullif(current_setting('app.auth_user_id', true), '')::uuid AND role IN ('ADMIN','STAFF')
    AND role = current_setting('app.role', true) AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Access denied'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dms:collector:' || NEW.collector_id::text));
  SELECT * INTO fundraiser FROM public.people WHERE id = NEW.collector_id AND role = 'COLLECTOR'
    AND status = 'ACTIVE' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fundraiser is not active'; END IF;
  SELECT * INTO details FROM public.collectors WHERE person_id = NEW.collector_id AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fundraiser details missing'; END IF;
  IF NEW.assignment_date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'Assignment date cannot be in the future'; END IF;
  IF jsonb_typeof(NEW.areas) <> 'array' OR jsonb_array_length(NEW.areas) NOT BETWEEN 1 AND 50
    OR jsonb_typeof(NEW.book_ids) <> 'array' OR jsonb_array_length(NEW.book_ids) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'Invalid selection'; END IF;
  IF (SELECT count(DISTINCT value::uuid) FROM jsonb_array_elements_text(NEW.book_ids)) <> jsonb_array_length(NEW.book_ids)
    THEN RAISE EXCEPTION 'Duplicate book'; END IF;
  PERFORM 1 FROM public.master_records WHERE id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(NEW.areas)) ORDER BY id FOR SHARE;
  SELECT count(*), jsonb_agg(jsonb_build_object('id', id, 'nameEn', name_en, 'nameUr', name_ur) ORDER BY name_en, id)
    INTO area_count, canonical_areas FROM public.master_records
    WHERE id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(NEW.areas)) AND kind = 'AREA' AND active AND deleted_at IS NULL;
  IF area_count <> jsonb_array_length(NEW.areas) THEN RAISE EXCEPTION 'Select active collection areas'; END IF;
  NEW.areas := canonical_areas; NEW.collector_name := fundraiser.full_name; NEW.collector_code := details.code;
  NEW.phone := coalesce(fundraiser.phone, ''); NEW.whatsapp := details.whatsapp;
  NEW.address := concat_ws(', ', details.village, details.post_office, nullif(details.block,''), details.district, details.state, details.pin);
  NEW.assigned_by_name := actor.full_name; NEW.created_by := actor.id; NEW.updated_by := actor.id;
  NEW.created_at := now(); NEW.updated_at := now(); NEW.deleted_at := NULL;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.allocate_assignment_books() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE stock public.books; found_count integer := 0;
BEGIN
  FOR stock IN SELECT * FROM public.books WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(NEW.book_ids)) ORDER BY id FOR UPDATE LOOP
    IF stock.status <> 'IN_STOCK' OR stock.deleted_at IS NOT NULL OR stock.stock_date > NEW.assignment_date
      THEN RAISE EXCEPTION 'Book % is unavailable for this date', stock.book_number USING ERRCODE = 'P0001'; END IF;
    INSERT INTO public.book_cases(assignment_id, book_id) VALUES (NEW.id, stock.id);
    UPDATE public.books SET status = 'ASSIGNED', updated_by = NEW.created_by, updated_at = now() WHERE id = stock.id;
    found_count := found_count + 1;
  END LOOP;
  IF found_count <> jsonb_array_length(NEW.book_ids) THEN RAISE EXCEPTION 'Book selection changed'; END IF;
  INSERT INTO public.activity_log(actor_id, action, resource, record_id, new_values, reason, created_by, updated_by)
    VALUES (NEW.created_by, 'INSERT', 'book_assignments', NEW.id::text, to_jsonb(NEW), 'Book assignment', NEW.created_by, NEW.created_by);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prepare_book_assignment ON public.book_assignments;
CREATE TRIGGER prepare_book_assignment BEFORE INSERT ON public.book_assignments FOR EACH ROW EXECUTE FUNCTION public.prepare_book_assignment();
DROP TRIGGER IF EXISTS allocate_assignment_books ON public.book_assignments;
CREATE TRIGGER allocate_assignment_books AFTER INSERT ON public.book_assignments FOR EACH ROW EXECUTE FUNCTION public.allocate_assignment_books();
REVOKE ALL ON FUNCTION public.prepare_book_assignment(), public.allocate_assignment_books() FROM PUBLIC, dms_runtime;

CREATE OR REPLACE FUNCTION public.assignment_return_months() RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.people WHERE id = nullif(current_setting('app.person_id', true), '')::uuid
    AND auth_user_id = nullif(current_setting('app.auth_user_id', true), '')::uuid AND role IN ('ADMIN','STAFF')
    AND status = 'ACTIVE' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Access denied'; END IF;
  RETURN coalesce((SELECT default_return_months FROM public.app_settings WHERE slot = 1 AND deleted_at IS NULL), 11);
END $$;
REVOKE ALL ON FUNCTION public.assignment_return_months() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assignment_return_months() TO dms_runtime;

CREATE OR REPLACE FUNCTION public.audit_book_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.activity_log(actor_id, action, resource, record_id, old_values, new_values, reason)
  VALUES (nullif(current_setting('app.person_id', true), '')::uuid, TG_OP, 'books', NEW.id::text,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW),
    CASE WHEN TG_OP = 'UPDATE' AND OLD.status = 'IN_STOCK' AND NEW.status = 'ASSIGNED' THEN 'Book assignment' ELSE 'Book stock entry' END);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_book_stock() FROM PUBLIC;
COMMIT;
