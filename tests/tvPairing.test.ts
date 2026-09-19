import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDerivedStationChannel, resolveStationTvChannel, getTvChannelCandidates } from '../src/utils/tvPairing.ts';

test('buildDerivedStationChannel derives a predictable channel from station metadata', () => {
  const channel = buildDerivedStationChannel({ id: 'st-01', consoleType: 'PS5 Pro' });
  assert.equal(channel, 'tv:PS5PRO_01');
});

test('resolveStationTvChannel prefers persisted pairing over heuristic fallback', () => {
  const station = { id: 'st-07', consoleType: 'Nintendo Switch' };
  const pairings = [{ stationId: 'st-07', tvChannel: 'tv:SWITCH_07' }];

  assert.equal(resolveStationTvChannel(station, pairings), 'tv:SWITCH_07');
});

test('getTvChannelCandidates only includes pairing channel and matching-suffix channels', () => {
  const station = { id: 'st-03', consoleType: 'PS5 Pro' };
  const pairings = [{ stationId: 'st-03', tvChannel: 'tv:PS5PRO_03' }];
  const presenceChannels = ['tv:PS5PRO_03', 'tv:PS5PRO_03_EXTRA', 'tv:PS5PRO_04', 'tv:SWITCH_03'];

  const candidates = getTvChannelCandidates(station, pairings, presenceChannels);
  assert.deepEqual(candidates, ['tv:PS5PRO_03', 'tv:all']);
});
