import { redirect } from 'next/navigation';
import { getActiveSeasonId, getPlayerProfile, getStandings, getH2H } from '@/lib/queries';
import { getSessionPlayer } from '@/lib/auth';
import { createServerAuthClient } from '@/lib/supabase/server';
import { ProfileView } from '@/components/ProfileView';
import { EmailForm } from '@/components/EmailForm';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { signOutAction } from '@/app/ucet/actions';

export const dynamic = 'force-dynamic';

export default async function ProfilPage({
  searchParams,
}: {
  searchParams: Promise<{ vs?: string }>;
}) {
  const player = await getSessionPlayer();
  if (!player) redirect('/prihlaseni');

  const { vs } = await searchParams;

  const sb = await createServerAuthClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const rawEmail = user?.email ?? '';
  const currentEmail = rawEmail.endsWith('@obtipovacka.local') ? '' : rawEmail;

  const seasonId = await getActiveSeasonId();
  if (!seasonId) return <p className="px-1 py-6 text-sm text-slate-100/50">Není aktivní sezóna.</p>;

  const profile = await getPlayerProfile(seasonId, player.id);
  const standings = await getStandings(seasonId);
  const others = standings.filter((s) => s.player_id !== player.id).map((s) => ({ id: s.player_id, name: s.name }));
  const vsId = vs ? Number(vs) : null;
  const h2h = vsId && Number.isFinite(vsId) && vsId !== player.id ? await getH2H(seasonId, player.id, vsId) : null;

  return (
    <main className="pb-10">
      {profile ? (
        <ProfileView profile={profile} h2h={h2h} others={others} vsId={vsId} basePath="/profil" title="Můj profil" />
      ) : (
        <p className="px-1 py-6 text-sm text-slate-100/50">Zatím žádné statistiky — začni tipovat.</p>
      )}

      <section className="panel mt-6 p-5">
        <div className="eyebrow mb-4"><span className="flag-chip" /> Můj účet</div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-[12px] uppercase tracking-wider text-slate-300/55">Email</div>
            <p className="mb-2 text-[12px] text-slate-300/45">
              Doplň si email — bude sloužit k obnově hesla, až ji zapneme.
            </p>
            <EmailForm currentEmail={currentEmail} />
          </div>
          <div>
            <div className="mb-2 text-[12px] uppercase tracking-wider text-slate-300/55">Změna hesla</div>
            <ChangePasswordForm />
          </div>
        </div>

        <form action={signOutAction} className="mt-5 border-t border-terrain-700 pt-4">
          <button type="submit" className="w-full rounded-xl border border-terrain-600 px-4 py-2.5 text-sm text-slate-300/80 transition hover:bg-terrain-800 hover:text-white">
            Odhlásit se
          </button>
        </form>
      </section>
    </main>
  );
}
