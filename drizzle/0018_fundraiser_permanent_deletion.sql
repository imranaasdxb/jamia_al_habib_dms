-- Run this entire file in Neon as the database owner, through COMMIT.
-- Only record-only Fundraisers can be deleted. Existing foreign keys protect linked history.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_collector_profile(p_id uuid, p_version timestamptz)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target public.people%ROWTYPE;
  detail public.collectors%ROWTYPE;
  deleting_actor_id uuid;
  photo_keys jsonb;
BEGIN
  deleting_actor_id := nullif(current_setting('app.person_id', true), '')::uuid;
  IF current_setting('app.role', true) IS DISTINCT FROM 'ADMIN'
    OR NOT EXISTS (
      SELECT 1 FROM public.people
      WHERE id = deleting_actor_id AND role = 'ADMIN' AND status = 'ACTIVE' AND deleted_at IS NULL
        AND auth_user_id::text = current_setting('app.auth_user_id', true)
      FOR SHARE
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator access required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dms:collector:' || p_id::text));
  SELECT * INTO target FROM public.people
    WHERE id = p_id AND role = 'COLLECTOR' AND auth_user_id IS NULL AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P2101', MESSAGE = 'Fundraiser not found';
  END IF;
  SELECT * INTO detail FROM public.collectors WHERE person_id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P2101', MESSAGE = 'Fundraiser details not found';
  END IF;
  IF p_version IS NULL OR date_trunc('milliseconds', target.updated_at) IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P2102', MESSAGE = 'Fundraiser changed; refresh before deleting';
  END IF;

  SELECT coalesce(jsonb_agg(DISTINCT image_key), '[]'::jsonb) INTO photo_keys
    FROM (
      SELECT target.profile_photo_key AS image_key
      UNION ALL
      SELECT proposed_photo_key FROM public.collector_edit_requests WHERE collector_id = p_id
    ) images
    WHERE image_key IS NOT NULL AND image_key LIKE 'profiles/' || p_id::text || '/%';

  DELETE FROM public.collector_edit_requests WHERE collector_id = p_id;
  DELETE FROM public.collectors WHERE person_id = p_id;
  DELETE FROM public.people WHERE id = p_id;

  -- Keep the append-only audit trail; do not copy the deleted profile into another record.
  INSERT INTO public.activity_log(actor_id, action, resource, record_id, reason)
    VALUES (deleting_actor_id, 'DELETE', 'people', p_id::text, 'Permanent fundraiser profile deletion');

  RETURN jsonb_build_object('id', p_id, 'photoKeys', photo_keys);
EXCEPTION
  WHEN foreign_key_violation THEN
    -- The exception rolls back every deletion in this function.
    RAISE EXCEPTION USING ERRCODE = 'P2103', MESSAGE = 'Fundraiser has linked records and cannot be deleted';
END;
$$;

REVOKE ALL ON FUNCTION public.delete_collector_profile(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_collector_profile(uuid, timestamptz) FROM dms_runtime;
GRANT EXECUTE ON FUNCTION public.delete_collector_profile(uuid, timestamptz) TO dms_runtime;

COMMIT;
