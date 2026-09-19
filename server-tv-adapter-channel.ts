/**
 * Channel-based TV Adapter — pure WebSocket, zero per-TV IP config.
 *
 * Architecture:
 *   - Each Android TV receiver maintains a persistent WebSocket to server.ts.
 *   - On connect, the TV sends IDENTIFY (clientType: 'tv') + SUBSCRIBE to its
 *     unique channel (e.g. "tv:PS5_01").
 *   - The TV's channel name is derived from SharedPreferences "tv_channel_name"
 *     or from device ID — see MainActivity.kt::resolveChannelName().
 *   - When operator wants to send a command, the operator app PUBLISHES to
 *     the channel via server.ts → routed to TV → executes.
 *
 * Operator app does NOT need to know the TV's IP. Only the server.ts IP.
 *
 * To set a custom channel name on the TV:
 *   adb shell run-as com.cmdcenter.tvreceiver \
 *     sh -c 'echo "PS5_01" > /data/data/.../shared_prefs/tv_receiver.xml'
 * OR via SharedPreferences editor in your own UI.
 *
 * Usage in server.ts:
 *   import { mountChannelTVAdapter } from './server-tv-adapter-channel';
 *   mountChannelTVAdapter(); // No config needed!
 */

import type { WebSocket } from 'ws';

/**
 * Server-side helper to publish a command to a TV channel via WebSocket.
 * This relies on server.ts having its `wsChannels` registry exposed.
 */
export interface ChannelPublisher {
  publish: (channel: string, data: object) => number;
  getSubscribers: (channel: string) => number;
}

let publisher: ChannelPublisher | null = null;

/**
 * Inject the publisher once (after server.ts creates the channelRegistry).
 * In server.ts, call: mountChannelTVAdapter({ publish, getSubscribers })
 */
export function mountChannelTVAdapter(p: ChannelPublisher): void {
  publisher = p;
  console.log('[channel-tv-adapter] Mounted (operator can now publish to TV channels)');
}

/**
 * Publish a TV command (power_on, volume_up, etc.) to a specific channel.
 * Returns the number of TVs that received it.
 */
export function publishTVCommand(channel: string, command: string): number {
  if (!publisher) {
    console.warn('[channel-tv-adapter] Publisher not mounted yet');
    return 0;
  }
  return publisher.publish(channel, { command });
}

/**
 * Publish a branding payload to a specific channel.
 */
export function publishBranding(
  channel: string,
  payload: {
    action: 'show' | 'hide' | 'set';
    text?: string;
    subtitle?: string;
    color?: string;
    bg?: string;
  }
): number {
  if (!publisher) return 0;
  return publisher.publish(channel, { payload });
}

/**
 * Convenience: list active TV channels (for debugging / monitoring).
 */
export function listActiveTVChannels(): string[] {
  // The actual channel list is in server.ts; this is a placeholder.
  // In production, expose via REST: GET /api/channels
  return [];
}