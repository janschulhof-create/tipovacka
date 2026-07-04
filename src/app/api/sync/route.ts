import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchSeasonFixtures, normKey, type NormalizedMatch } from '@/lib/apiFootball';
import { fetchEspnResults, fetchEspnStats, fetchEspnSummary, mergeStats, orientDetail, pairKey, type EspnResult } from '@/lib/espn';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Row = { id: number; home_team: string; away_team: string; duration?: string | null };

/**
 * Synchronizace rozpisu a výsledků z API-Football do aktivní sezóny.
 * Volání:
 *   - Vercel Cron (Authorization: Bearer CRON_SECRET) — viz vercel.json,
 *   - ručně: GET /api/sync?key=CRON_SECRET
 *
 * DŮLEŽITÉ pro zachování tipů: zápasy se PÁRUJÍ na už existující řádky
 * (naseedované) podle (round, home_team, away_team) v rámci aktivní sezóny.
 * Existující zápas se jen AKTUALIZUJE (skóre/stav/čas/minuta/external_api_id),
 * takže jeho id zůstává a tipy na něj zůstávají navázané. Nový řádek vznikne
 * jen pro zápas, který v DB ještě není (typicky play-off po losu).
 *
 * Zápis skóre+status spustí DB trigger calculate_points (přepočet bodů).
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!(key === secret || auth === `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: season, error: seasonErr } = await supabase
    .from('seasons').select('id').eq('is_active', true).single();
  if (seasonErr || !season) {
    return NextResponse.json({ error: 'no active season' }, { status: 500 });
  }

  let fixtures: NormalizedMatch[];
  try {
    fixtures = await fetchSeasonFixtures();
  } catch (e) {
    return NextResponse.json({
      error: String(e),
      tokenSet: !!process.env.FOOTBALL_DATA_TOKEN,
      competition: process.env.FOOTBALL_DATA_COMPETITION ?? 'WC',
    }, { status: 502 });
  }

  // existující zápasy aktivní sezóny:
  //  - primárně párujeme podle stabilního API id (external_api_id),
  //  - sekundárně podle (round|home|away) — kvůli prvotnímu napárování seedu.
  const { data: existing } = await supabase
    .from('matches')
    .select('id, external_api_id, round, home_team, away_team')
    .eq('season_id', season.id);
  const keyOf = (r: number, h: string, a: string) => `${r}|${h}|${a}`;
  const idByApi = new Map<number, number>();
  const idByKey = new Map<string, number>();
  const idToTeams = new Map<number, { home: string; away: string }>();
  for (const m of (existing as { id: number; external_api_id: number | null; round: number; home_team: string; away_team: string }[]) ?? []) {
    if (m.external_api_id != null) idByApi.set(m.external_api_id, m.id);
    idByKey.set(keyOf(m.round, m.home_team, m.away_team), m.id);
    idToTeams.set(m.id, { home: m.home_team, away: m.away_team });
  }

  // Diagnostika (?debug=1): nic nezapisuje, jen ukáže, co se děje.
  if (req.nextUrl.searchParams.get('debug')) {
    const ex = (existing as { id: number; external_api_id: number | null; round: number; home_team: string; away_team: string }[]) ?? [];
    const orphans = ex.filter((m) => m.external_api_id == null);
    const keyCount = new Map<string, number>();
    for (const m of ex) {
      const k = keyOf(m.round, m.home_team, m.away_team);
      keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
    }
    const dupKeys = [...keyCount.entries()].filter(([, c]) => c > 1).map(([k]) => k);
    const finishedFromApi = fixtures
      .filter((f) => f.status === 'finished')
      .slice(0, 8)
      .map((f) => ({ round: f.round, home: f.home_team, away: f.away_team, hs: f.home_score, as: f.away_score, api: f.external_api_id }));
    return NextResponse.json({
      existingCount: ex.length,
      fetched: fixtures.length,
      orphanCount: orphans.length,
      orphansSample: orphans.slice(0, 12).map((m) => ({ round: m.round, home: m.home_team, away: m.away_team })),
      dupKeyCount: dupKeys.length,
      dupKeys: dupKeys.slice(0, 24),
      finishedFromApi,
    });
  }

  let updated = 0;
  let inserted = 0;
  const inserts: Record<string, unknown>[] = [];

  for (const f of fixtures) {
    const id = idByApi.get(f.external_api_id) ?? idByKey.get(keyOf(f.round, f.home_team, f.away_team));
    if (id) {
      // jen doplníme dynamická pole — id (a tím i tipy) zůstává
      const patch: Record<string, unknown> = {
        external_api_id: f.external_api_id,
        kickoff: f.kickoff,
        status: f.status,
        minute: f.minute,
      };
      // Skóre po 90' přepíšeme jen když ho známe. U prodloužení rozhodnutého gólem
      // (bez rozpadu z feedu) je null → ponecháme ručně doplněný stav po 90'.
      if (f.home_score !== null) patch.home_score = f.home_score;
      if (f.away_score !== null) patch.away_score = f.away_score;
      // Detail prodloužení/penalt přepíšeme jen když feed potvrdí prodloužení – jinak
      // neklobrujeme ručně doplněné údaje (a REGULAR zápasům necháme výchozí hodnoty).
      if (f.duration !== 'REGULAR') {
        patch.duration = f.duration;
        patch.extra_home = f.extra_home;
        patch.extra_away = f.extra_away;
        patch.pen_home = f.pen_home;
        patch.pen_away = f.pen_away;
      }
      // Play-off placeholdery: když má zápas v DB prázdné týmy a los je už znám,
      // doplníme týmy + kolo. Správně naseedované skupiny zůstávají netknuté.
      const cur = idToTeams.get(id);
      if ((!cur?.home || !cur?.away) && f.home_team && f.away_team) {
        patch.home_team = f.home_team;
        patch.away_team = f.away_team;
        patch.round = f.round;
      }
      const { error } = await supabase.from('matches').update(patch).eq('id', id);
      if (!error) updated++;
    } else {
      inserts.push({ ...f, season_id: season.id });
    }
  }

  if (inserts.length) {
    const { error, count } = await supabase
      .from('matches')
      .upsert(inserts, { onConflict: 'external_api_id', count: 'exact' });
    if (error) return NextResponse.json({ error: error.message, updated }, { status: 500 });
    inserted = count ?? inserts.length;
  }

  // ── ESPN (zdarma, bez klíče): z minut gólů dopočti skóre v 90:00 (Pán nastavení),
  // stav po 90' (na body) a detail prodloužení/penalt. Zpracují se odehrané, ještě
  // neověřené zápasy (reg_checked=false). Dopočet se ověří proti finálnímu skóre od ESPN
  // – když nesedí nebo se zápas nenajde, přeskočíme (nechá se na příště/ruční doplnění).
  let espnSet = 0;
  let espnSkipped = 0;
  let espnInvalid = 0;
  let espnLive = 0;
  try {
    const { data: pendData } = await supabase
      .from('matches')
      .select('id, home_team, away_team, duration')
      .eq('season_id', season.id)
      .eq('status', 'finished')
      .eq('reg_checked', false)
      .limit(20);
    const { data: liveData } = await supabase
      .from('matches')
      .select('id, home_team, away_team')
      .eq('season_id', season.id)
      .eq('status', 'live')
      .limit(12);
    const pending = (pendData as Row[]) ?? [];
    const liveMatches = (liveData as Row[]) ?? [];

    if (pending.length > 0 || liveMatches.length > 0) {
      const espn = await fetchEspnResults();

      // dohrané: skóre v 90:00 + stav po 90' + detail + bohaté statistiky (jednou → reg_checked)
      const jobs = pending
        .map((m) => ({ m, r: espn.get(pairKey(m.home_team, m.away_team)) }))
        .filter((j): j is { m: Row; r: EspnResult } => {
          if (!j.r) {
            espnSkipped++;
            return false;
          }
          if (!j.r.valid) {
            espnInvalid++;
            return false;
          }
          return true;
        });

      // summary stáhneme paralelně: statistiky + timeline (keyEvents) → spolehlivé skóre
      const sumList = await Promise.all(
        jobs.map((j) =>
          j.r.eventId
            ? fetchEspnSummary(j.r.eventId, j.r.homeId, j.r.awayId, j.r.scoreHome, j.r.scoreAway)
            : Promise.resolve(null),
        ),
      );

      for (let i = 0; i < jobs.length; i++) {
        const { m, r } = jobs[i];
        const sum = sumList[i];
        const stats = sum ? { home: sum.home, away: sum.away } : null;
        const same = normKey(m.home_team) === normKey(r.homeCz);
        const pick = <T,>(h: T, a: T): T => (same ? h : a);
        const detail = stats
          ? {
              ...r.detail,
              stats: {
                home: mergeStats(r.detail.stats?.home ?? {}, stats.home),
                away: mergeStats(r.detail.stats?.away ?? {}, stats.away),
              },
            }
          : r.detail;
        const detailUpd = orientDetail(detail, same);

        // Hlavní zdroj skóre = timeline z keyEvents (má period i "90'+X"). Použijeme ho,
        // jen když sedí na finální skóre z ESPN (valid). Jinak spadneme na zálohu:
        //   scoreboard (spolehlivý jen pro REGULAR) → u prodloužení radši nepřepisujeme.
        const tl = sum?.timeline && sum.timeline.valid ? sum.timeline : null;
        const knownOvertime = m.duration === 'EXTRA_TIME' || m.duration === 'PENALTY_SHOOTOUT';
        const scoreboardUnsafe = !tl && (knownOvertime || r.duration !== 'REGULAR');

        const scorePayload = tl
          ? {
              reg_home: pick(tl.reg90_home, tl.reg90_away),
              reg_away: pick(tl.reg90_away, tl.reg90_home),
              home_score: pick(tl.end90_home, tl.end90_away),
              away_score: pick(tl.end90_away, tl.end90_home),
              duration: tl.duration,
              extra_home: pick(tl.extra_home, tl.extra_away),
              extra_away: pick(tl.extra_away, tl.extra_home),
              pen_home: pick(tl.pen_home, tl.pen_away),
              pen_away: pick(tl.pen_away, tl.pen_home),
              clock: null,
            }
          : {
              reg_home: pick(r.reg90_home, r.reg90_away),
              reg_away: pick(r.reg90_away, r.reg90_home),
              home_score: pick(r.end90_home, r.end90_away),
              away_score: pick(r.end90_away, r.end90_home),
              duration: r.duration,
              extra_home: pick(r.extra_home, r.extra_away),
              extra_away: pick(r.extra_away, r.extra_home),
              pen_home: pick(r.pen_home, r.pen_away),
              pen_away: pick(r.pen_away, r.pen_home),
              clock: null,
            };

        const { error } = await supabase
          .from('matches')
          .update(
            scoreboardUnsafe
              ? { detail: detailUpd, reg_checked: true } // prodloužení bez validní timeline → jen detail
              : { ...scorePayload, detail: detailUpd, reg_checked: true },
          )
          .eq('id', m.id);
        if (!error) espnSet++;
      }

      // živé: živá minuta + detail vč. bohatých statistik (přepočítává se každý běh)
      const liveJobs = liveMatches
        .map((m) => ({ m, r: espn.get(pairKey(m.home_team, m.away_team)) }))
        .filter((j): j is { m: Row; r: EspnResult } => !!j.r);
      const liveStats = await Promise.all(
        liveJobs.map((j) => (j.r.eventId ? fetchEspnStats(j.r.eventId, j.r.homeId, j.r.awayId) : Promise.resolve(null))),
      );
      for (let i = 0; i < liveJobs.length; i++) {
        const { m, r } = liveJobs[i];
        const stats = liveStats[i];
        const same = normKey(m.home_team) === normKey(r.homeCz);
        const detail = stats
          ? {
              ...r.detail,
              stats: {
                home: mergeStats(r.detail.stats?.home ?? {}, stats.home),
                away: mergeStats(r.detail.stats?.away ?? {}, stats.away),
              },
            }
          : r.detail;
        // Živé skóre bereme z ESPN (stejný rychlý zdroj jako feed golů) → skóre pro body
        // se už neopožďuje za feedem. Orientace dle uložených názvů.
        const liveH = same ? r.scoreHome : r.scoreAway;
        const liveA = same ? r.scoreAway : r.scoreHome;
        const { error } = await supabase
          .from('matches')
          .update({
            home_score: liveH,
            away_score: liveA,
            clock: r.clock || null,
            detail: orientDetail(detail, same),
          })
          .eq('id', m.id);
        if (!error) espnLive++;
      }
    }
  } catch {
    /* ESPN nedostupné nebo chybí sloupce – tiše přeskočíme, zkusí se příště */
  }

  return NextResponse.json({
    updated,
    inserted,
    fetched: fixtures.length,
    espn: { set: espnSet, live: espnLive, skipped: espnSkipped, invalid: espnInvalid },
    competition: process.env.FOOTBALL_DATA_COMPETITION ?? 'WC',
    at: new Date().toISOString(),
  });
}
