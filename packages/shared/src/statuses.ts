/**
 * Estados internos del sistema. Se mantienen deliberadamente separados del texto
 * exacto devuelto por el SRI (que se conserva en `sri_status_raw`).
 */

export const BATCH_STATUSES = [
  'draft',
  'queued',
  'processing',
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const ITEM_STATUSES = [
  'pending',
  'processing',
  'authorized',
  'not_authorized',
  'annulled',
  'pending_annulment',
  'not_found',
  'invalid',
  'service_error',
] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** Estados en los que un item ya no volvera a consultarse. */
export const TERMINAL_ITEM_STATUSES: readonly ItemStatus[] = [
  'authorized',
  'not_authorized',
  'annulled',
  'pending_annulment',
  'not_found',
  'invalid',
];

export const isTerminalItemStatus = (status: ItemStatus): boolean =>
  TERMINAL_ITEM_STATUSES.includes(status);

export const isFinishedBatchStatus = (status: BatchStatus): boolean =>
  status === 'completed' ||
  status === 'completed_with_errors' ||
  status === 'failed' ||
  status === 'cancelled';

export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  draft: 'Borrador',
  queued: 'En cola',
  processing: 'Procesando',
  completed: 'Completado',
  completed_with_errors: 'Completado con errores',
  failed: 'Fallido',
  cancelled: 'Cancelado',
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  pending: 'Pendiente',
  processing: 'Procesando',
  authorized: 'Autorizado',
  not_authorized: 'No autorizado',
  annulled: 'Anulado',
  pending_annulment: 'Anulacion en proceso',
  not_found: 'No encontrado',
  invalid: 'Clave invalida',
  service_error: 'Error del servicio',
};

export type StatusTone = 'success' | 'danger' | 'warning' | 'neutral' | 'info';

export const BATCH_STATUS_TONES: Record<BatchStatus, StatusTone> = {
  draft: 'neutral',
  queued: 'info',
  processing: 'info',
  completed: 'success',
  completed_with_errors: 'warning',
  failed: 'danger',
  cancelled: 'neutral',
};

export const ITEM_STATUS_TONES: Record<ItemStatus, StatusTone> = {
  pending: 'neutral',
  processing: 'info',
  authorized: 'success',
  not_authorized: 'danger',
  annulled: 'danger',
  pending_annulment: 'warning',
  not_found: 'warning',
  invalid: 'danger',
  service_error: 'danger',
};

export const MEMBER_ROLES = ['owner', 'admin', 'operator'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  operator: 'Operador',
};

/** Solo owner y admin pueden modificar la configuracion de la organizacion. */
export const canManageOrganization = (role: MemberRole): boolean =>
  role === 'owner' || role === 'admin';
