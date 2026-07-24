import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const responseHeaders = { 'Content-Type': 'application/json' };
const RESULT_WINDOW_MS = 6 * 60 * 60 * 1000;

type PushRow = {
  id: number;
  player_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  notify_24h: boolean;
  notify_3h: boolean;
  notify_results: boolean;
};

type MatchRow = {
  id: number;
  round: number;
  kickoff: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
};

type PredictionRow = {
  player_id: number;
  match_id: number;
  predicted_home: number;
  predicted_away: number;
  points: number | null;
};

type ReminderDue = {
  round: number;
  kind: 'round_24h' | 'round_3h';
  matchIds: number[];
};

type ResultBlock = {
  round: number;
  blockKey: string;
  matches: MatchRow[];
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders });
}

function pointsLabel(points: number) {
  const absolute = Math.abs(points);
  if (absolute === 1) return `${points} bod`;
  if (absolute >= 2 && absolute <= 4) return `${points} body`;
  return `${points} bodů`;
}

function matchesLabel(count: number) {
  if (count === 1) return '1 zápas';
  if (count >= 2 && count <= 4) return `${count} zápasy`;
  return `${count} zápasů`;
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

function tippedBohemkaToWin(match: MatchRow, prediction: PredictionRow) {
  if (isBohemka(match.home_team)) return prediction.predicted_home > prediction.predicted_away;
  if (isBohemka(match.away_team)) return prediction.predicted_away > prediction.predicted_home;
  return false;
}

function isJablonec(team: string) {
  return /jablon/i.test(team);
}

function tippedJablonecToWin(match: MatchRow, prediction: PredictionRow) {
  if (isJablonec(match.home_team)) return prediction.predicted_home > prediction.predicted_away;
  if (isJablonec(match.away_team)) return prediction.predicted_away > prediction.predicted_home;
  return false;
}

function isSlovackoMatch(match: MatchRow) {
  return /slováck|slovack|synot/i.test(`${match.home_team} ${match.away_team}`);
}

function predictionTotal(prediction: PredictionRow) {
  return prediction.predicted_home + prediction.predicted_away;
}

function isAbsurdPrediction(prediction: PredictionRow) {
  return predictionTotal(prediction) >= 7
    || Math.abs(prediction.predicted_home - prediction.predicted_away) >= 4;
}

function isOneNilAgainstDraw(match: MatchRow, prediction: PredictionRow) {
  return match.home_score === 1
    && match.away_score === 0
    && prediction.predicted_home === prediction.predicted_away;
}

function evaluation(points: number, ...seed: Array<string | number>) {
  if (points === 10) return stablePick([
    'Přesný zásah! 🎯',
    '„Tak poď vole.“ Přesný zásah! 🎯',
    'Tohle není baroko, to je fotbalová poezie.',
    'Přesný zásah, tohle sedlo na chlup.',
    '„Volal Pelta.“ Přesný zásah je potvrzený.',
    '„Když se daří a padá to tam, to umí každej blbec.“ Deset bodů je doma.',
  ], ...seed, points);
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

function reminderNotification(kind: ReminderDue['kind'], round: number, missing: number, total: number, playerId: number) {
  if (missing > 0) {
    const missingText = `Chybí ti ${missing} z ${total} tipů.`;
    if (kind === 'round_24h') {
      return {
        title: stablePick([
          `⚽ Zítra začíná ${round}. kolo`,
          `📞 Telefonát z kabiny`,
          `📞 Musíš to mít pod kontrolou`,
        ], playerId, round, kind, 'title'),
        body: stablePick([
          `„Talent máš, tipy ti chyběj.“ ${missingText} Ať pak zase nemůžeš obviňovat uzávěrku.`,
          `„Talent máš, tipy ti chyběj.“ ${missingText} Pánové, bez sestavy se okres nehraje.`,
          `„Talent máš, tipy ti chyběj.“ ${missingText} Tohle už začíná být takový baroko.`,
          `„Talent máš, tipy ti chyběj.“ ${missingText} Delegát čeká, tabulka čeká, jen tipy nikde.`,
          `„Ty si to v klidu dokuř, ty to máš za tisíc.“ ${missingText} Jenže komise zatím eviduje díry v sestavě.`,
        ], playerId, round, kind, 'body'),
      };
    }
    return {
      title: stablePick([
        `⏳ Uzávěrka ${round}. kola za 3 hodiny`,
        `📞 Poslední telefonát před uzávěrkou`,
        `🚨 Trenére, v sestavě jsou díry`,
      ], playerId, round, kind, 'title'),
      body: stablePick([
        `„Talent máš, tipy ti chyběj.“ ${missingText} Teď už se nehraje na krásu, ale na odeslat.`,
        `„Talent máš, tipy ti chyběj.“ ${missingText} Teď už opravdu není na co čekat.`,
        `„Talent máš, tipy ti chyběj.“ ${missingText} Za chvíli se zavře krám a komise nic nepřepisuje.`,
        `„Talent máš, tipy ti chyběj.“ ${missingText} Okresní disciplína: naklikat, uložit, nevymlouvat se.`,
        `„Talent máš, tipy ti chyběj.“ ${missingText} „Tak poď vole.“ Naklikat, uložit, hotovo.`,
        `„Ty si to v klidu dokuř, ty to máš za tisíc.“ ${missingText} Tisíc stranou, uzávěrka je za tři hodiny.`,
      ], playerId, round, kind, 'body'),
    };
  }

  return {
    title: stablePick([
      `✅ ${round}. kolo máš připravené`,
      `📋 Sestava potvrzena`,
      `⚽ Máme Roteiro!`,
    ], playerId, round, kind, 'title'),
    body: stablePick([
      `Všech ${total} tipů je uložených. Teď už to může pokazit jen fotbal.`,
      `Všech ${total} tipů je v zápisu. Delegát spokojený, kabina může spát.`,
      `Hotovo. Žádné baroko, tentokrát profesionální výkon.`,
      `„Milane, myslím, že ty mediální mrdky máme pořešený.“ Všech ${total} tipů je uložených.`,
    ], playerId, round, kind, 'body'),
  };
}

function truncate(value: string, maxLength = 220) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function resultNotification(block: ResultBlock, predictions: PredictionRow[], playerId: number) {
  const byMatch = new Map(predictions.map((prediction) => [prediction.match_id, prediction]));
  const resultList = block.matches
    .map((match) => `${match.home_team} ${match.home_score}:${match.away_score} ${match.away_team}`)
    .join(' · ');

  if (block.matches.length === 1) {
    const match = block.matches[0];
    const prediction = byMatch.get(match.id);
    const title = `Konec: ${match.home_team} ${match.home_score}:${match.away_score} ${match.away_team}`;
    const quoteLead = prediction && isOneNilAgainstDraw(match, prediction)
      ? '„Já koukal na ten teletext a najednou tam naskočilo 1:0.“'
      : prediction && tippedJablonecToWin(match, prediction)
        ? '„Počkej pocem, nehrál tys divizi?“'
        : isSlovackoMatch(match)
          ? '„Ten Synot, ty Slovácí, jsou schopný vole ještě vyhrát.“'
          : match.home_score === match.away_score
            ? stablePick([
              '„Já bych tady, hele, Teplice kříž.“',
              '„Řekni, co o tomhle zápase řekl Beckham.“',
            ], playerId, block.blockKey, match.id, 'draw-quote')
            : Math.abs((match.home_score ?? 0) - (match.away_score ?? 0)) === 1
              ? stablePick([
                '„Ty vole, to jsou nervy.“',
                '„Řekni, co o tomhle zápase řekl Beckham.“',
              ], playerId, block.blockKey, match.id, 'tight-quote')
              : stablePick([
                '',
                '„Řekni, co o tomhle zápase řekl Beckham.“',
                '„Ti volal Pelta, jo?“',
              ], playerId, block.blockKey, match.id, 'result-quote');
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
          ], playerId, block.blockKey, match.id, 'high-goals')
          : evaluation(predictionPoints, playerId, block.blockKey, match.id);
    const body = prediction
      ? `${quoteLead ? `${quoteLead} ` : ''}Tvůj tip ${prediction.predicted_home}:${prediction.predicted_away} · ${pointsLabel(prediction.points ?? 0)}. ${resultEvaluation}`
      : stablePick([
        'Zápas skončil. Tip jsi neměl uložený.',
        'Bez uloženého tipu se body nerozdávají.',
        'Sestava bez tipu, tabulka bez bodů. Čistý okres.',
        '„Vy mě nechcete za tipéra?“ Bez uloženého tipu je odpověď komise zatím neurčitá.',
        '„Talent máš, tipy ti chyběj.“ Tady chyběl přesně jeden a body jsou pryč.',
      ], playerId, block.blockKey, match.id, 'missing-tip');
    return { title, body: truncate(body) };
  }

  const tipped = block.matches
    .map((match) => byMatch.get(match.id))
    .filter((prediction): prediction is PredictionRow => Boolean(prediction));
  const totalPoints = tipped.reduce((sum, prediction) => sum + (prediction.points ?? 0), 0);
  const exact = tipped.filter((prediction) => prediction.points === 10).length;
  const missing = Math.max(0, block.matches.length - tipped.length);

  const bohemkaZeros = block.matches.filter((match) => {
    const prediction = byMatch.get(match.id);
    return Boolean(prediction && (prediction.points ?? 0) === 0 && tippedBohemkaToWin(match, prediction));
  }).length;
  const jablonecWinTips = block.matches.filter((match) => {
    const prediction = byMatch.get(match.id);
    return Boolean(prediction && tippedJablonecToWin(match, prediction));
  }).length;
  const slovackoMatches = block.matches.filter(isSlovackoMatch).length;
  const highGoalTips = tipped.filter((prediction) => predictionTotal(prediction) >= 6).length;
  const absurdZeroTips = tipped.filter(
    (prediction) => (prediction.points ?? 0) === 0 && isAbsurdPrediction(prediction),
  ).length;
  const oneNilDrawMisses = block.matches.filter((match) => {
    const prediction = byMatch.get(match.id);
    return Boolean(prediction && isOneNilAgainstDraw(match, prediction));
  }).length;

  let summary = tipped.length
    ? `Získal jsi ${pointsLabel(totalPoints)} z ${block.matches.length} zápasů.`
    : `${matchesLabel(block.matches.length)} skončily. Neměl jsi uložený žádný tip.`;
  if (exact > 0) summary += ` Přesné tipy: ${exact}.`;
  if (missing > 0 && tipped.length > 0) summary += ` Bez tipu: ${missing}.`;

  const mood = bohemkaZeros > 0
    ? stablePick([
      '„Bohemka no.“ V tomhle bloku důvěra v klokany nepřinesla ani bod.',
      '„Bohemka no.“ Komise zaznamenala odvážný tip a stejně odvážnou nulu.',
    ], playerId, block.blockKey, 'multi-bohemka-zero')
    : exact > 0
      ? stablePick([
      'Přesný zásah je v zápisu.',
      '„Tak poď vole.“ Přesný zásah je v zápisu.',
      '„Volal Pelta.“ Přesný zásah je potvrzený.',
      '„Když se daří a padá to tam, to umí každej blbec.“ Přesný tip je v zápisu.',
      '„Řekni, co o tomhle zápase řekl Beckham.“ Tohle mělo parametry.',
      'Tohle nebylo baroko, tohle mělo parametry.',
      'Kabina tleská, komise potvrzuje.',
    ], playerId, block.blockKey, 'multi-exact')
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
      ], playerId, block.blockKey, 'multi-zero')
    : jablonecWinTips > 0
      ? '„Počkej pocem, nehrál tys divizi?“ V bloku se objevil tip na výhru Jablonce.'
    : slovackoMatches > 0
      ? '„Ten Synot, ty Slovácí, jsou schopný vole ještě vyhrát.“ Slovácko zase nedalo tipérům klid.'
    : highGoalTips > 0
      ? stablePick([
        '„Jak vidíte, čím víc gólů tipujeme, tím víc bodů máme.“ Ofenzivní papíry něco přinesly.',
        '„Já vyznávám útočnou kombinační filozofii.“ V tomhle bloku se tipovalo bez zatažené ruční brzdy.',
        '„Dneska očekávám 2 body. Za výhru jsou ale 4 body.“ Přestřelka na lístku nakonec něco cinkla.',
      ], playerId, block.blockKey, 'multi-high-goals')
      : stablePick([
        'Něco cinklo, na velkou tiskovku to ale není.',
        'Výkon obhajitelný, zápis podepsán.',
        '„Ty vole, to jsou nervy.“ Něco cinklo, ale klid v kabině nebyl.',
        'Trocha fotbalu, trocha baroka, body zůstaly.',
      ], playerId, block.blockKey, 'multi-mid');

  return {
    title: stablePick([
      `Dohráno: ${matchesLabel(block.matches.length)}`,
      `Blok zápasů je u konce`,
      `Komise uzavřela ${matchesLabel(block.matches.length)}`,
    ], playerId, block.blockKey, 'multi-title'),
    body: truncate(`${summary} ${mood} ${resultList}`),
  };
}

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get('PUSH_CRON_SECRET') || '';
  const authorization = request.headers.get('authorization') || '';
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return json({ error: 'Neplatné oprávnění.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || '';
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@obtipovacka.cz';
  if (!supabaseUrl || !serviceKey || !publicKey || !privateKey) {
    return json({ error: 'Chybí serverové proměnné pro push notifikace.' }, 500);
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const now = new Date();
  const nowMs = now.getTime();

  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_active', true)
    .maybeSingle();
  if (seasonError) return json({ error: seasonError.message }, 500);
  if (!season) return json({ ok: true, sent: 0, reason: 'Bez aktivní sezóny.' });

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('id, round, kickoff, home_team, away_team, home_score, away_score, status')
    .eq('season_id', season.id)
    .gt('round', 0)
    .order('kickoff');
  if (matchesError) return json({ error: matchesError.message }, 500);

  const matchRows = (matches || []) as MatchRow[];
  const matchesByRound = new Map<number, MatchRow[]>();
  for (const match of matchRows) {
    const rows = matchesByRound.get(match.round) || [];
    rows.push(match);
    matchesByRound.set(match.round, rows);
  }

  const reminders: ReminderDue[] = [];
  for (const [round, rows] of matchesByRound) {
    const firstFuture = rows
      .filter((row) => row.status === 'scheduled' && new Date(row.kickoff).getTime() > nowMs)
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())[0];
    if (!firstFuture) continue;
    const minutes = (new Date(firstFuture.kickoff).getTime() - nowMs) / 60000;
    if (minutes >= 1425 && minutes <= 1455) reminders.push({ round, kind: 'round_24h', matchIds: rows.map((row) => row.id) });
    if (minutes >= 165 && minutes <= 195) reminders.push({ round, kind: 'round_3h', matchIds: rows.map((row) => row.id) });
  }

  const resultGroups = new Map<string, MatchRow[]>();
  for (const match of matchRows) {
    const kickoffMs = new Date(match.kickoff).getTime();
    if (kickoffMs > nowMs || kickoffMs < nowMs - RESULT_WINDOW_MS) continue;
    if (match.status === 'postponed' || match.status === 'cancelled') continue;
    const kickoffKey = new Date(match.kickoff).toISOString();
    const key = `${match.round}|${kickoffKey}`;
    const rows = resultGroups.get(key) || [];
    rows.push(match);
    resultGroups.set(key, rows);
  }

  const resultBlocks: ResultBlock[] = [];
  for (const [key, rows] of resultGroups) {
    const complete = rows.every((match) =>
      match.status === 'finished' && match.home_score != null && match.away_score != null
    );
    if (!complete) continue;
    const [roundText, blockKey] = key.split('|');
    resultBlocks.push({ round: Number(roundText), blockKey, matches: rows });
  }
  resultBlocks.sort((a, b) => a.blockKey.localeCompare(b.blockKey));

  if (!reminders.length && !resultBlocks.length) {
    return json({ ok: true, sent: 0, reminders: 0, resultBlocks: 0 });
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from('push_subscriptions')
    .select('id, player_id, endpoint, p256dh, auth, notify_24h, notify_3h, notify_results')
    .eq('active', true);
  if (subscriptionsError) return json({ error: subscriptionsError.message }, 500);

  const subscriptionRows = (subscriptions || []) as PushRow[];
  let sent = 0;
  let invalidated = 0;

  const sendToPlayer = async (rows: PushRow[], payload: string, ttl: number) => {
    let delivered = false;
    for (const subscription of rows) {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload, { TTL: ttl, urgency: 'normal' });
        sent += 1;
        delivered = true;
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .update({ active: false, updated_at: new Date().toISOString() })
            .eq('id', subscription.id);
          invalidated += 1;
        }
      }
    }
    return delivered;
  };

  for (const item of reminders) {
    const eligibleRows = subscriptionRows.filter((row) => item.kind === 'round_24h' ? row.notify_24h : row.notify_3h);
    const playerIds = [...new Set(eligibleRows.map((row) => row.player_id))];
    if (!playerIds.length) continue;

    const { data: logs } = await supabase
      .from('push_notification_log')
      .select('player_id')
      .eq('season_id', season.id)
      .eq('round', item.round)
      .eq('kind', item.kind)
      .eq('block_key', '')
      .in('player_id', playerIds);
    const alreadySent = new Set((logs || []).map((row) => row.player_id as number));

    const { data: predictions } = await supabase
      .from('predictions')
      .select('player_id, match_id')
      .in('player_id', playerIds)
      .in('match_id', item.matchIds);
    const counts = new Map<number, number>();
    for (const prediction of predictions || []) {
      const playerId = prediction.player_id as number;
      counts.set(playerId, (counts.get(playerId) || 0) + 1);
    }

    for (const playerId of playerIds) {
      if (alreadySent.has(playerId)) continue;
      const completed = counts.get(playerId) || 0;
      const missing = Math.max(0, item.matchIds.length - completed);
      if (item.kind === 'round_3h' && missing === 0) continue;

      const notification = reminderNotification(item.kind, item.round, missing, item.matchIds.length, playerId);
      const payload = JSON.stringify({
        ...notification,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: `liga-${season.id}-${item.round}-${item.kind}`,
        url: `/?soutez=liga&kolo=${item.round}`,
      });

      const delivered = await sendToPlayer(
        eligibleRows.filter((row) => row.player_id === playerId),
        payload,
        item.kind === 'round_24h' ? 43200 : 7200,
      );

      if (delivered) {
        await supabase.from('push_notification_log').upsert({
          player_id: playerId,
          season_id: season.id,
          round: item.round,
          kind: item.kind,
          block_key: '',
          sent_at: new Date().toISOString(),
        }, { onConflict: 'player_id,season_id,round,kind,block_key' });
      }
    }
  }

  for (const block of resultBlocks) {
    const eligibleRows = subscriptionRows.filter((row) => row.notify_results);
    const playerIds = [...new Set(eligibleRows.map((row) => row.player_id))];
    if (!playerIds.length) continue;

    const { data: logs } = await supabase
      .from('push_notification_log')
      .select('player_id')
      .eq('season_id', season.id)
      .eq('round', block.round)
      .eq('kind', 'match_results')
      .eq('block_key', block.blockKey)
      .in('player_id', playerIds);
    const alreadySent = new Set((logs || []).map((row) => row.player_id as number));
    const pendingPlayerIds = playerIds.filter((playerId) => !alreadySent.has(playerId));
    if (!pendingPlayerIds.length) continue;

    const matchIds = block.matches.map((match) => match.id);
    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('player_id, match_id, predicted_home, predicted_away, points')
      .in('player_id', pendingPlayerIds)
      .in('match_id', matchIds);
    if (predictionsError) return json({ error: predictionsError.message }, 500);

    const predictionsByPlayer = new Map<number, PredictionRow[]>();
    for (const prediction of (predictions || []) as PredictionRow[]) {
      const rows = predictionsByPlayer.get(prediction.player_id) || [];
      rows.push(prediction);
      predictionsByPlayer.set(prediction.player_id, rows);
    }

    for (const playerId of pendingPlayerIds) {
      const notification = resultNotification(block, predictionsByPlayer.get(playerId) || [], playerId);
      const payload = JSON.stringify({
        ...notification,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: `liga-${season.id}-${block.round}-results-${Date.parse(block.blockKey)}`,
        url: `/?soutez=liga&kolo=${block.round}`,
      });

      const delivered = await sendToPlayer(
        eligibleRows.filter((row) => row.player_id === playerId),
        payload,
        21600,
      );

      if (delivered) {
        await supabase.from('push_notification_log').upsert({
          player_id: playerId,
          season_id: season.id,
          round: block.round,
          kind: 'match_results',
          block_key: block.blockKey,
          sent_at: new Date().toISOString(),
        }, { onConflict: 'player_id,season_id,round,kind,block_key' });
      }
    }
  }

  return json({
    ok: true,
    sent,
    invalidated,
    reminders: reminders.length,
    resultBlocks: resultBlocks.length,
  });
});
