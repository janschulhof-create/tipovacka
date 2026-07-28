#!/usr/bin/env node
/**
 * Vygeneruje nový pár VAPID klíčů pro webové notifikace.
 *
 * BEZPEČNOST: privátní klíč se vypíše do konzole, protože ho jinak nelze
 * předat. Nikam se neukládá. Zkopíruj ho rovnou do proměnných prostředí
 * (Vercel → Settings → Environment Variables) a výstup pak zavři.
 * NIKDY ho nezapisuj do souboru v repozitáři.
 */
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const b = (s) => Buffer.from(s, 'base64url');

const verejny = Buffer.concat([Buffer.from([4]), b(pub.x), b(pub.y)]).toString('base64url');
const privatni = b(priv.d).toString('base64url');

console.log('Zkopíruj do proměnných prostředí (a tento výstup pak zavři):\n');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${verejny}`);
console.log(`VAPID_PRIVATE_KEY=${privatni}`);
console.log('\n⚠️  VAPID_PRIVATE_KEY je tajný. Nikdy ho nedávej do repozitáře.');
