/**
 * License validation (Ed25519-signed keys, offline verification).
 *
 * Key format:  CC1.<base64url payload>.<base64url signature>
 * Payload:     JSON { licensee, maxStations, expiresAt (ms | null), issuedAt }
 *
 * The PUBLIC key is embedded here; the PRIVATE key (license-keys/private.pem)
 * never leaves the vendor machine. Signature verification is pure Node crypto,
 * so it works fully offline.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Embedded public key — generated once by the vendor (license-keys/public.pem).
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEASzl7TnWRs05CHkXFxH3EnVqVdeOw8CXhNdLaSKXVDA0=
-----END PUBLIC KEY-----`;

export interface LicensePayload {
  licensee: string;
  maxStations: number;
  /** Unix ms when the license expires; null = perpetual. */
  expiresAt: number | null;
  issuedAt: number;
}

export interface LicenseCheckResult {
  valid: boolean;
  reason: string;
  payload: LicensePayload | null;
}

function b64urlToJson(b64url: string): LicensePayload | null {
  try {
    const json = Buffer.from(b64url, 'base64url').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function verifyLicenseKey(key: string): LicenseCheckResult {
  const trimmed = (key || '').trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== 'CC1') {
    return { valid: false, reason: 'Format lisensi tidak valid', payload: null };
  }
  const [, payloadB64, sigB64] = parts;
  const payload = b64urlToJson(payloadB64);
  if (!payload || typeof payload.licensee !== 'string' || typeof payload.maxStations !== 'number') {
    return { valid: false, reason: 'Isi lisensi tidak valid', payload: null };
  }

  let sigOk = false;
  try {
    sigOk = crypto.verify(
      null, // Ed25519: algorithm implied by key type
      Buffer.from(payloadB64),
      LICENSE_PUBLIC_KEY,
      Buffer.from(sigB64, 'base64url')
    );
  } catch {
    sigOk = false;
  }
  if (!sigOk) {
    return { valid: false, reason: 'Tanda tangan lisensi tidak sah', payload };
  }
  if (payload.expiresAt !== null && Date.now() > payload.expiresAt) {
    return { valid: false, reason: 'Lisensi sudah kedaluwarsa', payload };
  }
  return { valid: true, reason: 'Lisensi aktif', payload };
}

/** Where the installed license key lives (server data dir). */
export function licenseFilePath(dataDir: string): string {
  return path.join(dataDir, 'license.key');
}

export function readInstalledLicense(dataDir: string): LicenseCheckResult {
  try {
    const key = fs.readFileSync(licenseFilePath(dataDir), 'utf-8');
    return verifyLicenseKey(key);
  } catch {
    return { valid: false, reason: 'Belum ada lisensi terpasang', payload: null };
  }
}

export function writeInstalledLicense(dataDir: string, key: string): LicenseCheckResult {
  const result = verifyLicenseKey(key);
  if (result.valid) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(licenseFilePath(dataDir), key.trim(), 'utf-8');
  }
  return result;
}
