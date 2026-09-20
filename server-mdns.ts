/**
 * Server-side mDNS / DNS-SD service for Command Center.
 *
 * What this does:
 *   1. Advertise this server as `_commandcenter._tcp.local` so Android TV
 *      receivers can discover the server URL automatically (no manual IP
 *      config needed by the TV owner).
 *   2. Browse for `_tvreceiver._tcp.local` services to discover TVs on the
 *      same LAN. When a TV appears, we record its channel name (from TXT
 *      record) and mark it online. When it disappears, mark offline.
 *
 * Why mDNS:
 *   - TV owners shouldn't need to know server IPs.
 *   - When the server moves to a different PC / IP, TVs auto-recover.
 *   - Mirrors what industry leaders do (AirPlay, Chromecast, Spotify Connect).
 *
 * Library: `bonjour-service` (pure JS, cross-platform — works on Windows,
 * macOS, Linux without native deps like Avahi / Bonjour).
 */

import { Bonjour, Service } from 'bonjour-service';

/** Service type constants. Must match APK constants. */
export const SERVER_SERVICE_TYPE = 'commandcenter';
export const TV_SERVICE_TYPE = 'tvreceiver';

/** Track discovered TVs from mDNS so we can report them via /api/mdns */
export interface DiscoveredTV {
  /** Channel name from TXT record (e.g. "PS5_01") */
  channel: string;
  /** Device model (e.g. "Mi Box S") */
  model: string;
  /** APK version */
  version: string;
  /** Android device ID (last 6 hex of ANDROID_ID) */
  deviceId: string;
  /** Resolved IP address */
  ip: string;
  /** Port for HTTP/WS server on the TV */
  port: number;
  /** Last time we saw this TV (ms epoch) */
  lastSeen: number;
}

let bonjour: Bonjour | null = null;
const discoveredTVs = new Map<string, DiscoveredTV>();
let tvChangeListeners: Array<(tvs: DiscoveredTV[]) => void> = [];

/**
 * Start mDNS services: advertise ourselves + browse for TVs.
 * Idempotent — calling multiple times is safe (no-op after first).
 */
export function startMdns(port: number, serverVersion: string): void {
  if (bonjour) {
    console.log('[mdns] Already running, skipping duplicate start');
    return;
  }

  bonjour = new Bonjour();

  // === 1. Advertise this server ===
  try {
    bonjour.publish({
      name: 'rental-server',
      type: SERVER_SERVICE_TYPE,
      // Fixed mDNS hostname so TVs connect to "rental-server.local" instead
      // of a raw IP. Even if the operator PC changes IP, the hostname resolves
      // to the new address automatically.
      host: 'rental-server.local',
      // Advertise IPv4 only — the WebSocket server binds 0.0.0.0 (IPv4).
      // Without this, some resolvers return IPv6 AAAA records that don't route.
      disableIPv6: true,
      port,
      txt: {
        version: serverVersion,
        platform: process.platform,
        // protocol='ws' so TVs know what to connect with
        protocol: 'ws',
        // Path on the WS endpoint
        path: '/ws',
      },
    });
    console.log(`[mdns] ✅ Advertising server as _${SERVER_SERVICE_TYPE}._tcp.local on port ${port}`);
    console.log('[mdns]    Android TVs on the same LAN will auto-discover this server.');
  } catch (e) {
    console.warn('[mdns] Failed to advertise server:', (e as Error).message);
  }

  // === 2. Browse for TV receivers ===
  try {
    const browser = bonjour.find({ type: TV_SERVICE_TYPE });

    browser.on('up', (service: Service) => {
      const channel = (service.txt?.channel as string) || '';
      if (!channel) {
        console.warn(`[mdns] TV appeared but has no channel TXT record: ${service.name}`);
        return;
      }

      // Resolve host (bonjour gives us a hostname like android.local — need IP)
      const ip = resolveServiceIp(service);
      const port = service.port || 8765;

      const tv: DiscoveredTV = {
        channel,
        model: (service.txt?.model as string) || 'Unknown',
        version: (service.txt?.version as string) || '?',
        deviceId: (service.txt?.device_id as string) || '',
        ip,
        port,
        lastSeen: Date.now(),
      };

      discoveredTVs.set(channel, tv);
      console.log(
        `[mdns] 📺 TV discovered: channel=${channel} model=${tv.model} ip=${ip}:${port}`
      );
      notifyTVListeners();
    });

    browser.on('down', (service: Service) => {
      const channel = (service.txt?.channel as string) || '';
      if (channel && discoveredTVs.has(channel)) {
        discoveredTVs.delete(channel);
        console.log(`[mdns] 📺 TV disappeared: channel=${channel}`);
        notifyTVListeners();
      }
    });

    console.log(`[mdns] 🔍 Browsing for _${TV_SERVICE_TYPE}._tcp.local services...`);
  } catch (e) {
    console.warn('[mdns] Failed to start TV browser:', (e as Error).message);
  }

  // Periodic cleanup of stale entries (TVs that crashed without sending 'down')
  setInterval(() => {
    const now = Date.now();
    const STALE_TIMEOUT_MS = 90_000; // 90s without update = stale
    let changed = false;
    for (const [channel, tv] of discoveredTVs) {
      if (now - tv.lastSeen > STALE_TIMEOUT_MS) {
        console.log(`[mdns] 📺 TV stale (no refresh in ${STALE_TIMEOUT_MS}ms): ${channel}`);
        discoveredTVs.delete(channel);
        changed = true;
      }
    }
    if (changed) notifyTVListeners();
  }, 30_000);
}

/**
 * Stop mDNS services. Call on server shutdown.
 */
export function stopMdns(): void {
  if (!bonjour) return;
  try {
    bonjour.unpublishAll();
    bonjour.destroy();
  } catch (_) {}
  bonjour = null;
  discoveredTVs.clear();
  console.log('[mdns] Stopped.');
}

/**
 * Get snapshot of currently discovered TVs.
 */
export function getDiscoveredTVs(): DiscoveredTV[] {
  return Array.from(discoveredTVs.values());
}

/**
 * Subscribe to TV discovery changes. Callback fires on up/down events.
 * Returns an unsubscribe function.
 */
export function onTVsChanged(cb: (tvs: DiscoveredTV[]) => void): () => void {
  tvChangeListeners.push(cb);
  // Fire immediately with current snapshot
  cb(getDiscoveredTVs());
  return () => {
    tvChangeListeners = tvChangeListeners.filter((fn) => fn !== cb);
  };
}

function notifyTVListeners(): void {
  const snapshot = getDiscoveredTVs();
  for (const fn of tvChangeListeners) {
    try {
      fn(snapshot);
    } catch (e) {
      console.warn('[mdns] Listener error:', (e as Error).message);
    }
  }
}

/**
 * Resolve IP address from service referrer info.
 * bonjour-service may give us a hostname or referer object depending on
 * platform; this normalises to a string IP.
 */
function resolveServiceIp(service: Service): string {
  // Try several known properties
  const addresses = (service as any).addresses as string[] | undefined;
  if (addresses && addresses.length > 0) {
    // Prefer IPv4 over IPv6 for simplicity
    const v4 = addresses.find((a) => a.includes('.') && !a.includes(':'));
    return v4 || addresses[0];
  }
  const referer = (service as any).referer;
  if (referer?.address) return referer.address as string;
  // Last resort
  return (service.host || 'unknown') as string;
}
