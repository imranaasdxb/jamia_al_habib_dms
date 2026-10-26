-- Run this complete file as the database owner, through COMMIT, after 0024.
-- Read-only location projection: no receipt, version, financial amount or source record is rewritten.
BEGIN;
CREATE OR REPLACE FUNCTION public.receipt_historical_location(target_receipt uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $location$
DECLARE
  original_source jsonb; collection_area text; original_state text; area_state text;
  state_names constant jsonb := '{"andhrapradesh":"Andhra Pradesh","arunachalpradesh":"Arunachal Pradesh","assam":"Assam","bihar":"Bihar","chhattisgarh":"Chhattisgarh","chattisgarh":"Chhattisgarh","goa":"Goa","gujarat":"Gujarat","haryana":"Haryana","himachalpradesh":"Himachal Pradesh","jharkhand":"Jharkhand","karnataka":"Karnataka","kerala":"Kerala","madhyapradesh":"Madhya Pradesh","maharashtra":"Maharashtra","manipur":"Manipur","meghalaya":"Meghalaya","mizoram":"Mizoram","nagaland":"Nagaland","odisha":"Odisha","orissa":"Odisha","punjab":"Punjab","rajasthan":"Rajasthan","sikkim":"Sikkim","tamilnadu":"Tamil Nadu","telangana":"Telangana","tripura":"Tripura","uttarpradesh":"Uttar Pradesh","uttarakhand":"Uttarakhand","uttaranchal":"Uttarakhand","westbengal":"West Bengal","bengal":"West Bengal","andamanandnicobarislands":"Andaman and Nicobar Islands","andamannicobarislands":"Andaman and Nicobar Islands","chandigarh":"Chandigarh","dadraandnagarhavelianddamananddiu":"Dadra and Nagar Haveli and Daman and Diu","dadraandnagarhaveli":"Dadra and Nagar Haveli and Daman and Diu","damananddiu":"Dadra and Nagar Haveli and Daman and Diu","delhi":"Delhi","newdelhi":"Delhi","nctdelhi":"Delhi","delhinct":"Delhi","nctofdelhi":"Delhi","nationalcapitalterritoryofdelhi":"Delhi","jammuandkashmir":"Jammu and Kashmir","jammukashmir":"Jammu and Kashmir","ladakh":"Ladakh","lakshadweep":"Lakshadweep","puducherry":"Puducherry","pondicherry":"Puducherry"}'::jsonb;
BEGIN
  -- Reuse the existing access/provenance check; edited/manual receipts are excluded.
  IF NOT public.receipt_is_imported_summary(target_receipt) THEN RETURN '{}'::jsonb; END IF;
  SELECT imported.source_data INTO original_source FROM public.legacy_collection_imports imported
    WHERE imported.receipt_id=target_receipt AND imported.status='IMPORTED'
      AND imported.source_key LIKE 'Book3_v1:Sheet1:%' ORDER BY imported.source_row LIMIT 1;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  collection_area:=btrim(coalesce(original_source->>'Collection Area',''));
  original_state:=btrim(coalesce(original_source->>'State',''));
  area_state:=state_names->>regexp_replace(lower(collection_area),'[^a-z]','','g');
  original_state:=coalesce(state_names->>regexp_replace(lower(original_state),'[^a-z]','','g'),original_state);
  RETURN jsonb_build_object(
    'district',CASE WHEN area_state IS NOT NULL THEN '' ELSE collection_area END,
    'state',coalesce(area_state,original_state)
  );
END;
$location$;
REVOKE ALL ON FUNCTION public.receipt_historical_location(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receipt_historical_location(uuid) TO dms_runtime;
COMMIT;
