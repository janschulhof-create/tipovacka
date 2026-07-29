import type { RoundRecapFacts, RoundRecapMatch } from './roundRecap';

/**
 * Katalogové hlášky pro Kudy běží zajíc a pravidla, kdy je smí Claude použít.
 *
 * Hlášky NIKDY nejsou volné řetězce v komponentách. Aplikace nejdřív z faktů
 * deterministicky spočítá `eligiblePhraseIds` a Claude si smí vybírat pouze
 * z nich. Tím se nemůže stát, že model označí za divočinu běžný tip.
 */

export type RecapPhraseId =
  | 'painful_zero'
  | 'zero_disaster'
  | 'round_bottom'
  | 'gas_station_tip';

export const RECAP_PHRASES: Record<RecapPhraseId, string> = {
  painful_zero: '„Tady cejtím, že bude mrzení.“',
  zero_disaster: '„Můžeš skočit támhle do Renaulta a nazdar.“',
  round_bottom: '„Tady jde někdo pro tvrdou koledu.“',
  gas_station_tip: '„Tohle jsou tipy někde z benzinky, vole.“',
};

/** Kolik nul v jednom kole znamená katastrofu. Jediné místo, kde je práh. */
export const ZERO_DISASTER_THRESHOLD = 5;

/** Kolik procent kola musí být dohráno, aby šlo mluvit o posledním místě. */
export const ROUND_BOTTOM_MIN_PROGRESS = 0.5;

/** Minimální počet vyhodnocených tipů, aby poslední místo nebylo artefakt. */
export const ROUND_BOTTOM_MIN_TIPS = 3;

/** Nejvýše kolik procent tipérů smí věřit týmu, aby šlo o outsidera. */
export const OUTSIDER_CONSENSUS_MAX_SHARE = 0.2;

/** Kolik týmů od konce tabulky se považuje za outsidera. */
export const OUTSIDER_BOTTOM_TEAMS = 3;

export interface PainfulZeroFact {
  type: 'painful_zero';
  playerName: string;
  matchId: number;
  match: string;
  prediction: string;
  result: string;
  points: 0;
}

export interface ZeroDisasterFact {
  type: 'zero_disaster';
  playerName: string;
  zeroCount: number;
  evaluatedTips: number;
}

export interface RoundBottomFact {
  type: 'round_bottom';
  playerName: string;
  points: number;
  position: number;
  totalPlayers: number;
}

export interface GasStationTipFact {
  type: 'gas_station_tip';
  playerName: string;
  team: string;
  opponent: string;
  predictedResult: string;
  actualResult: string;
  outsiderEvidence:
    | { source: 'standings'; position: number; leagueSize: number }
    | { source: 'tipster_consensus'; winPickShare: number };
}

export interface RecapPhraseFacts {
  painfulZero: PainfulZeroFact | null;
  zeroDisaster: ZeroDisasterFact | null;
  roundBottom: RoundBottomFact | null;
  gasStationTip: GasStationTipFact | null;
  eligiblePhraseIds: RecapPhraseId[];
  /** Kolik katalogových hlášek smí text obsahovat. */
  maxPhrases: number;
}

/** Pořadí týmů PŘED zápasem — jen pokud je bezpečně rekonstruovatelné. */
export interface PreMatchStanding {
  team: string;
  position: number;
  leagueSize: number;
}

/**
 * Nejbolestivější nula: ta na nejsebevědomějším tipu.
 *
 * „Sebevědomý“ = tipér šel proti davu. Kdyby se vybíralo podle pořadí zápasů,
 * byl by výběr náhodný; takhle je deterministický a odpovídá významu hlášky.
 */
function najdiPainfulZero(facts: RoundRecapFacts): PainfulZeroFact | null {
  let nejlepsi: { fact: PainfulZeroFact; share: number } | null = null;

  for (const match of facts.matches) {
    for (const tip of match.tips) {
      if (tip.points !== 0) continue;

      // Jak moc byl tipér proti davu: podíl tipérů se stejným tipem.
      const stejny = match.tips.filter((other) => other.tip === tip.tip).length;
      const share = match.tips.length > 0 ? stejny / match.tips.length : 1;

      const kandidat: PainfulZeroFact = {
        type: 'painful_zero',
        playerName: tip.name,
        matchId: match.id,
        match: match.label,
        prediction: tip.tip,
        result: match.score,
        points: 0,
      };

      if (!nejlepsi || share < nejlepsi.share
        || (share === nejlepsi.share && match.id < nejlepsi.fact.matchId)) {
        nejlepsi = { fact: kandidat, share };
      }
    }
  }

  return nejlepsi?.fact ?? null;
}

/** Pět a více nul v jednom kole. Jediné pravidlo, žádné volné „> 4“. */
function najdiZeroDisaster(facts: RoundRecapFacts): ZeroDisasterFact | null {
  const kandidati = facts.players
    .filter((p) => p.zeros >= ZERO_DISASTER_THRESHOLD)
    .sort((a, b) => b.zeros - a.zeros || a.name.localeCompare(b.name, 'cs'));

  const nejhorsi = kandidati[0];
  if (!nejhorsi) return null;

  return {
    type: 'zero_disaster',
    playerName: nejhorsi.name,
    zeroCount: nejhorsi.zeros,
    evaluatedTips: nejhorsi.evaluatedTips,
  };
}

/**
 * Poslední místo v kole — s ochranami proti artefaktu.
 *
 * V rozehraném kole musí být dohraná aspoň polovina zápasů a tipér musí mít
 * dost vyhodnocených tipů. Jinak by „poslední“ znamenalo jen to, že se jeho
 * zápasy ještě nehrály.
 */
