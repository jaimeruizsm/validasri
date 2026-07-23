'use client';

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Copy, Info, Inbox } from 'lucide-react';
import {
  describeDocumentType,
  formatDateTimeEc,
  type Paginated,
  type ValidationItem,
} from '@validasri/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { ItemStatusBadge } from '@/components/status-badge';

interface ResultsTableProps {
  data: Paginated<ValidationItem> | null;
  loading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onCopyKey: (accessKey: string) => void;
  onShowError: (item: ValidationItem) => void;
}

export function ResultsTable({
  data,
  loading,
  page,
  onPageChange,
  onCopyKey,
  onShowError,
}: ResultsTableProps) {
  const columns: ColumnDef<ValidationItem>[] = [
    {
      header: 'Clave de acceso',
      accessorKey: 'accessKey',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-700">{row.original.accessKey}</span>
          <button
            type="button"
            onClick={() => onCopyKey(row.original.accessKey)}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Copiar clave de acceso"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
    {
      header: 'Estado',
      accessorKey: 'status',
      cell: ({ row }) => <ItemStatusBadge status={row.original.status} />,
    },
    {
      header: 'Emisor',
      accessorKey: 'issuerRuc',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">
            {row.original.issuerName ?? '—'}
          </p>
          <p className="text-xs text-slate-400">{row.original.issuerRuc ?? ''}</p>
        </div>
      ),
    },
    {
      header: 'Tipo',
      accessorKey: 'documentType',
      cell: ({ row }) => (
        <span className="text-sm">{describeDocumentType(row.original.documentType)}</span>
      ),
    },
    {
      header: 'Importe',
      accessorKey: 'totalAmount',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm tabular-nums">
          {row.original.totalAmount ?? '—'}
        </span>
      ),
    },
    {
      header: 'Autorizacion',
      accessorKey: 'authorizationDate',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-slate-500">
          {formatDateTimeEc(row.original.authorizationDate, '—')}
        </span>
      ),
    },
    {
      header: 'Intentos',
      accessorKey: 'attemptCount',
      cell: ({ row }) => <span className="text-sm">{row.original.attemptCount}</span>,
    },
    {
      header: 'Observacion',
      id: 'observation',
      cell: ({ row }) => {
        const text = row.original.errorMessage ?? row.original.sriStatusRaw ?? '';
        if (!text) return <span className="text-slate-300">—</span>;
        return (
          <button
            type="button"
            onClick={() => onShowError(row.original)}
            className="inline-flex max-w-[16rem] items-center gap-1 truncate text-left text-sm text-[var(--color-brand-700)] hover:underline"
          >
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{text}</span>
          </button>
        );
      },
    },
    {
      header: 'Consulta',
      accessorKey: 'processedAt',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-slate-500">
          {formatDateTimeEc(row.original.processedAt, '—')}
        </span>
      ),
    },
  ];

  const table = useReactTable({
    data: data?.rows ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (data && data.rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={Inbox}
            title="Sin resultados"
            description="No hay comprobantes que coincidan con los filtros seleccionados."
          />
        </CardContent>
      </Card>
    );
  }

  const pageCount = data?.pageCount ?? 1;

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-3">
          <p className="text-sm text-slate-500">
            {data ? `${data.total.toLocaleString('es-EC')} comprobantes` : ''}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              Anterior
            </Button>
            <span className="text-sm text-slate-500">
              {page} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pageCount}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
