import { notFound } from 'next/navigation';
import { getRepository } from '@validasri/database';
import { requireSessionContext } from '@/server/session';
import { BatchDetail } from './batch-detail';

export const dynamic = 'force-dynamic';

interface BatchPageProps {
  params: Promise<{ batchId: string }>;
}

export default async function BatchPage({ params }: BatchPageProps) {
  const session = await requireSessionContext();
  const { batchId } = await params;

  const repository = getRepository();
  const batch = await repository.getBatch(session.organization.id, batchId);
  if (!batch) notFound();

  return <BatchDetail initialBatch={batch} />;
}
