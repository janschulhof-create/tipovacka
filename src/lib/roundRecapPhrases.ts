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
  | 'gas_station_tip'
  | 'dance_exit'
  | 'knows_the_shovel'
  | 'what_the_hell'
  | 'levels'
  | 'melta'
  | 'bagrovana'
  | 'kriplfight'
  | 'unfinished_business'
  | 'division_performance'
  | 'spooky'
  | 'close_the_shop'
  | 'absolutely_shocking'
  | 'walked_all_over';

export const RECAP_PHRASES: Record<RecapPhraseId, string> = {
  painful_zero: '„Tady cejtím, že bude mrzení.“',
  zero_disaster: '„Můžeš skočit támhle do Renaulta a nazdar.“',
  round_bottom: '„Tady jde někdo pro tvrdou koledu.“',
  gas_station_tip: '„Tohle jsou tipy někde z benzinky, vole.“',
  dance_exit: '„Odchod z tančírny.“',
  knows_the_shovel: '„On ví, jak se na lopatě sedí.“',
  what_the_hell: '„Pičo vole, co to jako je?“',
  levels: '„Levely.“',
  melta: '„To byla melta.“',
  bagrovana: '„To byla bagrovaná.“',
  kriplfight: '„Kriplfight.“',
  unfinished_business: '„Budeme se o tom ještě bavit.“',
  division_performance: '„Tohle je naprosto divizní výkon.“',
  spooky: '„To je strašidelný.“',
  close_the_shop: '„Můžeš zavřít krám a jít do prdele.“',
  absolutely_shocking: '„To je pro mě naprosto šokující.“',
  // Rod se volí podle `variant` v dokladu – nikdy odhadem ze jména.
  walked_all_over: '„To se po něm prošlo.“',
};

/**
 * Povolené tvary rodiny „To se po … prošlo.“
 *
 * Jde o JEDNU rodinu se třemi tvary, ne o tři samostatné hlášky. Který tvar
 * je povolený, určuje aplikace podle typu cíle — model si ho nevybírá sám
 * a nesmí použít jiný.
 */
export const WALKED_ALL_OVER_VARIANTS = {
  masculine: '„To se po něm prošlo.“',
  feminine: '„To se po ní prošlo.“',
  plural: '„To se po nich prošlo.“',
} as const;

export type WalkedVariant = keyof typeof WALKED_ALL_OVER_VARIANTS;

/**
 * Jak silný musí být konsenzus, aby šlo o „naprosto šokující“ výsledek.
 *
 * Existující `crowdShock` má práh 0,67 a živí mírnější hlášky. Pro tuhle
 * je laťka výš: musí se mýlit drtivá většina, ne jen nadpoloviční. Při osmi
 * tipérech to znamená aspoň sedm proti jednomu.
 */
export const SHOCKING_MIN_CONSENSUS_SHARE = 0.85;

/**
 * Kolik tipérů musí zápas vůbec tipovat, aby se dal konsenzus měřit.
 *
 * Ze dvou tipů „drtivá většina“ nevznikne — poměr by byl náhoda.
 */
export const SHOCKING_MIN_SAMPLE = 5;

/**
 * Brankový rozdíl, od kterého se dá mluvit o převálcování týmu.
 *
 * Vyšší než `BAGROVANA_MIN_DIFF` (4). Bagrovaná je jednostranný výprask,
 * tohle je jeho krajní podoba — a proto se prahy nepřekrývají náhodně:
 * každý rozdíl ≥ 5 je zároveň bagrovaná, ale ne naopak.
 */
export const WALKED_OVER_MIN_GOAL_DIFF = 5;

/**
 * Jak daleko musí být tip od skutečnosti, aby šlo o zničenou předpověď.
 *
 * Měří se součet odchylek obou skóre. Pro ilustraci:
 *   tip 1:0, výsledek 0:1  →  1 + 1 = 2   (běžná chyba)
 *   tip 4:0, výsledek 0:4  →  4 + 4 = 8   (katastrofa)
 *
 * Práh 7 je nad běžnou chybou a zároveň pod nedosažitelnou hranicí.
 * Samotná nula bodů nestačí — musí k tomu být i špatný vítěz.
 */
export const WALKED_OVER_MIN_MISS_DISTANCE = 7;

/** Jak těsné musí být čelo tabulky, aby se o tom „ještě bavilo“. */
export const UNFINISHED_BUSINESS_MAX_GAP = 5;

