import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { computePersonalXb, type XbHistoryRow } from '@/lib/predict';
import { buildPersonalXbHistory, isMatchBeforeTarget } from '@/lib/xbHistory';

const archive: XbHistoryRow[] = [
  { home: 'Artis Brno', away: 'Sparta Praha', points: 4, source: 'archive' },
  { home: 'Slavia Praha', away: 'Artis Brno', points: 6, source: 'archive' },
];

const finished = [
  { id: 101, kickoff: '2026-07-18T15:00:00Z', home_team: 'Artis Brno', away_team: 'Mladá Boleslav' },
  { id: 102, kickoff: '2026-07-25T15:00:00Z', home_team: 'Plzeň', away_team: 'Artis Brno' },
];

describe('xB — živá osobní historie', () => {
  test('XB-R1: jeden letošní dokončený zápas zvýší vzorek Artisu z 2 na 3', () => {
    const history = buildPersonalXbHistory({
      archiveTips: archive,
      finishedMatches: finished.slice(0, 1),
      predictions: [{ match_id: 101, predicted_home: 1, predicted_away: 1, points: 4 }],
    });
    const xb = computePersonalXb({
      home: 'Artis Brno',
      away: 'Liberec',
      archiveTips: history.combined,
      seasonPoints: history.currentSeason.map((row) => row.points),
      trendRows: history.combined,
    });
    assert.equal(xb.factors.find((factor) => factor.key === 'home')?.sample, 3);
  });

  test('XB-R11: historická Líšeň se u Artisu počítá do stejného týmového vzorku', () => {
    const history = buildPersonalXbHistory({
      archiveTips: [
        { home: 'Líšeň', away: 'Sparta Praha', points: 4, source: 'archive' },
        { home: 'Slavia Praha', away: 'SK Líšeň', points: 6, source: 'archive' },
      ],
      finishedMatches: finished.slice(0, 1),
      predictions: [{ match_id: 101, points: 4 }],
    });
    const xb = computePersonalXb({ home: 'Artis Brno', away: 'Liberec', archiveTips: history.combined });
    assert.equal(xb.factors.find((factor) => factor.key === 'home')?.sample, 3);
  });

  test('XB-R2: nerozhodnutý zápas není součástí historie', () => {
    const history = buildPersonalXbHistory({
      archiveTips: archive,
      finishedMatches: [],
      predictions: [{ match_id: 999, predicted_home: 2, predicted_away: 1, points: null }],
    });
    assert.equal(history.combined.length, 2);
    assert.equal(history.currentSeason.length, 0);
  });

  test('XB-R3: po druhém letošním zápase roste týmový vzorek na 4', () => {
    const history = buildPersonalXbHistory({
      archiveTips: archive,
      finishedMatches: finished,
      predictions: [
        { match_id: 101, points: 4 },
        { match_id: 102, points: 10 },
      ],
    });
    const xb = computePersonalXb({ home: 'Artis Brno', away: 'Liberec', archiveTips: history.combined });
    assert.equal(xb.factors.find((factor) => factor.key === 'home')?.sample, 4);
  });

  test('XB-R4: H2H kombinuje archiv a aktuální sezonu', () => {
    const pairArchive: XbHistoryRow[] = [
      { home: 'Artis Brno', away: 'Mladá Boleslav', points: 6, source: 'archive' },
      { home: 'Mladá Boleslav', away: 'Artis Brno', points: 4, source: 'archive' },
    ];
    const history = buildPersonalXbHistory({
      archiveTips: pairArchive,
      finishedMatches: finished.slice(0, 1),
      predictions: [{ match_id: 101, points: 10 }],
    });
    const xb = computePersonalXb({ home: 'Artis Brno', away: 'Mladá Boleslav', archiveTips: history.combined });
    assert.equal(xb.factors.find((factor) => factor.key === 'h2h')?.sample, 3);
  });

  test('XB-R5: stejné match id se nikdy nezapočítá dvakrát', () => {
    const history = buildPersonalXbHistory({
      archiveTips: archive,
      finishedMatches: [finished[0], finished[0]],
      predictions: [{ match_id: 101, points: 4 }],
    });
    assert.equal(history.currentSeason.length, 1);
  });

  test('XB-R6: nováčkovi se zápasy před prvním uloženým tipem nepřipíší jako nuly', () => {
    const history = buildPersonalXbHistory({
      archiveTips: [],
      finishedMatches: [
        { id: 1, kickoff: '2026-07-01T15:00:00Z', home_team: 'A', away_team: 'B' },
        { id: 2, kickoff: '2026-07-08T15:00:00Z', home_team: 'C', away_team: 'D' },
        { id: 3, kickoff: '2026-07-15T15:00:00Z', home_team: 'E', away_team: 'F' },
      ],
      predictions: [{ match_id: 2, points: 6 }],
    });
    assert.deepEqual(history.currentSeason.map((row) => [row.matchId, row.points]), [[2, 6], [3, 0]]);
  });

  test('XB-R7: trend pokračuje z archivu do aktuální sezony', () => {
    const history = buildPersonalXbHistory({
      archiveTips: archive,
      finishedMatches: finished.slice(0, 1),
      predictions: [{ match_id: 101, points: 4 }],
    });
    const xb = computePersonalXb({
      home: 'Artis Brno',
      away: 'Liberec',
      archiveTips: history.combined,
      trendRows: history.combined,
    });
    assert.deepEqual(xb.trend.map((row) => row.source), ['archive', 'archive', 'database']);
  });

  test('XB-R9: při zpoždění DB triggeru se body uloženého tipu dopočítají z finálního skóre', () => {
    const history = buildPersonalXbHistory({
      archiveTips: archive,
      finishedMatches: [{
        ...finished[0],
        home_score: 2,
        away_score: 1,
      }],
      predictions: [{ match_id: 101, predicted_home: 2, predicted_away: 1, points: null }],
    });
    assert.equal(history.currentSeason[0]?.points, 10);
  });

  test('XB-R10: při zpětném otevření staršího kola se nepoužijí budoucí výsledky', () => {
    const target = { id: 200, kickoff: '2026-07-20T15:00:00Z' };
    assert.equal(isMatchBeforeTarget({ id: 101, kickoff: '2026-07-18T15:00:00Z' }, target), true);
    assert.equal(isMatchBeforeTarget({ id: 201, kickoff: '2026-07-25T15:00:00Z' }, target), false);
    assert.equal(isMatchBeforeTarget({ id: 200, kickoff: '2026-07-20T15:00:00Z' }, target), false);
  });

  test('XB-R8: sezonní forma používá pouze letošní dokončené zápasy', () => {
    const history = buildPersonalXbHistory({
      archiveTips: archive,
      finishedMatches: finished.slice(0, 1),
      predictions: [{ match_id: 101, points: 4 }],
    });
    const xb = computePersonalXb({
      home: 'Artis Brno',
      away: 'Liberec',
      archiveTips: history.combined,
      seasonPoints: history.currentSeason.map((row) => row.points),
    });
    assert.equal(xb.factors.find((factor) => factor.key === 'season')?.sample, 1);
    assert.equal(xb.factors.find((factor) => factor.key === 'overall')?.sample, 3);
  });
});
