import { redirect } from 'next/navigation';
import { LEGAL_DISCLAIMER } from '@validasri/shared';
import { getSessionContext } from '@/server/session';
import { Sidebar } from '@/components/sidebar';
import { logoutAction } from '@/app/(auth)/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  if (!session) redirect('/login');

  return (
    <div className="flex min-h-screen bg-[var(--color-background)]">
      <Sidebar
        email={session.user.email}
        organizationName={session.organization.name}
        role={session.role}
        logoutAction={logoutAction}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
        <footer className="border-t border-[var(--color-border)] px-4 py-4 sm:px-8">
          <p className="mx-auto max-w-7xl text-center text-xs text-slate-400">{LEGAL_DISCLAIMER}</p>
        </footer>
      </div>
    </div>
  );
}
