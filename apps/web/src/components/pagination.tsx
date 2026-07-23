'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  pageCount: number;
  className?: string;
}

export function Pagination({ page, pageCount, className }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const goToPage = (target: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(target));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <p className="text-sm text-slate-500">
        Pagina {page} de {pageCount}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
          aria-label="Pagina anterior"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Pagina siguiente"
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
