-- ==========================================================================
-- ValidaSRI - Row Level Security
--
-- Regla general: un usuario solo ve y escribe datos de las organizaciones a las
-- que pertenece. Los operadores no pueden modificar la organizacion.
-- El worker usa service_role, que omite RLS por diseno de PostgREST.
-- ==========================================================================

-- Helpers ------------------------------------------------------------------
-- SECURITY DEFINER para evitar recursion infinita al consultar
-- organization_members dentro de las politicas de esa misma tabla.

create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.role in ('owner','admin')
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.can_manage_org(uuid) to authenticated;

-- Activacion ---------------------------------------------------------------

alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.validation_batches   enable row level security;
alter table public.validation_items     enable row level security;
alter table public.usage_records        enable row level security;

alter table public.organizations        force row level security;
alter table public.organization_members force row level security;
alter table public.validation_batches   force row level security;
alter table public.validation_items     force row level security;
alter table public.usage_records        force row level security;

-- organizations ------------------------------------------------------------

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

-- Solo owner/admin pueden cambiar la configuracion de la empresa.
drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.can_manage_org(id))
  with check (public.can_manage_org(id));

-- organization_members -----------------------------------------------------

drop policy if exists members_select on public.organization_members;
create policy members_select on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists members_manage on public.organization_members;
create policy members_manage on public.organization_members
  for all to authenticated
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

-- validation_batches -------------------------------------------------------

drop policy if exists batches_select on public.validation_batches;
create policy batches_select on public.validation_batches
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Cualquier miembro (incluido operator) puede crear lotes en SU organizacion.
drop policy if exists batches_insert on public.validation_batches;
create policy batches_insert on public.validation_batches
  for insert to authenticated
  with check (public.is_org_member(organization_id) and created_by = auth.uid());

drop policy if exists batches_update on public.validation_batches;
create policy batches_update on public.validation_batches
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- validation_items ---------------------------------------------------------

drop policy if exists items_select on public.validation_items;
create policy items_select on public.validation_items
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists items_insert on public.validation_items;
create policy items_insert on public.validation_items
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and exists (
      select 1 from public.validation_batches b
      where b.id = batch_id and b.organization_id = validation_items.organization_id
    )
  );

-- Reintentar fallidos: el usuario solo puede reencolar items de su organizacion.
drop policy if exists items_update on public.validation_items;
create policy items_update on public.validation_items
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- usage_records ------------------------------------------------------------

drop policy if exists usage_select on public.usage_records;
create policy usage_select on public.usage_records
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists usage_insert on public.usage_records;
create policy usage_insert on public.usage_records
  for insert to authenticated
  with check (public.is_org_member(organization_id));

-- No se define politica de DELETE en ninguna tabla: el historial y el consumo
-- son inmutables desde la aplicacion.
