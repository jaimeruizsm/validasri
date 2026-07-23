import { cn } from '@/lib/utils';

interface ProgressBarProps {
  percent: number;
  className?: string;
  tone?: 'brand' | 'success' | 'warning';
}

const TONE: Record<NonNullable<ProgressBarProps['tone']>, string> = {
  brand: 'bg-[var(--color-brand-700)]',
  success: 'bg-[var(--color-success)]',
  warning: 'bg-[var(--color-warning)]',
};

export function ProgressBar({ percent, className, tone = 'brand' }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-500', TONE[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
