# Aktualizace desktopu Chance ligy — 1:1 návrh

Tato verze aplikuje schválený desktopový návrh Chance ligy na reálnou aplikaci.

## Co se změnilo

- Třísloupcový dashboard: rozpis zápasů, detail s xB a pravý analytický panel.
- Responzivní desktopové šířky od 1200 px; sloupce se plynule přizpůsobují běžným notebookům i velkým monitorům.
- Levý panel má výběr kola a filtry Všechny / Otevřené / Uzavřené.
- Detail zápasu se otevírá v prostředním panelu a výchozí záložkou je xB predikce.
- xB detail obsahuje kruhový ukazatel, trend, faktory, AI komentář, formu a integrované H2H.
- Vývoj bodů byl z dashboardu Chance ligy odstraněn.
- V pravém panelu zůstává průběžné pořadí a rozšířená projekce xB na konci sezony.
- xB se zobrazí také u kola Příprava, ale přípravné zápasy se nadále nezapočítávají do historie ani do sezonní projekce.
- Mobilní rozhraní a ostatní soutěže zůstávají zachované.

## Nasazení

1. Nahraďte projekt obsahem balíčku nebo použijte patch se stejnou adresářovou strukturou.
2. Spusťte `npm ci`.
3. Spusťte `npm run build`.
4. Nasaďte standardním způsobem na Vercel.

Není potřeba SQL migrace, nová proměnná prostředí ani změna API klíčů.
