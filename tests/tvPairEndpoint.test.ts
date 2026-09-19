import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the TV pairing HTTP endpoint logic (server.ts).
 *
 * Since the server is monolithic and runs the WS + HTTP together, we
 * exercise the pairing state machine in isolation by re-implementing
 * the same Map-based claim tracker and asserting the invariants that
 * the real endpoint enforces.
 *
 * These tests catch regressions in:
 *   1. Channel format validation (rejects bad input)
 *   2. Channel-uniqueness (409 CONFLICT semantics)
 *   3. Same-device re-claim is idempotent (refresh, not error)
 *   4. Release semantics (only owner can release)
 */

interface Claim {
  deviceId: string;
  model: string;
  version: string;
  claimedAt: number;
}

// Mirror of the in-process tracker in server.ts
function makePairStore() {
  const claims = new Map<string, Claim>();

  function normalize(raw: string): string {
    return raw.toUpperCase().replace(/^TV:/, '');
  }

  function validateChannel(raw: string): { ok: boolean; channel?: string; error?: string } {
    const normalized = normalize(raw);
    if (!/^[A-Z0-9_]{2,16}$/.test(normalized)) {
      return { ok: false, error: 'invalid format' };
    }
    return { ok: true, channel: `tv:${normalized}` };
  }

  function pair(rawChannel: string, deviceId: string, model = '', version = ''):
    { ok: true; channel: string } | { ok: false; status: number; error: string; claimedBy?: string } {
    const v = validateChannel(rawChannel);
    if (!v.ok) return { ok: false, status: 400, error: v.error };

    const existing = claims.get(v.channel);
    if (existing && existing.deviceId !== deviceId) {
      return { ok: false, status: 409, error: 'CHANNEL_TAKEN', claimedBy: existing.deviceId };
    }

    claims.set(v.channel, {
      deviceId,
      model,
      version,
      claimedAt: Date.now(),
    });
    return { ok: true, channel: v.channel };
  }

  function release(rawChannel: string, deviceId: string): { ok: boolean; released: boolean } {
    const v = validateChannel(rawChannel);
    if (!v.ok) return { ok: true, released: false };
    const existing = claims.get(v.channel);
    if (existing && existing.deviceId === deviceId) {
      claims.delete(v.channel);
      return { ok: true, released: true };
    }
    return { ok: true, released: false };
  }

  return { claims, pair, release, validateChannel };
}

test('pair: accepts well-formed channel names (PS5_01, PS3_99, etc)', () => {
  const store = makePairStore();
  const r = store.pair('PS5_01', 'deviceA');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.channel, 'tv:PS5_01');
});

test('pair: prepends tv: prefix when missing', () => {
  const store = makePairStore();
  const r = store.pair('PS5_01', 'deviceA');
  if (r.ok) assert.equal(r.channel, 'tv:PS5_01');
});

test('pair: normalizes "tv:ps5_01" → "tv:PS5_01"', () => {
  const store = makePairStore();
  const r = store.pair('tv:ps5_01', 'deviceA');
  if (r.ok) assert.equal(r.channel, 'tv:PS5_01');
});

test('pair: rejects bad formats (too short, too long, special chars)', () => {
  const store = makePairStore();
  assert.equal(store.pair('A', 'deviceA').ok, false); // too short
  assert.equal(store.pair('A'.repeat(20), 'deviceA').ok, false); // too long
  assert.equal(store.pair('PS5-01', 'deviceA').ok, false); // dash not allowed
  assert.equal(store.pair('PS5 01', 'deviceA').ok, false); // space not allowed
  assert.equal(store.pair('PS5@01', 'deviceA').ok, false); // symbol not allowed
});

test('pair: 409 CONFLICT when deviceB tries to claim deviceA channel', () => {
  const store = makePairStore();
  const first = store.pair('PS5_01', 'deviceA');
  assert.equal(first.ok, true);
  const second = store.pair('PS5_01', 'deviceB');
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.equal(second.status, 409);
    assert.equal(second.error, 'CHANNEL_TAKEN');
    assert.equal(second.claimedBy, 'deviceA');
  }
});

test('pair: same-device re-claim is idempotent (refresh, no error)', () => {
  const store = makePairStore();
  const a1 = store.pair('PS5_01', 'deviceA');
  const a2 = store.pair('PS5_01', 'deviceA');
  assert.equal(a1.ok, true);
  assert.equal(a2.ok, true);
  assert.equal(store.claims.size, 1);
});

test('pair: different channels can be claimed by different devices', () => {
  const store = makePairStore();
  const r1 = store.pair('PS5_01', 'deviceA');
  const r2 = store.pair('PS5_02', 'deviceB');
  const r3 = store.pair('PS3_99', 'deviceC');
  assert.equal(r1.ok && r2.ok && r3.ok, true);
  assert.equal(store.claims.size, 3);
});

test('release: owner can release their channel', () => {
  const store = makePairStore();
  store.pair('PS5_01', 'deviceA');
  const r = store.release('PS5_01', 'deviceA');
  assert.equal(r.released, true);
  assert.equal(store.claims.size, 0);
});

test('release: another device cannot release', () => {
  const store = makePairStore();
  store.pair('PS5_01', 'deviceA');
  const r = store.release('PS5_01', 'deviceB');
  assert.equal(r.released, false);
  assert.equal(store.claims.size, 1);
});

test('release: after release, the channel can be re-claimed by anyone', () => {
  const store = makePairStore();
  store.pair('PS5_01', 'deviceA');
  store.release('PS5_01', 'deviceA');
  // Now deviceB can claim it
  const r = store.pair('PS5_01', 'deviceB');
  assert.equal(r.ok, true);
});

test('pair then release then pair — size goes 0 → 1 → 0 → 1', () => {
  const store = makePairStore();
  assert.equal(store.claims.size, 0);
  store.pair('PS5_01', 'deviceA');
  assert.equal(store.claims.size, 1);
  store.release('PS5_01', 'deviceA');
  assert.equal(store.claims.size, 0);
  store.pair('PS5_01', 'deviceB');
  assert.equal(store.claims.size, 1);
});
