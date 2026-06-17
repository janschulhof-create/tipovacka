// Jednorázový seed: založí auth účty (skrytý email + vygenerované 3-slovní heslo)
// a propojí je s hráči. Spusť LOKÁLNĚ se service-role klíčem:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-auth.mjs
// Idempotentní: hráče, kteří už účet mají, přeskočí.
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Chybí NEXT_PUBLIC_SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY v prostředí.');
  process.exit(1);
}
const EMAIL_DOMAIN = 'obtipovacka.local';
const WORDS = ['kobra','vino','most','hrad','lano','javor','kotva','kafe','ryba','sova','dub','lev','vlk','jelen','orel','bobr','kapr','sumec','losos','krab','osel','koza','ovce','husa','holub','sloup','prkno','cihla','hora','kopec','potok','jezero','ostrov','les','louka','pole','sad','zahrada','strom','list','plod','jablko','malina','jahoda','houba','mech','seno','oves','chmel','sklo','kladivo','pila','lopata','kosa','srp','vidle','pizza','mango','tango','radar','banan','kakao','sirup','cibule','paprika','brambor','mrkev','hrach','fazole','cuketa','meloun','citron','kokos','datle','oliva','hrozen','raketa','planeta','kometa','slunce','obloha','mrak','duha','led','voda','kamna','lampa','okno','schody','koberec','deka','postel','police','kniha','guma','barva','hrnec','konev','mop','hadr','kostka','mince'];

const slug = (n) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const pick = () => WORDS[crypto.randomInt(WORDS.length)];
const passphrase = () => `${pick()}-${pick()}-${pick()}`;

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const { data: players, error } = await sb.from('players').select('id, name, auth_user_id, email').order('id');
if (error) { console.error(error); process.exit(1); }

const created = [];
for (const p of players) {
  if (p.auth_user_id) { console.log(`• ${p.name}: účet už existuje — přeskakuji`); continue; }
  const email = p.email || `${slug(p.name)}@${EMAIL_DOMAIN}`;
  const password = passphrase();
  const { data: u, error: e1 } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (e1) { console.error(`✗ ${p.name}: ${e1.message}`); continue; }
  const { error: e2 } = await sb.from('players').update({ auth_user_id: u.user.id, email }).eq('id', p.id);
  if (e2) { console.error(`✗ ${p.name}: ${e2.message}`); continue; }
  created.push({ name: p.name, password });
}

console.log('\n=== PŘIHLAŠOVACÍ HESLA (rozdej hráčům a pak tento výpis smaž) ===');
for (const c of created) console.log(`  ${c.name.padEnd(12)} ${c.password}`);
if (created.length === 0) console.log('  (nic nového — všichni už účet mají)');
console.log('');
