'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { BATCH_STATUSES, BATCH_STATUS_LABELS } from '@validasri/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

interface HistoryFiltersProps {
  defaultSearch: string;
  defaultStatus: string;
  defaultFrom: string;
  defaultTo: string;
}

export function HistoryFilters({
  defaultSearch,
  defaultStatus,
  defaultFrom,
  defaultTo,
}: HistoryFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(defaultSearch);
  const [status, setStatus] = useState(defaultStatus);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const apply = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    router.push(`/historial?${params.toString()}`);
  };

  const reset = () => {
    setSearch('');
    setStatus('');
    setFrom('');
    setTo('');
    router.push('/historial');
  };

  return (
    <Card>
      <CardContent className="p-4">
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <Label htmlFor="search">Buscar por nombre</Label>
            <Input
              id="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="archivo.txt"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Estado</Label>
            <select
              id="status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-10 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-600)]"
            >
              <option value="">Todos</option>
              {BATCH_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {BATCH_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">Desde</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">Hasta</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex gap-2 lg:col-span-5">
            <Button type="submit">
              <Search className="h-4 w-4" />
              Filtrar
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              Limpiar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
