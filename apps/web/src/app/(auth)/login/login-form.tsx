'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction, recoveryAction, type ActionResult } from '../actions';

const initialState: ActionResult = { ok: false };

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'recovery'>('login');
  const [loginState, loginSubmit, loginPending] = useActionState(loginAction, initialState);
  const [recoveryState, recoverySubmit, recoveryPending] = useActionState(
    recoveryAction,
    initialState,
  );

  useEffect(() => {
    if (loginState.ok) {
      router.replace('/dashboard');
      router.refresh();
    } else if (loginState.message) {
      toast.error(loginState.message);
    }
  }, [loginState, router]);

  useEffect(() => {
    if (recoveryState.message) {
      if (recoveryState.ok) toast.success(recoveryState.message);
      else toast.error(recoveryState.message);
    }
  }, [recoveryState]);

  if (mode === 'recovery') {
    return (
      <Card>
        <CardContent className="pt-6">
          <form action={recoverySubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="recovery-email">Correo electronico</Label>
              <Input
                id="recovery-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="tucorreo@empresa.com"
                required
              />
            </div>
            <Button type="submit" disabled={recoveryPending}>
              {recoveryPending && <Loader2 className="animate-spin" />}
              Enviar instrucciones
            </Button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className="text-sm text-[var(--color-brand-700)] hover:underline"
            >
              Volver al inicio de sesion
            </button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={loginSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Correo electronico</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="tucorreo@empresa.com"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contrasena</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>
          <Button type="submit" disabled={loginPending}>
            {loginPending && <Loader2 className="animate-spin" />}
            Iniciar sesion
          </Button>
          <button
            type="button"
            onClick={() => setMode('recovery')}
            className="text-sm text-[var(--color-brand-700)] hover:underline"
          >
            Olvide mi contrasena
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
