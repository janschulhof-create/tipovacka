#!/usr/bin/env node
/**
 * Kontrola integrity zdrojů kolem sestavení.
 *
 * Důvod: dřívější `prebuild` mazal soubory `.ts`/`.tsx` v kořeni projektu
 * a přepisoval `next.config.ts` z base64 řetězce. Build tak mohl tiše
 * zahodit rozpracovanou práci a konfigurace existovala na dvou místech.
 *
 * Použití:
 *   node scripts/verify-source-integrity.mjs snapshot   # před buildem
 *   node scripts/verify-source-integrity.mjs verify     # po buildu
 *
 * Návratový kód 1 = build změnil nebo smazal zdrojový soubor.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SNAPSHOT = path.join(ROOT, '.source-integrity.json');

/** Adresáře, které se nikdy nekontrolují (generované nebo cizí). */
const IGNOROVANE = new Set(['node_modules', '.next', '.git', '.vercel', 'out', 'dist']);

/** Přípony zdrojů, které build nesmí měnit. */
const PRIPONY = new Set(['.ts', '.tsx', '.mjs', '.js', '.json', '.css', '.sql']);

function sesbirej(dir = ROOT, out = new Map()) {
  for (const polozka of readdirSync(dir)) {
    if (IGNOROVANE.has(polozka)) continue;
    const plna = path.join(dir, polozka);
    if (statSync(plna).isDirectory()) {
      sesbirej(plna, out);
    } else if (PRIPONY.has(path.extname(polozka))) {
      const rel = path.relative(ROOT, plna);
      if (rel === path.basename(SNAPSHOT)) continue;
      out.set(rel, createHash('sha256').update(readFileSync(plna)).digest('hex'));
    }
  }
  return out;
}

const rezim = process.argv[2];

if (rezim === 'snapshot') {
  const soucty = Object.fromEntries([...sesbirej()].sort());
  writeFileSync(SNAPSHOT, JSON.stringify(soucty, null, 2));
  console.log(`Zaznamenáno ${Object.keys(soucty).length} zdrojových souborů.`);
} else if (rezim === 'verify') {
  if (!existsSync(SNAPSHOT)) {
    console.error('Chybí snímek. Spusť nejdřív: node scripts/verify-source-integrity.mjs snapshot');
    process.exit(1);
  }
  const puvodni = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  const aktualni = Object.fromEntries(sesbirej());

  const smazane = Object.keys(puvodni).filter((f) => !(f in aktualni));
  const zmenene = Object.keys(puvodni).filter((f) => f in aktualni && puvodni[f] !== aktualni[f]);
  const nove = Object.keys(aktualni).filter((f) => !(f in puvodni));

  // Snímek uklidíme vždy – nesmí zůstat viset v pracovním stromu ani v balíčku.
  rmSync(SNAPSHOT, { force: true });

  if (smazane.length || zmenene.length || nove.length) {
    console.error('❌ Sestavení sáhlo na zdrojové soubory:');
    for (const f of smazane) console.error(`   SMAZÁNO:  ${f}`);
    for (const f of zmenene) console.error(`   ZMĚNĚNO:  ${f}`);
    for (const f of nove)    console.error(`   VYTVOŘENO: ${f}`);
    process.exit(1);
  }
  console.log(`✅ Sestavení nezměnilo, nesmazalo ani nevytvořilo žádný zdroj (${Object.keys(puvodni).length} souborů).`);
} else {
  console.error('Použití: verify-source-integrity.mjs <snapshot|verify>');
  process.exit(1);
}
