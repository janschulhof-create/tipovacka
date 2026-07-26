import { NextRequest, NextResponse } from 'next/server';
import { getSessionPlayer } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PushSubscriptionPayload = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};



type ResultMatchRow = {
  id: number;
  kickoff: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
};

type ResultPredictionRow = {
  match_id: number;
  predicted_home: number;
  predicted_away: number;
  points: number | null;
};

function pointsLabel(points: number) {
  const absolute = Math.abs(points);
  if (absolute === 1) return `${points} bod`;
  if (absolute >= 2 && absolute <= 4) return `${points} body`;
  return `${points} bodů`;
}

function stablePick(lines: readonly string[], ...parts: Array<string | number>) {
  const text = parts.join('|');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return lines[Math.abs(hash) % lines.length];
}

function isBohemka(team: string) {
  return /bohem/i.test(team);
}

function tippedBohemkaToWin(match: ResultMatchRow, prediction: ResultPredictionRow) {
  if (isBohemka(match.home_team)) return prediction.predicted_home > prediction.predicted_away;
  if (isBohemka(match.away_team)) return prediction.predicted_away > prediction.predicted_home;
  return false;
}

function isJablonec(team: string) {
  return /jablon/i.test(team);
}

function tippedJablonecToWin(match: ResultMatchRow, prediction: ResultPredictionRow) {
  if (isJablonec(match.home_team)) return prediction.predicted_home > prediction.predicted_away;
  if (isJablonec(match.away_team)) return prediction.predicted_away > prediction.predicted_home;
  return false;
}

function isSlovackoMatch(match: ResultMatchRow) {
  return /slováck|slovack|synot/i.test(`${match.home_team} ${match.away_team}`);
}

function predictionTotal(prediction: ResultPredictionRow) {
  return prediction.predicted_home + prediction.predicted_away;
}

function isAbsurdPrediction(prediction: ResultPredictionRow) {
  return predictionTotal(prediction) >= 7
    || Math.abs(prediction.predicted_home - prediction.predicted_away) >= 4;
}

function isOneNilAgainstDraw(match: ResultMatchRow, prediction: ResultPredictionRow) {
  return match.home_score === 1
    && match.away_score === 0
    && prediction.predicted_home === prediction.predicted_away;
}

function resultEvaluation(points: number, ...seed: Array<string | number>) {
  if (points === 10) return stablePick([
    '„Volal Pelta.“ Přesný zásah je potvrzený.',
    '„Tak poď vole.“ Přesný zásah! 🎯',
    '„Když se daří a padá to tam, to umí každej blbec.“ Deset bodů je doma.',
    'Tohle není baroko, to je fotbalová poezie.',
  ], ...seed, points);
  if (points >= 6) return stablePick([
    'Parádní tip. Komise potvrzuje velmi slušnou práci.',
    'Na okrese by tě po tomhle nosili na ramenou.',
  ], ...seed, points);
  if (points >= 4) return stablePick([
    'Správný vítěz. Funkcionářsky se to obhájit dá.',
    'Jít štěstíčku naproti. Směr dobrý, provedení lehce okresní.',
  ], ...seed, points);
  if (points >= 2) return stablePick([
    'Seděl alespoň počet gólů. Na oslavy to není, do tabulky se to počítá.',
    'Dva body. Něco se zachránilo, úplné baroko to nebylo.',
  ], ...seed, points);
  return stablePick([
    '„To by člověk blil, Milane.“ Komise zapsala nulu.',
    '„Ty by nás sfoukli jako svíčku.“ Z tohohle nebyl ani bod.',
    '„Vy mě nechcete za tipéra?“ Tohle se bude v kabině vysvětlovat těžko.',
  ], ...seed, points);
}

