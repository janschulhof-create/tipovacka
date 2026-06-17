import { redirect } from 'next/navigation';
import { getSessionPlayer } from '@/lib/auth';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { signOutAction } from './actions';
import { PageHeader } from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default async function UcetPage() {
  const player = await getSessionPlayer();
  if (!player) redirect('/prihlaseni');

  return (
    <main className="mx-auto max-w-sm">
      <PageHeader icon="👤" title="Můj účet" subtitle={`Přihlášen jako ${player.name}`} />

      <section className="panel mb-5 p-5">
        <div className="eyebrow mb-3"><span className="flag-chip" /> Změna hesla</div>
        <ChangePasswordForm />
      </section>

      <form action={signOutAction}>
        <button type="submit" className="w-full rounded-xl border border-terrain-600 px-4 py-2.5 text-sm text-slate-300/80 transition hover:bg-terrain-800 hover:text-white">
          Odhlásit se
        </button>
      </form>
    </main>
  );
}
