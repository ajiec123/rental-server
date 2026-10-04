/**
 * License validation (Ed25519-signed keys, offline verification, DEVICE BINDING).
 *
 * Key format:  CC1.<base64url payload>.<base64url signature>
 * Payload:     JSON { licensee, maxStations, expiresAt, issuedAt, machineIds? }
 *   machineIds: array of device fingerprints allowed to run this license.
 *   - Empty array / missing  → key is device-agnostic (works anywhere).
 *   - Non-empty              → this install's fingerprint MUST be in the list.
 *
 * The PUBLIC key is embedded here; the PRIVATE key (license-keys/private.pem)
 * never leaves the vendor machine. Signature verification is pure Node crypto,
 * so it works fully offline.
 *
 * Device fingerprint: Windows MachineGuid (HKLM\SOFTWARE\Microsoft\Cryptography)
 * hashed with SHA-256 — stable across reboots, changes only on OS reinstall.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

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
  /** Device fingerprints (SHA-256 of MachineGuid) allowed to run this key. */
  machineIds?: string[];
}

export interface LicenseCheckResult {
  valid: boolean;
  reason: string;
  payload: LicensePayload | null;
}

let cachedMachineId: string | null = null;

/**
 * Device fingerprint: SHA-256 hex of the Windows MachineGuid.
 * Cached after first read. Falls back to hostname hash if the registry is
 * unavailable (non-Windows dev machine).
 */
export function getMachineId(): string {
  if (cachedMachineId) return cachedMachineId;
  let raw = '';
  try {
    raw = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { encoding: 'utf-8', timeout: 5000 }
    );
    const m = raw.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
    if (m) raw = m[1];
  } catch {
    raw = `fallback:${process.env.COMPUTERNAME ?? 'unknown-host'}`;
  }
  cachedMachineId = crypto.createHash('sha256').update(raw.trim()).digest('hex');
  return cachedMachineId;
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

  // ===== Device binding =====
  const allowed = payload.machineIds ?? [];
  if (allowed.length > 0) {
    const myId = getMachineId();
    if (!allowed.includes(myId)) {
      return {
        valid: false,
        reason: 'Lisensi tidak terikat ke perangkat ini — hubungi vendor untuk migrasi',
        payload,
      };
    }
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
