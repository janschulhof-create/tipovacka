# Messenger — studie proveditelnosti

**Otázka:** může se nově vygenerované „Kudy běží zajíc“ samo objevit v Messengeru?

## Doporučení: **NO-GO** pro tento účel

---

## Tři různé věci, které se pletou

| | Scénář | Podpora API |
|---|---|---|
| **A** | Konverzace stránky s uživatelem | ✅ ano, Send API |
| **B** | Běžný osobní chat | ❌ **žádné veřejné API** |
| **C** | Soukromá skupina na Messengeru | ❌ **žádné veřejné API** |

Tvůj případ je **C** — parta osmi lidí ve skupině. Pro ten Meta rozhraní
neposkytuje. Neexistuje k tomu ani placená varianta.

## Proč nepomůže ani varianta A

I kdybychom založili facebookovou stránku a každý z party jí napsal, naráží
to na **24hodinové okno**: stránka smí odeslat zprávu jen uživateli, který
jí sám napsal během posledních 24 hodin. Okno se resetuje pokaždé, když
uživatel odepíše.

Hodnocení vzniká po dohrání programu — tedy typicky ve chvíli, kdy okno
dávno vypršelo. Museli by tedy **před každou zprávou napsat stránce**, aby
se okno otevřelo. To je horší než si otevřít web.

Značky zpráv ani jednorázová oznámení tuhle mezeru nezaplní: značky se
nesmí používat k propagačnímu ani zábavnímu obsahu a od 27. dubna 2026
navíc tři z nich vracejí chybu 100. Marketingové zprávy jsou v roce 2026
dostupné jen v několika zemích.

## Co by to stálo, kdyby to šlo

Založit aplikaci u Mety, facebookovou stránku, projít schválením aplikace,
spravovat tokeny stránky, provozovat webhook, evidovat PSID každého člena
a hlídat okna. Pro osm kamarádů je to nepoměr.

## Co navrhuju místo toho

| Cesta | Poznámka |
|---|---|
| **Push notifikace** | Aplikace už je má (`push_subscriptions`) — stačí navázat na úspěšné hodnocení |
| **Telegram** | Boti smí psát do skupin bez časového okna; nastavení je řádově jednodušší |
| **Odkaz ke sdílení** | Nejlevnější: po vygenerování hodit do skupiny odkaz ručně |

Push notifikace jsou nejblíž tomu, co chceš, a nevyžadují nic u Mety.

## Kdyby se to přesto stavělo

Architektura by byla:

```
úspěšné hodnocení → fronta → adaptér → idempotentní odeslání → log
```

Klíčem idempotence by byl `facts_fingerprint`, aby opakovaný běh cronu
neposlal totéž dvakrát. Přihlašovací údaje Mety patří do proměnných
prostředí, nikdy do kódu.

**V v0.1.81 se do Messengeru neposílá nic.**

> Podklady: dokumentace Send API a zásad Messenger Platform (Meta for
> Developers), doplněné o shrnutí změn pro rok 2026. Stav k srpnu 2026 —
> Meta pravidla mění často, před případnou realizací je potřeba ověřit znovu.
