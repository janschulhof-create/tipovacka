#!/usr/bin/env node
/**
 * Build-level důkaz, že Sentry v prohlížeči dostane prostředí i DSN.
 *
 * Postaví aplikaci s neškodnými hodnotami a zkontroluje kód pro prohlížeč.
 *
 * ⚠️ NESTAČÍ hledat, jestli je DSN v bundlu. V v0.1.82 tam BYL – Next.js
 * ho vložil i přes alias. Chybělo PROSTŘEDÍ: `process.env` se předal funkci
 * dynamicky, v prohlížeči je to prázdný objekt → `development` → SDK vypnuté.
 * Kontroluje se proto:
 *   1. objekt proměnných má všechny hodnoty jako LITERÁLY,
 *   2. `process.env` se v inicializaci nepředává jako celek.
 *
 * Trvá několik minut (plný build), proto není v `npm test`.
 * Spuštění: npm run verify:client-env
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';

const KOREN = path.resolve(import.meta.dirname, '..');
const HODNOTY = {
  NEXT_PUBLIC_SENTRY_DSN: 'https://verifyclientenv@o0.ingest.sentry.io/1',
  NEXT_PUBLIC_VERCEL_ENV: 'production',
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: 'c0ffee0123456789',
};

rmSync(path.join(KOREN, '.next'), { recursive: true, force: true });
execSync('npx next build', {
  cwd: KOREN,
  stdio: 'ignore',
  env: {
    ...process.env, ...HODNOTY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://e.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'd',
  },
});

const soubory = [];
const projdi = (d) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) projdi(p);
    else if (p.endsWith('.js')) soubory.push(p);
  }
};
projdi(path.join(KOREN, '.next/static/chunks'));

const init = soubory.map((f) => readFileSync(f, 'utf8'))
  .filter((t) => t.includes('enabled:!!') && t.includes(HODNOTY.NEXT_PUBLIC_SENTRY_DSN));

let chyby = 0;
if (init.length === 0) { console.error('❌ Inicializace Sentry v prohlížeči nenalezena.'); chyby++; }
for (const t of init) {
  for (const [k, v] of Object.entries(HODNOTY)) {
    if (!t.includes(`${k}:"${v}"`)) { console.error(`❌ ${k} není v prohlížeči jako literál.`); chyby++; }
  }
  if (/=process\.env,/.test(t)) {
    console.error('❌ process.env se předává dynamicky – v prohlížeči je prázdný.'); chyby++;
  }
}
rmSync(path.join(KOREN, '.next'), { recursive: true, force: true });
if (chyby) process.exit(1);
console.log(`✅ Sentry v prohlížeči dostane DSN, prostředí i release (${init.length} chunk/ů).`);
