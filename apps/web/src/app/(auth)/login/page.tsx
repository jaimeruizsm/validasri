import { redirect } from 'next/navigation';
import { APP_NAME, LEGAL_DISCLAIMER } from '@validasri/shared';
import { getSessionContext } from '@/server/session';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const session = await getSessionContext();
  if (session) redirect('/dashboard');

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-brand-700)] text-lg font-bold text-white">
            VS
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Validacion de comprobantes electronicos del SRI
          </p>
        </div>

        <LoginForm />

        <p className="mt-8 text-center text-xs leading-relaxed text-slate-400">{LEGAL_DISCLAIMER}</p>
      </div>
    </main>
  );
}