/** O kolik musí tipér zaostat za svým loňským průměrem, aby šlo o divizi. */
export const DIVISION_PERFORMANCE_MIN_DROP = 1.5;

/** Jaký podíl tipérů musí v jednom zápase vyhořet, aby to bylo strašidelné. */
export const SPOOKY_MIN_ZERO_SHARE = 0.75;

/** Kolik bodů za celé kolo znamená „zavři krám“. */
export const CLOSE_THE_SHOP_MAX_POINTS = 2;

/** O kolik míst musí tipér spadnout, aby šlo o odchod z tančírny. */
export const DANCE_EXIT_MIN_PLACES = 2;

/** Jak velký musí být náskok vítěze kola, aby šlo o jiné levely. */
export const LEVELS_MIN_GAP = 8;

/** Kolik gólů dělá z zápasu meltu (a zároveň nesmí být jednostranný). */
export const MELTA_MIN_GOALS = 6;
export const MELTA_MAX_DIFF = 2;

/** Jak velký brankový rozdíl je bagrovaná. */
export const BAGROVANA_MIN_DIFF = 4;

/** Kriplfight: oba na dně a blízko sebe. */
export const KRIPLFIGHT_MAX_POINTS = 8;
export const KRIPLFIGHT_MAX_GAP = 2;

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

export interface DanceExitFact {
  type: 'dance_exit';
  playerName: string;
  places: number;
}

export interface KnowsTheShovelFact {
  type: 'knows_the_shovel';
  playerName: string;
  match: string;
  score: string;
  crowdFavorite: string | null;
  crowdShare: number;
}

export interface WhatTheHellFact {
  type: 'what_the_hell';
  match: string;
  score: string;
  favoriteTeam: string | null;
  share: number;
  zeros: number;
}

export interface LevelsFact {
  type: 'levels';
  playerName: string;
  points: number;
  gap: number;
}

export interface MeltaFact {
  type: 'melta';
  match: string;
  score: string;
  totalGoals: number;
}

export interface BagrovanaFact {
  type: 'bagrovana';
  match: string;
  score: string;
  goalDifference: number;
}

export interface KriplfightFact {
  type: 'kriplfight';
  first: string;
  second: string;
  firstPoints: number;
  secondPoints: number;
}

export interface UnfinishedBusinessFact {
  type: 'unfinished_business';
  leader: string;
  challenger: string;
  gap: number;
}

export interface DivisionPerformanceFact {
  type: 'division_performance';
  playerName: string;
  roundAverage: number;
  previousAverage: number;
  drop: number;
}

export interface SpookyFact {
  type: 'spooky';
  match: string;
  score: string;
  zeros: number;
  totalTips: number;
}

export interface CloseTheShopFact {
  type: 'close_the_shop';
  playerName: string;
  points: number;
  evaluatedTips: number;
}

export interface AbsolutelyShockingFact {
  type: 'absolutely_shocking';
  match: string;
  score: string;
  /** Tým, kterému věřila drtivá většina. */
  expectedTeam: string | null;
  /** Podíl tipérů, kteří se mýlili. */
  share: number;
  /** Kolik tipů se zápasu vůbec týkalo – kvůli velikosti vzorku. */
  sampleSize: number;
  zeros: number;
}

/**
 * Podstatné jméno, na které se zájmeno v hlášce váže.
 *
 * Rod se NEODHADUJE z názvu klubu ani ze jména hráče. Aplikace dodá
 * konkrétní referent a k němu odpovídající tvar, takže věta „…mužstvo
 * Artisu, to se po něm prošlo“ je gramaticky bezpečná i pro klub,
 * jehož název je ženského rodu (Sparta, Slavia).
 */
export interface WalkedReferent {
  /** Podstatné jméno pro zájmeno, např. „mužstvo“ nebo „obrana“. */
  noun: string;
  /** Tvar hlášky, který k tomuto podstatnému jménu patří. */
  variant: WalkedVariant;
}

/**
 * Referenty pro oba významy.
 *
 * `team`    → „mužstvo“ (střední rod, zájmeno „něm“) — funguje pro každý
 *             klub bez ohledu na rod jeho názvu.
 * `tipster` → „tip“ (mužský rod) — váže se na TIP, ne na osobu, takže
 *             hláška funguje i pro tipérku.
 */
