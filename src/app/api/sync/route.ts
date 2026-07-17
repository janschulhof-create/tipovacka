import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchSeasonFixtures, normKey, type NormalizedMatch } from '@/lib/apiFootball';
import { fetchEspnResults, fetchEspnSummary, mergeStats, orientDetail, pairKey, type EspnResult } from '@/lib/espn';
import { runRoastBatch } from '@/lib/roastBatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Row = { id: number; home_team: string; away_team: string; duration?: string | null };

/**
 * Synchronizace MS 2026 a spuštění navazujícího syncu Chance ligy a Evropy.
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

  // Stávající cron zůstává na /api/sync. Jedním během současně spustíme
  // synchronizaci Chance ligy a Evropy přes již připravený endpoint.
  // Volání běží paralelně s MS, takže není nutné zakládat další cron.
  const additionalUrl = new URL('/api/sync-football', req.nextUrl.origin);
  // Ruční diagnostické/bootstrapping parametry přepošleme i přes stávající
  // /api/sync, aby uživatel nemusel měnit uloženou adresu cronu.
  for (const name of ['competition', 'full', 'repair', 'dates', 'highlightly_bootstrap', 'highlightly_force']) {
    const value = req.nextUrl.searchParams.get(name);
    if (value != null) additionalUrl.searchParams.set(name, value);
  }
  const additionalCompetitionsPromise = req.nextUrl.searchParams.get('debug')
    ? Promise.resolve(null)
    : fetch(additionalUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${secret}` },
        cache: 'no-store',
      })
        .then(async (response) => {
          let body: unknown = null;
          try {
            body = await response.json();
          } catch {
            body = { error: 'invalid JSON response' };
          }
          return { ok: response.ok, status: response.status, body };
        })
        .catch((error) => ({ ok: false, status: 0, body: { error: String(error) } }));

  const { data: season, error: seasonErr } = await supabase
    .from('seasons').select('id').eq('competition_key', 'ms').eq('is_active', true).single();
  if (seasonErr || !season) {
    const additionalCompetitions = await additionalCompetitionsPromise;
    return NextResponse.json(
      { error: 'no active MS season', additionalCompetitions, at: new Date().toISOString() },
      { status: 500 },
    );
  }

  // ── Šetření CPU: nejdřív levně zjisti, jestli je vůbec co dělat ──
  // Když se nic nehraje / nezačíná, nic není k dopočtu ani k ohodnocení,
  // skonči hned – běhy „naprázdno" jsou tak skoro zadarmo.
  const now = new Date();
  const winLo = new Date(now.getTime() - 4 * 3600 * 1000).toISOString(); // začal výkop (i doběh)
  const winHi = new Date(now.getTime() + 10 * 60 * 1000).toISOString(); // brzy začne
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const [liveRes, regRes, roastRes] = await Promise.all([
    supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', season.id)
      .neq('status', 'finished')
      .gte('kickoff', winLo)
      .lte('kickoff', winHi),
    supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', season.id)
      .eq('status', 'finished')
      .eq('reg_checked', false),
    hasKey
      ? supabase
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .eq('season_id', season.id)
          .eq('status', 'finished')
          .is('roast', null)
          .not('home_score', 'is', null)
      : Promise.resolve({ count: 0 }),
  ]);
  const doLive = (liveRes.count ?? 0) > 0; // něco se hraje/začíná → ESPN live + rozpis
  // Rozpis (nové zápasy po losu!) musí běžet i mimo herní okno – jinak by se
  // play-off vůbec nezaložilo. Stačí párkrát za hodinu, CPU to nezatíží.
  const scheduleTick = now.getMinutes() % 15 === 0;
  const doReg = (regRes.count ?? 0) > 0; // dohrané, ještě nepřepočtené → ESPN pending
  const doRoast = (roastRes.count ?? 0) > 0; // dohrané bez hodnocení → LLM

  if (!doLive && !doReg && !doRoast && !scheduleTick) {
    const additionalCompetitions = await additionalCompetitionsPromise;
    return NextResponse.json({ idle: true, additionalCompetitions, at: now.toISOString() });
  }

  // Football-data = POUZE ROZPIS (týmy, čas výkopu, kolo). Nic víc.
  // Skóre, stav zápasu, live, statistiky i sestavy řídí výhradně ESPN (níže).
  // Rozpis lze vypnout přes USE_FOOTBALL_DATA=0. Výpadek nikdy neshodí sync.
  // Běží při zápase (kvůli přesunům výkopu) a jinak každých 15 min (kvůli losu).
  const useFootballData = process.env.USE_FOOTBALL_DATA !== '0' && (doLive || scheduleTick);
  let fixtures: NormalizedMatch[] = [];
  let footballDataError: string | null = null;
  if (useFootballData) {
    try {
      fixtures = await fetchSeasonFixtures();
    } catch (e) {
      footballDataError = String(e);
    }
  }

  // existující zápasy aktivní sezóny:
  //  - primárně párujeme podle stabilního API id (external_api_id),
  //  - sekundárně podle (round|home|away) — kvůli prvotnímu napárování seedu.
  const { data: existing } = await supabase
    .from('matches')
    .select('id, external_api_id, round, home_team, away_team, kickoff')
    .eq('season_id', season.id);
  const keyOf = (r: number, h: string, a: string) => `${r}|${h}|${a}`;
  const idByApi = new Map<number, number>();
  const idByKey = new Map<string, number>();
  const idToTeams = new Map<number, { home: string; away: string }>();
  const idToMeta = new Map<number, { kickoff: string | null; apiId: number | null }>();
  const pairInRound = new Map<string, number>(); // "round|normHome|normAway(sorted)" -> id (na dedup play-off)
  for (const m of (existing as { id: number; external_api_id: number | null; round: number; home_team: string; away_team: string; kickoff: string | null }[]) ?? []) {
    if (m.external_api_id != null) idByApi.set(m.external_api_id, m.id);
    idByKey.set(keyOf(m.round, m.home_team, m.away_team), m.id);
    idToTeams.set(m.id, { home: m.home_team, away: m.away_team });
    idToMeta.set(m.id, { kickoff: m.kickoff, apiId: m.external_api_id });
    pairInRound.set(`${m.round}|${[normKey(m.home_team), normKey(m.away_team)].sort().join('|')}`, m.id);
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
    // Ještě neznámí soupeři (play-off před losem) → football-data vrací prázdné týmy. Přeskoč.
    if (!f.home_team || !f.away_team) continue;
    const pkey = `${f.round}|${[normKey(f.home_team), normKey(f.away_team)].sort().join('|')}`;
    // Napáruj na existující řádek: přes eventId → přesný klíč → normalizovanou dvojici v kole.
    const id =
      idByApi.get(f.external_api_id) ??
      idByKey.get(keyOf(f.round, f.home_team, f.away_team)) ??
      pairInRound.get(pkey);
    if (id && id > 0) {
      // ROZPIS ONLY: čas výkopu + eventId; u play-off placeholderů doplň týmy/kolo.
      // Skóre, stav, minutu, prodloužení ani statistiky ZDE NEsaháme (řídí ESPN).
      const cur = idToTeams.get(id);
      const meta = idToMeta.get(id);
      const needTeams = (!cur?.home || !cur?.away) && !!f.home_team && !!f.away_team;
      const kickoffChanged =
        !meta || !meta.kickoff || new Date(meta.kickoff).getTime() !== new Date(f.kickoff).getTime();
      const apiChanged = !meta || meta.apiId !== f.external_api_id;
      if (!needTeams && !kickoffChanged && !apiChanged) continue; // nic se nezměnilo → žádný zápis
      const patch: Record<string, unknown> = { external_api_id: f.external_api_id, kickoff: f.kickoff };
      if (needTeams) {
        patch.home_team = f.home_team;
        patch.away_team = f.away_team;
        patch.round = f.round;
      }
      const { error } = await supabase.from('matches').update(patch).eq('id', id);
      if (!error) updated++;
    } else {
      // Nový zápas (typicky play-off po losu) → vlož jen rozpis, stav 'scheduled'.
      // Skóre/stav doplní ESPN (i zpětně u už odehraných).
      inserts.push({
        season_id: season.id,
        round: f.round,
        kickoff: f.kickoff,
        home_team: f.home_team,
        away_team: f.away_team,
        external_api_id: f.external_api_id,
        status: 'scheduled',
      });
      pairInRound.set(pkey, -1); // ať týž zápas nevložíme dvakrát v jednom běhu
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
  if (doLive || doReg) try {
    const { data: pendData } = await supabase
      .from('matches')
      .select('id, home_team, away_team, duration')
      .eq('season_id', season.id)
      .eq('status', 'finished')
      .eq('reg_checked', false)
      .limit(20);
    // Kandidáti, jejichž stav řídí ESPN: cokoli po výkopu a ještě nedohrané
    // (živé i zpětně nedokončené). O stavu (živě/dohráno) rozhodne ESPN.
    const { data: liveData } = await supabase
      .from('matches')
      .select('id, home_team, away_team')
      .eq('season_id', season.id)
      .neq('status', 'finished')
      .lte('kickoff', new Date().toISOString())
      .order('kickoff', { ascending: false })
      .limit(20);
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
              lineups: sum?.lineups ?? r.detail.lineups ?? null,
            }
          : r.detail;
        const detailUpd = orientDetail(detail, same);

        // Hlavní zdroj skóre = timeline z keyEvents (má period i "90'+X"). Použijeme ho,
        // jen když sedí na finální skóre z ESPN (valid). Jinak spadneme na zálohu:
        //   scoreboard (spolehlivý jen pro REGULAR) → u prodloužení radši nepřepisujeme.
        // Rozdělení práce podle silných stránek každého zdroje:
        //  - REGULÉRNÍ zápas → scoreboard (r). Po opravě parseru minut spolehlivě
        //    odečítá góly v nastavení a správně je přiřazuje týmu (keyEvents u pár
        //    zápasů přiřazoval stranu obráceně).
        //  - PRODLOUŽENÍ / PENALTY → keyEvents timeline (má period, scoreboard ne).
        //    Když timeline není validní, radši nepřepisujeme (chráníme ruční data).
        const tl = sum?.timeline && sum.timeline.valid ? sum.timeline : null;
        const overtime = tl
          ? tl.duration !== 'REGULAR'
          : r.duration !== 'REGULAR' || m.duration === 'EXTRA_TIME' || m.duration === 'PENALTY_SHOOTOUT';

        let scorePayload: Record<string, unknown> | null;
        if (overtime) {
          scorePayload = tl
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
            : null; // prodloužení bez validní timeline → jen detail, skóre necháme
        } else {
          scorePayload = {
            reg_home: pick(r.reg90_home, r.reg90_away),
            reg_away: pick(r.reg90_away, r.reg90_home),
            home_score: pick(r.end90_home, r.end90_away),
            away_score: pick(r.end90_away, r.end90_home),
            duration: 'REGULAR',
            extra_home: null,
            extra_away: null,
            pen_home: null,
            pen_away: null,
            clock: null,
          };
        }

        const { error } = await supabase
          .from('matches')
          .update(
            scorePayload
              ? { ...scorePayload, detail: detailUpd, reg_checked: true }
              : { detail: detailUpd, reg_checked: true },
          )
          .eq('id', m.id);
        if (!error) espnSet++;
      }

      // živě / právě dohrané: o stavu rozhoduje ESPN (rychlé), ne football-data
      const liveJobs = liveMatches
        .map((m) => ({ m, r: espn.get(pairKey(m.home_team, m.away_team)) }))
        .filter((j): j is { m: Row; r: EspnResult } => !!j.r && (j.r.inProgress || j.r.completed));
      const liveStats = await Promise.all(
        liveJobs.map((j) => (j.r.eventId ? fetchEspnSummary(j.r.eventId, j.r.homeId, j.r.awayId) : Promise.resolve(null))),
      );
      for (let i = 0; i < liveJobs.length; i++) {
        const { m, r } = liveJobs[i];
        const sum = liveStats[i];
        const stats = sum ? { home: sum.home, away: sum.away } : null;
        const same = normKey(m.home_team) === normKey(r.homeCz);
        const detail = stats
          ? {
              ...r.detail,
              stats: {
                home: mergeStats(r.detail.stats?.home ?? {}, stats.home),
                away: mergeStats(r.detail.stats?.away ?? {}, stats.away),
              },
              lineups: sum?.lineups ?? r.detail.lineups ?? null,
            }
          : r.detail;
        // Skóre z ESPN (stejný rychlý zdroj jako feed golů). Orientace dle uložených názvů.
        const liveH = same ? r.scoreHome : r.scoreAway;
        const liveA = same ? r.scoreAway : r.scoreHome;

        if (r.completed) {
          // ESPN hlásí konec → přepni na finished; přesný přepočet (stav po 90'/prodloužení)
          // dodá pending průchod v příštím běhu (reg_checked=false).
          const { error } = await supabase
            .from('matches')
            .update({
              status: 'finished',
              home_score: liveH,
              away_score: liveA,
              clock: null,
              reg_checked: false,
              detail: orientDetail(detail, same),
            })
            .eq('id', m.id);
          if (!error) espnLive++;
        } else {
          // probíhá → živé skóre + minuta + detail; a označ jako live
          // (football-data mohlo zaostat a nenastavit status='live')
          const { error } = await supabase
            .from('matches')
            .update({
              status: 'live',
              home_score: liveH,
              away_score: liveA,
              clock: r.clock || null,
              detail: orientDetail(detail, same),
            })
            .eq('id', m.id);
          if (!error) espnLive++;
        }
      }
    }
  } catch {
    /* ESPN nedostupné nebo chybí sloupce – tiše přeskočíme, zkusí se příště */
  }

  // ── vtipné zhodnocení zápasů (LLM, viz roast.ts), pár za běh ──
  let roastsAdded = 0;
  if (doRoast) {
    try {
      const { done } = await runRoastBatch(supabase, season.id, 3);
      roastsAdded = done;
    } catch {
      /* generování hodnocení selhalo – tiše přeskočíme, zkusí se příště */
    }
  }

  const additionalCompetitions = await additionalCompetitionsPromise;

  return NextResponse.json({
    updated,
    inserted,
    fetched: fixtures.length,
    espn: { set: espnSet, live: espnLive, skipped: espnSkipped, invalid: espnInvalid },
    schedule: !useFootballData
      ? { source: 'football-data', enabled: false, ranThisTick: false }
      : footballDataError
        ? { source: 'football-data', ok: false, error: footballDataError, updated, inserted }
        : { source: 'football-data', ok: true, updated, inserted },
    roasts: roastsAdded,
    competition: process.env.FOOTBALL_DATA_COMPETITION ?? 'WC',
    additionalCompetitions,
    at: new Date().toISOString(),
  });
}