function najdiRoundBottom(facts: RoundRecapFacts): RoundBottomFact | null {
  const hodnoceni = facts.players.filter((p) => p.evaluatedTips > 0);
  if (hodnoceni.length < 2) return null;

  if (facts.mode === 'progress') {
    const progress = facts.totalMatches > 0 ? facts.completedMatches / facts.totalMatches : 0;
    if (progress < ROUND_BOTTOM_MIN_PROGRESS) return null;
  }

  const serazeni = [...hodnoceni].sort(
    (a, b) => a.points - b.points || b.evaluatedTips - a.evaluatedTips || a.name.localeCompare(b.name, 'cs'),
  );
  const posledni = serazeni[0];

  if (posledni.evaluatedTips < ROUND_BOTTOM_MIN_TIPS) return null;

  // Musí být jednoznačně poslední, nebo aspoň mít víc vyhodnocených tipů
  // než ten druhý od konce (jinak jde o shodu bez rozhodnutí).
  const druhy = serazeni[1];
  if (druhy && druhy.points === posledni.points && druhy.evaluatedTips === posledni.evaluatedTips) {
    return null;
  }

  return {
    type: 'round_bottom',
    playerName: posledni.name,
    points: posledni.points,
    position: hodnoceni.length,
    totalPlayers: hodnoceni.length,
  };
}

/** Vrátí tým, na jehož výhru tip ukazuje, nebo null u remízy. */
function tipovanyVitez(match: RoundRecapMatch, tip: string): string | null {
  const [h, a] = tip.split(':').map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(a) || h === a) return null;
  return h > a ? match.homeTeam : match.awayTeam;
}

/** Vrátí skutečného vítěze zápasu, nebo null u remízy. */
function skutecnyVitez(match: RoundRecapMatch): string | null {
  const [h, a] = match.score.split(':').map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(a) || h === a) return null;
  return h > a ? match.homeTeam : match.awayTeam;
}

/**
 * Tip na výrazného outsidera, který prohrál.
 *
 * KLÍČOVÉ: outsider se dokazuje POUZE informacemi známými před zápasem.
 * Nikdy „prohrál → tedy byl outsider“ (to by byl hindsight bias).
 *
 * Priorita důkazu:
 *   1) historické pořadí před zápasem (poslední tři týmy),
 *   2) tipérský konsenzus (≤ 20 % věřilo jeho výhře).
 */
function najdiGasStationTip(
  facts: RoundRecapFacts,
  preMatchStandings: PreMatchStanding[] = [],
): GasStationTipFact | null {
  const podleTymu = new Map(preMatchStandings.map((row) => [row.team, row]));

  for (const match of facts.matches) {
    const vitez = skutecnyVitez(match);
    if (vitez === null) continue; // remíza není prohra outsidera

    for (const tip of match.tips) {
      const tipovany = tipovanyVitez(match, tip.tip);
      if (!tipovany || tipovany === vitez) continue; // tipoval vítěze nebo remízu

      const soupeR = tipovany === match.homeTeam ? match.awayTeam : match.homeTeam;

      // 1) pořadí před zápasem
      const standing = podleTymu.get(tipovany);
      if (standing && standing.position >= standing.leagueSize - (OUTSIDER_BOTTOM_TEAMS - 1)) {
        return {
          type: 'gas_station_tip',
          playerName: tip.name,
          team: tipovany,
          opponent: soupeR,
          predictedResult: tip.tip,
          actualResult: match.score,
          outsiderEvidence: {
            source: 'standings',
            position: standing.position,
            leagueSize: standing.leagueSize,
          },
        };
      }

      // 2) tipérský konsenzus — kolik tipérů věřilo výhře tohoto týmu
      if (match.tips.length > 0) {
        const verili = match.tips.filter((other) => tipovanyVitez(match, other.tip) === tipovany).length;
        const share = verili / match.tips.length;
        if (share <= OUTSIDER_CONSENSUS_MAX_SHARE) {
          return {
            type: 'gas_station_tip',
            playerName: tip.name,
            team: tipovany,
            opponent: soupeR,
            predictedResult: tip.tip,
            actualResult: match.score,
            outsiderEvidence: { source: 'tipster_consensus', winPickShare: Number(share.toFixed(3)) },
          };
        }
      }
    }
  }

  return null;
}

/**
 * Kolik katalogových hlášek smí text obsahovat.
 *
 * Kudy běží zajíc je dlouhý studiový formát, takže snese víc než krátká
 * push notifikace. Pořád ale nesmí být z hlášek sestavený seznam.
 */
export function maxPhrasesForMode(mode: RoundRecapFacts['mode']): number {
  return mode === 'final' ? 3 : 2;
}

/** Deterministicky spočítá, které hlášky smí Claude v tomto kole použít. */
export function buildRecapPhraseFacts(
  facts: RoundRecapFacts,
  preMatchStandings: PreMatchStanding[] = [],
): RecapPhraseFacts {
  const painfulZero = najdiPainfulZero(facts);
  const zeroDisaster = najdiZeroDisaster(facts);
  const roundBottom = najdiRoundBottom(facts);
  const gasStationTip = najdiGasStationTip(facts, preMatchStandings);

  const eligiblePhraseIds: RecapPhraseId[] = [];
  if (painfulZero) eligiblePhraseIds.push('painful_zero');
  if (zeroDisaster) eligiblePhraseIds.push('zero_disaster');
  if (roundBottom) eligiblePhraseIds.push('round_bottom');
  if (gasStationTip) eligiblePhraseIds.push('gas_station_tip');

  return {
    painfulZero,
    zeroDisaster,
    roundBottom,
    gasStationTip,
    eligiblePhraseIds,
    maxPhrases: maxPhrasesForMode(facts.mode),
  };
}
