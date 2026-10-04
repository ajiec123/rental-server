/**
 * License key generator — VENDOR ONLY.
 *
 * Usage:
 *   npm run license:generate -- --licensee "Nama Rental" --stations 12 [--days 365]
 *
 * Requires license-keys/private.pem (never committed).
 * Output: a CC1.<payload>.<signature> key to paste into the customer's
 * activation screen.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const licensee = arg('--licensee');
const stations = Number(arg('--stations') ?? 12);
const days = arg('--days') ? Number(arg('--days')) : null;

if (!licensee || isNaN(stations) || stations <= 0) {
  console.error('Usage: npm run license:generate -- --licensee "Nama Rental" --stations 12 [--days 365]');
  process.exit(1);
}

const privPath = path.join(process.cwd(), 'license-keys', 'private.pem');
if (!fs.existsSync(privPath)) {
  console.error(`Private key not found: ${privPath}`);
  console.error('Generate it first: node -e "..." (see license.ts header) — private.pem must stay vendor-side.');
  process.exit(1);
}

const payload = {
  licensee,
  maxStations: stations,
  expiresAt: days ? Date.now() + days * 24 * 60 * 60 * 1000 : null,
  issuedAt: Date.now(),
};

const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
const privateKey = crypto.createPrivateKey(fs.readFileSync(privPath, 'utf-8'));
const signature = crypto.sign(null, Buffer.from(payloadB64), privateKey).toString('base64url');

const key = `CC1.${payloadB64}.${signature}`;

console.log('='.repeat(60));
console.log(`Licensee     : ${licensee}`);
console.log(`Max stations : ${stations}`);
console.log(`Expires      : ${payload.expiresAt ? new Date(payload.expiresAt!).toISOString().slice(0, 10) : 'perpetual'}`);
console.log('='.repeat(60));
console.log(key);
console.log('='.repeat(60));
console.log('Paste this key into the customer\'s activation screen.');

// Optionally save to a file for records.
const outPath = path.join(process.cwd(), 'license-keys', `key-${licensee.replace(/\W+/g, '-').toLowerCase()}.txt`);
fs.writeFileSync(outPath, `${key}\n`, 'utf-8');
console.log(`Saved to: ${outPath}`);
