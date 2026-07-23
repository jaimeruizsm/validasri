-- ==========================================================================
-- ValidaSRI - datos del emisor extraidos del XML del comprobante
--
-- El servicio de autorizacion del SRI devuelve el XML firmado, del que se
-- extraen la razon social, el nombre comercial y el importe total.
-- ==========================================================================

alter table public.validation_items
  add column if not exists issuer_name  text,
  add column if not exists trade_name   text,
  add column if not exists total_amount text;

-- Se reemplaza record_item_result para persistir los nuevos campos.
drop function if exists public.record_item_result(
  uuid, item_status, text, text, text, timestamptz, text, text, text, text, jsonb
);

create or replace function public.record_item_result(
  p_id uuid,
  p_status item_status,
  p_sri_status_raw text,
  p_document_type text,
  p_issuer_ruc text,
  p_issuer_name text,
  p_trade_name text,
  p_total_amount text,
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
    issuer_name = p_issuer_name,
    trade_name = p_trade_name,
    total_amount = p_total_amount,
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

revoke all on function public.record_item_result(
  uuid, item_status, text, text, text, text, text, text, timestamptz, text, text, text, text, jsonb
) from public, anon, authenticated;
