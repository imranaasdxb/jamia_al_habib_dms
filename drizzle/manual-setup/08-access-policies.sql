-- Manual setup part 8. Run in numeric order. Stop if any part reports an error.
-- These files contain the same SQL as 0000_auth_foundation.sql; choose one setup method.
CREATE POLICY people_read ON public.people FOR SELECT TO dms_runtime USING (
  deleted_at IS NULL AND (
    auth_user_id = nullif(current_setting('app.auth_user_id', true), '')::uuid
    OR email = current_setting('app.email', true)
    OR current_setting('app.role', true) = 'ADMIN'
  )
);
CREATE POLICY people_create ON public.people FOR INSERT TO dms_runtime WITH CHECK (
  current_setting('app.role', true) = 'ADMIN'
  OR (role = 'STAFF' AND status = 'PENDING' AND auth_user_id IS NULL
    AND email = current_setting('app.email', true)
    AND NOT EXISTS (SELECT 1 FROM public.bootstrap_state WHERE first_person_id IS NOT NULL))
);
CREATE POLICY people_update ON public.people FOR UPDATE TO dms_runtime USING (
  deleted_at IS NULL AND (current_setting('app.role', true) = 'ADMIN'
    OR (email = current_setting('app.email', true)
      AND (auth_user_id IS NULL OR auth_user_id = nullif(current_setting('app.auth_user_id', true), '')::uuid)))
) WITH CHECK (
  current_setting('app.role', true) = 'ADMIN'
  OR (email = current_setting('app.email', true)
    AND auth_user_id = nullif(current_setting('app.auth_user_id', true), '')::uuid)
);
CREATE POLICY bootstrap_read ON public.bootstrap_state FOR SELECT TO dms_runtime USING (true);
CREATE POLICY bootstrap_claim ON public.bootstrap_state FOR UPDATE TO dms_runtime
  USING (first_person_id IS NULL) WITH CHECK (first_person_id IS NOT NULL);
CREATE POLICY settings_read ON public.app_settings FOR SELECT TO dms_runtime USING (deleted_at IS NULL);
CREATE POLICY settings_update ON public.app_settings FOR UPDATE TO dms_runtime
  USING (current_setting('app.role', true) = 'ADMIN')
  WITH CHECK (current_setting('app.role', true) = 'ADMIN');
CREATE POLICY permissions_read ON public.user_permissions FOR SELECT TO dms_runtime USING (
  deleted_at IS NULL AND (person_id::text = current_setting('app.person_id', true)
    OR current_setting('app.role', true) = 'ADMIN')
);
CREATE POLICY permissions_admin ON public.user_permissions FOR ALL TO dms_runtime
  USING (current_setting('app.role', true) = 'ADMIN')
  WITH CHECK (current_setting('app.role', true) = 'ADMIN');
CREATE POLICY sessions_own ON public.app_sessions FOR ALL TO dms_runtime
  USING (person_id::text = current_setting('app.person_id', true))
  WITH CHECK (person_id::text = current_setting('app.person_id', true));
CREATE POLICY rate_limits_runtime ON public.auth_rate_limits FOR ALL TO dms_runtime
  USING (true) WITH CHECK (true);
CREATE POLICY audit_read ON public.activity_log FOR SELECT TO dms_runtime
  USING (current_setting('app.role', true) = 'ADMIN');
CREATE POLICY audit_append ON public.activity_log FOR INSERT TO dms_runtime WITH CHECK (
  actor_id::text = current_setting('app.person_id', true)
);

