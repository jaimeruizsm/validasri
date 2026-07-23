import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  extractDocumentType,
  extractIssuerRuc,
  nowIso,
  resolveFinalBatchStatus,
} from '@validasri/shared';
import type {
  ItemStatus,
  Organization,
  OrganizationMember,
  Paginated,
  ValidationBatch,
  ValidationItem,
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
import { getDatabase } from './connection';
import { asInt, mapBatch, mapItem, mapMember, mapOrganization, type SqlRow } from './mappers';

type SqlValue = string | number | null;

const SORT_COLUMNS: Record<ItemListQuery['sortBy'], string> = {
  access_key: 'access_key',
  status: 'status',
  issuer_ruc: 'issuer_ruc',
  authorization_date: 'authorization_date',
  processed_at: 'processed_at',
  created_at: 'created_at',
};

const BATCH_SELECT = `
  SELECT b.*, u.email AS created_by_email
  FROM validation_batches b
  LEFT JOIN app_users u ON u.id = b.created_by
`;

interface ItemWhere {
  clause: string;
  params: SqlValue[];
}

const buildItemWhere = (
  organizationId: string,
  batchId: string,
  filters: ItemFilters,
): ItemWhere => {
  const conditions = ['organization_id = ?', 'batch_id = ?'];
  const params: SqlValue[] = [organizationId, batchId];

  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.documentType) {
    conditions.push('document_type = ?');
    params.push(filters.documentType);
  }
  if (filters.search) {
    conditions.push('(access_key LIKE ? OR issuer_ruc LIKE ?)');
    const like = `%${filters.search}%`;
    params.push(like, like);
  }
  return { clause: `WHERE ${conditions.join(' AND ')}`, params };
};

/**
 * Implementacion sobre SQLite (`node:sqlite`, incluido en Node >= 22). Sirve para
 * desarrollo y demostracion sin depender de Supabase. El aislamiento entre
 * organizaciones se garantiza filtrando por `organization_id` en cada consulta.
 */