function modalMood(matches: ResultMatchRow[], predictions: ResultPredictionRow[], playerId: number, blockKey: string) {
  const byMatch = new Map(predictions.map((prediction) => [prediction.match_id, prediction]));
  if (matches.length === 1) {
    const match = matches[0];
    const prediction = byMatch.get(match.id);
    if (!prediction) return '„Talent máš, tipy ti chyběj.“ Tady chyběl přesně jeden a body jsou pryč.';
    const points = prediction.points ?? 0;
    if (points === 0 && tippedBohemkaToWin(match, prediction)) return '„Bohemka no.“';
    if (points === 0 && isAbsurdPrediction(prediction)) return '„Kapříci připluli.“ Tohle byl tip pro vlastní vyšetřovací spis.';
    if (isOneNilAgainstDraw(match, prediction)) return '„Já koukal na ten teletext a najednou tam naskočilo 1:0.“';
    if (tippedJablonecToWin(match, prediction)) return '„Počkej pocem, nehrál tys divizi?“';
    if (isSlovackoMatch(match)) return '„Ten Synot, ty Slovácí, jsou schopný vole ještě vyhrát.“';
    if (predictionTotal(prediction) >= 6 && points > 0 && points < 10) return stablePick([
      '„Jak vidíte, čím víc gólů tipujeme, tím víc bodů máme.“',
      '„Já vyznávám útočnou kombinační filozofii.“',
      '„Dneska očekávám 2 body. Za výhru jsou ale 4 body.“',
    ], playerId, blockKey, match.id, 'modal-high-goals');
    return resultEvaluation(points, playerId, blockKey, match.id);
  }

  const tipped = matches
    .map((match) => byMatch.get(match.id))
    .filter((prediction): prediction is ResultPredictionRow => Boolean(prediction));
  const totalPoints = tipped.reduce((sum, prediction) => sum + (prediction.points ?? 0), 0);
  const exact = tipped.filter((prediction) => prediction.points === 10).length;
  const bohemkaZero = matches.some((match) => {
    const prediction = byMatch.get(match.id);
    return Boolean(prediction && (prediction.points ?? 0) === 0 && tippedBohemkaToWin(match, prediction));
  });
  const oneNilMiss = matches.some((match) => {
    const prediction = byMatch.get(match.id);
    return Boolean(prediction && isOneNilAgainstDraw(match, prediction));
  });
  const absurdZero = tipped.some((prediction) => (prediction.points ?? 0) === 0 && isAbsurdPrediction(prediction));
  if (bohemkaZero) return '„Bohemka no.“ V tomhle bloku důvěra v klokany nepřinesla ani bod.';
  if (exact > 0) return stablePick([
    '„Volal Pelta.“ Přesný zásah je potvrzený.',
    '„Tak poď vole.“ Přesný zásah je v zápisu.',
    '„Když se daří a padá to tam, to umí každej blbec.“',
  ], playerId, blockKey, 'modal-exact');
  if (oneNilMiss) return '„Já koukal na ten teletext a najednou tam naskočilo 1:0.“ Remízový tip zmizel ze zápisu.';
  if (absurdZero) return '„Kapříci připluli.“ V bloku se objevil tip, který si žádá vlastní komisi.';
  if (totalPoints === 0) return stablePick([
    '„Loď se potápí, bárka de ke dnu.“ V tomhle bloku nepřiplul ani bod.',
    '„To by člověk blil, Milane.“ Komise nenašla jediný bod.',
    '„Ty by nás sfoukli jako svíčku.“ Tenhle blok skončil bez jediného bodu.',
  ], playerId, blockKey, 'modal-zero');
  return stablePick([
    '„Ty vole, to jsou nervy.“ Něco cinklo, ale klid v kabině nebyl.',
    'Trocha fotbalu, trocha baroka, body zůstaly.',
    'Výkon obhajitelný, zápis podepsán.',
  ], playerId, blockKey, 'modal-mid');
}

