-- ==========================================================================
-- ValidaSRI - datos iniciales (opcional)
--
-- Ejecutar DESPUES de crear el primer usuario en Supabase Auth
-- (Dashboard > Authentication > Users > Add user).
--
-- Reemplaza el correo por el del usuario que acabas de crear.
-- ==========================================================================

do $$
declare
  v_email text := 'demo@validasri.ec';   -- <-- CAMBIAR
  v_org_name text := 'Empresa Demostracion';
  v_org_ruc  text := '0991234567001';    -- RUC ficticio, no corresponde a ningun contribuyente
  v_user_id uuid;
  v_org_id  uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(v_email);
  if v_user_id is null then
    raise exception 'No existe el usuario % en auth.users. Crealo primero en el dashboard.', v_email;
  end if;

  select id into v_org_id from public.organizations where name = v_org_name;
  if v_org_id is null then
    insert into public.organizations (name, ruc, plan, monthly_limit)
    values (v_org_name, v_org_ruc, 'profesional', 10000)
    returning id into v_org_id;
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner')
  on conflict (organization_id, user_id) do update set role = 'owner';

  raise notice 'Organizacion % lista para el usuario %', v_org_id, v_email;
end $$;
