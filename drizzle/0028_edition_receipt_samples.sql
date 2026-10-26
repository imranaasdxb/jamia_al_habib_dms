-- Run this entire statement manually as the Neon database owner.
-- Images use the existing private Neon bucket; only the private object key is stored here.
DO $edition_receipt_samples$
BEGIN
  ALTER TABLE public.master_records ADD COLUMN IF NOT EXISTS edition_receipt_photo_key text;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.master_records'::regclass AND conname = 'master_records_edition_receipt_photo_check') THEN
    ALTER TABLE public.master_records ADD CONSTRAINT master_records_edition_receipt_photo_check CHECK (
      edition_receipt_photo_key IS NULL OR (kind = 'EDITION'
        AND edition_receipt_photo_key ~ ('^editions/' || id::text || '/receipt-samples/[0-9a-f-]{36}\.jpg$'))
    );
  END IF;
END;
$edition_receipt_samples$;