async function resultModalResponse(request: NextRequest, playerId: number) {
  const seasonId = Number(request.nextUrl.searchParams.get('season'));
  const round = Number(request.nextUrl.searchParams.get('round'));
  const blockKey = request.nextUrl.searchParams.get('block') || '';
  const blockDate = new Date(blockKey);
  if (!Number.isInteger(seasonId) || seasonId <= 0 || !Number.isInteger(round) || round <= 0 || Number.isNaN(blockDate.getTime())) {
    return NextResponse.json({ error: 'Odkaz na vyhodnocení není platný.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const from = new Date(blockDate.getTime() - 60_000).toISOString();
  const to = new Date(blockDate.getTime() + 60_000).toISOString();
  const { data: matches, error: matchesError } = await admin
    .from('matches')
    .select('id, kickoff, home_team, away_team, home_score, away_score, status')
    .eq('season_id', seasonId)
    .eq('round', round)
    .gte('kickoff', from)
    .lte('kickoff', to)
    .order('id');
  if (matchesError) return NextResponse.json({ error: matchesError.message }, { status: 500 });

  const matchRows = (matches || []) as ResultMatchRow[];
  if (!matchRows.length) return NextResponse.json({ error: 'Vyhodnocení tohoto bloku už není dostupné.' }, { status: 404 });
  if (matchRows.some((match) => match.status !== 'finished' || match.home_score == null || match.away_score == null)) {
    return NextResponse.json({ error: 'Zápasy ještě nejsou kompletně vyhodnocené.' }, { status: 409 });
  }

  const matchIds = matchRows.map((match) => match.id);
  const { data: predictions, error: predictionsError } = await admin
    .from('predictions')
    .select('match_id, predicted_home, predicted_away, points')
    .eq('player_id', playerId)
    .in('match_id', matchIds);
  if (predictionsError) return NextResponse.json({ error: predictionsError.message }, { status: 500 });

  const predictionRows = (predictions || []) as ResultPredictionRow[];
  const byMatch = new Map(predictionRows.map((prediction) => [prediction.match_id, prediction]));
  const totalPoints = predictionRows.reduce((sum, prediction) => sum + (prediction.points ?? 0), 0);
  const exact = predictionRows.filter((prediction) => prediction.points === 10).length;
  const missing = Math.max(0, matchRows.length - predictionRows.length);
  const timeLabel = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    hour: '2-digit',
    minute: '2-digit',
  }).format(blockDate);

  const rows = matchRows.map((match) => {
    const prediction = byMatch.get(match.id);
    return {
      id: match.id,
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      homeScore: match.home_score,
      awayScore: match.away_score,
      predictedHome: prediction?.predicted_home ?? null,
      predictedAway: prediction?.predicted_away ?? null,
      points: prediction?.points ?? 0,
      hadPrediction: Boolean(prediction),
    };
  });

  return NextResponse.json({
    kind: 'result',
    round,
    blockKey,
    title: matchRows.length === 1
      ? `${matchRows[0].home_team} ${matchRows[0].home_score}:${matchRows[0].away_score} ${matchRows[0].away_team}`
      : `Vyhodnocení bloku ${timeLabel}`,
    summary: matchRows.length === 1
      ? predictionRows.length
        ? `Tvůj tip ${predictionRows[0].predicted_home}:${predictionRows[0].predicted_away} · ${pointsLabel(totalPoints)}`
        : 'Tip nebyl uložený · 0 bodů'
      : `${matchRows.length} zápasy · ${pointsLabel(totalPoints)}${exact ? ` · ${exact} přesný tip${exact > 1 ? 'y' : ''}` : ''}${missing ? ` · ${missing} bez tipu` : ''}`,
    mood: modalMood(matchRows, predictionRows, playerId, blockKey),
    matches: rows,
  });
}
const defaultPreferences = {
  notify24h: true,
  notify3h: true,
  notifyResults: true,
};

function pushConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    publicKey,
    hasServiceRole,
    configured: Boolean(publicKey && hasServiceRole),
    setupIssue: !publicKey
      ? 'Na Vercelu chybí proměnná NEXT_PUBLIC_VAPID_PUBLIC_KEY.'
      : !hasServiceRole
        ? 'Na Vercelu chybí proměnná SUPABASE_SERVICE_ROLE_KEY.'
        : '',
  };
}

