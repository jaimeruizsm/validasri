import { toPublicError } from '@validasri/shared';
import { getRepository } from '@validasri/database';
import { exportQuerySchema } from '@validasri/validation';
import { buildCsv, buildXlsx, exportFilename } from '@validasri/export';
import { requireSessionContext } from '@/server/session';

/**
 * Exporta los resultados de un lote en Excel o CSV, respetando los filtros
 * activos (o el lote completo si no hay filtros).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const session = await requireSessionContext();
    const { batchId } = await params;
    const url = new URL(request.url);
    const query = exportQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

    const repository = getRepository();
    const batch = await repository.getBatch(session.organization.id, batchId);
    if (!batch) {
      return new Response('El lote no existe.', { status: 404 });
    }

    const { format, ...filters } = query;
    const items = await repository.listItemsForExport(session.organization.id, batchId, filters);
    const filename = exportFilename(batch.originalFilename, format);

    if (format === 'csv') {
      return new Response(buildCsv(items), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    const buffer = await buildXlsx(batch, items);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const publicError = toPublicError(error);
    return new Response(publicError.message, { status: publicError.status });
  }
}
