import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { normKey } from '@/lib/apiFootball';
import { fetchEspnResults, pairKey } from '@/lib/espn';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Rychlá kontrola, že zápasy „sedí" – porovná DB proti ESPN.
 *   GET /api/verify?key=CRON_SECRET          → jen problémy + souhrn
 *   GET /api/verify?key=CRON_SECRET&all=1     → vypíše i zápasy, které sedí
 *
 * Kontroluje: párování DB↔ESPN, shodu stavu (živě/dohráno), skóre u základní
 * hrací doby, prázdné týmy a duplicity (stejná dvojice ve stejném kole).
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
    .select('id, round, home_team, away_team, kickoff, status, home_score, away_score, duration')
    .eq('season_id', season.id)
    .order('kickoff', { ascending: true });

  let espn;
  try {
    espn = await fetchEspnResults();
  } catch (e) {
    return NextResponse.json({ error: `ESPN fetch failed: ${String(e)}` }, { status: 502 });
  }

  type Row = {
    id: number;
    round: number;
    home_team: string;
    away_team: string;
    kickoff: string;
    status: string;
    home_score: number | null;
    away_score: number | null;
    duration: string | null;
  };
  const all = (rows as Row[]) ?? [];
  const now = Date.now();

  // duplicity: stejná (kolo|dvojice) víc než jednou
  const pairCount = new Map<string, number[]>();
  for (const m of all) {
    const k = `${m.round}|${[normKey(m.home_team), normKey(m.away_team)].sort().join('|')}`;
    (pairCount.get(k) ?? pairCount.set(k, []).get(k)!).push(m.id);
  }
  const duplicities = [...pairCount.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([k, ids]) => ({ klic: k, ids }));

  const problems: Record<string, unknown>[] = [];
  const okList: Record<string, unknown>[] = [];
  let paired = 0;
  let unpaired = 0;

  for (const m of all) {
    const label = `${m.home_team || '??'} – ${m.away_team || '??'}`;
    const started = new Date(m.kickoff).getTime() <= now;

    if (!m.home_team || !m.away_team) {
      problems.push({ id: m.id, kolo: m.round, zapas: label, problem: 'prázdné týmy' });
      continue;
    }

    const r = espn.get(pairKey(m.home_team, m.away_team));
    if (!r) {
      // ESPN vrací jen probíhající/dohrané; budoucí (nezačaté) zápasy tu nejsou → to je OK
      if (started && m.status !== 'scheduled') {
        unpaired++;
        problems.push({ id: m.id, kolo: m.round, zapas: label, stav: m.status, problem: 'nenapárováno na ESPN (názvy týmů?)' });
      }
      continue;
    }
    paired++;

    // shoda stavu
    const espnStav = r.completed ? 'finished' : r.inProgress ? 'live' : 'pre';
    const stavSedi =
      (r.completed && m.status === 'finished') ||
      (r.inProgress && m.status === 'live') ||
      (!r.completed && !r.inProgress);

    // shoda skóre jen u základní hrací doby (u prodloužení je DB = stav po 90')
    const regular = !m.duration || m.duration === 'REGULAR';
    const skoreSedi =
      !r.completed ||
      !regular ||
      m.home_score == null ||
      (m.home_score === r.end90_home && m.away_score === r.end90_away);

    if (!stavSedi || !skoreSedi) {
      problems.push({
        id: m.id,
        kolo: m.round,
        zapas: label,
        db: { stav: m.status, skore: `${m.home_score ?? '–'}:${m.away_score ?? '–'}` },
        espn: { stav: espnStav, skore: `${r.end90_home}:${r.end90_away}`, minuta: r.clock || null },
        problem: [!stavSedi ? 'stav nesedí' : null, !skoreSedi ? 'skóre nesedí' : null].filter(Boolean).join(' + '),
      });
    } else if (showAll) {
      okList.push({ id: m.id, kolo: m.round, zapas: label, stav: m.status, skore: `${m.home_score ?? '–'}:${m.away_score ?? '–'}` });
    }
  }

  return NextResponse.json({
    souhrn: {
      zapasu_celkem: all.length,
      napparovano_espn: paired,
      nenaparovano: unpaired,
      duplicit: duplicities.length,
      problemu: problems.length,
      vse_ok: problems.length === 0 && duplicities.length === 0,
    },
    duplicity: duplicities,
    problemy: problems,
    ...(showAll ? { ok: okList } : {}),
  });
}
