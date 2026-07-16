import { redirect } from 'next/navigation';
import { getActiveSeasonId, getPlayerProfile, getStandings, getH2H } from '@/lib/queries';
import { getSessionPlayer } from '@/lib/auth';
import { createServerAuthClient } from '@/lib/supabase/server';
import { ProfileView } from '@/components/ProfileView';
import { EmailForm } from '@/components/EmailForm';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { signOutAction } from '@/app/ucet/actions';
import { H2HCompare, type H2HSeason } from '@/components/H2HCompare';
import { getMsSeason } from '@/lib/msSeason';
import historie from '@/data/historie.json';
import type { SRound } from '@/lib/seasonStats';

export const dynamic = 'force-dynamic';

export default async function ProfilPage({
  searchParams,
}: {
  searchParams: Promise<{ vs?: string }>;
}) {
  const player = await getSessionPlayer();
  if (!player) redirect('/prihlaseni');

  const { vs } = await searchParams;

  // podklady pro H2H porovnání (MS + Chance liga)
  const liga = historie as unknown as { season: string; players: string[]; rounds: SRound[] };
  const msSeason = await getMsSeason();
  const h2hSeasons: H2HSeason[] = [
    ...(msSeason
      ? [{
          key: 'ms-2026',
          competition: 'MS 2026' as const,
          season: msSeason.data.season,
          players: msSeason.data.players,
          rounds: msSeason.rounds,
        }]
      : []),
    {
      key: `liga-${liga.season}`,
      competition: 'Chance liga' as const,
      season: liga.season,
      players: liga.players,
      rounds: liga.rounds,
    },
  ];

  const sb = await createServerAuthClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const rawEmail = user?.email ?? '';
  const currentEmail = rawEmail.endsWith('@obtipovacka.local') ? '' : rawEmail;

  const seasonId = await getActiveSeasonId('liga');
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

      {/* Plné porovnání se všemi statistikami */}
      <section className="panel mt-6 p-5">
        <h2 className="eyebrow mb-3">
          <span className="flag-chip" /> ⚔️ H2H — porovnej se s kýmkoli
        </h2>
        <H2HCompare seasons={h2hSeasons} fixedPlayer={player.name} />
      </section>

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
