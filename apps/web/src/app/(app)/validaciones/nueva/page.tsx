import { getUploadLimits } from '@/server/config';
import { requireSessionContext } from '@/server/session';
import { PageHeader } from '@/components/page-header';
import { UploadWizard } from './upload-wizard';

export const dynamic = 'force-dynamic';

export default async function NewValidationPage() {
  await requireSessionContext();
  const limits = getUploadLimits();

  return (
    <div>
      <PageHeader
        title="Nueva validacion"
        description="Sube un archivo TXT con una clave de acceso por linea"
      />
      <UploadWizard
        maxSizeMb={Math.round(limits.maxSizeBytes / (1024 * 1024))}
        maxKeys={limits.maxKeys}
      />
    </div>
  );
}
