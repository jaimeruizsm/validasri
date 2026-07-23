import { NextResponse } from 'next/server';
import { toPublicError } from '@validasri/shared';
import { assertValidTxtFile } from '@validasri/validation';
import { requireSessionContext } from '@/server/session';
import { getUploadLimits } from '@/server/config';
import { createBatchFromTxt } from '@/server/batch-service';
import { enforceRateLimit } from '@/server/rate-limit';

/**
 * Crea un lote a partir del TXT subido. Toda la validacion se repite aqui en el
 * servidor: la del navegador es solo para la vista previa.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSessionContext();
    enforceRateLimit(`create-batch:${session.organization.id}`, { limit: 20, windowMs: 60_000 });

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Debes adjuntar un archivo .txt.' }, { status: 400 });
    }

    const limits = getUploadLimits();
    assertValidTxtFile({ name: file.name, size: file.size }, limits);

    const content = await file.text();
    const result = await createBatchFromTxt(session, { filename: file.name, content });

    return NextResponse.json({ batchId: result.batch.id, analysis: result.analysis });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json(
      { error: publicError.message, code: publicError.code },
      { status: publicError.status },
    );
  }
}
