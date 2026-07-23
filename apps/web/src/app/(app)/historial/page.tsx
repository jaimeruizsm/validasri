import Link from 'next/link';
import { FileText } from 'lucide-react';
import { computeBatchProgress, formatDateTimeEc } from '@validasri/shared';
import { getRepository } from '@validasri/database';
import { batchesQuerySchema } from '@validasri/validation';
import { requireSessionContext } from '@/server/session';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { BatchStatusBadge } from '@/components/status-badge';
import { ProgressBar } from '@/components/progress-bar';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HistoryFilters } from './history-filters';
import { Pagination } from '@/components/pagination';

export const dynamic = 'force-dynamic';

interface HistoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const session = await requireSessionContext();
  const params = await searchParams;

  const query = batchesQuerySchema.parse({
    page: params.page,
    search: params.search,
    status: params.status,
    from: params.from,
    to: params.to,
  });

  const repository = getRepository();
  const result = await repository.listBatches(session.organization.id, query);

  return (
    <div>
      <PageHeader title="Historial" description="Todos los archivos procesados por tu organizacion" />

      <HistoryFilters
        defaultSearch={query.search ?? ''}
        defaultStatus={query.status ?? ''}
        defaultFrom={query.from ?? ''}
        defaultTo={query.to ?? ''}
      />

      <Card className="mt-4">
        <CardContent className="p-0">
          {result.rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={FileText}
                title="No se encontraron lotes"
                description="Ajusta los filtros o crea una nueva validacion."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Progreso</TableHead>
                  <TableHead className="text-right">Claves</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((batch) => {
                  const progress = computeBatchProgress(batch);
                  return (
                    <TableRow key={batch.id} className="cursor-pointer">
                      <TableCell>
                        <Link
                          href={`/lotes/${batch.id}`}
                          className="font-medium text-[var(--color-brand-700)] hover:underline"
                        >
                          {batch.originalFilename}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-slate-500">
                        {formatDateTimeEc(batch.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {batch.createdByEmail ?? '—'}
                      </TableCell>
                      <TableCell>
                        <BatchStatusBadge status={batch.status} />
                      </TableCell>
                      <TableCell className="w-40">
                        <div className="flex items-center gap-2">
                          <ProgressBar percent={progress.percent} className="w-24" />
                          <span className="text-xs text-slate-400">{progress.percent}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm text-slate-600">
                        {batch.totalValid.toLocaleString('es-EC')}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {result.pageCount > 1 && (
        <Pagination page={result.page} pageCount={result.pageCount} className="mt-4" />
      )}
    </div>
  );
}
