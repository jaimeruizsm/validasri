import type { LucideIcon } from 'lucide-react';
import type { StatusTone } from '@validasri/shared';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const ICON_TONE: Record<StatusTone, string> = {
  success: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
  danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
  warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
  info: 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
  neutral: 'bg-slate-100 text-slate-500',
};

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: StatusTone;
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'neutral' }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        {Icon && (
          <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg', ICON_TONE[tone])}>
            <Icon className="h-5 w-5" />
          </span>
        )}
      </CardContent>
    </Card>
  );
}
