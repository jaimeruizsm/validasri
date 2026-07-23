import {
  BATCH_STATUS_LABELS,
  BATCH_STATUS_TONES,
  ITEM_STATUS_LABELS,
  ITEM_STATUS_TONES,
  type BatchStatus,
  type ItemStatus,
} from '@validasri/shared';
import { Badge } from '@/components/ui/badge';

export const BatchStatusBadge = ({ status }: { status: BatchStatus }) => (
  <Badge tone={BATCH_STATUS_TONES[status]}>{BATCH_STATUS_LABELS[status]}</Badge>
);

export const ItemStatusBadge = ({ status }: { status: ItemStatus }) => (
  <Badge tone={ITEM_STATUS_TONES[status]}>{ITEM_STATUS_LABELS[status]}</Badge>
);
