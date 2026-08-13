# Nasazení v0.1.73 — Windows CMD

## ⚠️ Pořadí kroků je závazné

Krok 1 nelze přeskočit. Bez něj by tipování odloženého zápasu selhalo
až u uživatele.

---

## KROK 1 — Ověř databázový trigger (POVINNÉ)

Supabase → SQL Editor:

```sql
select pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'enforce_prediction_lock';
```

**Podle výsledku:**

| Co vidíš | Co udělat |
|---|---|
| `m.status <> 'scheduled'` | spusť `db/02-prediction-lock-postponed.sql` |
| `m.status not in ('scheduled', 'postponed')` | už je hotovo, nic nedělej |
| něco jiného | **zastav se** a pošli mi znění |

Migrace mění jednu funkci a je vratná (rollback v komentáři souboru).

---

## KROK 2 — Ověř zápas Zbrojovka–Hradec

```sql
select id, external_api_id, round, status, kickoff
from matches
where home_team ilike '%Zbrojovka%' and away_team ilike '%Hradec%';
```

Zapiš si `external_api_id` a `round`. Po 2. 9. je porovnáš.

---

## KROK 3 — Nahraj kód

```cmd
cd C:\kod\tipovacka
git checkout main
git pull
git checkout -b v0.1.73-odlozene
```

Rozbal ZIP do `C:\tipovacka`, pak:

```cmd
for /d %d in (*) do if /i not "%d"==".git" if /i not "%d"=="node_modules" rd /s /q "%d"
del /q *.* 2>nul
xcopy C:\tipovacka\tipovacka-main\* . /E /H /Y
```

---

## KROK 4 — Ověř lokálně PŘED odesláním

```cmd
npm ci
npm run security:check
npm run ci
```

Když cokoli selže, **neodesílej** a napiš mi.

---

## KROK 5 — Odešli na větev

```cmd
git add -A
git status
git commit -m "v0.1.73 odlozene zapasy: identita, ochrana tipu, pohled ve vyberu kol"
git push -u origin v0.1.73-odlozene
```

⚠️ V `git status` nesmí být `node_modules`, `.next` ani `.env`.

---

## KROK 6 — Ověř na Preview

Vercel vytvoří Preview deployment. Zkontroluj:

1. **Výběr kol** obsahuje „Odložené zápasy“ (pokud nějaký existuje).
2. **Odložený zápas jde tipovat** — vyplň tip a ulož. Pokud se objeví chyba
   o uzavřených tipech, **trigger z kroku 1 není opravený**.
3. **Graf** v tabulce funguje (Body / Pořadí, výběr kola).
4. **`/historie`** se chová beze změny.

---

## KROK 7 — Teprve pak do produkce

```cmd
git checkout main
git merge v0.1.73-odlozene
git push
```

---

## KROK 8 — Po 2. 9. ověř výsledek

```sql
select m.round, m.status, m.home_score, m.away_score,
       count(p.id) as tipu, sum(p.points) as body
from matches m left join predictions p on p.match_id = m.id
where m.home_team ilike '%Zbrojovka%' and m.away_team ilike '%Hradec%'
group by m.round, m.status, m.home_score, m.away_score;
```

Očekávané: `round` se **nezměnilo**, `status = finished`, tipy mají body.

---

## Rollback

```cmd
git revert -m 1 HEAD
git push
```

Databázová migrace se vrací zvlášť — rollback je v komentáři
`db/02-prediction-lock-postponed.sql`.
