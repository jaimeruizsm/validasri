-- ==========================================================================
-- ValidaSRI - soporte de aplicacion sobre Supabase
--
-- - Tabla de sesiones opacas propias (cookie validasri_session), para reutilizar
--   el mismo modelo de sesion del driver local sin depender del refresco de JWT.
-- - Funciones de agregacion que el query builder de supabase-js no resuelve bien
--   (SUM y GROUP BY). Se ejecutan con la service_role del servidor/worker.
-- ==========================================================================

-- Sesiones -----------------------------------------------------------------
-- Solo la service_role accede a esta tabla: RLS activa y sin politicas = nadie
-- mas puede leerla ni escribirla via PostgREST.

create table if not exists public.app_sessions (
  token      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_sessions_user on public.app_sessions(user_id);
create index if not exists idx_app_sessions_expires on public.app_sessions(expires_at);

alter table public.app_sessions enable row level security;
alter table public.app_sessions force row level security;

-- Consumo mensual acumulado de una organizacion ----------------------------

create or replace function public.monthly_usage(p_org uuid, p_period text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(quantity), 0)::int
  from public.usage_records
  where organization_id = p_org and billing_period = p_period;
$$;

-- Estadisticas del dashboard de una organizacion ---------------------------

create or replace function public.dashboard_stats(p_org uuid, p_period text)
returns table (
  used_this_month integer,
  monthly_limit integer,
  authorized integer,
  annulled integer,
  errors integer,
  total_batches integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.monthly_usage(p_org, p_period) as used_this_month,
    coalesce((select o.monthly_limit from public.organizations o where o.id = p_org), 0) as monthly_limit,
    coalesce(sum(b.total_authorized), 0)::int as authorized,
    coalesce(sum(b.total_annulled), 0)::int   as annulled,
    coalesce(sum(b.total_errors), 0)::int     as errors,
    count(b.id)::int                          as total_batches
  from public.validation_batches b
  where b.organization_id = p_org;
$$;

-- Conteo de items por estado en un lote ------------------------------------

create or replace function public.count_items_by_status(p_org uuid, p_batch uuid)
returns table (status item_status, total integer)
language sql
stable
security definer
set search_path = public
as $$
  select status, count(*)::int as total
  from public.validation_items
  where organization_id = p_org and batch_id = p_batch
  group by status;
$$;

revoke all on function public.monthly_usage(uuid, text) from public, anon, authenticated;
revoke all on function public.dashboard_stats(uuid, text) from public, anon, authenticated;
revoke all on function public.count_items_by_status(uuid, uuid) from public, anon, authenticated;
