-- Run this entire file in Neon as the database owner, through COMMIT.
-- New profiles: JAH001, JAH002, ... JAH999, JAH1000.
-- Existing profile codes and database UUIDs remain unchanged.
BEGIN;

LOCK TABLE public.collectors IN SHARE ROW EXCLUSIVE MODE;
CREATE SEQUENCE IF NOT EXISTS public.fundraiser_jah_number_seq
  AS bigint START WITH 1 MINVALUE 1 NO CYCLE;

-- A first installation starts at 001. Re-running never reuses issued JAH numbers.
DO $$
DECLARE
  existing_max bigint;
  sequence_value bigint;
  sequence_used boolean;
  next_number bigint;
BEGIN
  SELECT coalesce(max(substring(code FROM 4)::bigint), 0)
    INTO existing_max FROM public.collectors WHERE code ~ '^JAH[0-9]+$';
  SELECT last_value, is_called INTO sequence_value, sequence_used
    FROM public.fundraiser_jah_number_seq;
  next_number := greatest(existing_max + 1,
    sequence_value + CASE WHEN sequence_used THEN 1 ELSE 0 END);
  EXECUTE format('ALTER SEQUENCE public.fundraiser_jah_number_seq RESTART WITH %s', next_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.next_fundraiser_profile_code()
RETURNS text
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public
AS $$
DECLARE
  profile_number text;
BEGIN
  profile_number := nextval('public.fundraiser_jah_number_seq'::regclass)::text;
  RETURN 'JAH' || lpad(profile_number, greatest(3, length(profile_number)), '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_fundraiser_profile_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_fundraiser_profile_code() TO dms_runtime;
GRANT USAGE ON SEQUENCE public.fundraiser_jah_number_seq TO dms_runtime;

ALTER TABLE public.collectors ALTER COLUMN code
  SET DEFAULT public.next_fundraiser_profile_code();

COMMIT;
