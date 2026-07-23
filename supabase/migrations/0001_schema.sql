-- ==========================================================================
-- ValidaSRI - esquema base
-- Equivalente PostgreSQL del esquema local SQLite
-- (packages/database/src/local/schema.ts). Mantener ambos sincronizados.
-- ==========================================================================

create extension if not exists "pgcrypto";

-- Enums -------------------------------------------------------------------

do $$ begin
  create type batch_status as enum (
    'draft','queued','processing','completed','completed_with_errors','failed','cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type item_status as enum (
    'pending','processing','authorized','not_authorized','annulled',
    'pending_annulment','not_found','invalid','service_error'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_role as enum ('owner','admin','operator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type org_plan as enum ('basico','profesional','empresarial','corporativo');
exception when duplicate_object then null; end $$;

-- Trigger de updated_at ----------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- organizations ------------------------------------------------------------

create table if not exists public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 2 and 120),
  ruc           text check (ruc ~ '^[0-9]{13}$'),
  plan          org_plan not null default 'basico',
  monthly_limit integer not null default 2000 check (monthly_limit >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- organization_members -----------------------------------------------------

create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            member_role not null default 'operator',
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_members_user on public.organization_members(user_id);
create index if not exists idx_members_org  on public.organization_members(organization_id);

-- validation_batches -------------------------------------------------------

create table if not exists public.validation_batches (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  created_by           uuid not null references auth.users(id) on delete restrict,
  original_filename    text not null check (char_length(original_filename) between 1 and 255),
  status               batch_status not null default 'draft',
  total_lines          integer not null default 0 check (total_lines >= 0),
  total_valid          integer not null default 0 check (total_valid >= 0),
  total_invalid        integer not null default 0 check (total_invalid >= 0),
  total_duplicates     integer not null default 0 check (total_duplicates >= 0),
  total_processed      integer not null default 0 check (total_processed >= 0),
  total_authorized     integer not null default 0 check (total_authorized >= 0),
  total_annulled       integer not null default 0 check (total_annulled >= 0),
  total_not_authorized integer not null default 0 check (total_not_authorized >= 0),
  total_not_found      integer not null default 0 check (total_not_found >= 0),
  total_errors         integer not null default 0 check (total_errors >= 0),
  started_at           timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_batches_org
  on public.validation_batches(organization_id, created_at desc);
create index if not exists idx_batches_status on public.validation_batches(status);

drop trigger if exists trg_batches_updated_at on public.validation_batches;
create trigger trg_batches_updated_at
  before update on public.validation_batches
  for each row execute function public.set_updated_at();

-- validation_items ---------------------------------------------------------

create table if not exists public.validation_items (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  batch_id             uuid not null references public.validation_batches(id) on delete cascade,
  access_key           text not null check (access_key ~ '^[0-9]{49}$'),
  status               item_status not null default 'pending',
  sri_status_raw       text,
  document_type        text,
  issuer_ruc           text,
  authorization_date   timestamptz,
  authorization_number text,
  environment          text,
  error_code           text,
  error_message        text,
  attempt_count        integer not null default 0 check (attempt_count >= 0),
  next_attempt_at      timestamptz,
  locked_at            timestamptz,
  processed_at         timestamptz,
  raw_response         jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- evita duplicados dentro del mismo lote
  constraint uq_items_batch_key unique (batch_id, access_key)
);

create index if not exists idx_items_batch  on public.validation_items(batch_id);
create index if not exists idx_items_org    on public.validation_items(organization_id);
create index if not exists idx_items_status on public.validation_items(status);
create index if not exists idx_items_queue
  on public.validation_items(status, next_attempt_at)
  where status = 'pending';
create index if not exists idx_items_locked
  on public.validation_items(locked_at) where status = 'processing';
create index if not exists idx_items_ruc on public.validation_items(issuer_ruc);
create index if not exists idx_items_batch_status on public.validation_items(batch_id, status);

drop trigger if exists trg_items_updated_at on public.validation_items;
create trigger trg_items_updated_at
  before update on public.validation_items
  for each row execute function public.set_updated_at();

-- usage_records ------------------------------------------------------------

create table if not exists public.usage_records (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id        uuid references public.validation_batches(id) on delete set null,
  quantity        integer not null check (quantity >= 0),
  billing_period  text not null check (billing_period ~ '^[0-9]{4}-[0-9]{2}$'),
  created_at      timestamptz not null default now()
);

create index if not exists idx_usage_org_period
  on public.usage_records(organization_id, billing_period);

-- Reclamo atomico de items para el worker ----------------------------------
-- SECURITY DEFINER + SKIP LOCKED: dos workers nunca toman la misma clave.

create or replace function public.claim_validation_items(p_limit integer)
returns table (
  id uuid,
  batch_id uuid,
  organization_id uuid,
  access_key text,
  attempt_count integer
)
language sql
security definer
set search_path = public
as $$
  with claimed as (
    select i.id
    from public.validation_items i
    where i.status = 'pending'
      and (i.next_attempt_at is null or i.next_attempt_at <= now())
    order by coalesce(i.next_attempt_at, i.created_at) asc
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update public.validation_items t
  set status = 'processing', locked_at = now()
  from claimed
  where t.id = claimed.id
  returning t.id, t.batch_id, t.organization_id, t.access_key, t.attempt_count;
$$;

revoke all on function public.claim_validation_items(integer) from public, anon, authenticated;

-- Recalculo de contadores del lote -----------------------------------------

create or replace function public.refresh_batch_counters(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer;
begin
  with agg as (
    select
      count(*) filter (where status in ('authorized','not_authorized','annulled',
                                        'pending_annulment','not_found','invalid',
                                        'service_error')) as processed,
      count(*) filter (where status = 'authorized')      as authorized,
      count(*) filter (where status in ('annulled','pending_annulment')) as annulled,
      count(*) filter (where status = 'not_authorized')  as not_authorized,
      count(*) filter (where status = 'not_found')       as not_found,
      count(*) filter (where status in ('service_error','invalid')) as errors
    from public.validation_items where batch_id = p_batch_id
  )
  update public.validation_batches b
  set total_processed      = agg.processed,
      total_authorized     = agg.authorized,
      total_annulled       = agg.annulled,
      total_not_authorized = agg.not_authorized,
      total_not_found      = agg.not_found,
      total_errors         = agg.errors,
      started_at           = coalesce(b.started_at, case when agg.processed > 0 then now() end),
      status               = case when b.status = 'queued' and agg.processed > 0
                                  then 'processing' else b.status end
  from agg
  where b.id = p_batch_id
  returning agg.processed into v_processed;
end;
$$;

revoke all on function public.refresh_batch_counters(uuid) from public, anon, authenticated;
