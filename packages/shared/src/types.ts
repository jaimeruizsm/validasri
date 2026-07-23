import type { BatchStatus, ItemStatus, MemberRole } from './statuses';
import type { Plan } from './plans';

export interface Organization {
  id: string;
  name: string;
  ruc: string | null;
  plan: Plan;
  monthlyLimit: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  role: MemberRole;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
}

export interface SessionContext {
  user: SessionUser;
  organization: Organization;
  role: MemberRole;
}

export interface BatchCounters {
  totalLines: number;
  totalValid: number;
  totalInvalid: number;
  totalDuplicates: number;
  totalProcessed: number;
  totalAuthorized: number;
  totalAnnulled: number;
  totalNotAuthorized: number;
  totalNotFound: number;
  totalErrors: number;
}

export interface ValidationBatch extends BatchCounters {
  id: string;
  organizationId: string;
  createdBy: string;
  createdByEmail: string | null;
  originalFilename: string;
  status: BatchStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationItem {
  id: string;
  organizationId: string;
  batchId: string;
  accessKey: string;
  status: ItemStatus;
  sriStatusRaw: string | null;
  documentType: string | null;
  issuerRuc: string | null;
  /** Razon social del emisor (extraida del XML del comprobante). */
  issuerName: string | null;
  /** Nombre comercial del emisor. */
  tradeName: string | null;
  /** Importe total del comprobante, tal cual lo entrega el SRI. */
  totalAmount: string | null;
  authorizationDate: string | null;
  authorizationNumber: string | null;
  environment: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  nextAttemptAt: string | null;
  lockedAt: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Item con la respuesta cruda incluida. Solo se expone en el servidor. */
export interface ValidationItemWithRaw extends ValidationItem {
  rawResponse: unknown;
}

export interface UsageRecord {
  id: string;
  organizationId: string;
  batchId: string | null;
  quantity: number;
  billingPeriod: string;
  createdAt: string;
}

export interface MonthlyUsage {
  billingPeriod: string;
  used: number;
  limit: number;
  remaining: number;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