export const WALKED_REFERENTS: Record<'team' | 'tipster', WalkedReferent> = {
  team: { noun: 'mužstvo', variant: 'masculine' },
  tipster: { noun: 'tip', variant: 'masculine' },
};

export interface WalkedAllOverFact {
  type: 'walked_all_over';
  /** `team` = převálcovaný tým, `tipster` = zničená předpověď. */
  context: 'team' | 'tipster';
  /** Koho se to týká. U týmu poražený, u tipéra jeho jméno. */
  target: string;
  /** Povolený tvar hlášky. Určuje aplikace, ne model. */
  variant: WalkedVariant;
  /** Na co se zájmeno váže. Model musí větu postavit kolem tohoto slova. */
  referentNoun: string;
  match: string;
  score: string;
  /** Vítěz (u kontextu týmu) nebo tip (u kontextu tipéra). */
  detail: string;
  /** Brankový rozdíl u týmu, vzdálenost tipu u tipéra. */
  evidence: number;
}

export interface RecapPhraseFacts {
  painfulZero: PainfulZeroFact | null;
  zeroDisaster: ZeroDisasterFact | null;
  roundBottom: RoundBottomFact | null;
  gasStationTip: GasStationTipFact | null;
  danceExit: DanceExitFact | null;
  knowsTheShovel: KnowsTheShovelFact | null;
  whatTheHell: WhatTheHellFact | null;
  levels: LevelsFact | null;
  melta: MeltaFact | null;
  bagrovana: BagrovanaFact | null;
  kriplfight: KriplfightFact | null;
  unfinishedBusiness: UnfinishedBusinessFact | null;
  divisionPerformance: DivisionPerformanceFact | null;
  spooky: SpookyFact | null;
  closeTheShop: CloseTheShopFact | null;
  absolutelyShocking: AbsolutelyShockingFact | null;
  walkedAllOver: WalkedAllOverFact | null;
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
 * „Odchod z tančírny.“ — tipér vypadl z boje, výrazně se propadl v pořadí.
 * Doklad: `biggestFall` s propadem aspoň o dvě místa.
 */
function najdiDanceExit(facts: RoundRecapFacts): DanceExitFact | null {
  const pad = facts.biggestFall;
  if (!pad || pad.places < DANCE_EXIT_MIN_PLACES) return null;
  return { type: 'dance_exit', playerName: pad.name, places: pad.places };
}

/**
 * „On ví, jak se na lopatě sedí.“ — pochvala matadora.
 *
 * Trefil PŘESNĚ zápas, u kterého se dav mýlil. Nejde o štěstí: většina
 * tipérů čekala jiný výsledek, on ne.
 */
function najdiKnowsTheShovel(facts: RoundRecapFacts): KnowsTheShovelFact | null {
  for (const match of facts.matches) {
    if (!match.crowdShock) continue;
    const trefil = match.exactHitters[0];
    if (!trefil) continue;

    return {
      type: 'knows_the_shovel',
      playerName: trefil,
      match: match.label,
      score: match.score,
      crowdFavorite: match.crowdFavorite?.team ?? null,
      crowdShare: match.crowdFavorite?.share ?? 0,
    };
  }
  return null;
}

/**
 * „Pičo vole, co to jako je?“ — naprostý údiv nad výsledkem.
 * Doklad: consensusShock, tedy zápas, kde se dav spletl a nasypal nuly.
 */
function najdiWhatTheHell(facts: RoundRecapFacts): WhatTheHellFact | null {
  const shock = facts.consensusShock;
  if (!shock) return null;
  return {
    type: 'what_the_hell',
    match: shock.match,
    score: shock.score,
    favoriteTeam: shock.favoriteTeam,
    share: shock.share,
    zeros: shock.zeros,
  };
}

/**
 * „Levely.“ — vítěz kola byl o třídu jinde než zbytek.
 * Pozor: měří se náskok V KOLE, ne celkově (na to je „to se nebavíme“).
 */
function najdiLevels(facts: RoundRecapFacts): LevelsFact | null {
  const serazeni = [...facts.players]
    .filter((p) => p.evaluatedTips > 0)
    .sort((a, b) => b.points - a.points);

  const [prvni, druhy] = serazeni;
  if (!prvni || !druhy) return null;

  const gap = prvni.points - druhy.points;
  if (gap < LEVELS_MIN_GAP) return null;

  return { type: 'levels', playerName: prvni.name, points: prvni.points, gap };
}

/**
 * „To byla melta.“ — divoká přestřelka.
 * Hodně gólů, ale vyrovnaná. Jednostranný výprask je bagrovaná, ne melta.
 */
function najdiMeltu(facts: RoundRecapFacts): MeltaFact | null {
  const kandidati = facts.matches
    .filter((m) => m.totalGoals >= MELTA_MIN_GOALS && m.goalDifference <= MELTA_MAX_DIFF)
    .sort((a, b) => b.totalGoals - a.totalGoals || a.id - b.id);

  const zapas = kandidati[0];
  if (!zapas) return null;
  return { type: 'melta', match: zapas.label, score: zapas.score, totalGoals: zapas.totalGoals };
}

/**
 * „To byla bagrovaná.“ — jednostranný výprask.
 * Doklad: brankový rozdíl aspoň čtyři góly.
 */
function najdiBagrovanou(facts: RoundRecapFacts): BagrovanaFact | null {
  const kandidati = facts.matches
    .filter((m) => m.goalDifference >= BAGROVANA_MIN_DIFF)
    .sort((a, b) => b.goalDifference - a.goalDifference || a.id - b.id);

  const zapas = kandidati[0];
  if (!zapas) return null;
  return {
    type: 'bagrovana',
    match: zapas.label,
    score: zapas.score,
    goalDifference: zapas.goalDifference,
  };
}

/**
 * „Kriplfight.“ — souboj dvou nejhorších o dno kola.
 * Oba musí být hluboko a blízko sebe, jinak jde o normální poslední místo.
 */
function najdiKriplfight(facts: RoundRecapFacts): KriplfightFact | null {
  const serazeni = [...facts.players]
    .filter((p) => p.evaluatedTips >= ROUND_BOTTOM_MIN_TIPS)
    .sort((a, b) => a.points - b.points || a.name.localeCompare(b.name, 'cs'));

  const [posledni, predposledni] = serazeni;
  if (!posledni || !predposledni) return null;

  if (predposledni.points > KRIPLFIGHT_MAX_POINTS) return null;
  if (predposledni.points - posledni.points > KRIPLFIGHT_MAX_GAP) return null;

  return {
    type: 'kriplfight',
    first: posledni.name,
    second: predposledni.name,
    firstPoints: posledni.points,
    secondPoints: predposledni.points,
  };
}


/**
 * „Budeme se o tom ještě bavit.“ — účet není uzavřený.
 *
 * Čelo CELKOVÉ tabulky je těsné, takže rozhodnuto zdaleka není. Hodí se jako
 * studiová pointa na závěr, ne jako rýpnutí.
 */
function najdiUnfinishedBusiness(facts: RoundRecapFacts): UnfinishedBusinessFact | null {
  const [prvni, druhy] = facts.overallStandings;
  if (!prvni || !druhy) return null;

  const gap = prvni.points - druhy.points;
  if (gap < 0 || gap > UNFINISHED_BUSINESS_MAX_GAP) return null;

  return { type: 'unfinished_business', leader: prvni.name, challenger: druhy.name, gap };
}

/**
 * „Tohle je naprosto divizní výkon.“ — tipér hluboko pod VLASTNÍM standardem.
 *
 * Pozor na záměnu: „To je divize.“ mluví o kolapsu TÝMU, tahle hláška
 * o výkonu TIPÉRA proti jeho loňskému průměru.
 */
function najdiDivisionPerformance(facts: RoundRecapFacts): DivisionPerformanceFact | null {
  const propad = facts.worstVsLastSeason;
  if (!propad) return null;

  const drop = propad.previousAverage - propad.roundAverage;
  if (drop < DIVISION_PERFORMANCE_MIN_DROP) return null;

  return {
    type: 'division_performance',
    playerName: propad.name,
    roundAverage: propad.roundAverage,
    previousAverage: propad.previousAverage,
    drop: Number(drop.toFixed(2)),
  };
}

/**
 * „To je strašidelný.“ — jeden zápas sebral body skoro všem.
 * Na rozdíl od „co to jako je“ nejde o šok z výsledku, ale o hromadnou zkázu.
 */
function najdiSpooky(facts: RoundRecapFacts): SpookyFact | null {
  const kandidati = facts.matches
    .map((match) => {
      const vyhodnocene = match.tips.filter((tip) => typeof tip.points === 'number');
      const nuly = vyhodnocene.filter((tip) => tip.points === 0).length;
      return { match, nuly, celkem: vyhodnocene.length };
    })
    .filter((row) => row.celkem >= 3 && row.nuly / row.celkem >= SPOOKY_MIN_ZERO_SHARE)
    .sort((a, b) => b.nuly - a.nuly || a.match.id - b.match.id);

  const nej = kandidati[0];
  if (!nej) return null;

  return {
    type: 'spooky',
    match: nej.match.label,
    score: nej.match.score,
    zeros: nej.nuly,
    totalTips: nej.celkem,
  };
}

/**
 * „Můžeš zavřít krám a jít do prdele.“ — nejtvrdší odsudek katalogu.
 *
 * Rezervováno pro naprostý propadák celého kola. Musí mít odtipováno
 * dost zápasů, aby nešlo o někoho, kdo prostě netipoval.
 */
function najdiCloseTheShop(facts: RoundRecapFacts): CloseTheShopFact | null {
  const kandidati = facts.players
    .filter((p) => p.evaluatedTips >= ROUND_BOTTOM_MIN_TIPS && p.points <= CLOSE_THE_SHOP_MAX_POINTS)
    .sort((a, b) => a.points - b.points || a.name.localeCompare(b.name, 'cs'));

  const nej = kandidati[0];
  if (!nej) return null;

  return {
    type: 'close_the_shop',
    playerName: nej.name,
    points: nej.points,
    evaluatedTips: nej.evaluatedTips,
  };
}


/**
 * „To je pro mě naprosto šokující.“ — výsledek proti drtivému konsenzu.
 *
 * Přísnější než existující `crowdShock` (0,67): musí se mýlit skoro všichni
 * a vzorek musí být dost velký, aby poměr nebyl náhoda.
 */
function najdiAbsolutelyShocking(facts: RoundRecapFacts): AbsolutelyShockingFact | null {
  const kandidati = facts.matches
    .filter((match) => {
      const favorit = match.crowdFavorite;
      if (!favorit) return false;
      // Zápas se musí počítat jen z vyhodnocených tipů.
      const vyhodnocene = match.tips.filter((tip) => typeof tip.points === 'number').length;
      if (vyhodnocene < SHOCKING_MIN_SAMPLE) return false;
      if (favorit.share < SHOCKING_MIN_CONSENSUS_SHARE) return false;
      // A dav se musel skutečně splést.
      return match.crowdShock;
    })
    .sort((a, b) =>
      (b.crowdFavorite?.share ?? 0) - (a.crowdFavorite?.share ?? 0)
      || b.zeroTipsters.length - a.zeroTipsters.length
      || a.id - b.id);

  const zapas = kandidati[0];
  if (!zapas) return null;

  return {
    type: 'absolutely_shocking',
    match: zapas.label,
    score: zapas.score,
    expectedTeam: zapas.crowdFavorite?.team ?? null,
    share: Number((zapas.crowdFavorite?.share ?? 0).toFixed(3)),
    sampleSize: zapas.tips.filter((tip) => typeof tip.points === 'number').length,
    zeros: zapas.zeroTipsters.length,
  };
}

/** Vzdálenost tipu od skutečnosti: součet odchylek obou skóre. */
export function predictionMissDistance(tip: string, score: string): number | null {
  const [th, ta] = tip.split(':').map(Number);
  const [sh, sa] = score.split(':').map(Number);
  if (![th, ta, sh, sa].every(Number.isFinite)) return null;
  return Math.abs(th - sh) + Math.abs(ta - sa);
}

/** Vítěz podle skóre, nebo `null` u remízy. */
function vitezPodleSkore(score: string): 'home' | 'away' | null {
  const [h, a] = score.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(a) || h === a) return null;
  return h > a ? 'home' : 'away';
}

