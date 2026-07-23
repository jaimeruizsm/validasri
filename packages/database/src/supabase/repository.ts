import type { SupabaseClient } from '@supabase/supabase-js';
import {
  extractDocumentType,
  extractIssuerRuc,
  resolveFinalBatchStatus,
  type ItemStatus,
  type Organization,
  type OrganizationMember,
  type Paginated,
  type ValidationBatch,
  type ValidationItem,
} from '@validasri/shared';
import type {
  BatchListQuery,
  ClaimedItem,
  CreateBatchInput,
  DashboardStats,
  ItemFilters,
  ItemListQuery,
  ItemResult,
  Membership,
  ValidaSriRepository,
} from '../repository';
import { getWorkerLockTimeoutMs } from '../env';
import { asInt, mapBatch, mapItem, mapMember, mapOrganization, type SqlRow } from '../local/mappers';
import { getServiceClient } from './client';

const SORT_COLUMNS: Record<ItemListQuery['sortBy'], string> = {
  access_key: 'access_key',
  status: 'status',
  issuer_ruc: 'issuer_ruc',
  authorization_date: 'authorization_date',
  processed_at: 'processed_at',
  created_at: 'created_at',
};

const ITEM_INSERT_CHUNK = 1_000;

type PgResult<T> = { data: T | null; error: { message: string } | null };

const fail = (error: { message: string }): never => {
  throw new Error(`Error de base de datos: ${error.message}`);
};

/** Devuelve las filas de una consulta (o error). Nunca filtra detalles internos. */
const checkRows = (result: PgResult<unknown[]>): SqlRow[] => {
  if (result.error) fail(result.error);
  return (result.data ?? []) as SqlRow[];
};

/** Escalar de una RPC (p.ej. `monthly_usage`). */
const checkScalar = (result: PgResult<unknown>): unknown => {
  if (result.error) fail(result.error);
  return result.data;
};

/** Operacion sin valor de retorno relevante (insert/update/delete/rpc void). */
const checkVoid = (result: { error: { message: string } | null }): void => {
  if (result.error) fail(result.error);
};

/**
 * Driver de datos sobre Supabase/PostgreSQL. Usa la service_role, por lo que el
 * aislamiento entre organizaciones se garantiza filtrando por organization_id en
 * cada consulta (misma disciplina que el driver local). El RLS de 0002 queda como
 * defensa en profundidad frente a accesos con la anon key.
 */
export class SupabaseRepository implements ValidaSriRepository {
  private readonly db: SupabaseClient;

  constructor(client: SupabaseClient = getServiceClient()) {
    this.db = client;
  }

  // ------------------------------------------------------------------
  // Organizaciones y miembros
  // ------------------------------------------------------------------

  async getMembership(userId: string, organizationId?: string): Promise<Membership | null> {
    let query = this.db
      .from('organization_members')
      .select('role, organizations(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (organizationId) query = query.eq('organization_id', organizationId);

    const rows = checkRows(await query);
    const row = rows[0] as { role: string; organizations: SqlRow } | undefined;
    if (!row || !row.organizations) return null;
    return {
      organization: mapOrganization(row.organizations),
      role: row.role as Membership['role'],
    };
  }

  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    const rows = checkRows(await this.db.rpc('list_org_members', { p_org: organizationId }));
    return rows.map(mapMember);
  }

  async updateOrganization(
    organizationId: string,
    input: { name: string; ruc: string | null },
  ): Promise<Organization> {
    const rows = checkRows(
      await this.db
        .from('organizations')
        .update({ name: input.name, ruc: input.ruc })
        .eq('id', organizationId)
        .select('*'),
    );
    const row = rows[0];
    if (!row) throw new Error('La organizacion no existe.');
    return mapOrganization(row);
  }

  // ------------------------------------------------------------------
  // Consumo mensual
  // ------------------------------------------------------------------

  async getMonthlyUsage(organizationId: string, billingPeriod: string): Promise<number> {
    const value = checkScalar(
      await this.db.rpc('monthly_usage', { p_org: organizationId, p_period: billingPeriod }),
    );
    return asInt(value);
  }

  async recordUsage(input: {
    organizationId: string;
    batchId: string;
    quantity: number;
    billingPeriod: string;
  }): Promise<void> {
    checkVoid(
      await this.db.from('usage_records').insert({
        organization_id: input.organizationId,
        batch_id: input.batchId,
        quantity: input.quantity,
        billing_period: input.billingPeriod,
      }),
    );
  }

  // ------------------------------------------------------------------
  // Lotes
  // ------------------------------------------------------------------

