#!/usr/bin/env node
/**
 * Založení nebo aktualizace hráče a jeho přihlašovacího účtu.
 *
 * BEZPEČNOST:
 *   • Heslo se NIKDY nezapisuje do repozitáře ani nevypisuje do konzole.
 *   • Všechny citlivé hodnoty se čtou výhradně z proměnných prostředí.
 *   • Při chybějící proměnné skript skončí a vypíše POUZE její název.
 *
 * Použití (PowerShell):
 *   $env:SEED_PLAYER_NAME="Mele"
 *   $env:SEED_PLAYER_EMAIL="mele@example.com"
 *   $env:SEED_PLAYER_PASSWORD="…"
 *   npm run seed:player
 *
 * Použití (bash):
 *   SEED_PLAYER_NAME="Mele" SEED_PLAYER_EMAIL="mele@example.com" \
 *   SEED_PLAYER_PASSWORD="…" npm run seed:player
 *
 * Jméno a e-mail lze předat i argumenty:
 *   npm run seed:player -- --name "Mele" --email "mele@example.com"
 */
import { createClient } from '@supabase/supabase-js';

/** Načte proměnnou, nebo srozumitelně skončí. Nikdy nevypisuje hodnotu. */
function vyzadovano(nazev, nahradniZArgumentu) {
  const hodnota = nahradniZArgumentu ?? process.env[nazev];
  if (!hodnota || !String(hodnota).trim()) {
    console.error(`Chybí proměnná prostředí: ${nazev}`);
    console.error('Nastav ji před spuštěním. Hodnotu nikam nezapisuj ani neposílej.');
    process.exit(1);
  }
  return String(hodnota).trim();
}

/** Jednoduché načtení `--klic hodnota` z argumentů. */
function argument(klic) {
  const i = process.argv.indexOf(`--${klic}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (!url) {
  console.error('Chybí proměnná prostředí: NEXT_PUBLIC_SUPABASE_URL (nebo SUPABASE_URL)');
  process.exit(1);
}
const serviceKey = vyzadovano('SUPABASE_SERVICE_ROLE_KEY');

const name = vyzadovano('SEED_PLAYER_NAME', argument('name'));
const email = vyzadovano('SEED_PLAYER_EMAIL', argument('email'));
const password = vyzadovano('SEED_PLAYER_PASSWORD'); // ZÁMĚRNĚ jen z prostředí

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

// 1) Hráč v tabulce `players`
let { data: player, error: chybaHledani } = await sb
  .from('players')
  .select('id,name,email,auth_user_id')
  .eq('name', name)
  .maybeSingle();
if (chybaHledani) throw chybaHledani;

if (!player) {
  const vysledek = await sb
    .from('players')
    .insert({ name, is_active: true, email })
    .select('id,name,email,auth_user_id')
    .single();
  if (vysledek.error) throw vysledek.error;
  player = vysledek.data;
  console.log(`Hráč „${name}" založen.`);
} else {
  console.log(`Hráč „${name}" už existuje, aktualizuji.`);
}

// 2) Přihlašovací účet
let userId = player.auth_user_id;

if (!userId) {
  const vytvoreny = await sb.auth.admin.createUser({ email, password, email_confirm: true });

  if (vytvoreny.error) {
    // Účet už možná existuje pod stejným e-mailem – zkusíme ho dohledat.
    const seznam = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (seznam.error) throw vytvoreny.error;
    const existujici = seznam.data.users.find((u) => u.email === email);
    if (!existujici) throw vytvoreny.error;
    userId = existujici.id;
    console.log('Účet s tímto e-mailem už existoval, propojuji.');
  } else {
    userId = vytvoreny.data.user.id;
    console.log('Přihlašovací účet vytvořen.');
  }

  const propojeni = await sb
    .from('players')
    .update({ auth_user_id: userId, email, is_active: true })
    .eq('id', player.id);
  if (propojeni.error) throw propojeni.error;
} else {
  const aktualizace = await sb.auth.admin.updateUserById(userId, {
    email,
    password,
    email_confirm: true,
  });
  if (aktualizace.error) throw aktualizace.error;
  await sb.from('players').update({ email, is_active: true }).eq('id', player.id);
  console.log('Heslo a e-mail účtu aktualizovány.');
}

// Heslo se ZÁMĚRNĚ nevypisuje – zná ho jen ten, kdo skript spustil.
console.log(`Hotovo. Hráč „${name}" je propojený s přihlašovacím účtem.`);
