BEGIN;

-- PAN is stored in book_receipts.data alongside the other donor fields.
-- Missing PAN in existing receipts remains valid; no records are rewritten.
CREATE OR REPLACE FUNCTION public.validate_receipt_data(d jsonb, complete boolean, start_day date, end_day date, token_paise integer) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE head jsonb; master public.master_records; category public.master_records; head_total bigint := 0; amount bigint;
BEGIN
  IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR coalesce(d->>'status','') NOT IN ('VALID','CANCELLED','TORN','LOST','BLANK')
    OR jsonb_typeof(d->'heads') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid receipt'; END IF;
  IF jsonb_array_length(d->'heads') > 20 THEN RAISE EXCEPTION 'Invalid receipt'; END IF;
  IF coalesce(d->>'date','') <> '' AND ((d->>'date')::date < start_day OR (d->>'date')::date > end_day) THEN RAISE EXCEPTION 'Receipt date outside assignment and return dates'; END IF;
  IF coalesce(d->>'pan','') <> '' AND d->>'pan' !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' THEN RAISE EXCEPTION 'Invalid PAN'; END IF;
  amount := (d->>'amountPaise')::bigint;
  IF amount < 0 OR amount > 999999999999 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF d->>'status' <> 'VALID' AND coalesce(amount,0) <> 0 THEN RAISE EXCEPTION 'Money-bearing receipts cannot be blank or cancelled'; END IF;
  FOR head IN SELECT value FROM jsonb_array_elements(d->'heads') LOOP
    IF (head->>'amountPaise')::bigint < 0 OR (head->>'amountPaise')::bigint > 999999999999 THEN RAISE EXCEPTION 'Invalid head amount'; END IF;
    IF coalesce(head->>'categoryId','') <> '' THEN
      SELECT * INTO category FROM public.master_records WHERE id = (head->>'categoryId')::uuid AND kind = 'DONATION_CATEGORY' AND deleted_at IS NULL FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid category'; END IF;
    END IF;
    IF coalesce(head->>'headId','') <> '' THEN
      SELECT * INTO master FROM public.master_records WHERE id = (head->>'headId')::uuid AND kind = 'DONATION_HEAD' AND deleted_at IS NULL FOR SHARE;
      IF NOT FOUND OR master.parent_id IS DISTINCT FROM nullif(head->>'categoryId','')::uuid THEN RAISE EXCEPTION 'Head does not belong to category'; END IF;
      IF complete AND master.needs_detail AND length(btrim(coalesce(head->>'purpose',''))) = 0 THEN RAISE EXCEPTION 'Other donation head requires a detail'; END IF;
    END IF;
    IF complete AND d->>'status' = 'VALID' AND (coalesce(head->>'categoryId','') = '' OR coalesce(head->>'headId','') = '' OR coalesce((head->>'amountPaise')::bigint,0) <= 0)
      THEN RAISE EXCEPTION 'Complete each donation head'; END IF;
    head_total := head_total + coalesce((head->>'amountPaise')::bigint,0);
  END LOOP;
  IF NOT complete THEN RETURN; END IF;
  IF coalesce(d->>'date','') = '' THEN RAISE EXCEPTION 'Receipt date required'; END IF;
  IF d->>'status' <> 'VALID' THEN
    IF amount IS NULL OR amount <> 0 OR jsonb_array_length(d->'heads') <> 0 THEN RAISE EXCEPTION 'Non-valid receipts must have zero amount and no donation heads'; END IF;
    PERFORM 1 FROM public.master_records WHERE id = nullif(d->>'reasonId','')::uuid AND kind = 'RECEIPT_REASON' AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Receipt reason required'; END IF;
    RETURN;
  END IF;
  IF amount IS NULL OR amount <= 0 OR length(btrim(coalesce(d->>'amountWords',''))) = 0 OR length(btrim(coalesce(d->>'receiverName',''))) < 2
    OR coalesce(d->>'paymentMode','') NOT IN ('CASH','DIGITAL','CHEQUE') THEN RAISE EXCEPTION 'Receipt amount and receiver details required'; END IF;
  IF NOT coalesce((d->>'anonymous')::boolean,false) AND (length(btrim(coalesce(d->>'donorName',''))) < 2
    OR coalesce(d->>'phone','') !~ '^[6-9][0-9]{9}$') THEN RAISE EXCEPTION 'Donor name and mobile required'; END IF;
  IF coalesce(d->>'phone','') <> '' AND d->>'phone' !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Invalid donor phone'; END IF;
  IF length(btrim(coalesce(d->>'village',''))) < 2 THEN RAISE EXCEPTION 'Donor village required'; END IF;
  IF coalesce(d->>'pin','') <> '' AND d->>'pin' !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'Invalid PIN'; END IF;
  IF token_paise IS NOT NULL AND amount <> token_paise THEN RAISE EXCEPTION 'Token receipt amount is fixed'; END IF;
  IF jsonb_array_length(d->'heads') = 0 OR head_total <> amount THEN RAISE EXCEPTION 'Head total must equal receipt amount'; END IF;
  IF d->>'paymentMode' = 'DIGITAL' THEN
    IF upper(btrim(coalesce(d->>'reference',''))) !~ '^[A-Z0-9/_-]{3,100}$' THEN RAISE EXCEPTION 'UTR required'; END IF;
    PERFORM 1 FROM public.master_records WHERE id = nullif(d->>'upiAppId','')::uuid AND kind = 'UPI_APP' AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'UPI app required'; END IF;
  ELSIF d->>'paymentMode' = 'CHEQUE' THEN
    IF coalesce(d->>'chequeNumber','') !~ '^[0-9]{6}$' OR length(btrim(coalesce(d->>'branch',''))) < 2 OR coalesce(d->>'chequeDate','') = ''
      THEN RAISE EXCEPTION 'Cheque details required'; END IF;
    PERFORM 1 FROM public.master_records WHERE id = nullif(d->>'bankId','')::uuid AND kind = 'BANK' AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cheque bank required'; END IF;
    PERFORM (d->>'chequeDate')::date;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.validate_receipt_data(jsonb, boolean, date, date, integer) FROM PUBLIC, dms_runtime;

