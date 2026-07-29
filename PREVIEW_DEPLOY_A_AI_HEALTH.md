# Preview deploy a ověření `/api/ai-health`

Mock v testech dokazuje, že implementace funguje. **Neříká ale, proč dnes
selhává produkční Claude.** To ukáže až skutečné zavolání endpointu.

## 1. Nasazení na Preview

```powershell
cd C:\tipovacka\tipovacka-main
git checkout -b v62-ai-diagnostika
git add .
npm run security:check      # musí projít, jinak nic neodesílej
git commit -m "v0.1.62 Claude diagnostika a historicke xB"
git push -u origin v62-ai-diagnostika
```

Vercel z větve vytvoří **Preview deployment**. Jeho URL najdeš
v Vercel → Deployments (tvar `https://tipovacka-<hash>-<ucet>.vercel.app`).

## 2. Nastavení proměnných pro Preview

Vercel → Settings → Environment Variables. **Zaškrtni prostředí `Preview`**,
jinak se na preview nepoužijí:

| Proměnná | Hodnota |
|---|---|
| `ANTHROPIC_API_KEY` | tajný klíč |
| `ANTHROPIC_ROAST_MODEL` | `claude-sonnet-4-6` |
| `ANTHROPIC_TIMEOUT_MS` | `30000` (nepovinné) |
| `AI_HEALTH_SECRET` | dlouhý náhodný řetězec |

Vygenerování tajemství:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

⚠️ Po změně proměnných je nutný **nový deploy** (Redeploy).

## 3. Zavolání endpointu

```powershell
$secret = Read-Host "AI_HEALTH_SECRET" -AsSecureString
$plain  = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret))

Invoke-RestMethod -Method POST `
  -Uri "https://<PREVIEW-URL>/api/ai-health" `
  -Headers @{ Authorization = "Bearer $plain" } |
  ConvertTo-Json -Depth 5

Remove-Variable plain, secret
```

Tajemství se nikam neukládá ani nezapisuje do historie příkazů.

## 4. Co uvidíme

| Odpověď | Znamená |
|---|---|
| `reachable: true` | Claude funguje. Fallback pak způsobil **náš validátor** — hledej v logu `round_recap_ai_validation_rejected`. |
| `reason: missing_key` | Klíč není v Preview prostředí (nebo chybí redeploy) |
| `reason: authentication` | Klíč je neplatný nebo zneplatněný |
| `reason: permission` | Klíč nemá právo na tento model |
| `reason: model_unavailable` | Překlep v `ANTHROPIC_ROAST_MODEL` |
| `reason: billing_or_quota` | Došel kredit |
| `reason: rate_limit` | Příliš mnoho požadavků |
| `reason: local_timeout` | Odpověď nedorazila včas → zvyš `ANTHROPIC_TIMEOUT_MS` |
| HTTP 404 bez těla | Špatný nebo chybějící `AI_HEALTH_SECRET` |

## 5. Postup, jak to projdeme spolu

1. Nasadíš Preview a nastavíš proměnné (kroky 1–2).
2. Zavoláš endpoint (krok 3).
3. **Pošleš mi celou odpověď** — neobsahuje klíč ani prompt, je bezpečná.
4. Podle `reason` řekneme, co konkrétně opravit.
5. Ověříme „Kudy běží zajíc" na Preview.
6. Teprve pak sloučíme do `main`.

**Do produkce nepřecházíme na základě mocku.**

## 6. Kontrola v logu

Vercel → Deployment → Logs, filtr:

- `round_recap_ai_failed` — selhalo volání API
- `round_recap_ai_validation_rejected` — API odpovědělo, text zamítl validátor

## 7. Rollback

```powershell
git checkout main
```

Preview se produkce nedotýká. Po sloučení lze vrátit revertem commitu.
