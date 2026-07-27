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
  detail: { cards?: Array<{ side: 'home' | 'away'; color: 'yellow' | 'red' }> } | null;
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

function tippedHomeWinButHomeLost(match: ResultMatchRow, prediction: ResultPredictionRow) {
  return prediction.predicted_home > prediction.predicted_away
    && (match.home_score ?? 0) < (match.away_score ?? 0);
}

function tippedTeamWhoseOpponentGotRed(match: ResultMatchRow, prediction: ResultPredictionRow) {
  const redSides = new Set(
    (match.detail?.cards ?? [])
      .filter((card) => card.color === 'red')
      .map((card) => card.side),
  );
  if (prediction.predicted_home > prediction.predicted_away) return redSides.has('away');
  if (prediction.predicted_away > prediction.predicted_home) return redSides.has('home');
  return false;
}

function matchesLabel(count: number) {
  if (count === 1) return '1 zápas';
  if (count >= 2 && count <= 4) return `${count} zápasy`;
  return `${count} zápasů`;
}

function evaluation(points: number, ...seed: Array<string | number>) {
  if (points === 10) return '„Ty vole, v těhle letech ty tipy.“ Přesný zásah za 10 bodů je doma.';
  if (points >= 6) return stablePick([
    'Parádní tip.',
    'Na okrese by tě po tomhle nosili na ramenou.',
    'Komise potvrzuje: velmi slušná práce.',
  ], ...seed, points);
  if (points >= 4) return stablePick([
    'Správný vítěz.',
    'Jít štěstíčku naproti. Směr dobrý, provedení lehce okresní.',
    'Výsledek nevyšel, ale funkcionářsky se to obhájit dá.',
  ], ...seed, points);
  if (points >= 2) return stablePick([
    'Seděl alespoň počet gólů.',
    'Něco se zachránilo, úplné baroko to nebylo.',
    'Dva body. Na zápis to stačí, na oslavy ne.',
  ], ...seed, points);
  return stablePick([
    'Tentokrát bez bodu.',
    '„To by člověk blil, Milane.“ Tentokrát bez bodu.',
    '„Loď se potápí, bárka de ke dnu.“ Tenhle tip právě nabral vodu.',
    'Tohle je takový baroko. Nula bodů a dlouhá cesta domů.',
    'Tenhle tip se nepovedl. Komise zavřela zápis.',
    'Komise zasedla a ponechala nulu v platnosti.',
    '„Vy mě nechcete za tipéra?“ Po téhle nule komise chvíli mlčela.',
    '„Ty by nás sfoukli jako svíčku.“ Tenhle tip nepřežil ani bod.',
  ], ...seed, points);
}

