import {
  billingPeriodFor,
  canManageOrganization,
  MEMBER_ROLE_LABELS,
  PLAN_LABELS,
} from '@validasri/shared';
import { getRepository } from '@validasri/database';
import { requireSessionContext } from '@/server/session';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OrganizationForm } from './organization-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSessionContext();
  const repository = getRepository();
  const [members, usage] = await Promise.all([
    repository.listMembers(session.organization.id),
    repository.getMonthlyUsage(session.organization.id, billingPeriodFor()),
  ]);
  const canManage = canManageOrganization(session.role);

  return (
    <div>
      <PageHeader title="Configuracion" description="Datos de la empresa, plan y miembros" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Datos de la empresa</CardTitle>
              <CardDescription>
                {canManage
                  ? 'Actualiza el nombre y el RUC de tu organizacion.'
                  : 'Solo el propietario o un administrador pueden editar estos datos.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OrganizationForm
                defaultName={session.organization.name}
                defaultRuc={session.organization.ruc ?? ''}
                canManage={canManage}
              />
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Miembros</CardTitle>
              <CardDescription>Personas con acceso a esta organizacion</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Correo</TableHead>
                    <TableHead>Rol</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium text-slate-800">{member.email}</TableCell>
                      <TableCell>
                        <Badge tone={member.role === 'operator' ? 'neutral' : 'info'}>
                          {MEMBER_ROLE_LABELS[member.role]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Plan</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="text-sm text-slate-500">Plan actual</p>
                <p className="text-lg font-semibold text-slate-900">
                  {PLAN_LABELS[session.organization.plan]}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Limite mensual</p>
                <p className="text-lg font-semibold text-slate-900">
                  {session.organization.monthlyLimit.toLocaleString('es-EC')}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Consumo este mes</p>
                <p className="text-lg font-semibold text-slate-900">
                  {usage.toLocaleString('es-EC')}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Tu rol</p>
                <p className="text-lg font-semibold text-slate-900">
                  {MEMBER_ROLE_LABELS[session.role]}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