export class LocalRepository implements ValidaSriRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync = getDatabase()) {
    this.db = db;
  }

  private all(sql: string, params: SqlValue[] = []): SqlRow[] {
    return this.db.prepare(sql).all(...params) as unknown as SqlRow[];
  }

  private get(sql: string, params: SqlValue[] = []): SqlRow | undefined {
    return this.db.prepare(sql).get(...params) as unknown as SqlRow | undefined;
  }

  private run(sql: string, params: SqlValue[] = []): void {
    this.db.prepare(sql).run(...params);
  }

  // ------------------------------------------------------------------
  // Organizaciones y miembros
  // ------------------------------------------------------------------

  async getMembership(userId: string, organizationId?: string): Promise<Membership | null> {
    const sql = `
      SELECT m.role, o.*
      FROM organization_members m
      JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = ?
      ${organizationId ? 'AND m.organization_id = ?' : ''}
      ORDER BY m.created_at ASC
      LIMIT 1
    `;
    const params: SqlValue[] = organizationId ? [userId, organizationId] : [userId];
    const row = this.get(sql, params);
    if (!row) return null;
    return { organization: mapOrganization(row), role: row['role'] as Membership['role'] };
  }

  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    const rows = this.all(
      `SELECT m.*, u.email
       FROM organization_members m
       JOIN app_users u ON u.id = m.user_id
       WHERE m.organization_id = ?
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.email`,
      [organizationId],
    );
    return rows.map(mapMember);
  }

  async updateOrganization(
    organizationId: string,
    input: { name: string; ruc: string | null },
  ): Promise<Organization> {
    this.run(`UPDATE organizations SET name = ?, ruc = ?, updated_at = ? WHERE id = ?`, [
      input.name,
      input.ruc,
      nowIso(),
      organizationId,
    ]);
    const row = this.get(`SELECT * FROM organizations WHERE id = ?`, [organizationId]);
    if (!row) throw new Error('La organizacion no existe.');
    return mapOrganization(row);
  }

  // ------------------------------------------------------------------
  // Consumo mensual
  // ------------------------------------------------------------------

  async getMonthlyUsage(organizationId: string, billingPeriod: string): Promise<number> {
    const row = this.get(
      `SELECT COALESCE(SUM(quantity), 0) AS total
       FROM usage_records WHERE organization_id = ? AND billing_period = ?`,
      [organizationId, billingPeriod],
    );
    return asInt(row?.['total']);
  }

  async recordUsage(input: {
    organizationId: string;
    batchId: string;
    quantity: number;
    billingPeriod: string;
  }): Promise<void> {
    this.run(
      `INSERT INTO usage_records (id, organization_id, batch_id, quantity, billing_period, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.organizationId,
        input.batchId,
        input.quantity,
        input.billingPeriod,
        nowIso(),
      ],
    );
  }

  // ------------------------------------------------------------------
  // Lotes
  // ------------------------------------------------------------------

  async createBatch(input: CreateBatchInput): Promise<ValidationBatch> {
    const batchId = randomUUID();
    const timestamp = nowIso();

    const insertBatch = this.db.prepare(
      `INSERT INTO validation_batches (
         id, organization_id, created_by, original_filename, status,
         total_lines, total_valid, total_invalid, total_duplicates,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)`,
    );
    const insertItem = this.db.prepare(
      `INSERT INTO validation_items (
         id, organization_id, batch_id, access_key, status,
         document_type, issuer_ruc, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    );

    this.db.exec('BEGIN IMMEDIATE');
    try {
      insertBatch.run(
        batchId,
        input.organizationId,
        input.createdBy,
        input.originalFilename,
        input.totalLines,
        input.accessKeys.length,
        input.totalInvalid,
        input.totalDuplicates,
        timestamp,
        timestamp,
      );
      for (const accessKey of input.accessKeys) {
        insertItem.run(
          randomUUID(),
          input.organizationId,
          batchId,
          accessKey,
          extractDocumentType(accessKey),
          extractIssuerRuc(accessKey),
          timestamp,
          timestamp,
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    const batch = await this.getBatch(input.organizationId, batchId);
    if (!batch) throw new Error('No se pudo crear el lote.');
    return batch;
  }

  async getBatch(organizationId: string, batchId: string): Promise<ValidationBatch | null> {
    const row = this.get(`${BATCH_SELECT} WHERE b.organization_id = ? AND b.id = ?`, [
      organizationId,
      batchId,
    ]);
    return row ? mapBatch(row) : null;
  }

  async listBatches(
    organizationId: string,
    query: BatchListQuery,
  ): Promise<Paginated<ValidationBatch>> {
    const conditions = ['b.organization_id = ?'];
    const params: SqlValue[] = [organizationId];

    if (query.status) {
      conditions.push('b.status = ?');
      params.push(query.status);
    }
    if (query.search) {
      conditions.push('b.original_filename LIKE ?');
      params.push(`%${query.search}%`);
    }
    if (query.from) {
      conditions.push('b.created_at >= ?');
      params.push(`${query.from}T00:00:00.000Z`);
    }
    if (query.to) {
      conditions.push('b.created_at <= ?');
      params.push(`${query.to}T23:59:59.999Z`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const totalRow = this.get(
      `SELECT COUNT(*) AS total FROM validation_batches b ${where}`,
      params,
    );
    const total = asInt(totalRow?.['total']);
    const offset = (query.page - 1) * query.pageSize;
    const rows = this.all(
      `${BATCH_SELECT} ${where} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
      [...params, query.pageSize, offset],
    );

    return {
      rows: rows.map(mapBatch),
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
    const org = this.get(`SELECT monthly_limit FROM organizations WHERE id = ?`, [organizationId]);
    const totals = this.get(
      `SELECT
         COUNT(*) AS total_batches,
         COALESCE(SUM(total_authorized), 0) AS authorized,
         COALESCE(SUM(total_annulled), 0) AS annulled,
         COALESCE(SUM(total_errors), 0) AS errors
       FROM validation_batches WHERE organization_id = ?`,
      [organizationId],
    );

    return {
      usedThisMonth: await this.getMonthlyUsage(organizationId, billingPeriod),
      monthlyLimit: asInt(org?.['monthly_limit']),
      authorized: asInt(totals?.['authorized']),
      annulled: asInt(totals?.['annulled']),
      errors: asInt(totals?.['errors']),
      totalBatches: asInt(totals?.['total_batches']),
    };
  }

  // ------------------------------------------------------------------
  // Items
  // ------------------------------------------------------------------

  async listItems(
    organizationId: string,
    batchId: string,
    query: ItemListQuery,
  ): Promise<Paginated<ValidationItem>> {
    const { clause, params } = buildItemWhere(organizationId, batchId, query);
    const totalRow = this.get(`SELECT COUNT(*) AS total FROM validation_items ${clause}`, params);
    const total = asInt(totalRow?.['total']);
    const column = SORT_COLUMNS[query.sortBy];
    const direction = query.sortDir === 'desc' ? 'DESC' : 'ASC';
    const offset = (query.page - 1) * query.pageSize;

    const rows = this.all(
      `SELECT * FROM validation_items ${clause}
       ORDER BY ${column} ${direction}, access_key ASC
       LIMIT ? OFFSET ?`,
      [...params, query.pageSize, offset],
    );

    return {
      rows: rows.map(mapItem),
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
    const { clause, params } = buildItemWhere(organizationId, batchId, filters);
    const column = SORT_COLUMNS[filters.sortBy];
    const direction = filters.sortDir === 'desc' ? 'DESC' : 'ASC';
    const rows = this.all(
      `SELECT * FROM validation_items ${clause} ORDER BY ${column} ${direction}, access_key ASC`,
      params,
    );
    return rows.map(mapItem);
  }

  async countItemsByStatus(
    organizationId: string,
    batchId: string,
  ): Promise<Partial<Record<ItemStatus, number>>> {
    const rows = this.all(
      `SELECT status, COUNT(*) AS total FROM validation_items
       WHERE organization_id = ? AND batch_id = ? GROUP BY status`,
      [organizationId, batchId],
    );
    const result: Partial<Record<ItemStatus, number>> = {};
    for (const row of rows) {
      result[String(row['status']) as ItemStatus] = asInt(row['total']);
    }
    return result;
  }

  async retryFailedItems(organizationId: string, batchId: string): Promise<number> {
    const pending = this.get(
      `SELECT COUNT(*) AS total FROM validation_items
       WHERE organization_id = ? AND batch_id = ? AND status = 'service_error'`,
      [organizationId, batchId],
    );
    const count = asInt(pending?.['total']);
    if (count === 0) return 0;

    const timestamp = nowIso();
    this.run(
      `UPDATE validation_items
       SET status = 'pending', attempt_count = 0, next_attempt_at = NULL, locked_at = NULL,
           error_code = NULL, error_message = NULL, processed_at = NULL, updated_at = ?
       WHERE organization_id = ? AND batch_id = ? AND status = 'service_error'`,
      [timestamp, organizationId, batchId],
    );
    // Primero los contadores (que pueden mover el lote a 'processing') y luego el
    // estado, para que el lote quede efectivamente de vuelta en la cola.
    await this.refreshBatchCounters(batchId);
    this.run(
      `UPDATE validation_batches
       SET status = 'queued', completed_at = NULL, updated_at = ?
       WHERE organization_id = ? AND id = ?`,
      [timestamp, organizationId, batchId],
    );
    return count;
  }

  // ------------------------------------------------------------------
  // Cola del worker
  // ------------------------------------------------------------------

  async claimPendingItems(limit: number): Promise<ClaimedItem[]> {
    const timestamp = nowIso();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const candidates = this.all(
        `SELECT id, batch_id, organization_id, access_key, attempt_count
         FROM validation_items
         WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY COALESCE(next_attempt_at, created_at) ASC
         LIMIT ?`,
        [timestamp, limit],
      );

      const update = this.db.prepare(
        `UPDATE validation_items SET status = 'processing', locked_at = ?, updated_at = ?
         WHERE id = ? AND status = 'pending'`,
      );
      for (const row of candidates) {
        update.run(timestamp, timestamp, String(row['id']));
      }
      this.db.exec('COMMIT');

      return candidates.map((row) => ({
        id: String(row['id']),
        batchId: String(row['batch_id']),
        organizationId: String(row['organization_id']),
        accessKey: String(row['access_key']),
        attemptCount: asInt(row['attempt_count']),
      }));
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async recordItemResult(itemId: string, result: ItemResult): Promise<void> {
    const timestamp = nowIso();
    this.run(
      `UPDATE validation_items SET
         status = ?, sri_status_raw = ?, document_type = COALESCE(?, document_type),
         issuer_ruc = COALESCE(?, issuer_ruc), authorization_date = ?, authorization_number = ?,
         environment = ?, error_code = ?, error_message = ?, raw_response = ?,
         attempt_count = attempt_count + 1, next_attempt_at = NULL, locked_at = NULL,
         processed_at = ?, updated_at = ?
       WHERE id = ?`,
      [
        result.status,
        result.sriStatusRaw,
        result.documentType,
        result.issuerRuc,
        result.authorizationDate,
        result.authorizationNumber,
        result.environment,
        result.errorCode,
        result.errorMessage,
        result.rawResponse === undefined ? null : JSON.stringify(result.rawResponse),
        timestamp,
        timestamp,
        itemId,
      ],
    );
  }

  async rescheduleItem(
    itemId: string,
    nextAttemptAt: string,
    lastError: { code: string | null; message: string },
  ): Promise<void> {
    const timestamp = nowIso();
    this.run(
      `UPDATE validation_items SET
         status = 'pending', attempt_count = attempt_count + 1, next_attempt_at = ?,
         locked_at = NULL, error_code = ?, error_message = ?, updated_at = ?
       WHERE id = ?`,
      [nextAttemptAt, lastError.code, lastError.message, timestamp, itemId],
    );
  }

  async releaseStaleLocks(lockTimeoutMs: number = getWorkerLockTimeoutMs()): Promise<number> {
    const threshold = new Date(Date.now() - lockTimeoutMs).toISOString();
    const stale = this.get(
      `SELECT COUNT(*) AS total FROM validation_items
       WHERE status = 'processing' AND locked_at IS NOT NULL AND locked_at <= ?`,
      [threshold],
    );
    const count = asInt(stale?.['total']);
    if (count === 0) return 0;

    this.run(
      `UPDATE validation_items
       SET status = 'pending', locked_at = NULL, updated_at = ?
       WHERE status = 'processing' AND locked_at IS NOT NULL AND locked_at <= ?`,
      [nowIso(), threshold],
    );
    return count;
  }

  async refreshBatchCounters(batchId: string): Promise<void> {
    const row = this.get(
      `SELECT
         SUM(CASE WHEN status IN ('authorized','not_authorized','annulled','pending_annulment',
                                  'not_found','invalid','service_error') THEN 1 ELSE 0 END) AS processed,
         SUM(CASE WHEN status = 'authorized' THEN 1 ELSE 0 END) AS authorized,
         SUM(CASE WHEN status = 'annulled' THEN 1 ELSE 0 END) AS annulled,
         SUM(CASE WHEN status = 'pending_annulment' THEN 1 ELSE 0 END) AS pending_annulment,
         SUM(CASE WHEN status = 'not_authorized' THEN 1 ELSE 0 END) AS not_authorized,
         SUM(CASE WHEN status = 'not_found' THEN 1 ELSE 0 END) AS not_found,
         SUM(CASE WHEN status IN ('service_error','invalid') THEN 1 ELSE 0 END) AS errors
       FROM validation_items WHERE batch_id = ?`,
      [batchId],
    );
    if (!row) return;

    const processed = asInt(row['processed']);
    const timestamp = nowIso();

    this.run(
      `UPDATE validation_batches SET
         total_processed = ?, total_authorized = ?, total_annulled = ?,
         total_not_authorized = ?, total_not_found = ?, total_errors = ?,
         started_at = COALESCE(started_at, CASE WHEN ? > 0 THEN ? ELSE NULL END),
         status = CASE WHEN status = 'queued' AND ? > 0 THEN 'processing' ELSE status END,
         updated_at = ?
       WHERE id = ?`,
      [
        processed,
        asInt(row['authorized']),
        asInt(row['annulled']) + asInt(row['pending_annulment']),
        asInt(row['not_authorized']),
        asInt(row['not_found']),
        asInt(row['errors']),
        processed,
        timestamp,
        processed,
        timestamp,
        batchId,
      ],
    );
  }

  async finalizePendingBatches(): Promise<string[]> {
    const rows = this.all(
      `SELECT b.id FROM validation_batches b
       WHERE b.status IN ('queued','processing')
         AND NOT EXISTS (
           SELECT 1 FROM validation_items i
           WHERE i.batch_id = b.id AND i.status IN ('pending','processing')
         )`,
    );

    const finalized: string[] = [];
    for (const row of rows) {
      const batchId = String(row['id']);
      await this.refreshBatchCounters(batchId);
      const batchRow = this.get(`${BATCH_SELECT} WHERE b.id = ?`, [batchId]);
      if (!batchRow) continue;
      const batch = mapBatch(batchRow);
      const finalStatus = resolveFinalBatchStatus(batch);
      this.run(
        `UPDATE validation_batches SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
        [finalStatus, nowIso(), nowIso(), batchId],
      );
      finalized.push(batchId);
    }
    return finalized;
  }

  async close(): Promise<void> {
    // La conexion es un singleton compartido; se cierra explicitamente en el worker.
  }
}
