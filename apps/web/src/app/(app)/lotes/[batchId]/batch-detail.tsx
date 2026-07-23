'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Loader2, RefreshCcwDot, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  computeBatchProgress,
  describeDocumentType,
  formatDateTimeEc,
  isFinishedBatchStatus,
  ITEM_STATUS_LABELS,
  ITEM_STATUSES,
  type ItemStatus,
  type Paginated,
  type ValidationBatch,
  type ValidationItem,
} from '@validasri/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/page-header';
import { ProgressBar } from '@/components/progress-bar';
import { BatchStatusBadge, ItemStatusBadge } from '@/components/status-badge';
import { exportCsvLocally, exportXlsxLocally, fetchAllBatchItems } from '@/lib/batch-export';
import { ResultsTable } from './results-table';

const PAGE_SIZE = 25;
// 10 s en vez de 3 s para reducir invocaciones de funciones serverless en Vercel.
const POLL_INTERVAL_MS = 10_000;

interface ItemsResponse {
  batch: ValidationBatch;
  items: Paginated<ValidationItem>;
  counts: Partial<Record<ItemStatus, number>>;
}

export function BatchDetail({ initialBatch }: { initialBatch: ValidationBatch }) {
  const [batch, setBatch] = useState(initialBatch);
  const [items, setItems] = useState<Paginated<ValidationItem> | null>(null);
  const [counts, setCounts] = useState<Partial<Record<ItemStatus, number>>>({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ItemStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [revalidateOpen, setRevalidateOpen] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const allItemsRef = useRef<ValidationItem[] | null>(null);
  const [errorDetail, setErrorDetail] = useState<ValidationItem | null>(null);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const progress = computeBatchProgress(batch);
  const isFinished = isFinishedBatchStatus(batch.status);

  const fetchItems = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);

    const response = await fetch(`/api/lotes/${initialBatch.id}/items?${params.toString()}`);
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? 'No se pudieron cargar los resultados.');
      return;
    }
    const data = (await response.json()) as ItemsResponse;
    setBatch(data.batch);
    setItems(data.items);
    setCounts(data.counts);
    setLoading(false);
  }, [debouncedSearch, initialBatch.id, page, statusFilter]);

  // Debounce de la busqueda.
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [search]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  // Polling del progreso mientras el lote no ha terminado. Se pausa cuando la
  // pestaña esta en segundo plano (Page Visibility API) para no gastar CPU de
  // Vercel innecesariamente: si el usuario no esta mirando, no se consulta.
  useEffect(() => {
    if (isFinished) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => void fetchItems(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        void fetchItems(); // refresco inmediato al volver a la pestana
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchItems, isFinished]);

  const copyKey = useCallback(async (accessKey: string) => {
    try {
      await navigator.clipboard.writeText(accessKey);
      toast.success('Clave copiada al portapapeles.');
    } catch {
      toast.error('No se pudo copiar la clave.');
    }
  }, []);

  const retryFailed = async () => {
    setRetrying(true);
    try {
      const response = await fetch(`/api/lotes/${initialBatch.id}/retry`, { method: 'POST' });
      const data = (await response.json()) as { requeued?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'No se pudo reintentar.');
      if (data.requeued && data.requeued > 0) {
        toast.success(`Se reencolaron ${data.requeued} consultas fallidas.`);
      } else {
        toast.info('No hay consultas fallidas para reintentar.');
      }
      allItemsRef.current = null; // la cache local quedo obsoleta
      await fetchItems();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al reintentar.');
    } finally {
      setRetrying(false);
    }
  };

  const revalidateAll = async () => {
    setRevalidating(true);
    try {
      const response = await fetch(`/api/lotes/${initialBatch.id}/revalidate`, { method: 'POST' });
      const data = (await response.json()) as { requeued?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'No se pudo re-validar el lote.');
      toast.success(`Se reencolaron ${data.requeued ?? 0} comprobantes para volver a consultar.`);
      setRevalidateOpen(false);
      allItemsRef.current = null; // la cache local quedo obsoleta
      await fetchItems();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al re-validar.');
    } finally {
      setRevalidating(false);
    }
  };

  // Descargas generadas en el navegador desde la cache local (IndexedDB), con
  // todos los detalles y respetando los filtros activos. No pasan por el servidor.
  const ensureAllItems = async (): Promise<ValidationItem[]> => {
    const items = allItemsRef.current ?? (await fetchAllBatchItems(initialBatch.id));
    allItemsRef.current = items;
    return items;
  };
  const filters = { search: debouncedSearch, status: statusFilter };

  const downloadCsvLocal = async () => {
    setCsvBusy(true);
    try {
      exportCsvLocally(batch.originalFilename, await ensureAllItems(), filters);
    } catch {
      toast.error('No se pudo generar el CSV.');
    } finally {
      setCsvBusy(false);
    }
  };

  const downloadXlsxLocal = async () => {
    setXlsxBusy(true);
    try {
      await exportXlsxLocally(batch, await ensureAllItems(), filters);
    } catch {
      toast.error('No se pudo generar el Excel.');
    } finally {
      setXlsxBusy(false);
    }
  };

  // Al terminar el lote, se descargan todos los items a la cache local una vez.
  useEffect(() => {
    if (!isFinished) return;
    let active = true;
    void fetchAllBatchItems(initialBatch.id).then((items) => {
      if (active) allItemsRef.current = items;
    });
    return () => {
      active = false;
    };
  }, [isFinished, initialBatch.id]);


  const errorCount = counts.service_error ?? 0;

  return (
    <div>
      <Link
        href="/historial"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al historial
      </Link>

      <PageHeader
        title={batch.originalFilename}
        description={`Creado el ${formatDateTimeEc(batch.createdAt)} por ${batch.createdByEmail ?? '—'}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void fetchItems()}>
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
            {errorCount > 0 && (
              <Button variant="outline" size="sm" onClick={retryFailed} disabled={retrying}>
                <RotateCcw className={retrying ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                Reintentar fallidos
              </Button>
            )}
            {isFinished && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRevalidateOpen(true)}
                disabled={revalidating}
              >
                <RefreshCcwDot className={revalidating ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                Volver a validar todo
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={downloadXlsxLocal} disabled={xlsxBusy}>
              <Download className={xlsxBusy ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={downloadCsvLocal} disabled={csvBusy}>
              <Download className={csvBusy ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
              CSV
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Progreso</CardTitle>
          <BatchStatusBadge status={batch.status} />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              {progress.processed.toLocaleString('es-EC')} de{' '}
              {progress.total.toLocaleString('es-EC')} claves procesadas
            </span>
            <span className="font-medium">{progress.percent}%</span>
          </div>
          <ProgressBar
            className="mt-3"
            percent={progress.percent}
            tone={batch.status === 'completed_with_errors' ? 'warning' : 'brand'}
          />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MiniStat label="Validas" value={batch.totalValid} />
            <MiniStat label="Autorizadas" value={batch.totalAuthorized} tone="text-[var(--color-success)]" />
            <MiniStat label="Anuladas" value={batch.totalAnnulled} tone="text-[var(--color-danger)]" />
            <MiniStat label="No autorizadas" value={batch.totalNotAuthorized} tone="text-[var(--color-danger)]" />
            <MiniStat label="No encontradas" value={batch.totalNotFound} tone="text-[var(--color-warning)]" />
            <MiniStat label="Errores" value={batch.totalErrors} tone="text-[var(--color-warning)]" />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por clave de acceso o RUC"
              className="sm:max-w-sm"
              aria-label="Buscar comprobantes"
            />
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as ItemStatus | '');
                setPage(1);
              }}
              aria-label="Filtrar por estado"
              className="h-10 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-600)]"
            >
              <option value="">Todos los estados</option>
              {ITEM_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ITEM_STATUS_LABELS[status]}
                  {counts[status] ? ` (${counts[status]})` : ''}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4">
        <ResultsTable
          data={items}
          loading={loading}
          page={page}
          onPageChange={setPage}
          onCopyKey={copyKey}
          onShowError={setErrorDetail}
        />
      </div>

      <Dialog open={revalidateOpen} onOpenChange={(open) => !revalidating && setRevalidateOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Volver a validar todo el lote</DialogTitle>
            <DialogDescription>
              Se volveran a consultar al SRI los {batch.totalValid.toLocaleString('es-EC')}{' '}
              comprobantes de este lote. Los resultados actuales se reemplazaran por los nuevos.
              Esto no consume validaciones adicionales de tu plan.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRevalidateOpen(false)} disabled={revalidating}>
              Cancelar
            </Button>
            <Button onClick={revalidateAll} disabled={revalidating}>
              {revalidating && <Loader2 className="animate-spin" />}
              Volver a validar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={errorDetail !== null} onOpenChange={(open) => !open && setErrorDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalle de la consulta</DialogTitle>
            <DialogDescription>Informacion adicional del comprobante</DialogDescription>
          </DialogHeader>
          {errorDetail && (
            <div className="flex flex-col gap-3 text-sm">
              <DetailRow label="Clave de acceso" value={errorDetail.accessKey} mono />
              <DetailRow label="Estado" value={<ItemStatusBadge status={errorDetail.status} />} />
              {errorDetail.sriStatusRaw && (
                <DetailRow label="Respuesta del SRI" value={errorDetail.sriStatusRaw} />
              )}
              {errorDetail.issuerName && (
                <DetailRow label="Razon social del emisor" value={errorDetail.issuerName} />
              )}
              {errorDetail.tradeName && (
                <DetailRow label="Nombre comercial" value={errorDetail.tradeName} />
              )}
              <DetailRow label="RUC del emisor" value={errorDetail.issuerRuc ?? '—'} />
              <DetailRow
                label="Tipo de comprobante"
                value={describeDocumentType(errorDetail.documentType)}
              />
              {errorDetail.totalAmount && (
                <DetailRow label="Importe total" value={errorDetail.totalAmount} />
              )}
              {errorDetail.errorCode && <DetailRow label="Codigo" value={errorDetail.errorCode} />}
              {errorDetail.errorMessage && (
                <DetailRow label="Observacion" value={errorDetail.errorMessage} />
              )}
              <DetailRow label="Intentos" value={String(errorDetail.attemptCount)} />
              <DetailRow
                label="Fecha de consulta"
                value={formatDateTimeEc(errorDetail.processedAt)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = 'text-slate-900',
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-white p-3">
      <p className={`text-xl font-bold ${tone}`}>{value.toLocaleString('es-EC')}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <span className={mono ? 'break-all font-mono text-slate-800' : 'text-slate-800'}>{value}</span>
    </div>
  );
}
