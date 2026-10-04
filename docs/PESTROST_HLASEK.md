# Pestrost hlášek v rámci kola (v0.1.82)

## Pravidlo

Každá **rodina** hlášky smí v jednom kole padnout **nejvýš jednou** v každém
ze dvou nezávislých fondů:

| Fond | Rozsah |
|---|---|
| **Baroko** | všechny zápasy kola dohromady |
| **Kudy běží zajíc** | všechny verze kola (sobota → neděle → odložený zápas) |

Tatáž hláška tedy smí padnout jednou v Baroku a jednou v Kudy. Hlášky se
nemusí vyčerpat — když nic nesedí, píše se běžná věta.

## Rodiny

| Klíč | Co |
|---|---|
| `rule:<id>` | hláška vázaná na pravidlo — všechny tvary i znění z databáze |
| `builtin:<hash>` | schválená vestavěná hláška |
| `builtin:osloveni` | „Pane …, vždyť já mám stejnej zájem jako vy.“ pro jakékoli jméno |
| `db:<id>` | volná hláška z `recap_phrases` |

**Katalog:** 56 schválených vestavěných hlášek → 54 rodin. Tři tvary
„To se po něm/ní/nich prošlo.“ jsou jedna rodina. Všech 17 pravidel Kudy je
součástí katalogu.

## Kdo rozhoduje

**Kód, ne prompt.** Model dostane seznam už použitých hlášek, ale rozhodující
je kontrola výstupu: text s rodinou, která v kole padla, nebo s jednou
rodinou dvakrát, se **neuloží**.

```
zablokované = trvalé použití v tabulce ∪ rodiny v už uložených textech kola
→ generování
→ kontrola výstupu
→ ATOMICKÁ rezervace použitých rodin (všechno, nebo nic)
→ uložení textu → potvrzení  |  neúspěch → uvolnění
```

Nejvýš **2 volání modelu** na text. Pak se text neuloží a Baroko/Kudy
zkusí další běh.

## Souběh a pády

`reserve_phrase_usage` vloží všechny rodiny v jedné transakci. Když je
kterákoli obsazená, zruší se vše. Dva souběžné běhy se stejnou hláškou →
uspěje jeden, druhý zkusí znovu s čerstvým stavem.

Rezervace bez uložení textu vyprší po **5 minutách** — pád procesu hlášku
neotráví.

## Výběr volných hlášek

Z databáze se nabídne nejvýš 6 volných hlášek na požadavek. Seznam se seřadí
podle váhy a **začátek se posune podle klíče kola a zápasu**. Různé zápasy
dostanou různé výřezy → celý katalog má reálnou šanci. Výběr je
deterministický. Váha rozhoduje jen mezi NEpoužitými hláškami.

## Existující texty

Texty vzniklé před nasazením se do tabulky nezapisují zpětně. Místo toho se
při každém generování dohledají rodiny v už uložených textech kola —
**přesnou shodou** citovaných řetězců z katalogu. To je bezpečné: katalogové
hlášky jsou přesné texty v uvozovkách. Volný text se neodhaduje.

**Omezení:** když se znění hlášky v databázi později upraví, starý text se
starým zněním se už nerozpozná a hláška může v tom kole padnout ještě jednou.

## Bez migrace 07

Aplikace funguje. Blokuje se jen podle uložených textů a rezervace vždy
projde — **chybí ochrana souběhu**. Proto migraci 07 nasaď spolu s kódem.

## Příklad

| | Použito | Smí použít |
|---|---|---|
| sobota Kudy | A | — |
| neděle Kudy | B | cokoli kromě A |
| odložený zápas | C | cokoli kromě A, B |
| Baroko 1. zápasu | A | — (fond Baroka je nezávislý) |
| Baroko 2. zápasu | — | cokoli kromě A |
