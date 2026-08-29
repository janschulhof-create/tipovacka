#!/usr/bin/env node
/**
 * Kontrola rozvržení projektu.
 *
 * Produkční repozitář obsahoval 62 zdrojových souborů v kořeni, které tam
 * nepatřily — duplikáty souborů ze `src/` s přeházenými názvy a artefakty
 * stahování z prohlížeče („page (6).tsx“). Nebyly nikde importované, ale
 * mátly a u `middleware.ts` hrozila záměna s tím skutečným.
 *
 * Tento skript pouze HLÁSÍ. Nikdy nic nemaže a nemění.
 *
 * Spuštění: node scripts/check-source-layout.mjs
 * Návratový kód 1 = v kořeni je zdrojový soubor, který tam nepatří.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const KOREN = path.resolve(import.meta.dirname, '..');

/** Přípony, které v kořeni bez výslovného povolení nemají co dělat. */
const SLEDOVANE = ['.ts', '.tsx', '.css', '.js', '.mjs', '.cjs', '.jsx'];

/**
 * Legitimní konfigurační soubory v kořeni.
 * Nový nástroj sem přidej vědomě — proto výčet, ne odhad podle názvu.
 */
const POVOLENO = new Set([
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
  'next-env.d.ts',
  'postcss.config.mjs',
  'postcss.config.js',
  'tailwind.config.ts',
  'tailwind.config.js',
  'eslint.config.mjs',
  'middleware.ts', // viz poznámka níže
]);

/**
 * `middleware.ts` je v Next.js legitimní v kořeni NEBO v `src/`.
 * Tenhle projekt používá `src/middleware.ts`. Mít obojí je nejednoznačné,
 * proto se hlásí jako chyba.
 */
const MIDDLEWARE_V_SRC = 'src/middleware.ts';

const nalezy = [];

for (const jmeno of readdirSync(KOREN)) {
  const plna = path.join(KOREN, jmeno);
  if (statSync(plna).isDirectory()) continue;
  if (!SLEDOVANE.includes(path.extname(jmeno))) continue;

  if (jmeno === 'middleware.ts') {
    try {
      statSync(path.join(KOREN, MIDDLEWARE_V_SRC));
      nalezy.push({
        soubor: jmeno,
        duvod: `middleware existuje v kořeni i v ${MIDDLEWARE_V_SRC} – který z nich Next.js použije, není zřejmé`,
      });
    } catch {
      // Jen v kořeni: legitimní uspořádání.
    }
    continue;
  }

  if (POVOLENO.has(jmeno)) continue;

  nalezy.push({
    soubor: jmeno,
    duvod: 'zdrojový soubor v kořeni; aplikační kód patří do src/',
  });
}

if (nalezy.length > 0) {
  console.error('❌ Neočekávané zdrojové soubory v kořeni projektu:\n');
  for (const n of nalezy) console.error(`   ${n.soubor}\n     → ${n.duvod}`);
  console.error(`\n${nalezy.length} soubor(ů). Přesuň je do src/, nebo (u nového`);
  console.error('nástroje) doplň název do seznamu POVOLENO v tomto skriptu.');
  console.error('Skript sám nic nemaže – rozhodnutí je na člověku.');
  process.exit(1);
}

console.log('✅ Rozvržení projektu je v pořádku – v kořeni jen povolená konfigurace.');
