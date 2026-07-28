#!/usr/bin/env node
/**
 * Kontrola tajemství v repozitáři.
 *
 * Hledá KONKRÉTNÍ HODNOTY, ne názvy proměnných. `SEED_PLAYER_PASSWORD`
 * v dokumentaci je v pořádku; `password: 'Neco-Tajneho'` není.
 *
 * Spuštění:  npm run security:check
 * Exit 1 = nález, který nesmí do repozitáře.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const KOREN = path.resolve(import.meta.dirname, '..');
const PRESKOCIT = new Set(['node_modules', '.next', '.git', '.vercel', 'out', 'dist']);

/** Soubor s pravidly sám obsahuje vzory – nekontroluje se. */
const VYJIMKY = new Set(['scripts/check-secrets.mjs']);

const PRAVIDLA = [
  {
    nazev: 'Anthropic API klíč',
    vzor: /sk-ant-[A-Za-z0-9_-]{20,}/g,
  },
  {
    nazev: 'JWT / Supabase klíč (service-role nebo anon)',
    // Skutečný JWT má tři části a je dlouhý; krátké „eyJ" v kódu nevadí.
    vzor: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
  },
  {
    nazev: 'Heslo natvrdo přiřazené do proměnné',
    // password = 'hodnota' / heslo: "hodnota"
    // Povolené: odkaz na process.env, prázdný řetězec, zjevný placeholder.
    vzor: /\b(?:password|heslo|pass|pwd)\s*[:=]\s*['"`]([^'"`\n]{4,})['"`]/gi,
    jeVPoradku: (hodnota) =>
      /^(process\.env|<|\$\{|xxx|změň|zmen|placeholder|vyplň|vypln|tvoje|your|example|…|\.\.\.)/i
        .test(hodnota) || hodnota.trim() === '',
  },
  {
    nazev: 'VAPID privátní klíč natvrdo',
    vzor: /VAPID_PRIVATE_KEY\s*[:=]\s*['"`]?([A-Za-z0-9_-]{30,})['"`]?/g,
  },
  {
    nazev: 'Service-role klíč natvrdo',
    vzor: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"`]([^'"`\n]{20,})['"`]/g,
    jeVPoradku: (h) => /^(process\.env|<|\$\{)/i.test(h),
  },
];

/**
 * Environment soubory nesmějí být v repozitáři NIKDE (ani v podadresáři).
 * Jediná povolená výjimka je `.env.example` s ukázkovými hodnotami.
 */
const POVOLENY_ENV = '.env.example';
function jeZakazanyEnvSoubor(nazevSouboru) {
  return /^\.env(\..+)?$/.test(nazevSouboru) && nazevSouboru !== POVOLENY_ENV;
}

function projdi(dir = KOREN, out = []) {
  for (const polozka of readdirSync(dir)) {
    if (PRESKOCIT.has(polozka)) continue;
    const plna = path.join(dir, polozka);
    if (statSync(plna).isDirectory()) projdi(plna, out);
    else out.push(path.relative(KOREN, plna).split(path.sep).join('/'));
  }
  return out;
}

let nalezy = 0;

const vsechnySoubory = projdi();

// 1) Environment soubory kdekoli v repozitáři
for (const soubor of vsechnySoubory) {
  if (jeZakazanyEnvSoubor(path.basename(soubor))) {
    console.error(`❌ Environment soubor v repozitáři: ${soubor} – nesmí se verzovat.`);
    nalezy++;
  }
}

// 2) Obsah souborů (včetně .env.example, aby v něm nebyly skutečné hodnoty)
const soubory = vsechnySoubory.filter(
  (f) => !VYJIMKY.has(f) && /(\.(ts|tsx|mjs|js|json|md|sql|yml|yaml)$|(^|\/)\.env(\..+)?$)/.test(f),
);

for (const soubor of soubory) {
  let obsah;
  try {
    obsah = readFileSync(path.join(KOREN, soubor), 'utf8');
  } catch {
    continue; // binární nebo nečitelný soubor
  }

  for (const pravidlo of PRAVIDLA) {
    for (const shoda of obsah.matchAll(pravidlo.vzor)) {
      const hodnota = shoda[1] ?? shoda[0];
      if (pravidlo.jeVPoradku?.(hodnota)) continue;

      // `.env.example` smí obsahovat prázdné nebo ukázkové hodnoty
      if (soubor === '.env.example' && /^(|<.*>|xxx.*|zmen.*)$/i.test(hodnota)) continue;

      const radek = obsah.slice(0, shoda.index).split('\n').length;
      // Hodnotu ZÁMĚRNĚ nevypisujeme, jen její délku a místo nálezu.
      console.error(
        `❌ ${pravidlo.nazev}: ${soubor}:${radek} (hodnota délky ${hodnota.length}, nevypisuji ji)`,
      );
      nalezy++;
    }
  }
}

// 3) .gitignore musí vylučovat .env
const gitignore = existsSync(path.join(KOREN, '.gitignore'))
  ? readFileSync(path.join(KOREN, '.gitignore'), 'utf8')
  : '';
if (!/^\.env$/m.test(gitignore) || !/^\.env\.\*$/m.test(gitignore)) {
  console.error('❌ .gitignore musí obsahovat řádky `.env` i `.env.*` (a `!.env.example`).');
  nalezy++;
}

if (nalezy > 0) {
  console.error(`\n${nalezy} nález(ů). Repozitář NENÍ připravený ke zveřejnění.`);
  process.exit(1);
}

console.log(`✅ Žádná tajemství nenalezena (zkontrolováno ${soubory.length} souborů).`);
console.log('   Kontrolováno: Anthropic klíče, JWT/Supabase klíče, hesla natvrdo,');
console.log('   VAPID privátní klíč, service-role klíč, přítomnost .env.');
