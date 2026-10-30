-- Run this entire file as the database owner BEFORE the Edition 6 repair SQL.
-- Recorded historical commission is an exact amount; percentage is display-only.
-- Existing amounts remain unchanged. Normal submissions retain their percentage calculation.
-- No grants or row-level security policies are relaxed. All changes are atomic.
BEGIN;
DO $owner$
BEGIN
  IF current_user='dms_runtime' OR
    (SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.book_returns'::regclass)
      <> current_user::regrole::oid THEN
    RAISE EXCEPTION 'Run historical commission setup as the application table owner' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('dms:import:Book3_v1'));
END;
$owner$;

ALTER TABLE public.book_returns ADD COLUMN IF NOT EXISTS historical_commission_paise bigint;
ALTER TABLE public.book_returns DROP CONSTRAINT IF EXISTS book_returns_historical_commission_check;
ALTER TABLE public.book_returns ADD CONSTRAINT book_returns_historical_commission_check
  CHECK (historical_commission_paise IS NULL OR historical_commission_paise BETWEEN 0 AND total_paise);

-- Keep the existing columns, constraints and stored values. A final BEFORE trigger
-- replaces the generated expressions so the exact amount can take precedence.
ALTER TABLE public.book_returns
  ALTER COLUMN commission_paise DROP EXPRESSION IF EXISTS,
  ALTER COLUMN net_paise DROP EXPRESSION IF EXISTS,
  ALTER COLUMN cash_handover_paise DROP EXPRESSION IF EXISTS,
  ALTER COLUMN commission_paise SET DEFAULT 0,
  ALTER COLUMN net_paise SET DEFAULT 0,
  ALTER COLUMN cash_handover_paise SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.calculate_book_return_amounts() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $amounts$
BEGIN
  IF (TG_OP='INSERT' AND NEW.historical_commission_paise IS NOT NULL) OR
    (TG_OP='UPDATE' AND NEW.historical_commission_paise IS DISTINCT FROM OLD.historical_commission_paise) THEN
    IF (SELECT relowner FROM pg_class WHERE oid='public.book_returns'::regclass)
      <> current_user::regrole::oid THEN
      RAISE EXCEPTION 'Historical commission can only be set by the table-owner import' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.historical_commission_paise IS NOT NULL THEN
    IF NEW.historical_commission_paise NOT BETWEEN 0 AND NEW.total_paise THEN
      RAISE EXCEPTION 'Historical commission cannot exceed collected amount' USING ERRCODE='23514';
    END IF;
    NEW.commission_paise:=NEW.historical_commission_paise;
    NEW.commission_basis_points:=CASE WHEN NEW.total_paise=0 THEN 0
      ELSE round(NEW.commission_paise::numeric*10000/NEW.total_paise)::integer END;
  ELSE
    NEW.commission_paise:=round(NEW.total_paise::numeric*NEW.commission_basis_points/1000000)*100;
  END IF;
  NEW.net_paise:=NEW.total_paise-NEW.commission_paise;
  NEW.cash_handover_paise:=NEW.cash_paise-NEW.commission_paise;
  RETURN NEW;
END;
$amounts$;
REVOKE ALL ON FUNCTION public.calculate_book_return_amounts() FROM PUBLIC,dms_runtime;
DROP TRIGGER IF EXISTS zz_calculate_book_return_amounts ON public.book_returns;
CREATE TRIGGER zz_calculate_book_return_amounts BEFORE INSERT OR UPDATE ON public.book_returns
  FOR EACH ROW EXECUTE FUNCTION public.calculate_book_return_amounts();

-- Adapt the installed importer without replacing its current permissions or book matcher.
DO $exact_importer$
DECLARE
  definition text;
  old_basis constant text := $old$        SELECT bp INTO basis_points FROM generate_series(
          greatest(0,floor(total_commission::numeric*10000/total_amount)::integer-1),
          least(10000,ceil(total_commission::numeric*10000/total_amount)::integer+1)
        ) AS candidate(bp)
        WHERE round(total_amount::numeric*bp/1000000)*100=total_commission
        ORDER BY abs(bp-total_commission::numeric*10000/total_amount),bp LIMIT 1;
        IF basis_points IS NULL THEN
          RAISE EXCEPTION 'Exact recorded commission cannot be represented by the current percentage and rupee-rounding rule; manual review required' USING ERRCODE='P3101';
        END IF;$old$;
  old_columns constant text := 'last_used,commission_basis_points,commission_given,';
  old_values constant text := 'END,basis_points,total_commission>0,';
  fragment text;
BEGIN
  definition:=replace(pg_get_functiondef('public.import_book3_collection_drafts(jsonb)'::regprocedure),E'\r\n',E'\n');
  IF position('last_used,commission_basis_points,historical_commission_paise,commission_given,' IN definition)>0 THEN
    RAISE NOTICE 'Exact historical commission importer is already installed';
    RETURN;
  END IF;
  FOREACH fragment IN ARRAY ARRAY[old_basis,old_columns,old_values] LOOP
    IF (length(definition)-length(replace(definition,fragment,'')))/length(fragment)<>1 THEN
      RAISE EXCEPTION 'Installed historical importer differs from the expected version; setup rolled back';
    END IF;
  END LOOP;
  definition:=replace(definition,old_basis,
    '        basis_points:=round(total_commission::numeric*10000/total_amount)::integer;');
  definition:=replace(definition,old_columns,
    'last_used,commission_basis_points,historical_commission_paise,commission_given,');
  definition:=replace(definition,old_values,'END,basis_points,total_commission,total_commission>0,');
  EXECUTE definition;
END;
$exact_importer$;
COMMIT;