  async createBatch(input: CreateBatchInput): Promise<ValidationBatch> {
    const inserted = checkRows(
      await this.db
        .from('validation_batches')
        .insert({
          organization_id: input.organizationId,
          created_by: input.createdBy,
          created_by_email: input.createdByEmail ?? null,
          original_filename: input.originalFilename,
          status: 'queued',
          total_lines: input.totalLines,
          total_valid: input.accessKeys.length,
          total_invalid: input.totalInvalid,
          total_duplicates: input.totalDuplicates,
        })
        .select('*'),
    );
    const batchRow = inserted[0];
    if (!batchRow) throw new Error('No se pudo crear el lote.');
    const batchId = String(batchRow['id']);

    for (let start = 0; start < input.accessKeys.length; start += ITEM_INSERT_CHUNK) {
      const chunk = input.accessKeys.slice(start, start + ITEM_INSERT_CHUNK).map((accessKey) => ({
        organization_id: input.organizationId,
        batch_id: batchId,
        access_key: accessKey,
        status: 'pending' as const,
        document_type: extractDocumentType(accessKey),
        issuer_ruc: extractIssuerRuc(accessKey),
      }));
      checkVoid(await this.db.from('validation_items').insert(chunk));
    }

    return mapBatch(batchRow);
  }

  async getBatch(organizationId: string, batchId: string): Promise<ValidationBatch | null> {
    const rows = checkRows(
      await this.db
        .from('validation_batches')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', batchId)
        .limit(1),
    );
    const row = rows[0];
    return row ? mapBatch(row) : null;
  }

  async listBatches(
    organizationId: string,
    query: BatchListQuery,
  ): Promise<Paginated<ValidationBatch>> {
    let builder = this.db
      .from('validation_batches')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId);

    if (query.status) builder = builder.eq('status', query.status);
    if (query.search) builder = builder.ilike('original_filename', `%${query.search}%`);
    if (query.from) builder = builder.gte('created_at', `${query.from}T00:00:00.000Z`);
    if (query.to) builder = builder.lte('created_at', `${query.to}T23:59:59.999Z`);

    const offset = (query.page - 1) * query.pageSize;
    const { data, error, count } = await builder
      .order('created_at', { ascending: false })
      .range(offset, offset + query.pageSize - 1);
    if (error) throw new Error(`Error de base de datos: ${error.message}`);

