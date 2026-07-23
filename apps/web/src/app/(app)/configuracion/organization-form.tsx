'use client';

import { useActionState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateOrganizationAction, type SettingsResult } from './actions';

const initialState: SettingsResult = { ok: false };

interface OrganizationFormProps {
  defaultName: string;
  defaultRuc: string;
  canManage: boolean;
}

export function OrganizationForm({ defaultName, defaultRuc, canManage }: OrganizationFormProps) {
  const [state, submit, pending] = useActionState(updateOrganizationAction, initialState);

  useEffect(() => {
    if (state.message) {
      if (state.ok) toast.success(state.message);
      else toast.error(state.message);
    }
  }, [state]);

  return (
    <form action={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nombre de la empresa</Label>
        <Input id="name" name="name" defaultValue={defaultName} disabled={!canManage} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ruc">RUC (opcional)</Label>
        <Input
          id="ruc"
          name="ruc"
          defaultValue={defaultRuc}
          disabled={!canManage}
          inputMode="numeric"
          placeholder="1790012345001"
        />
      </div>
      {canManage && (
        <div>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Guardar cambios
          </Button>
        </div>
      )}
    </form>
  );
}
