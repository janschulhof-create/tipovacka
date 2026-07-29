# Tipovačka v0.1.61 — Kudy běží zajíc

## Co se změnilo

Původní blok `Dohráno` se uživatelsky mění na **Kudy běží zajíc** a z krátkého souhrnu se stává hlavní analytické studio kola.

### Datové vrstvy

Hodnocení nově kombinuje pouze deterministicky připravená fakta:

- body, desítky, nuly a pořadí aktuálního kola,
- sezonní skutečné body vs očekávané xB do tohoto okamžiku,
- průměr bodů na tip v aktuálním kole vs osobní průměr z archivu 2025/26,
- případné překonání loňského nejlepšího kola,
- konsenzus tipérů k výsledkové tendenci a šok proti tomuto konsenzu,
- dramatické události: gól v nastavení měnící skóre, změna lídra posledním zápasem, přestřelka a červené karty.

### Deterministické kandidáty

Aplikace před voláním Claude sama rozhodne, zda existuje podklad pro:

- `dominantLeader` → „To se nebavíme.“,
- `consensusShock`,
- `divizeCandidate` → „To je divize.“,
- `cinemaCandidate` → „To bylo cinema.“,
- `snowman` → „Sněhulák.“,
- `blamageCandidate` → „Blamáž.“ / „Katastrofální faul na fotbal.“.

Claude nesmí tyto situace vymýšlet. Pouze zpracuje předaná fakta do výsledného textu.

### AI text

Finální hodnocení je delší: 8–12 krátkých vět ve čtyřech odstavcích. Průběžné studio má 5–8 vět. Model je stále určen konfigurací `ANTHROPIC_ROAST_MODEL`.

Tón je původní hlas Tipovačky: úsečný, expresivní český fotbalový panel. Zadání výslovně nepožaduje imitaci konkrétního novináře nebo osobnosti.

### Notifikace

Nové hlášky jsou přidány i do katalogu AI notifikací, ale jen s přísnými datovými podmínkami. Aby je produkční push notifikace skutečně používaly, je nutné nasadit aktualizovanou Supabase Edge Function `send-round-reminders` a nastavit `ANTHROPIC_API_KEY` + `ANTHROPIC_ROAST_MODEL` v Supabase Edge Function secrets.

Viz `SUPABASE_CLAUDE_NOTIFIKACE_NAVOD.txt`.
