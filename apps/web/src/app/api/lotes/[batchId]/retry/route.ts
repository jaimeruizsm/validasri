import { NextResponse } from 'next/server';
import { toPublicError } from '@validasri/shared';
import { requireSessionContext } from '@/server/session';
import { retryBatchFailures } from '@/server/batch-service';
import { enforceRateLimit } from '@/server/rate-limit';

/** Reencola las consultas fallidas (service_error) de un lote. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const session = await requireSessionContext();
    const { batchId } = await params;
    enforceRateLimit(`retry:${session.organization.id}:${batchId}`, { limit: 10, windowMs: 60_000 });

    const requeued = await retryBatchFailures(session, batchId);
    return NextResponse.json({ requeued });
  } catch (error) {
    const publicError = toPublicError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
