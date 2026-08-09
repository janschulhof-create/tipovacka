# Nasazení v0.1.63 — Windows CMD

Příkazy jsou k přímému zkopírování. **Nasazení neprováděj, dokud si to
neprojdeme společně.**

## 1. Rozbal ZIP

Rozbal `tipovacka-v0.1.63.zip` do `C:\tipovacka`.
Vznikne `C:\tipovacka\tipovacka-main`.

## 2. Přejdi do klonu repozitáře a vytvoř větev

```cmd
cd C:\kod\tipovacka
git checkout main
git pull
git checkout -b v0.1.63-artis-live
```

## 3. Nahraď obsah

```cmd
for /d %d in (*) do if /i not "%d"==".git" if /i not "%d"=="node_modules" rd /s /q "%d"
del /q *.* 2>nul
xcopy C:\tipovacka\tipovacka-main\* . /E /H /Y
```

## 4. Ověř lokálně PŘED odesláním

```cmd
npm ci
npm run security:check
npm run ci
```

Když kterýkoli příkaz skončí chybou, **nic neodesílej** a napiš mi.

## 5. Zkontroluj, co půjde ven

```cmd
git add -A
git status
```

Ověř, že tam **není** `node_modules`, `.next` ani `.env`.

## 6. Odešli

```cmd
git commit -m "v0.1.63 konsolidovany release: optimalizace tokenu, nove hlasky KBZ, Artis live hotfix"
git push -u origin v0.1.63-artis-live
```

## 7. Preview a ověření Artisu

Vercel vytvoří Preview deployment. Po nasazení ověř párování:

```cmd
curl -X POST "https://PREVIEW-URL/api/team-match-debug" ^
  -H "Authorization: Bearer TVUJ_AI_HEALTH_SECRET" ^
  -H "Content-Type: application/json" ^
  -d "{\"appHome\":\"1.FC Slovácko\",\"appAway\":\"FC Artis Brno\",\"providerHome\":\"Slovacko\",\"providerAway\":\"SK Lisen\"}"
```

Očekávaný výsledek: `"matched": true`, `"matchingReason": "both_teams_matched"`.

⚠️ `AI_HEALTH_SECRET` musí být nastavený i pro prostředí **Preview**.

## 8. Teprve po ověření sloučit

**Až po společné kontrole:**

```cmd
git checkout main
git merge v0.1.63-artis-live
git push
```

## Rollback

```cmd
git revert -m 1 HEAD
git push
```
