import { notFound } from 'next/navigation';
import { getActiveSeasonId, getPlayerProfile, getStandings, getH2H } from '@/lib/queries';
import { ProfileView } from '@/components/ProfileView';

export const dynamic = 'force-dynamic';

export default async function HracPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vs?: string }>;
}) {
  const { id } = await params;
  const { vs } = await searchParams;
  const playerId = Number(id);
  if (!Number.isFinite(playerId)) notFound();

  const seasonId = await getActiveSeasonId('liga');
  if (!seasonId) return <p className="px-1 py-6 text-sm text-slate-100/50">Není aktivní sezóna.</p>;

  const profile = await getPlayerProfile(seasonId, playerId);
  if (!profile) notFound();

  const standings = await getStandings(seasonId);
  const others = standings.filter((s) => s.player_id !== playerId).map((s) => ({ id: s.player_id, name: s.name }));

  const vsId = vs ? Number(vs) : null;
  const h2h = vsId && Number.isFinite(vsId) && vsId !== playerId ? await getH2H(seasonId, playerId, vsId) : null;

  return (
    <main className="pb-10">
      <ProfileView profile={profile} h2h={h2h} others={others} vsId={vsId} basePath={`/hrac/${playerId}`} showBack />
    </main>
  );
}
