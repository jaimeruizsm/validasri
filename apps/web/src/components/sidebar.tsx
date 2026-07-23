'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileCheck2,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Upload,
  X,
} from 'lucide-react';
import { MEMBER_ROLE_LABELS, type MemberRole } from '@validasri/shared';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Panel', icon: LayoutDashboard },
  { href: '/validaciones/nueva', label: 'Nueva validacion', icon: Upload },
  { href: '/historial', label: 'Historial', icon: History },
  { href: '/configuracion', label: 'Configuracion', icon: Settings },
];

interface SidebarProps {
  email: string;
  organizationName: string;
  role: MemberRole;
  logoutAction: () => Promise<void>;
}

export function Sidebar({ email, organizationName, role, logoutAction }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Navegacion principal">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-[var(--color-brand-700)] text-white'
                : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Barra superior movil */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-700)] text-sm font-bold text-white">
            VS
          </span>
          <span className="font-semibold text-slate-900">ValidaSRI</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? 'Cerrar menu' : 'Abrir menu'}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[var(--color-border)] bg-white transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-brand-700)] text-sm font-bold text-white">
            VS
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{organizationName}</p>
            <p className="text-xs text-slate-400">ValidaSRI</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">{nav}</div>

        <div className="border-t border-[var(--color-border)] px-3 py-4">
          <div className="mb-3 flex items-center gap-2 px-2">
            <FileCheck2 className="h-4 w-4 text-slate-400" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-700">{email}</p>
              <p className="text-xs text-slate-400">{MEMBER_ROLE_LABELS[role]}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesion
            </button>
          </form>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
