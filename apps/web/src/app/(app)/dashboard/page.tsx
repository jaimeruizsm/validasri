import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Gauge,
  Plus,
  XCircle,
} from 'lucide-react';
import { billingPeriodFor, computeBatchProgress, formatDateTimeEc } from '@validasri/shared';
import { getRepository } from '@validasri/database';
import { requireSessionContext } from '@/server/session';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { EmptyState } from '@/components/empty-state';
import { BatchStatusBadge } from '@/components/status-badge';
import { ProgressBar } from '@/components/progress-bar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requireSessionContext();
  const repository = getRepository();
  const period = billingPeriodFor();

  const [stats, recent] = await Promise.all([
    repository.getDashboardStats(session.organization.id, period),
    repository.listBatches(session.organization.id, { page: 1, pageSize: 5 }),
  ]);

  const usagePercent = stats.monthlyLimit > 0 ? (stats.usedThisMonth / stats.monthlyLimit) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Panel"
        description={`Resumen de ${session.organization.name}`}
        action={
          <Button asChild>
            <Link href="/validaciones/nueva">
              <Plus className="h-4 w-4" />
              Nueva validacion
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Validaciones este mes"
          value={stats.usedThisMonth.toLocaleString('es-EC')}
          hint={`Limite: ${stats.monthlyLimit.toLocaleString('es-EC')}`}
          icon={Gauge}
          tone="info"
        />
        <StatCard
          label="Comprobantes autorizados"
          value={stats.authorized.toLocaleString('es-EC')}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Comprobantes anulados"
          value={stats.annulled.toLocaleString('es-EC')}
          icon={XCircle}
          tone="danger"
        />
        <StatCard
          label="Consultas con errores"
          value={stats.errors.toLocaleString('es-EC')}
          icon={AlertTriangle}
          tone="warning"
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Consumo mensual</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              {stats.usedThisMonth.toLocaleString('es-EC')} de{' '}
              {stats.monthlyLimit.toLocaleString('es-EC')} validaciones
            </span>
            <span className="font-medium">{Math.round(usagePercent)}%</span>
          </div>
          <ProgressBar
            className="mt-3"
            percent={usagePercent}
            tone={usagePercent >= 90 ? 'warning' : 'brand'}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Lotes recientes</CardTitle>
          <Link href="/historial" className="text-sm text-[var(--color-brand-700)] hover:underline">
            Ver historial
          </Link>
        </CardHeader>
        <CardContent>
          {recent.rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Aun no hay validaciones"
              description="Sube un archivo TXT con claves de acceso para comenzar."
              action={
                <Button asChild variant="outline">
                  <Link href="/validaciones/nueva">Crear la primera validacion</Link>
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--color-border)]">
              {recent.rows.map((batch) => {
                const progress = computeBatchProgress(batch);
                return (
                  <li key={batch.id}>
                    <Link
                      href={`/lotes/${batch.id}`}
                      className="flex flex-col gap-2 py-3 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {batch.originalFilename}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDateTimeEc(batch.createdAt)} · {batch.totalValid} claves validas
                        </p>
                      </div>
                      <div className="flex items-center gap-4 sm:w-64">
                        <ProgressBar percent={progress.percent} className="hidden flex-1 sm:block" />
                        <BatchStatusBadge status={batch.status} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
