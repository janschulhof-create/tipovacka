import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { normKey } from '@/lib/apiFootball';
import { fetchEspnResults, pairKey } from '@/lib/espn';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Ověření „Pána nastavení" (skóre v 90:00) na všech odehraných zápasech.
 *   GET /api/verify-reg?key=CRON_SECRET
 *   GET /api/verify-reg?key=CRON_SECRET&all=1   (vypíše i zápasy bez gólu v nastavení)
 *
 * Porovná uložené reg_home/reg_away a home_score/away_score v DB s hodnotami
 * přepočtenými z ESPN. Vypíše zápasy s gólem v nastavení 2. poločasu a neshody.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get('key') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized – přidej ?key=CRON_SECRET' }, { status: 401 });
  }
  const showAll = p.get('all') === '1';

  const supabase = createAdminClient();
  const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single();
  if (!season) return NextResponse.json({ error: 'aktivní season nenalezena' }, { status: 404 });

  const { data: rows } = await supabase
    .from('matches')
    .select('id, home_team, away_team, reg_home, reg_away, home_score, away_score, duration, kickoff')
    .eq('season_id', season.id)
    .eq('status', 'finished')
    .order('kickoff', { ascending: true });

  let espn;
  try {
    espn = await fetchEspnResults();
  } catch (e) {
    return NextResponse.json({ error: `ESPN fetch failed: ${String(e)}` }, { status: 502 });
  }

  type Row = {
    id: number;
    home_team: string;
    away_team: string;
    reg_home: number | null;
    reg_away: number | null;
    home_score: number | null;
    away_score: number | null;
    duration: string | null;
  };

  const detail: unknown[] = [];
  let stoppage = 0;
  let mismatch = 0;
  let notFound = 0;
  let ok = 0;
  let overtimeManual = 0;

  for (const m of (rows as Row[]) ?? []) {
    // Zápasy v prodloužení / na penalty: ESPN scoreboard neumí spolehlivě rozdělit góly
    // (chybí period), skóre po 90' držíme z ručních backfillů → nebereme jako neshodu.
    if (m.duration === 'EXTRA_TIME' || m.duration === 'PENALTY_SHOOTOUT') {
      overtimeManual++;
      detail.push({
        zapas: `${m.home_team}–${m.away_team}`,
        duration: m.duration,
        pan_nastaveni_90_00: `${m.reg_home}:${m.reg_away}`,
        stav_po_90: `${m.home_score}:${m.away_score}`,
        poznamka: 'prodloužení/penalty – ruční data (ESPN nerozděluje), nekontroluje se proti ESPN',
      });
      continue;
    }

    const r = espn.get(pairKey(m.home_team, m.away_team));
    if (!r || !r.valid) {
      notFound++;
      detail.push({ zapas: `${m.home_team}–${m.away_team}`, poznamka: r ? 'ESPN dopočet neprošel validací' : 'ESPN zápas nenalezen (názvy?)' });
      continue;
    }
    const same = normKey(m.home_team) === normKey(r.homeCz);
    const regH = same ? r.reg90_home : r.reg90_away;
    const regA = same ? r.reg90_away : r.reg90_home;
    const endH = same ? r.end90_home : r.end90_away;
    const endA = same ? r.end90_away : r.end90_home;

    const hadStoppage = regH !== endH || regA !== endA;
    const stoppageGoals = (r.detail.goals ?? [])
      .filter((g) => (g.min ?? '').includes("90'+"))
      .map((g) => `${g.min} ${g.player} (${g.side === 'home' ? m.home_team : m.away_team})`);

    const regOk = m.reg_home === regH && m.reg_away === regA;
    const scoreOk = m.home_score === endH && m.away_score === endA;
    const allOk = regOk && scoreOk;

    if (hadStoppage) stoppage++;
    if (!allOk) mismatch++;
    else ok++;

    if (hadStoppage || !allOk || showAll) {
      detail.push({
        zapas: `${m.home_team} ${endH}:${endA} ${m.away_team}`,
        duration: r.duration,
        pan_nastaveni_90_00: `${regH}:${regA}`,
        stav_po_90: `${endH}:${endA}`,
        goly_v_nastaveni_2pol: stoppageGoals.length ? stoppageGoals : '—',
        db_ulozeno: { reg: `${m.reg_home}:${m.reg_away}`, skore: `${m.home_score}:${m.away_score}` },
        sedi_db_s_espn: allOk ? 'ANO' : `NE (reg ${regOk ? 'ok' : 'X'}, skóre ${scoreOk ? 'ok' : 'X'})`,
      });
    }
  }

  return NextResponse.json({
    souhrn: {
      odehrano: (rows ?? []).length,
      s_golem_v_nastaveni: stoppage,
      prodlouzeni_penalty_rucni: overtimeManual,
      neshody_db_vs_espn: mismatch,
      espn_nenalezeno_ci_nevalidni: notFound,
      v_poradku: ok,
    },
    legenda: 'pan_nastaveni_90_00 = skóre v 90:00 (na body pro Pána nastavení). Když se liší od stav_po_90, padl gól v nastavení 2. poločasu. sedi_db_s_espn=NE → zápas se nepřepočítal (spusť reg_checked=false) nebo je jinde problém.',
    detail,
  });
}
