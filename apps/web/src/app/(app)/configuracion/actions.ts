'use server';

import { revalidatePath } from 'next/cache';
import { canManageOrganization, forbidden, toPublicError } from '@validasri/shared';
import { getRepository } from '@validasri/database';
import { organizationSettingsSchema } from '@validasri/validation';
import { requireSessionContext } from '@/server/session';

export interface SettingsResult {
  ok: boolean;
  message?: string;
}

export const updateOrganizationAction = async (
  _prev: SettingsResult,
  formData: FormData,
): Promise<SettingsResult> => {
  try {
    const session = await requireSessionContext();
    // Los operadores no pueden modificar la configuracion de la organizacion.
    if (!canManageOrganization(session.role)) {
      throw forbidden('Solo el propietario o un administrador pueden editar la organizacion.');
    }

    const parsed = organizationSettingsSchema.safeParse({
      name: formData.get('name'),
      ruc: formData.get('ruc') ?? '',
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos invalidos.' };
    }

    const repository = getRepository();
    await repository.updateOrganization(session.organization.id, {
      name: parsed.data.name,
      ruc: parsed.data.ruc && parsed.data.ruc.length > 0 ? parsed.data.ruc : null,
    });

    revalidatePath('/configuracion');
    return { ok: true, message: 'Configuracion actualizada correctamente.' };
  } catch (error) {
    return { ok: false, message: toPublicError(error).message };
  }
};