function statusResponse(config: ReturnType<typeof pushConfig>, extra?: Record<string, unknown>) {
  return NextResponse.json({
    authenticated: true,
    configured: config.configured,
    publicKey: config.publicKey,
    subscribed: false,
    preferences: defaultPreferences,
    ...(config.setupIssue ? { setupIssue: config.setupIssue } : {}),
    ...extra,
  });
}

export async function GET(request: NextRequest) {
  const player = await getSessionPlayer();
  if (!player) return NextResponse.json({ authenticated: false, error: 'Pro zobrazení vyhodnocení se přihlas.' }, { status: 401 });

  if (request.nextUrl.searchParams.get('view') === 'result') {
    return resultModalResponse(request, player.id);
  }

  const config = pushConfig();
  if (!config.configured) return statusResponse(config);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, notify_24h, notify_3h, notify_results, active')
      .eq('player_id', player.id)
      .eq('active', true)
      .order('updated_at', { ascending: false });

    if (error?.code === '42P01') {
      return statusResponse(
        { ...config, configured: false },
        { setupIssue: 'V Supabase chybí tabulka push_subscriptions. Spusť část WEB PUSH NOTIFIKACE ze schema.sql.' },
      );
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const first = data?.[0];
    const endpoint = request.nextUrl.searchParams.get('endpoint') || '';
    const currentDeviceSubscribed = endpoint
      ? Boolean(data?.some((row) => row.active && row.endpoint === endpoint))
      : false;

    return statusResponse(config, {
      subscribed: currentDeviceSubscribed,
      preferences: {
        notify24h: first?.notify_24h ?? true,
        notify3h: first?.notify_3h ?? true,
        notifyResults: first?.notify_results ?? true,
      },
    });
  } catch (error) {
    console.error('push status failed', error);
    return NextResponse.json(
      { error: 'Server nedokázal načíst nastavení upozornění. Zkontroluj Supabase proměnné ve Vercelu.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const player = await getSessionPlayer();
  if (!player) return NextResponse.json({ error: 'Nejsi přihlášený.' }, { status: 401 });

  const config = pushConfig();
  if (!config.configured) {
    return NextResponse.json({ error: config.setupIssue || 'Push notifikace nejsou nakonfigurované.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '');

  try {
    const admin = createAdminClient();

    if (action === 'subscribe') {
      const subscription = (body?.subscription || {}) as PushSubscriptionPayload;
      if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return NextResponse.json({ error: 'Neplatná push subscription.' }, { status: 400 });
      }
      const { error } = await admin.from('push_subscriptions').upsert({
        player_id: player.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: request.headers.get('user-agent') || '',
        notify_24h: body?.notify24h !== false,
        notify_3h: body?.notify3h !== false,
        notify_results: body?.notifyResults !== false,
        active: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error?.code === '42P01') return NextResponse.json({ error: 'V Supabase chybí tabulka push_subscriptions.' }, { status: 503 });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'preferences') {
      const { error } = await admin.from('push_subscriptions').update({
        notify_24h: body?.notify24h !== false,
        notify_3h: body?.notify3h !== false,
        notify_results: body?.notifyResults !== false,
        updated_at: new Date().toISOString(),
      }).eq('player_id', player.id).eq('active', true);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'unsubscribe') {
      const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
      let query = admin.from('push_subscriptions').update({
        active: false,
        updated_at: new Date().toISOString(),
      }).eq('player_id', player.id);
      if (endpoint) query = query.eq('endpoint', endpoint);
      const { error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Neznámá akce.' }, { status: 400 });
  } catch (error) {
    console.error('push action failed', error);
    return NextResponse.json({ error: 'Server nedokázal dokončit práci s upozorněním.' }, { status: 500 });
  }
}
