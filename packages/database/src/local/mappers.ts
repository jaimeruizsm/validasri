import type {
  BatchStatus,
  ItemStatus,
  MemberRole,
  Organization,
  OrganizationMember,
  Plan,
  ValidationBatch,
  ValidationItem,
} from '@validasri/shared';

export type SqlRow = Record<string, unknown>;

export const asText = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

export const asNullableText = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

export const asInt = (value: unknown): number => {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const mapOrganization = (row: SqlRow): Organization => ({
  id: asText(row['id']),
  name: asText(row['name']),
  ruc: asNullableText(row['ruc']),
  plan: asText(row['plan']) as Plan,
  monthlyLimit: asInt(row['monthly_limit']),
  createdAt: asText(row['created_at']),
  updatedAt: asText(row['updated_at']),
});

export const mapMember = (row: SqlRow): OrganizationMember => ({
  id: asText(row['id']),
  organizationId: asText(row['organization_id']),
  userId: asText(row['user_id']),
  email: asText(row['email']),
  role: asText(row['role']) as MemberRole,
  createdAt: asText(row['created_at']),
});

export const mapBatch = (row: SqlRow): ValidationBatch => ({
  id: asText(row['id']),
  organizationId: asText(row['organization_id']),
  createdBy: asText(row['created_by']),
  createdByEmail: asNullableText(row['created_by_email']),
  originalFilename: asText(row['original_filename']),
  status: asText(row['status']) as BatchStatus,
  totalLines: asInt(row['total_lines']),
  totalValid: asInt(row['total_valid']),
  totalInvalid: asInt(row['total_invalid']),
  totalDuplicates: asInt(row['total_duplicates']),
  totalProcessed: asInt(row['total_processed']),
  totalAuthorized: asInt(row['total_authorized']),
  totalAnnulled: asInt(row['total_annulled']),
  totalNotAuthorized: asInt(row['total_not_authorized']),
  totalNotFound: asInt(row['total_not_found']),
  totalErrors: asInt(row['total_errors']),
  startedAt: asNullableText(row['started_at']),
  completedAt: asNullableText(row['completed_at']),
  createdAt: asText(row['created_at']),
  updatedAt: asText(row['updated_at']),
});

export const mapItem = (row: SqlRow): ValidationItem => ({
  id: asText(row['id']),
  organizationId: asText(row['organization_id']),
  batchId: asText(row['batch_id']),
  accessKey: asText(row['access_key']),
  status: asText(row['status']) as ItemStatus,
  sriStatusRaw: asNullableText(row['sri_status_raw']),
  documentType: asNullableText(row['document_type']),
  issuerRuc: asNullableText(row['issuer_ruc']),
  authorizationDate: asNullableText(row['authorization_date']),
  authorizationNumber: asNullableText(row['authorization_number']),
  environment: asNullableText(row['environment']),
  errorCode: asNullableText(row['error_code']),
  errorMessage: asNullableText(row['error_message']),
  attemptCount: asInt(row['attempt_count']),
  nextAttemptAt: asNullableText(row['next_attempt_at']),
  lockedAt: asNullableText(row['locked_at']),
  processedAt: asNullableText(row['processed_at']),
  createdAt: asText(row['created_at']),
  updatedAt: asText(row['updated_at']),
});
