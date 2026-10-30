# v0.1.83 — nasazení

Bez migrací databáze.

## Co je v této verzi

| | |
|---|---|
| **Notifikace u odložených zápasů** | připomínky 24 h a 3 h před NOVÝM výkopem, jen tipérům bez tipu |
| **Automatické znovunačtení po „Load failed“** | Sentry `OB-TIPOVACKA-2` – zastaralý chunk po nasazení, jednou za minutu |
| **Síň slávy = Historie + Síň slávy** | rekordy všech sezón nahoře, archiv sezóny pod nimi; `/historie` přesměruje |

## Postup

1. Vercel: běžné nasazení (merge do `main`).
2. **Edge funkce zvlášť** — Vercel ji neaktualizuje:

   ```cmd
   npx.cmd supabase@latest functions deploy send-round-reminders
   ```

   Pak v Supabase → Edge Functions → `send-round-reminders` ověř novou verzi.
   Bez tohoto kroku oprava notifikací **nefunguje**.

## Kontrola

- `/historie` přesměruje na `/sin-slavy`; v navigaci je jen Síň slávy.
- U příštího odloženého zápasu: v tabulce `push_notification_log` se objeví
  záznam s `block_key` začínajícím `resched:`.

## Poznámka k připomínkám

Aplikace posílá připomínky **24 h a 3 h** před výkopem (ne 1 h). U odložených
zápasů platí stejné časy, jen dostane upozornění pouze ten, komu tip chybí.
Text je pevný („Odložený zápas X. kola se hraje zítra…“) — obecná šablona
i AI mluví o začátku kola, což by u odloženého zápasu nebyla pravda.
