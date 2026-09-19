/**
 * Lightweight PIN hashing for browser-side protection.
 * NOTE: Browser-side hashing is NOT real security — anyone with DevTools can
 * tamper. This layer prevents:
 *   - Casual viewing of plaintext PINs in localStorage
 *   - "Shoulder-surfing" the PIN from a visible chip in the login modal
 *   - Accidental leakage in dev logs
 * For production-grade auth, replace with backend bcrypt + session tokens.
 */

const SALT_PREFIX = 'cmdctr-v1:';

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(SALT_PREFIX + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return 'sha256:' + toHex(buf);
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  const candidate = await hashPin(pin);
  // Constant-time-ish comparison
  if (candidate.length !== storedHash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < candidate.length; i++) {
    mismatch |= candidate.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Backwards-compatible migration: when loading accounts that still have a
 * plaintext `pin` field, hash it on first read and persist the hashed form.
 */
export async function ensureHashedPin<T extends { pin?: string }>(account: T): Promise<T> {
  if (!account.pin) return account;
  if (account.pin.startsWith('sha256:')) return account;
  const hashed = await hashPin(account.pin);
  return { ...account, pin: hashed };
}