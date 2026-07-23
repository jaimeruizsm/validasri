import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';

export default function BatchNotFound() {
  return (
    <div className="py-10">
      <EmptyState
        icon={FileQuestion}
        title="Lote no encontrado"
        description="El lote no existe o no pertenece a tu organizacion."
        action={
          <Button asChild variant="outline">
            <Link href="/historial">Volver al historial</Link>
          </Button>
        }
      />
    </div>
  );
}