    const total = count ?? 0;
    return {
      rows: (data as SqlRow[]).map(mapBatch),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getDashboardStats(
    organizationId: string,
    billingPeriod: string,
  ): Promise<DashboardStats> {
    const rows = checkRows(
      await this.db.rpc('dashboard_stats', { p_org: organizationId, p_period: billingPeriod }),
    );
    const row = rows[0] ?? {};
    return {
      usedThisMonth: asInt(row['used_this_month']),
      monthlyLimit: asInt(row['monthly_limit']),
      authorized: asInt(row['authorized']),
      annulled: asInt(row['annulled']),
      errors: asInt(row['errors']),
      totalBatches: asInt(row['total_batches']),
    };
  }

  // ------------------------------------------------------------------
  // Items
  // ------------------------------------------------------------------

  /** Aplica los filtros comunes de items sobre un builder ya iniciado. */
  private itemsQuery(organizationId: string, batchId: string, filters: ItemFilters, count: boolean) {
    const builder = count
      ? this.db.from('validation_items').select('*', { count: 'exact' })
      : this.db.from('validation_items').select('*');
    let next = builder.eq('organization_id', organizationId).eq('batch_id', batchId);
    if (filters.status) next = next.eq('status', filters.status);
    if (filters.documentType) next = next.eq('document_type', filters.documentType);
    if (filters.search) {
      const like = `%${filters.search}%`;
      next = next.or(`access_key.ilike.${like},issuer_ruc.ilike.${like}`);
    }
    return next;
  }

  async listItems(
    organizationId: string,
    batchId: string,
    query: ItemListQuery,
  ): Promise<Paginated<ValidationItem>> {
    const offset = (query.page - 1) * query.pageSize;
    const { data, error, count } = await this.itemsQuery(organizationId, batchId, query, true)
      .order(SORT_COLUMNS[query.sortBy], { ascending: query.sortDir === 'asc' })
      .order('access_key', { ascending: true })
      .range(offset, offset + query.pageSize - 1);
    if (error) fail(error);

    const total = count ?? 0;
    return {
      rows: ((data ?? []) as SqlRow[]).map(mapItem),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async listItemsForExport(
    organizationId: string,
    batchId: string,
    filters: ItemFilters,
  ): Promise<ValidationItem[]> {
    const rows = checkRows(
      await this.itemsQuery(organizationId, batchId, filters, false)
        .order(SORT_COLUMNS[filters.sortBy], { ascending: filters.sortDir === 'asc' })
        .order('access_key', { ascending: true }),
    );
    return rows.map(mapItem);
  }

  async countItemsByStatus(
    organizationId: string,
    batchId: string,
  ): Promise<Partial<Record<ItemStatus, number>>> {
    const rows = checkRows(
      await this.db.rpc('count_items_by_status', { p_org: organizationId, p_batch: batchId }),
    );
    const result: Partial<Record<ItemStatus, number>> = {};
    for (const row of rows) {
      result[String(row['status']) as ItemStatus] = asInt(row['total']);
    }
    return result;
  }

  async retryFailedItems(organizationId: string, batchId: string): Promise<number> {
    const updated = checkRows(
      await this.db
        .from('validation_items')
        .update({
          status: 'pending',
          attempt_count: 0,
          next_attempt_at: null,
          locked_at: null,
          error_code: null,
          error_message: null,
          processed_at: null,
        })
        .eq('organization_id', organizationId)
        .eq('batch_id', batchId)
        .eq('status', 'service_error')
        .select('id'),
    );
    const count = updated.length;
    if (count === 0) return 0;

    await this.refreshBatchCounters(batchId);
    checkVoid(
      await this.db
        .from('validation_batches')
        .update({ status: 'queued', completed_at: null })
        .eq('organization_id', organizationId)
        .eq('id', batchId),
    );
    return count;
  }

  // ------------------------------------------------------------------
  // Cola del worker
  // ------------------------------------------------------------------

  async claimPendingItems(limit: number): Promise<ClaimedItem[]> {
    const rows = checkRows(await this.db.rpc('claim_validation_items', { p_limit: limit }));
    return rows.map((row) => ({
      id: String(row['id']),
      batchId: String(row['batch_id']),
      organizationId: String(row['organization_id']),
      accessKey: String(row['access_key']),
      attemptCount: asInt(row['attempt_count']),
    }));
  }

  async recordItemResult(itemId: string, result: ItemResult): Promise<void> {
    checkVoid(
      await this.db.rpc('record_item_result', {
        p_id: itemId,
        p_status: result.status,
        p_sri_status_raw: result.sriStatusRaw,
        p_document_type: result.documentType,
        p_issuer_ruc: result.issuerRuc,
        p_authorization_date: result.authorizationDate,
        p_authorization_number: result.authorizationNumber,
        p_environment: result.environment,
        p_error_code: result.errorCode,
        p_error_message: result.errorMessage,
        p_raw: result.rawResponse ?? null,
      }),
    );
  }

  async rescheduleItem(
    itemId: string,
    nextAttemptAt: string,
    lastError: { code: string | null; message: string },
  ): Promise<void> {
    checkVoid(
      await this.db.rpc('reschedule_item', {
        p_id: itemId,
        p_next: nextAttemptAt,
        p_code: lastError.code,
        p_message: lastError.message,
      }),
    );
  }

  async releaseStaleLocks(lockTimeoutMs: number = getWorkerLockTimeoutMs()): Promise<number> {
    const threshold = new Date(Date.now() - lockTimeoutMs).toISOString();
    const rows = checkRows(
      await this.db
        .from('validation_items')
        .update({ status: 'pending', locked_at: null })
        .eq('status', 'processing')
        .lte('locked_at', threshold)
        .select('id'),
    );
    return rows.length;
  }

  async refreshBatchCounters(batchId: string): Promise<void> {
    checkVoid(await this.db.rpc('refresh_batch_counters', { p_batch_id: batchId }));
  }

  async finalizePendingBatches(): Promise<string[]> {
    const candidates = checkRows(
      await this.db
        .from('validation_batches')
        .select('id')
        .in('status', ['queued', 'processing']),
    );

    const finalized: string[] = [];
    for (const candidate of candidates) {
      const batchId = String(candidate['id']);
      const { count, error } = await this.db
        .from('validation_items')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', batchId)
        .in('status', ['pending', 'processing']);
      if (error) throw new Error(`Error de base de datos: ${error.message}`);
      if ((count ?? 0) > 0) continue;

      await this.refreshBatchCounters(batchId);
      const rows = checkRows(
        await this.db.from('validation_batches').select('*').eq('id', batchId).limit(1),
      );
      const row = rows[0];
      if (!row) continue;
      const finalStatus = resolveFinalBatchStatus(mapBatch(row));
      checkVoid(
        await this.db
          .from('validation_batches')
          .update({ status: finalStatus, completed_at: new Date().toISOString() })
          .eq('id', batchId),
      );
      finalized.push(batchId);
    }
    return finalized;
  }

  async close(): Promise<void> {
    // supabase-js no mantiene conexiones persistentes que cerrar.
  }
}
