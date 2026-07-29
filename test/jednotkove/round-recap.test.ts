import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoundRecapFacts, fallbackRoundRecap } from '@/lib/roundRecap';
import type { Match, Player, RoundPrediction } from '@/lib/types';

const players: Player[] = [
  { id: 1, name: 'Adam', is_active: true },
  { id: 2, name: 'Boris', is_active: true },
];

const finishedMatch = (id: number, home = 'Artis Brno', away = 'Liberec'): Match => ({
  id,
  season_id: 1,
  external_api_id: id,
  round: 2,
  kickoff: `2026-07-${20 + id}T15:00:00Z`,
  home_team: home,
  away_team: away,
  home_score: 2,
  away_score: 1,
  status: 'finished',
  source_league: 'cze.1',
});

const predictions: RoundPrediction[] = [
  { match_id: 1, name: 'Adam', predicted_home: 2, predicted_away: 1, points: 10 },
  { match_id: 1, name: 'Boris', predicted_home: 0, predicted_away: 0, points: 0 },
];

describe('Kudy běží zajíc — fakta kola', () => {
  test('průběžný režim počítá pouze dokončené zápasy', () => {
    const scheduled: Match = { ...finishedMatch(2, 'Plzeň', 'Sparta Praha'), home_score: null, away_score: null, status: 'scheduled' };
    const facts = buildRoundRecapFacts({
      matches: [finishedMatch(1), scheduled], players, predictions,
      roundTitle: '2. kolo', seasonName: '2026/27',
    });
    assert.equal(facts.mode, 'progress');
    assert.equal(facts.completedMatches, 1);
    assert.equal(facts.remainingMatches, 1);
    assert.equal(facts.leader?.name, 'Adam');
    assert.equal(facts.totalExactHits, 1);
    assert.equal(facts.totalZeros, 1);
  });

  test('finální režim vznikne až po dokončení všech relevantních zápasů', () => {
    const facts = buildRoundRecapFacts({
      matches: [finishedMatch(1), finishedMatch(2, 'Plzeň', 'Sparta Praha')],
      players,
      predictions,
      roundTitle: '2. kolo', seasonName: '2026/27',
    });
    assert.equal(facts.mode, 'final');
    assert.equal(facts.remainingMatches, 0);
    assert.match(fallbackRoundRecap(facts), /Kolo je zavřené/);
  });

  test('hráč bez vyhodnoceného tipu není automaticky označen za nejhoršího', () => {
    const facts = buildRoundRecapFacts({
      matches: [finishedMatch(1)],
      players: [...players, { id: 3, name: 'Nováček', is_active: true }],
      predictions,
      roundTitle: '2. kolo', seasonName: '2026/27',
    });
    assert.notEqual(facts.worst?.name, 'Nováček');
  });

  test('finální skóre dopočítá body, když DB trigger ještě nechal points=null', () => {
    const delayed: RoundPrediction[] = [
      { match_id: 1, name: 'Adam', predicted_home: 2, predicted_away: 1, points: null },
    ];
    const facts = buildRoundRecapFacts({
      matches: [finishedMatch(1)], players, predictions: delayed,
      roundTitle: '2. kolo', seasonName: '2026/27',
    });
    assert.equal(facts.leader?.name, 'Adam');
    assert.equal(facts.leader?.points, 10);
    assert.equal(facts.totalExactHits, 1);
  });

  test('finální recap dopočítá posun v celkovém pořadí bez modelového hádání', () => {
    const facts = buildRoundRecapFacts({
      matches: [finishedMatch(1)],
      players,
      predictions,
      standings: [
        { player_id: 1, name: 'Adam', season_id: 1, points: 20, scored_matches: 4, exact_hits: 1, avg_points: 5, success_rate: 50 },
        { player_id: 2, name: 'Boris', season_id: 1, points: 18, scored_matches: 4, exact_hits: 0, avg_points: 4.5, success_rate: 50 },
      ],
      roundTitle: '2. kolo', seasonName: '2026/27',
    });
    // Před odečtením tohoto kola: Boris 18, Adam 10. Po kole: Adam 20, Boris 18.
    assert.deepEqual(facts.biggestRise, { name: 'Adam', places: 1 });
    assert.deepEqual(facts.biggestFall, { name: 'Boris', places: 1 });
  });

  test('poslední zápas je označen jako rozhodovačka jen když skutečně změní lídra kola', () => {
    const secondPredictions: RoundPrediction[] = [
      { match_id: 1, name: 'Adam', predicted_home: 2, predicted_away: 0, points: 6 },
      { match_id: 1, name: 'Boris', predicted_home: 0, predicted_away: 0, points: 0 },
      { match_id: 2, name: 'Adam', predicted_home: 0, predicted_away: 0, points: 0 },
      { match_id: 2, name: 'Boris', predicted_home: 2, predicted_away: 1, points: 10 },
    ];
    const facts = buildRoundRecapFacts({
      matches: [finishedMatch(1), finishedMatch(2, 'Plzeň', 'Sparta Praha')],
      players,
      predictions: secondPredictions,
      roundTitle: '2. kolo', seasonName: '2026/27',
    });
    assert.equal(facts.lastMatchSwing?.match, 'Plzeň – Sparta Praha');
    assert.equal(facts.lastMatchSwing?.beforeLeader, 'Adam');
    assert.equal(facts.lastMatchSwing?.afterLeader, 'Boris');
  });

  test('ručně otevřené starší kolo nevymýšlí posun z dnešního celkového pořadí', () => {
    const facts = buildRoundRecapFacts({
      matches: [finishedMatch(1)],
      players,
      predictions,
      standings: [
        { player_id: 1, name: 'Adam', season_id: 1, points: 120, scored_matches: 30, exact_hits: 3, avg_points: 4, success_rate: 50 },
        { player_id: 2, name: 'Boris', season_id: 1, points: 118, scored_matches: 30, exact_hits: 2, avg_points: 3.9, success_rate: 50 },
      ],
      roundTitle: '2. kolo', seasonName: '2026/27', includeStandingMovement: false,
    });
    assert.equal(facts.biggestRise, null);
    assert.equal(facts.biggestFall, null);
    assert.equal(facts.players.every((row) => row.rankMovement === 0), true);
  });

  test('waiting režim negeneruje falešné hodnocení před prvním výsledkem', () => {
    const scheduled: Match = { ...finishedMatch(1), home_score: null, away_score: null, status: 'scheduled' };
    const facts = buildRoundRecapFacts({
      matches: [scheduled], players, predictions: [], roundTitle: '2. kolo', seasonName: '2026/27',
    });
    assert.equal(facts.mode, 'waiting');
    assert.match(fallbackRoundRecap(facts), /Kudy běží zajíc zatím nikdo neví/);
  });

  test('xB reality check porovnává skutečné sezonní body s očekávanými xBody', () => {
    const facts = buildRoundRecapFacts({
      matches: [finishedMatch(1)], players, predictions,
      standings: [], roundTitle: '2. kolo', seasonName: '2026/27',
      xbSnapshots: [
        { name: 'Adam', actualPoints: 20, expectedXb: 12.5 },
        { name: 'Boris', actualPoints: 8, expectedXb: 14 },
      ],
    });
    assert.deepEqual(facts.xbOverperformer, { name: 'Adam', actual: 20, expected: 12.5, delta: 7.5 });
    assert.deepEqual(facts.xbUnderperformer, { name: 'Boris', actual: 8, expected: 14, delta: -6 });
  });

  test('srovnání s minulou sezonou používá průměr bodů na tip, ne celkové body', () => {
    const facts = buildRoundRecapFacts({
      matches: [finishedMatch(1)], players, predictions,
      roundTitle: '2. kolo', seasonName: '2026/27', previousSeasonName: '2025/26',
      previousSeasonStats: [
        { name: 'Adam', avgPoints: 2.5, bestRound: 40, roundWins: 3, zeros: 100 },
        { name: 'Boris', avgPoints: 3.0, bestRound: 42, roundWins: 4, zeros: 120 },
      ],
    });
    assert.equal(facts.bestVsLastSeason?.name, 'Adam');
    assert.equal(facts.bestVsLastSeason?.roundAverage, 10);
    assert.equal(facts.bestVsLastSeason?.previousAverage, 2.5);
    assert.equal(facts.worstVsLastSeason?.name, 'Boris');
  });

  test('silný konsenzus pro favorita, který nevyhraje, vytvoří divizeCandidate', () => {
    const shockMatch: Match = { ...finishedMatch(1, 'Sparta Praha', 'Artis Brno'), home_score: 0, away_score: 1 };
    const shockTips: RoundPrediction[] = [
      { match_id: 1, name: 'Adam', predicted_home: 2, predicted_away: 0, points: 0 },
      { match_id: 1, name: 'Boris', predicted_home: 3, predicted_away: 0, points: 0 },
      { match_id: 1, name: 'Cyril', predicted_home: 1, predicted_away: 0, points: 0 },
      { match_id: 1, name: 'David', predicted_home: 2, predicted_away: 1, points: 0 },
    ];
    const morePlayers: Player[] = [
      ...players,
      { id: 3, name: 'Cyril', is_active: true },
      { id: 4, name: 'David', is_active: true },
    ];
    const facts = buildRoundRecapFacts({
      matches: [shockMatch], players: morePlayers, predictions: shockTips,
      roundTitle: '2. kolo', seasonName: '2026/27',
    });
    assert.equal(facts.consensusShock?.favoriteTeam, 'Sparta Praha');
    assert.equal(facts.divizeCandidate?.team, 'Sparta Praha');
    assert.equal(facts.blamageCandidate?.label, 'Sparta Praha – Artis Brno');
  });

  test('dramatický zápas v nastavení je cinemaCandidate', () => {
    const cinemaMatch: Match = {
      ...finishedMatch(1),
      home_score: 2,
      away_score: 1,
      reg_home: 1,
      reg_away: 1,
      duration: 'REGULAR',
    };
    const facts = buildRoundRecapFacts({
      matches: [cinemaMatch], players, predictions,
      roundTitle: '2. kolo', seasonName: '2026/27',
    });
    assert.equal(facts.cinemaCandidate?.reason, 'stoppage');
    assert.equal(facts.cinemaCandidate?.match, 'Artis Brno – Liberec');
  });

  test('hráč s většinou nul může být sněhulák, ale hráč bez tipů ne', () => {
    const second = finishedMatch(2, 'Plzeň', 'Sparta Praha');
    const snowTips: RoundPrediction[] = [
      { match_id: 1, name: 'Adam', predicted_home: 0, predicted_away: 0, points: 0 },
      { match_id: 2, name: 'Adam', predicted_home: 0, predicted_away: 0, points: 0 },
      { match_id: 1, name: 'Boris', predicted_home: 2, predicted_away: 1, points: 10 },
      { match_id: 2, name: 'Boris', predicted_home: 2, predicted_away: 1, points: 10 },
    ];
    const facts = buildRoundRecapFacts({
      matches: [finishedMatch(1), second], players, predictions: snowTips,
      roundTitle: '2. kolo', seasonName: '2026/27',
    });
    assert.equal(facts.snowman?.name, 'Adam');
    assert.equal(facts.snowman?.points, 0);
  });

});
