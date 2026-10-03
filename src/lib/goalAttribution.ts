/**
 * Připsání gólů a přednost zdrojů skóre.
 *
 * ── KOŘENOVÁ PŘÍČINA CHYBY S VLASTNÍMI GÓLY ─────────────────────────────────
 * Dvě chyby, které spolu pracovaly:
 *
 * 1. Vlastní gól se otáčel na druhou stranu, protože kód předpokládal, že
 *    Highlightly váže událost k týmu hráče, který si gól dal. Obě produkční
 *    chyby ale odpovídají opaku: událost je už u týmu, KTERÉMU byl gól
 *    připsán. Otočení tedy gól přesunulo na špatnou stranu.
 *
 * 2. `reconcileHighlightlyScore` pak OFICIÁLNÍ skóre přepsal skórem
 *    poskládaným z událostí, kdykoli seděl součet a lišilo se rozložení.
 *    Gól na špatné straně dává přesně tenhle podpis — stejný součet,
 *    jiné rozložení. Heuristika tak každý chybně otočený vlastní gól
 *    proměnila v chybně uložený výsledek.
 *
 *    Plzeň–Olomouc: oficiálně 1:2, z událostí 0:3 → uloženo 0:3
 *    Hradec–Teplice: oficiálně 0:2, z událostí 1:1 → uloženo 1:1
 *
 * Heuristika vznikla kvůli přátelským zápasům s prohozenými týmy. Import
 * přípravných zápasů je ale trvale vypnutý.
 *
 * ── PRAVIDLO ────────────────────────────────────────────────────────────────
 * OFICIÁLNÍ SKÓRE ZE ZDROJE VŽDY VYHRÁVÁ. Události vysvětlují průběh,
 * výsledek neurčují. Ze skládání gólů se skóre bere jen tehdy, když
 * oficiální chybí.
 */

export type Side = 'home' | 'away';

/** Typ události z poskytovatele, jak ho rozlišujeme. */
export type GoalKind = 'goal' | 'penalty' | 'own';

/**
 * Rozpozná druh gólu z textu typu události.
 *
 * Neznámý nebo zrušený gól vrací `null` — nikdy se z něj nepřipočítá bod
 * a nikdy se kvůli němu neotočí strana.
 */
export function classifyGoalEvent(type: string): GoalKind | null {
  const t = type.toLowerCase();
  // Zrušené, neproměněné a VAR stažené góly do skóre nepatří.
  if (/cancel|disallow|no goal|missed penalty|penalty missed/.test(t)) return null;
  if (/\bvar\b/.test(t)) return null;
  if (!/goal|penalty/.test(t)) return null;
  if (/own/.test(t)) return 'own';
  if (/penalt/.test(t)) return 'penalty';
  return 'goal';
}

/**
 * Strana, které se gól připíše.
 *
 * Highlightly vrací událost vlastního gólu U TÝMU, KTERÉMU BYL PŘIPSÁN —
 * stejně jako u běžného gólu. Strana se proto u žádného druhu neotáčí.
 *
 * Dokladem jsou dvě nezávislé produkční chyby, které obě odpovídají
 * právě zbytečnému otočení. Potvrzení na zachyceném payloadu viz
 * dokumentace.
 */
export function benefitingSide(eventSide: Side, _kind: GoalKind): Side {
  return eventSide;
}

/**
 * Výsledné skóre zápasu.
 *
 * Oficiální skóre vyhrává VŽDY, když existuje. Z událostí se skóre bere
 * pouze jako náhrada, když zdroj žádné nedodal.
 */
export function resolveMatchScore(input: {
  official: { home: number | null; away: number | null };
  fromEvents: { home: number; away: number } | null;
}): { home: number | null; away: number | null; source: 'official' | 'events' | 'none' } {
  const { official, fromEvents } = input;

  if (official.home != null && official.away != null) {
    return { home: official.home, away: official.away, source: 'official' };
  }
  if (fromEvents) {
    return { home: fromEvents.home, away: fromEvents.away, source: 'events' };
  }
  return { home: official.home, away: official.away, source: 'none' };
}

/**
 * Souhlasí průběh s oficiálním skóre?
 *
 * Nesoulad se jen zaloguje — oficiální skóre se kvůli němu nemění. Slouží
 * k odhalení nových variant u poskytovatele, ne k opravě výsledku.
 */
export function eventsAgreeWithOfficial(
  official: { home: number | null; away: number | null },
  fromEvents: { home: number; away: number } | null,
): boolean {
  if (!fromEvents || official.home == null || official.away == null) return true;
  return official.home === fromEvents.home && official.away === fromEvents.away;
}
