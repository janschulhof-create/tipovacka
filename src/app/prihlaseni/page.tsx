import { redirect } from 'next/navigation';
import { getPlayers } from '@/lib/queries';
import { getSessionPlayer } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default async function PrihlaseniPage() {
  const player = await getSessionPlayer();
  if (player) redirect('/');

  const players = await getPlayers();

  return (
    <main className="mx-auto max-w-sm">
      <PageHeader icon="🔐" title="Přihlášení" subtitle="Tipovačka" />
      <div className="panel p-5">
        <p className="mb-4 text-[13px] text-slate-300/60">
          Vyber svoje jméno a zadej heslo, které jsi dostal. Heslo si pak můžeš změnit v účtu.
        </p>
        <LoginForm players={players} />
      </div>
    </main>
  );
}
