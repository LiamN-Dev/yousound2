import assert from 'node:assert/strict';
import test from 'node:test';
import { getUtcWeekKey, getWeeklyViolationNumber, hasExplicitUnsafeYouTubeMetadataSignal } from '../src/services/youtubeSafetyPolicy.ts';

test('UTC week starts Monday and resets at the next Monday', () => {
  assert.equal(getUtcWeekKey('2026-11-20T17:00:00.000Z'), '2026-11-16');
  assert.equal(getUtcWeekKey('2026-11-22T23:59:59.000Z'), '2026-11-16');
  assert.equal(getUtcWeekKey('2026-11-23T00:00:00.000Z'), '2026-11-23');
});

test('only distinct videos increment the weekly offense count', () => {
  const records = [{ uid: 'u1', weekKey: '2026-11-16', videoId: 'video000001', offenseNumber: 1 }];
  assert.equal(getWeeklyViolationNumber(records, 'u1', '2026-11-16', 'video000001'), 1);
  assert.equal(getWeeklyViolationNumber(records, 'u1', '2026-11-16', 'video000002'), 2);
  assert.equal(getWeeklyViolationNumber(records, 'u1', '2026-11-23', 'video000002'), 1);
  assert.equal(getWeeklyViolationNumber(records, 'u2', '2026-11-16', 'video000002'), 1);
});

test('clear unsafe metadata signals are auto-classified instead of sent to review', () => {
  assert.equal(hasExplicitUnsafeYouTubeMetadataSignal({ title: 'Inappropriate TV fails you have not seen', channelTitle: '', description: '', tags: [] }), true);
  assert.equal(hasExplicitUnsafeYouTubeMetadataSignal({ title: 'Pornography explained in a health class', channelTitle: '', description: '', tags: [] }), false);
  assert.equal(hasExplicitUnsafeYouTubeMetadataSignal({ title: 'How television editing works', channelTitle: '', description: '', tags: [] }), false);
  assert.equal(hasExplicitUnsafeYouTubeMetadataSignal({ title: 'Graphic gore documentary history', channelTitle: '', description: '', tags: [] }), false);
});
