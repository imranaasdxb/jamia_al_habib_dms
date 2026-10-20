-- After signup and email verification, replace the email below and run manually in Neon.
-- ADMIN is the application's Super Admin role. Managed Neon Auth roles stay separate.
UPDATE public.people
SET role = 'ADMIN', status = 'ACTIVE', updated_at = now()
WHERE email = lower('REPLACE_WITH_YOUR_VERIFIED_EMAIL')
  AND id = (SELECT first_person_id FROM public.bootstrap_state WHERE slot = 1)
  AND auth_user_id IS NOT NULL
  AND deleted_at IS NULL;
