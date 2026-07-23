-- ==========================================================================
-- ValidaSRI - correo del creador denormalizado en el lote
--
-- El driver local obtiene created_by_email uniendo con app_users. En Supabase el
-- correo vive en auth.users (fuera del alcance de PostgREST), por lo que se
-- denormaliza en la propia fila del lote al crearlo. Evita exponer auth.users.
-- ==========================================================================

alter table public.validation_batches
  add column if not exists created_by_email text;