/**
 * „To se po … prošlo.“ — jedna rodina, dva významy.
 *
 * A) TÝM: převálcovaný soupeř (brankový rozdíl ≥ 5).
 * B) TIPÉR: zničená předpověď — velká vzdálenost od skutečnosti
 *    A ZÁROVEŇ špatně určený vítěz. Samotná nula bodů nestačí.
 *
 * Přednost má drtivější doklad; při shodě rozhoduje pořadí zápasů,
 * takže výsledek je deterministický.
 */
function najdiWalkedAllOver(facts: RoundRecapFacts): WalkedAllOverFact | null {
  // ── A) převálcovaný tým ───────────────────────────────────────────────
  const drtivy = facts.matches
    .filter((m) => m.goalDifference >= WALKED_OVER_MIN_GOAL_DIFF)
    .sort((a, b) => b.goalDifference - a.goalDifference || a.id - b.id)[0];

  const teamFact: WalkedAllOverFact | null = drtivy
    ? (() => {
      const vitez = vitezPodleSkore(drtivy.score);
      const porazeny = vitez === 'home' ? drtivy.awayTeam : drtivy.homeTeam;
      const vyhral = vitez === 'home' ? drtivy.homeTeam : drtivy.awayTeam;
      return {
        type: 'walked_all_over' as const,
        context: 'team' as const,
        target: porazeny,
        variant: WALKED_REFERENTS.team.variant,
        referentNoun: WALKED_REFERENTS.team.noun,
        match: drtivy.label,
        score: drtivy.score,
        detail: vyhral,
        evidence: drtivy.goalDifference,
      };
    })()
    : null;

  // ── B) zničená předpověď ──────────────────────────────────────────────
  let tipsterFact: WalkedAllOverFact | null = null;
  let nejhorsi = WALKED_OVER_MIN_MISS_DISTANCE - 1;

  for (const match of facts.matches) {
    const skutecnyVitez = vitezPodleSkore(match.score);
    for (const tip of match.tips) {
      // Kdo netipoval, toho se hláška netýká.
      if (typeof tip.points !== 'number') continue;

      const vzdalenost = predictionMissDistance(tip.tip, match.score);
      if (vzdalenost == null || vzdalenost < WALKED_OVER_MIN_MISS_DISTANCE) continue;

      // Musí se splést i ve vítězi – jinak jde jen o nepřesné skóre.
      const tipovanyVitez = vitezPodleSkore(tip.tip);
      if (tipovanyVitez === skutecnyVitez) continue;

      if (vzdalenost > nejhorsi) {
        nejhorsi = vzdalenost;
        tipsterFact = {
          type: 'walked_all_over',
          context: 'tipster',
          target: tip.name,
          variant: WALKED_REFERENTS.tipster.variant,
          referentNoun: WALKED_REFERENTS.tipster.noun,
          match: match.label,
          score: match.score,
          detail: tip.tip,
          evidence: vzdalenost,
        };
      }
    }
  }

  // Drtivější doklad vyhrává; u shody má přednost tým (viditelnější).
  if (teamFact && tipsterFact) {
    return tipsterFact.evidence > teamFact.evidence + 2 ? tipsterFact : teamFact;
  }
  return teamFact ?? tipsterFact;
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
  const danceExit = najdiDanceExit(facts);
  const knowsTheShovel = najdiKnowsTheShovel(facts);
  const whatTheHell = najdiWhatTheHell(facts);
  const levels = najdiLevels(facts);
  const melta = najdiMeltu(facts);
  const bagrovana = najdiBagrovanou(facts);
  const kriplfight = najdiKriplfight(facts);
  const unfinishedBusiness = najdiUnfinishedBusiness(facts);
  const divisionPerformance = najdiDivisionPerformance(facts);
  const spooky = najdiSpooky(facts);
  const closeTheShop = najdiCloseTheShop(facts);
  const absolutelyShocking = najdiAbsolutelyShocking(facts);
  const walkedAllOver = najdiWalkedAllOver(facts);

  const eligiblePhraseIds: RecapPhraseId[] = [];
  if (painfulZero) eligiblePhraseIds.push('painful_zero');
  if (zeroDisaster) eligiblePhraseIds.push('zero_disaster');
  if (roundBottom) eligiblePhraseIds.push('round_bottom');
  if (gasStationTip) eligiblePhraseIds.push('gas_station_tip');
  if (danceExit) eligiblePhraseIds.push('dance_exit');
  if (knowsTheShovel) eligiblePhraseIds.push('knows_the_shovel');
  if (whatTheHell) eligiblePhraseIds.push('what_the_hell');
  if (levels) eligiblePhraseIds.push('levels');
  if (melta) eligiblePhraseIds.push('melta');
  if (bagrovana) eligiblePhraseIds.push('bagrovana');
  if (kriplfight) eligiblePhraseIds.push('kriplfight');
  if (unfinishedBusiness) eligiblePhraseIds.push('unfinished_business');
  if (divisionPerformance) eligiblePhraseIds.push('division_performance');
  if (spooky) eligiblePhraseIds.push('spooky');
  if (closeTheShop) eligiblePhraseIds.push('close_the_shop');
  if (absolutelyShocking) eligiblePhraseIds.push('absolutely_shocking');
  if (walkedAllOver) eligiblePhraseIds.push('walked_all_over');

  return {
    painfulZero,
    zeroDisaster,
    roundBottom,
    gasStationTip,
    danceExit,
    knowsTheShovel,
    whatTheHell,
    levels,
    melta,
    bagrovana,
    kriplfight,
    unfinishedBusiness,
    divisionPerformance,
    spooky,
    closeTheShop,
    absolutelyShocking,
    walkedAllOver,
    eligiblePhraseIds,
    maxPhrases: maxPhrasesForMode(facts.mode),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  ELIGIBILITA PRO JEDEN ZÁPAS — sdílené jádro pro Baroko
//
//  Kudy běží zajíc hodnotí celé kolo, Baroko jeden zápas. Prahy jsou ale
//  stejné, proto se sem soustředí a `buildRecapPhraseFacts` i Baroko je
//  berou odsud. Žádná kopie v roast.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Minimální vstup, který o zápase potřebujeme. Sedí na Baroko i na recap. */
export interface SingleMatchInput {
  homeTeam: string;
  awayTeam: string;
  /** Konečné skóre „2:1“. */
  score: string;
  tips: { name: string; tip: string; points: number | null }[];
}

export interface SingleMatchEligibility {
  eligiblePhraseIds: RecapPhraseId[];
  absolutelyShocking: AbsolutelyShockingFact | null;
  walkedAllOver: WalkedAllOverFact | null;
  /**
   * Přesné texty hlášek povolené PRO TENTO požadavek.
   *
   * U rodiny „prošlo“ obsahuje jen ten jediný tvar, který odpovídá
   * zvolenému referentu — ostatní tvary jsou nepovolené.
   */
  allowedPhraseTexts: string[];
}

/** Brankový rozdíl ze skóre, nebo `null` u neplatného vstupu. */
function goalDifference(score: string): number | null {
  const [h, a] = score.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return Math.abs(h - a);
}

/** Kdo byl favoritem davu a jak silně. */
function crowdConsensus(input: SingleMatchInput) {
  const vyhodnocene = input.tips.filter((t) => typeof t.points === 'number');
  if (vyhodnocene.length === 0) return null;

  const counts = { home: 0, draw: 0, away: 0 };
  for (const t of vyhodnocene) {
    const v = vitezPodleSkore(t.tip);
    counts[v === null ? 'draw' : v] += 1;
  }
  const poradi = ['home', 'draw', 'away'] as const;
  const favorit = poradi.reduce((best, v) => (counts[v] > counts[best] ? v : best), 'home' as const);
  const max = counts[favorit];
  if (max === 0 || poradi.filter((v) => counts[v] === max).length > 1) return null;

  return {
    outcome: favorit,
    share: max / vyhodnocene.length,
    sampleSize: vyhodnocene.length,
    team: favorit === 'home' ? input.homeTeam : favorit === 'away' ? input.awayTeam : null,
  };
}

/**
 * Eligibilita obou povinných rodin pro JEDEN zápas.
 *
 * Používá TYTÉŽ prahy jako hodnocení celého kola — proto je jádro sdílené
 * a v `roast.ts` žádné hodnoty nejsou.
 */
export function buildMatchPhraseEligibility(input: SingleMatchInput): SingleMatchEligibility {
  const eligiblePhraseIds: RecapPhraseId[] = [];
  const allowedPhraseTexts: string[] = [];

  // ── „To je pro mě naprosto šokující.“ ──────────────────────────────────
  const konsenzus = crowdConsensus(input);
  const skutecnyVitez = vitezPodleSkore(input.score);
  let absolutelyShocking: AbsolutelyShockingFact | null = null;

  if (konsenzus
    && konsenzus.sampleSize >= SHOCKING_MIN_SAMPLE
    && konsenzus.share >= SHOCKING_MIN_CONSENSUS_SHARE
    && konsenzus.outcome !== (skutecnyVitez ?? 'draw')) {
    absolutelyShocking = {
      type: 'absolutely_shocking',
      match: `${input.homeTeam} – ${input.awayTeam}`,
      score: input.score,
      expectedTeam: konsenzus.team,
      share: Number(konsenzus.share.toFixed(3)),
      sampleSize: konsenzus.sampleSize,
      zeros: input.tips.filter((t) => t.points === 0).length,
    };
    eligiblePhraseIds.push('absolutely_shocking');
    allowedPhraseTexts.push(RECAP_PHRASES.absolutely_shocking);
  }

  // ── „To se po … prošlo.“ ───────────────────────────────────────────────
  let walkedAllOver: WalkedAllOverFact | null = null;
  const rozdil = goalDifference(input.score);
  const label = `${input.homeTeam} – ${input.awayTeam}`;

  if (rozdil != null && rozdil >= WALKED_OVER_MIN_GOAL_DIFF && skutecnyVitez) {
    const porazeny = skutecnyVitez === 'home' ? input.awayTeam : input.homeTeam;
    const vitez = skutecnyVitez === 'home' ? input.homeTeam : input.awayTeam;
    walkedAllOver = {
      type: 'walked_all_over',
      context: 'team',
      target: porazeny,
      variant: WALKED_REFERENTS.team.variant,
      referentNoun: WALKED_REFERENTS.team.noun,
      match: label,
      score: input.score,
      detail: vitez,
      evidence: rozdil,
    };
  } else {
    let nejhorsi = WALKED_OVER_MIN_MISS_DISTANCE - 1;
    for (const tip of input.tips) {
      if (typeof tip.points !== 'number') continue;
      const vzdalenost = predictionMissDistance(tip.tip, input.score);
      if (vzdalenost == null || vzdalenost < WALKED_OVER_MIN_MISS_DISTANCE) continue;
      if (vitezPodleSkore(tip.tip) === skutecnyVitez) continue;
      if (vzdalenost > nejhorsi) {
        nejhorsi = vzdalenost;
        walkedAllOver = {
          type: 'walked_all_over',
          context: 'tipster',
          target: tip.name,
          variant: WALKED_REFERENTS.tipster.variant,
          referentNoun: WALKED_REFERENTS.tipster.noun,
          match: label,
          score: input.score,
          detail: tip.tip,
          evidence: vzdalenost,
        };
      }
    }
  }

  if (walkedAllOver) {
    eligiblePhraseIds.push('walked_all_over');
    // POUZE zvolený tvar – ostatní jsou pro tento požadavek nepovolené.
    allowedPhraseTexts.push(WALKED_ALL_OVER_VARIANTS[walkedAllOver.variant]);
  }

  return { eligiblePhraseIds, absolutelyShocking, walkedAllOver, allowedPhraseTexts };
}

/**
 * Přesné texty hlášek povolené pro celé kolo (Kudy běží zajíc).
 * U rodiny „prošlo“ opět jen zvolený tvar.
 */
export function allowedPhraseTextsFor(facts: RecapPhraseFacts): string[] {
  return facts.eligiblePhraseIds.map((id) =>
    id === 'walked_all_over' && facts.walkedAllOver
      ? WALKED_ALL_OVER_VARIANTS[facts.walkedAllOver.variant]
      : RECAP_PHRASES[id]);
}

/**
 * Blok povolených hlídaných hlášek pro prompt.
 *
 * Čistá funkce — používá ji Baroko i testy, takže se text v promptu dá
 * ověřit přímo, ne čtením zdrojáku.
 *
 * Když není povolená žádná, vrací větu, která výslovně říká, že se to týká
 * JEN hlídaných hlášek. Historické tím zakázané nejsou.
 */
export function buildGatedPhraseBlock(e: SingleMatchEligibility): string {
  if (e.eligiblePhraseIds.length === 0) {
    return 'Žádná hlídaná hláška fáze A není pro tento zápas povolená. '
      + 'Historické hlášky tím zakázané nejsou — řiď se jejich vlastními pravidly.';
  }

  return e.eligiblePhraseIds
    .map((id) => {
      const doklad = id === 'absolutely_shocking' ? e.absolutelyShocking : e.walkedAllOver;
      const text = id === 'walked_all_over' && e.walkedAllOver
        ? WALKED_ALL_OVER_VARIANTS[e.walkedAllOver.variant]
        : RECAP_PHRASES[id];
      const vazba = id === 'walked_all_over' && e.walkedAllOver
        ? ` Zájmeno se váže na slovo „${e.walkedAllOver.referentNoun}“ — postav větu tak, aby to bylo jasné.`
        : '';
      return `- ${text} — doloženo: ${JSON.stringify(doklad)}.${vazba}`;
    })
    .join('\n');
}