-- Runs after the existing BEFORE guard, preserving identity, permissions,
-- master validation, approval checks and the parent's serialization lock.
CREATE OR REPLACE FUNCTION public.guard_receipt_collection_limits() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE returned public.book_returns; entered_total bigint; entered_cash bigint; entered_digital bigint;
  amount bigint := 0;
BEGIN
  SELECT * INTO returned FROM public.book_returns WHERE id = NEW.return_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book unavailable'; END IF;
  IF NEW.status = 'VALID' THEN
    amount := coalesce(NEW.amount_paise,0);
    IF TG_OP = 'INSERT' THEN
      IF jsonb_array_length(NEW.data->'heads') > 1 THEN RAISE EXCEPTION 'Choose one donation head'; END IF;
    ELSIF NEW.data IS DISTINCT FROM OLD.data AND jsonb_array_length(NEW.data->'heads') > 1 THEN
      RAISE EXCEPTION 'Choose one donation head';
    END IF;
  END IF;
  SELECT coalesce(sum(amount_paise),0),
    coalesce(sum(amount_paise) FILTER (WHERE data->>'paymentMode' = 'CASH'),0),
    coalesce(sum(amount_paise) FILTER (WHERE data->>'paymentMode' = 'DIGITAL'),0)
    INTO entered_total, entered_cash, entered_digital FROM public.book_receipts
    WHERE return_id = NEW.return_id AND id <> NEW.id AND status = 'VALID' AND deleted_at IS NULL;
  IF entered_cash + CASE WHEN NEW.status = 'VALID' AND NEW.data->>'paymentMode' = 'CASH' THEN amount ELSE 0 END > returned.cash_paise THEN
    RAISE EXCEPTION 'RECEIPT_CASH_LIMIT';
  END IF;
  IF entered_digital + CASE WHEN NEW.status = 'VALID' AND NEW.data->>'paymentMode' = 'DIGITAL' THEN amount ELSE 0 END > returned.digital_paise THEN
    RAISE EXCEPTION 'RECEIPT_DIGITAL_LIMIT';
  END IF;
  IF entered_total + amount > returned.total_paise THEN RAISE EXCEPTION 'RECEIPT_TOTAL_LIMIT'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_receipt_collection_limits ON public.book_receipts;
CREATE TRIGGER zz_receipt_collection_limits BEFORE INSERT OR UPDATE ON public.book_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_collection_limits();
REVOKE ALL ON FUNCTION public.guard_receipt_collection_limits() FROM PUBLIC, dms_runtime;

COMMIT;
