import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessCrossyRoad, isPlausibleCrossyRoadScore } from '../src/services/crossyRoadPolicy.ts';

test('approved active members can play without the legacy gamesEnabled flag', () => {
  assert.equal(canAccessCrossyRoad({ role: 'user', isApproved: true, isSuspended: false, isLocked: false, gamesEnabled: false }), true);
});

test('admins can play', () => {
  assert.equal(canAccessCrossyRoad({ role: 'admin', isApproved: false, isSuspended: true, isLocked: true }), true);
});

test('pending, suspended, locked, and missing accounts cannot play', () => {
  assert.equal(canAccessCrossyRoad({ role: 'user', isApproved: false }), false);
  assert.equal(canAccessCrossyRoad({ role: 'user', isApproved: true, isSuspended: true }), false);
  assert.equal(canAccessCrossyRoad({ role: 'user', isApproved: true, isLocked: true }), false);
  assert.equal(canAccessCrossyRoad(null), false);
});

test('plausible scores are accepted at the documented session rate', () => {
  assert.equal(isPlausibleCrossyRoadScore(0, 0), true);
  assert.equal(isPlausibleCrossyRoadScore(84, 10), true);
});

test('invalid or implausibly fast scores are rejected', () => {
  assert.equal(isPlausibleCrossyRoadScore(85, 10), false);
  assert.equal(isPlausibleCrossyRoadScore(-1, 10), false);
  assert.equal(isPlausibleCrossyRoadScore(10001, 1000), false);
  assert.equal(isPlausibleCrossyRoadScore(1.5, 10), false);
  assert.equal(isPlausibleCrossyRoadScore(10, Number.NaN), false);
});
