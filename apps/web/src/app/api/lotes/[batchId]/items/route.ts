import { NextResponse } from 'next/server';
import { toPublicError } from '@validasri/shared';
import { getRepository } from '@validasri/database';
import { itemsQuerySchema } from '@validasri/validation';
import { requireSessionContext } from '@/server/session';

/** Lista paginada de items de un lote, filtrada desde el servidor. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const session = await requireSessionContext();
    const { batchId } = await params;
    const url = new URL(request.url);

    const query = itemsQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    const repository = getRepository();

    const batch = await repository.getBatch(session.organization.id, batchId);
    if (!batch) {
      return NextResponse.json({ error: 'El lote no existe.' }, { status: 404 });
    }

    const [items, counts] = await Promise.all([
      repository.listItems(session.organization.id, batchId, query),
      repository.countItemsByStatus(session.organization.id, batchId),
    ]);

    return NextResponse.json({
      batch,
      items,
      counts,
    });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
