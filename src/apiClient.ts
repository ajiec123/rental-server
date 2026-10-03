/**
 * API client dengan auth token.
 *
 * Server kini memproteksi endpoint mutasi dengan Bearer token (POST
 * /api/auth/login). Helper ini:
 *   1. Login sekali (cache token di sessionStorage) dengan kredensial operator
 *      yang sedang login di UI (username + PIN yang di-hash).
 *   2. Menyisipkan "Authorization: Bearer <token>" ke setiap request.
 *   3. Kalau token kadaluarsa (401), coba re-login SEKALI lalu ulang request.
 *
 * Kredensial di-set lewat setApiCredentials() saat operator login di UI —
 * PIN mentah TIDAK disimpan, hanya hash-nya (yang memang satu-satunya bentuk
 * yang dikirim ke server, sama seperti verifikasi login).
 */

let cachedUsername: string | null = null;
let cachedPinHash: string | null = null;
let tokenPromise: Promise<string> | null = null;

export function setApiCredentials(username: string, pinHash: string) {
  if (cachedUsername !== username || cachedPinHash !== pinHash) {
    // Credentials changed (different user logged in) → force fresh token.
    sessionStorage.removeItem('cmdcenter_api_token');
    tokenPromise = null;
  }
  cachedUsername = username;
  cachedPinHash = pinHash;
}

export function clearApiCredentials() {
  cachedUsername = null;
  cachedPinHash = null;
  sessionStorage.removeItem('cmdcenter_api_token');
  tokenPromise = null;
}

async function getToken(): Promise<string> {
  const cached = sessionStorage.getItem('cmdcenter_api_token');
  if (cached) return cached;
  if (!tokenPromise) {
    if (!cachedUsername || !cachedPinHash) {
      // Operator belum login — server akan menolak dengan 401 (expected).
      return '';
    }
    tokenPromise = (async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cachedUsername, pinHash: cachedPinHash }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Login API gagal');
      const data = await res.json();
      sessionStorage.setItem('cmdcenter_api_token', data.token);
      return data.token as string;
    })();
    tokenPromise.catch(() => {
      tokenPromise = null;
    });
  }
  return tokenPromise;
}

/**
 * fetch() dengan Bearer token otomatis. Signature sama seperti fetch biasa.
 * Pada 401, mencoba re-login sekali lalu mengulang request.
 */
export async function apiFetch(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401 && !retried) {
    // Token kadaluarsa → re-login sekali dan coba lagi.
    sessionStorage.removeItem('cmdcenter_api_token');
    tokenPromise = null;
    return apiFetch(url, init, true);
  }
  return res;
}