function truncate(value: string, maxLength = 220) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function resultNotification(matches: ResultMatchRow[], predictions: ResultPredictionRow[], playerId: number, playerName: string, blockKey: string) {
  const byMatch = new Map(predictions.map((prediction) => [prediction.match_id, prediction]));
  const resultList = matches
    .map((match) => `${match.home_team} ${match.home_score}:${match.away_score} ${match.away_team}`)
    .join(' · ');

  if (matches.length === 1) {
    const match = matches[0];
    const prediction = byMatch.get(match.id);
    const title = `Konec: ${match.home_team} ${match.home_score}:${match.away_score} ${match.away_team}`;
    const specialLeads = prediction
      ? [
        tippedTeamWhoseOpponentGotRed(match, prediction)
          ? `„Pane ${playerName}, vždyť já mám stejnej zájem jako vy.“ Soupeř tipovaného týmu dostal červenou.`
          : '',
        tippedHomeWinButHomeLost(match, prediction)
          ? '„Von tleskal nad hlavou a já dělal, že to nevidím.“ Domácí přesto prohráli.'
          : '',
      ].filter(Boolean)
      : [];
    const standardLead = specialLeads.length > 0
      ? ''
      : prediction && isOneNilAgainstDraw(match, prediction)
        ? '„Já koukal na ten teletext a najednou tam naskočilo 1:0.“'
        : prediction && tippedJablonecToWin(match, prediction)
          ? '„Počkej pocem, nehrál tys divizi?“'
          : isSlovackoMatch(match)
            ? '„Ten Synot, ty Slovácí, jsou schopný vole ještě vyhrát.“'
            : match.home_score === match.away_score
              ? stablePick([
                '„Já bych tady, hele, Teplice kříž.“',
                '„Řekni, co o tomhle zápase řekl Beckham.“',
              ], playerId, blockKey, match.id, 'draw-quote')
              : Math.abs((match.home_score ?? 0) - (match.away_score ?? 0)) === 1
                ? stablePick([
                  '„Ty vole, to jsou nervy.“',
                  '„Řekni, co o tomhle zápase řekl Beckham.“',
                ], playerId, blockKey, match.id, 'tight-quote')
                : stablePick([
                  '',
                  '„Řekni, co o tomhle zápase řekl Beckham.“',
                  '„Ti volal Pelta, jo?“',
                ], playerId, blockKey, match.id, 'result-quote');
    const quoteLead = [...specialLeads, standardLead].filter(Boolean).join(' ');
    const predictionPoints = prediction?.points ?? 0;
    const resultEvaluation = prediction && predictionPoints === 0 && tippedBohemkaToWin(match, prediction)
      ? '„Bohemka no.“'
      : prediction && predictionPoints === 0 && isAbsurdPrediction(prediction)
        ? '„Kapříci připluli.“ Tohle byl tip pro vlastní vyšetřovací spis.'
        : prediction && predictionPoints > 0 && predictionPoints < 10 && predictionTotal(prediction) >= 6
          ? stablePick([
            '„Jak vidíte, čím víc gólů tipujeme, tím víc bodů máme.“',
            '„Já vyznávám útočnou kombinační filozofii.“',
            '„Dneska očekávám 2 body. Za výhru jsou ale 4 body.“',
          ], playerId, blockKey, match.id, 'high-goals')
          : evaluation(predictionPoints, playerId, blockKey, match.id);
    const body = prediction
      ? `${quoteLead ? `${quoteLead} ` : ''}Tvůj tip ${prediction.predicted_home}:${prediction.predicted_away} · ${pointsLabel(prediction.points ?? 0)}. ${resultEvaluation}`
      : stablePick([
        'Zápas skončil. Tip jsi neměl uložený.',
        'Bez uloženého tipu se body nerozdávají.',
        'Sestava bez tipu, tabulka bez bodů. Čistý okres.',
        '„Vy mě nechcete za tipéra?“ Bez uloženého tipu je odpověď komise zatím neurčitá.',
        '„Talent máš, tipy ti chyběj.“ Tady chyběl přesně jeden a body jsou pryč.',
      ], playerId, blockKey, match.id, 'missing-tip');
    return { title, body: truncate(body) };
  }

  const tipped = matches
    .map((match) => byMatch.get(match.id))
    .filter((prediction): prediction is ResultPredictionRow => Boolean(prediction));
  const totalPoints = tipped.reduce((sum, prediction) => sum + (prediction.points ?? 0), 0);
  const exact = tipped.filter((prediction) => prediction.points === 10).length;
  const missing = Math.max(0, matches.length - tipped.length);

  const bohemkaZeros = matches.filter((match) => {
    const prediction = byMatch.get(match.id);
    return Boolean(prediction && (prediction.points ?? 0) === 0 && tippedBohemkaToWin(match, prediction));
  }).length;
  const jablonecWinTips = matches.filter((match) => {
    const prediction = byMatch.get(match.id);
    return Boolean(prediction && tippedJablonecToWin(match, prediction));
  }).length;
  const slovackoMatches = matches.filter(isSlovackoMatch).length;
  const highGoalTips = tipped.filter((prediction) => predictionTotal(prediction) >= 6).length;
  const absurdZeroTips = tipped.filter(
    (prediction) => (prediction.points ?? 0) === 0 && isAbsurdPrediction(prediction),
  ).length;
  const oneNilDrawMisses = matches.filter((match) => {
    const prediction = byMatch.get(match.id);
    return Boolean(prediction && isOneNilAgainstDraw(match, prediction));
  }).length;

  const homeWinLosses = matches.filter((match) => {
    const prediction = byMatch.get(match.id);
    return Boolean(prediction && tippedHomeWinButHomeLost(match, prediction));
  }).length;
  const redCardAdvantages = matches.filter((match) => {
    const prediction = byMatch.get(match.id);
    return Boolean(prediction && tippedTeamWhoseOpponentGotRed(match, prediction));
  }).length;
  const specialHighlights = [
    redCardAdvantages > 0
      ? `„Pane ${playerName}, vždyť já mám stejnej zájem jako vy.“ Soupeř tipovaného týmu dostal červenou.`
      : '',
    homeWinLosses > 0
      ? '„Von tleskal nad hlavou a já dělal, že to nevidím.“ Domácí z tipovaného zápasu přesto prohráli.'
      : '',
    exact > 0
      ? '„Ty vole, v těhle letech ty tipy.“ Přesný zásah za 10 bodů je v zápisu.'
      : '',
  ].filter(Boolean);

  let summary = tipped.length
    ? `Získal jsi ${pointsLabel(totalPoints)} z ${matches.length} zápasů.`
    : `${matchesLabel(matches.length)} skončily. Neměl jsi uložený žádný tip.`;
  if (exact > 0) summary += ` Přesné tipy: ${exact}.`;
  if (missing > 0 && tipped.length > 0) summary += ` Bez tipu: ${missing}.`;

  const mood = bohemkaZeros > 0
    ? stablePick([
      '„Bohemka no.“ V tomhle bloku důvěra v klokany nepřinesla ani bod.',
      '„Bohemka no.“ Komise zaznamenala odvážný tip a stejně odvážnou nulu.',
    ], playerId, blockKey, 'multi-bohemka-zero')
    : exact > 0
      ? stablePick([
        'Přesný zásah je v zápisu.',
        '„Tak poď vole.“ Přesný zásah je v zápisu.',
        '„Volal Pelta.“ Přesný zásah je potvrzený.',
        '„Když se daří a padá to tam, to umí každej blbec.“ Přesný tip je v zápisu.',
        '„Řekni, co o tomhle zápase řekl Beckham.“ Tohle mělo parametry.',
        'Tohle nebylo baroko, tohle mělo parametry.',
        'Kabina tleská, komise potvrzuje.',
      ], playerId, blockKey, 'multi-exact')
      : oneNilDrawMisses > 0
        ? '„Já koukal na ten teletext a najednou tam naskočilo 1:0.“ Remízový tip právě zmizel ze zápisu.'
        : absurdZeroTips > 0
          ? '„Kapříci připluli.“ V tomhle bloku se objevil tip, který si žádá vlastní komisi.'
          : totalPoints === 0
            ? stablePick([
              'Psojedy neexistujou. A body v tomhle bloku taky ne.',
              '„Loď se potápí, bárka de ke dnu.“ V tomhle bloku nepřiplul ani bod.',
              '„To by člověk blil, Milane.“ Komise nenašla jediný bod.',
              '„Ty by nás sfoukli jako svíčku.“ Tenhle blok skončil bez jediného bodu.',
              'Tenhle blok radši nerozebírejme.',
              'Komise nenašla jediný bod. Rozhodnutí je konečné.',
            ], playerId, blockKey, 'multi-zero')
            : jablonecWinTips > 0
              ? '„Počkej pocem, nehrál tys divizi?“ V bloku se objevil tip na výhru Jablonce.'
              : slovackoMatches > 0
                ? '„Ten Synot, ty Slovácí, jsou schopný vole ještě vyhrát.“ Slovácko zase nedalo tipérům klid.'
                : highGoalTips > 0
                  ? stablePick([
                    '„Jak vidíte, čím víc gólů tipujeme, tím víc bodů máme.“ Ofenzivní papíry něco přinesly.',
                    '„Já vyznávám útočnou kombinační filozofii.“ V tomhle bloku se tipovalo bez zatažené ruční brzdy.',
                    '„Dneska očekávám 2 body. Za výhru jsou ale 4 body.“ Přestřelka na lístku nakonec něco cinkla.',
                  ], playerId, blockKey, 'multi-high-goals')
                  : stablePick([
                    'Něco cinklo, na velkou tiskovku to ale není.',
                    'Výkon obhajitelný, zápis podepsán.',
                    '„Ty vole, to jsou nervy.“ Něco cinklo, ale klid v kabině nebyl.',
                    'Trocha fotbalu, trocha baroka, body zůstaly.',
                  ], playerId, blockKey, 'multi-mid');

  return {
    title: stablePick([
      `Dohráno: ${matchesLabel(matches.length)}`,
      'Blok zápasů je u konce',
      `Komise uzavřela ${matchesLabel(matches.length)}`,
    ], playerId, blockKey, 'multi-title'),
    body: truncate(`${specialHighlights.join(' ')} ${summary} ${mood} ${resultList}`.trim()),
  };
}

async function resultModalResponse(request: NextRequest, playerId: number, playerName: string) {
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
    .select('id, kickoff, home_team, away_team, home_score, away_score, status, detail')
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
  const notification = resultNotification(matchRows, predictionRows, playerId, playerName, blockKey);

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
    title: notification.title,
    summary: matchRows.length === 1
      ? predictionRows.length
        ? `Tvůj tip ${predictionRows[0].predicted_home}:${predictionRows[0].predicted_away} · ${pointsLabel(totalPoints)}`
        : 'Tip nebyl uložený · 0 bodů'
      : `${matchRows.length} zápasy · ${pointsLabel(totalPoints)}${exact ? ` · ${exact} přesný tip${exact > 1 ? 'y' : ''}` : ''}${missing ? ` · ${missing} bez tipu` : ''}`,
    notificationText: notification.body,
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
    return resultModalResponse(request, player.id, player.name);
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
