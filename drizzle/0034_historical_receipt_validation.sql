-- Run this entire file as the Neon database owner through COMMIT.
-- Requires the existing historical-import, partial-finalization and role setup.
BEGIN;

CREATE OR REPLACE FUNCTION public.receipt_is_imported_summary(target_receipt uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $historical_origin$
  SELECT EXISTS (
    SELECT 1 FROM public.book_receipts receipt
    JOIN public.legacy_collection_imports imported ON imported.receipt_id=receipt.id
    JOIN public.book_returns returned ON returned.id=receipt.return_id AND returned.deleted_at IS NULL
    WHERE receipt.id=target_receipt AND receipt.deleted_at IS NULL
      AND imported.status='IMPORTED' AND imported.source_key LIKE 'Book3_v1:Sheet1:%'
      AND imported.return_id=receipt.return_id AND imported.book_id=receipt.book_id
      AND returned.book_id=receipt.book_id AND imported.assignment_id=returned.assignment_id
      AND imported.assumed_receipt_number=receipt.receipt_number
      AND public.receipt_has_historical_import(receipt.return_id)
  );
$historical_origin$;
REVOKE ALL ON FUNCTION public.receipt_is_imported_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receipt_is_imported_summary(uuid) TO dms_runtime;

-- Unknown historical donor and donation-head details may remain empty.
-- Supplied values still pass the existing format, master relationship and amount checks.
CREATE OR REPLACE FUNCTION public.validate_historical_receipt_data(d jsonb, start_day date, end_day date)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public AS $historical_data$
DECLARE amount bigint; head_total bigint;
BEGIN
  PERFORM public.validate_receipt_data(d,false,start_day,end_day,NULL);
  IF d->>'status'<>'VALID' THEN
    -- Cancellation and damage records retain their reason and zero-amount requirements.
    PERFORM public.validate_receipt_data(d,true,start_day,end_day,NULL);
    RETURN;
  END IF;
  amount:=(d->>'amountPaise')::bigint;
  IF amount IS NULL OR amount<=0 OR coalesce(d->>'paymentMode','') NOT IN ('CASH','DIGITAL','CHEQUE') THEN
    RAISE EXCEPTION 'Historical receipt amount and payment mode are required';
  END IF;
  IF coalesce(d->>'phone','')<>'' AND d->>'phone' !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Invalid donor phone'; END IF;
  IF coalesce(d->>'pin','')<>'' AND d->>'pin' !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'Invalid PIN'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(d->'heads') head WHERE coalesce(head->>'headId','')<>'') THEN
    SELECT coalesce(sum((head->>'amountPaise')::bigint),0) INTO head_total FROM jsonb_array_elements(d->'heads') head;
    IF head_total<>amount THEN RAISE EXCEPTION 'Head total must equal receipt amount'; END IF;
  END IF;
END;
$historical_data$;
REVOKE ALL ON FUNCTION public.validate_historical_receipt_data(jsonb,date,date) FROM PUBLIC,dms_runtime;

-- Patch the installed functions so their current authorization, range locks,
-- version checks, reconciliation, exact commissions and leftover handling are retained.
DO $patch_historical_validation$
DECLARE definition text; patched text;
BEGIN
  IF (SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.book_returns'::regclass)<>current_user::regrole::oid THEN
    RAISE EXCEPTION 'Run this file as the application table owner';
  END IF;
  definition:=pg_catalog.pg_get_functiondef('public.guard_book_receipt()'::regprocedure);
  IF position('public.validate_historical_receipt_data(NEW.data' IN definition)=0 THEN
    patched:=regexp_replace(definition,
      'PERFORM public\.validate_receipt_data\(NEW\.data,[[:space:]]*NEW\.checked,[[:space:]]*start_day,[[:space:]]*returned\.return_date,[[:space:]]*stock\.token_value_paise\);',
      $guard$IF TG_OP='UPDATE' AND public.receipt_is_imported_summary(OLD.id) THEN
    PERFORM public.validate_historical_receipt_data(NEW.data,start_day,returned.return_date);
  ELSE
    PERFORM public.validate_receipt_data(NEW.data,NEW.checked,start_day,returned.return_date,stock.token_value_paise);
  END IF;$guard$, 'i');
    IF patched=definition THEN RAISE EXCEPTION 'Installed receipt save validation differs; no changes committed'; END IF;
    EXECUTE patched;
  END IF;

  definition:=pg_catalog.pg_get_functiondef('public.finalize_receipt_book(uuid,integer)'::regprocedure);
  IF position('public.validate_historical_receipt_data(receipt_row.data' IN definition)=0 THEN
    IF position('IF public.receipt_is_imported_summary(receipt_row.id) THEN' IN definition)=0 THEN
      RAISE EXCEPTION 'Apply 0024_continue_receipts_and_partial_finalize.sql before this file';
    END IF;
    patched:=replace(definition,'IF public.receipt_is_imported_summary(receipt_row.id) THEN',
      $finalize$IF public.receipt_is_imported_summary(receipt_row.id) THEN
      BEGIN
        PERFORM public.validate_historical_receipt_data(receipt_row.data,start_day,returned.return_date);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Incomplete receipt %',receipt_row.receipt_number USING ERRCODE='P0002';
      END;$finalize$);
    EXECUTE patched;
  END IF;
END;
$patch_historical_validation$;
REVOKE ALL ON FUNCTION public.guard_book_receipt() FROM PUBLIC,dms_runtime;
REVOKE ALL ON FUNCTION public.finalize_receipt_book(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_receipt_book(uuid,integer) TO dms_runtime;

COMMIT;
