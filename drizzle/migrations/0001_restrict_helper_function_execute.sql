REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_manage_org(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;