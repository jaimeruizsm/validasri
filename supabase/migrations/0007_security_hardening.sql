-- ==========================================================================
-- ValidaSRI - endurecimiento de seguridad (respuesta a los advisors)
--
-- - Fija search_path en el trigger set_updated_at.
-- - Revoca EXECUTE a public/anon en los helpers de RLS (solo authenticated los
--   necesita para evaluar las politicas). Reducen la superficie de la API RPC.
--
-- app_sessions se deja con RLS habilitada y sin politicas a proposito: solo la
-- service_role la usa, y "RLS sin politica" ya deniega todo al resto de roles.
-- ==========================================================================

alter function public.set_updated_at() set search_path = public;

revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.can_manage_org(uuid) from public, anon;
