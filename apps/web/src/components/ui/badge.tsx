import * as React from 'react';
import type { StatusTone } from '@validasri/shared';
import { cn } from '@/lib/utils';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
  danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
  warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
  info: 'bg-[var(--color-info-bg)] text-[var(--color-info)]',
  neutral: 'bg-slate-100 text-slate-600',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
}

const Badge = ({ className, tone = 'neutral', ...props }: BadgeProps) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      TONE_CLASSES[tone],
      className,
    )}
    {...props}
  />
);

export { Badge };
