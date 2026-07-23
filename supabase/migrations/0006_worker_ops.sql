-- ==========================================================================
-- ValidaSRI - operaciones del worker y listado de miembros
--
-- Estas funciones reproducen en PostgreSQL las escrituras que el driver local
-- hace en SQLite (incremento atomico de intentos, COALESCE de campos derivados),
-- que el query builder de supabase-js no expresa. Se ejecutan con service_role.
-- ==========================================================================

-- Miembros de la organizacion con su correo (auth.users no es visible via
-- PostgREST, por eso se expone aqui de forma controlada).
create or replace function public.list_org_members(p_org uuid)
returns table (
  id uuid,
  organization_id uuid,
  user_id uuid,
  email text,
  role member_role,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.organization_id, m.user_id, u.email::text, m.role, m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_org
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, u.email;
$$;

-- Persiste el resultado de una consulta al SRI (equivalente al UPDATE del driver
-- local): incrementa attempt_count, conserva tipo/RUC si el resultado no los trae
-- y libera el bloqueo.
create or replace function public.record_item_result(
  p_id uuid,
  p_status item_status,
  p_sri_status_raw text,
  p_document_type text,
  p_issuer_ruc text,
  p_authorization_date timestamptz,
  p_authorization_number text,
  p_environment text,
  p_error_code text,
  p_error_message text,
  p_raw jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.validation_items set
    status = p_status,
    sri_status_raw = p_sri_status_raw,
    document_type = coalesce(p_document_type, document_type),
    issuer_ruc = coalesce(p_issuer_ruc, issuer_ruc),
    authorization_date = p_authorization_date,
    authorization_number = p_authorization_number,
    environment = p_environment,
    error_code = p_error_code,
    error_message = p_error_message,
    raw_response = p_raw,
    attempt_count = attempt_count + 1,
    next_attempt_at = null,
    locked_at = null,
    processed_at = now()
  where id = p_id;
$$;

-- Reprograma un item tras un fallo temporal (backoff): incrementa el intento y
-- lo devuelve a la cola con next_attempt_at en el futuro.
create or replace function public.reschedule_item(
  p_id uuid,
  p_next timestamptz,
  p_code text,
  p_message text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.validation_items set
    status = 'pending',
    attempt_count = attempt_count + 1,
    next_attempt_at = p_next,
    locked_at = null,
    error_code = p_code,
    error_message = p_message
  where id = p_id;
$$;

revoke all on function public.list_org_members(uuid) from public, anon, authenticated;
revoke all on function public.record_item_result(uuid, item_status, text, text, text, timestamptz, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.reschedule_item(uuid, timestamptz, text, text) from public, anon, authenticated;
