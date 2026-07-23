import type {
  BatchStatus,
  ItemStatus,
  MemberRole,
  Organization,
  OrganizationMember,
  Paginated,
  ValidationBatch,
  ValidationItem,
} from '@validasri/shared';

export interface BatchListQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  status?: BatchStatus | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export interface ItemListQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  status?: ItemStatus | undefined;
  documentType?: string | undefined;
  sortBy: 'access_key' | 'status' | 'issuer_ruc' | 'authorization_date' | 'processed_at' | 'created_at';
  sortDir: 'asc' | 'desc';
}

export type ItemFilters = Omit<ItemListQuery, 'page' | 'pageSize'>;

export interface CreateBatchInput {
  organizationId: string;
  createdBy: string;
  /**
   * Correo del creador. El driver Supabase lo denormaliza en la fila del lote
   * (auth.users no es accesible via PostgREST); el driver local lo ignora porque
   * lo obtiene uniendo con app_users.
   */
  createdByEmail?: string | undefined;
  originalFilename: string;
  totalLines: number;
  totalInvalid: number;
  totalDuplicates: number;
  accessKeys: string[];
}

export interface Membership {
  organization: Organization;
  role: MemberRole;
}

export interface DashboardStats {
  usedThisMonth: number;
  monthlyLimit: number;
  authorized: number;
  annulled: number;
  errors: number;
  totalBatches: number;
}

/** Item entregado al worker tras reclamarlo. */
export interface ClaimedItem {
  id: string;
  batchId: string;
  organizationId: string;
  accessKey: string;
  attemptCount: number;
}

/** Resultado normalizado que el worker persiste para un item. */
export interface ItemResult {
  status: ItemStatus;
  sriStatusRaw: string | null;
  documentType: string | null;
  issuerRuc: string | null;
  authorizationDate: string | null;
  authorizationNumber: string | null;
  environment: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  rawResponse: unknown;
}

/**
 * Contrato unico de acceso a datos. Existen dos implementaciones intercambiables
 * (`local` sobre SQLite y `supabase` sobre PostgreSQL) seleccionadas por
 * `DATA_PROVIDER`. Todo metodo de lectura o escritura de datos de negocio exige
 * `organizationId`: es la segunda barrera de aislamiento, ademas de RLS.
 */
export interface ValidaSriRepository {
  // --- Organizaciones y miembros ---
  getMembership(userId: string, organizationId?: string): Promise<Membership | null>;
  listMembers(organizationId: string): Promise<OrganizationMember[]>;
  updateOrganization(
    organizationId: string,
    input: { name: string; ruc: string | null },
  ): Promise<Organization>;

  // --- Consumo mensual ---
  getMonthlyUsage(organizationId: string, billingPeriod: string): Promise<number>;
  recordUsage(input: {
    organizationId: string;
    batchId: string;
    quantity: number;
    billingPeriod: string;
  }): Promise<void>;

  // --- Lotes ---
  createBatch(input: CreateBatchInput): Promise<ValidationBatch>;
  getBatch(organizationId: string, batchId: string): Promise<ValidationBatch | null>;
  listBatches(organizationId: string, query: BatchListQuery): Promise<Paginated<ValidationBatch>>;
  getDashboardStats(organizationId: string, billingPeriod: string): Promise<DashboardStats>;

  // --- Items ---
  listItems(
    organizationId: string,
    batchId: string,
    query: ItemListQuery,
  ): Promise<Paginated<ValidationItem>>;
  listItemsForExport(
    organizationId: string,
    batchId: string,
    filters: ItemFilters,
  ): Promise<ValidationItem[]>;
  countItemsByStatus(
    organizationId: string,
    batchId: string,
  ): Promise<Partial<Record<ItemStatus, number>>>;
  retryFailedItems(organizationId: string, batchId: string): Promise<number>;

  // --- Worker (sin organizationId: opera sobre la cola global) ---
  claimPendingItems(limit: number): Promise<ClaimedItem[]>;
  recordItemResult(itemId: string, result: ItemResult): Promise<void>;
  rescheduleItem(itemId: string, nextAttemptAt: string, lastError: {
    code: string | null;
    message: string;
  }): Promise<void>;
  releaseStaleLocks(lockTimeoutMs: number): Promise<number>;
  refreshBatchCounters(batchId: string): Promise<void>;
  finalizePendingBatches(): Promise<string[]>;

  close(): Promise<void>;
}
