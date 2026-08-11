# Graf bodů v tabulce pořadí

## Návrhové rozhodnutí: znovupoužít, nikoli duplikovat

Původně jsem vytvořil samostatnou komponentu `RoundPointsChart` s vlastním
SVG. **Bylo to špatně** — vznikla by druhá, chudší implementace grafu vedle
existující.

Referencí je produkční `/historie`, která už používá `StandingsChart`.
Ten umí:

- tři pohledy (**po dnech**, **po kolech**, **sloupce**),
- skrývání tipérů klepnutím na legendu,
- hover s vodicí čárou a hodnotami všech tipérů,
- barevnou škálu podle pořadí (`qualityColor`),
- pevné časové pásmo Europe/Prague (žádný hydration mismatch).

Vlastní komponenta byla proto **smazána** a tabulka používá tentýž
`StandingsChart`. Jedna implementace, jedno chování, jedna údržba.

## Jak je to napojené

`getSeasonRoundPoints()` vrací **stejnou strukturu** jako `getSeasonChartData`:

```ts
{ matches: { round: number; pts: Record<string, number> }[], players: string[] }
```

Dva rozdíly proti /historie:

| | /historie | tabulka |
|---|---|---|
| Granularita | po zápasech (~280 bodů) | **po kolech** (~30 bodů) |
| `kickoff` | vyplněn | **záměrně chybí** |

Chybějící `kickoff` je signál pro graf, aby použil pohled **„po kolech“**
místo „po dnech“ — přesně to, co má tabulka ukazovat.

Kumulaci si graf dělá sám (`running[p] += g.pts[p]`), takže dotaz vrací body
**za kolo**, ne kumulativně.

## Proč agregace po kolech

Plný graf byl pro Chance ligu vypnutý kvůli objemu dat (280 zápasů × 8 tipérů
= ~2240 řádků). Agregací po kolech zbude ~30 bodů na tipéra, takže jde
zapnout i pro ligu bez dopadu na rychlost.

## Chování záložky

Třetí záložka v tabulce je dynamická:

```
Body  |  Graf   |  xBody      ← nehraje se
Body  |  Live ● |  xBody      ← běží zápas
```

Rozehraný zápas má **vždy** přednost. Po dohrání se vrátí graf.
Záložka je zakázaná, dokud nejsou odehraná aspoň dvě kola.

## Testy

`test/jednotkove/graf-bodu.test.ts` — GRAF-1…GRAF-8:
přepínání záložky, kumulace, chybějící kolo, shoda datového tvaru
se vstupem `StandingsChart`.
