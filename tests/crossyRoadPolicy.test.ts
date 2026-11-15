import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessCrossyRoad, isPlausibleCrossyRoadScore, resolveCrossyRoadHost } from '../src/services/crossyRoadPolicy.ts';
import { CROSSY_ROAD_FINISH_RUN_SQL } from '../src/services/crossyRoadSql.ts';

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

test('Crossy Road host accepts only HTTPS Google Apps Script domains', () => {
  const valid = resolveCrossyRoadHost('https://script.google.com/macros/s/example/exec');
  assert.equal(valid.url, 'https://script.google.com/macros/s/example/exec');
  assert.equal(valid.error, null);
  assert.equal(resolveCrossyRoadHost('https://script.googleusercontent.com/macros/echo').url, 'https://script.googleusercontent.com/macros/echo');
});

test('Crossy Road host fails closed for missing, non-HTTPS, or blocked domains', () => {
  assert.equal(resolveCrossyRoadHost('').url, null);
  assert.match(resolveCrossyRoadHost('').error || '', /not been configured/);
  assert.equal(resolveCrossyRoadHost('http://script.google.com/macros/s/example/exec').url, null);
  assert.equal(resolveCrossyRoadHost('https://yousound-game-assets.liamnystrom9.workers.dev/crossy-road').url, null);
  assert.equal(resolveCrossyRoadHost('https://example.com/game').url, null);
});

test('Crossy Road finish SQL uses one consistent type for the score parameter', () => {
  assert.equal((CROSSY_ROAD_FINISH_RUN_SQL.match(/\$3::integer/g) || []).length, 2);
  assert.doesNotMatch(CROSSY_ROAD_FINISH_RUN_SQL, /\$3::numeric/);
});


import { getCrossyDestination, sanitizeCrossyLaneObjects } from '../src/services/crossyRoadGameLogic.ts';
import { CROSSY_BIRD_SKINS, CROSSY_MAPS, getCrossyCosmetic } from '../src/services/crossyRoadCatalog.ts';

test('Crossy Road movement directions match the on-screen controls', () => {
  assert.deepEqual(getCrossyDestination(4, 0, 'up'), { x: 4, row: 1 });
  assert.deepEqual(getCrossyDestination(4, 1, 'down'), { x: 4, row: 0 });
  assert.deepEqual(getCrossyDestination(4, 1, 'left'), { x: 3, row: 1 });
  assert.deepEqual(getCrossyDestination(4, 1, 'right'), { x: 5, row: 1 });
});

test('road lanes never retain water logs or lily pads', () => {
  const objects = [
    { id: 'car', x: 1, length: 1.5, kind: 'vehicle' },
    { id: 'log', x: 2, length: 2, kind: 'log' },
    { id: 'lily', x: 4, length: 1, kind: 'lilyPad' },
  ];
  assert.deepEqual(sanitizeCrossyLaneObjects('road', objects).map((item) => item.id), ['car']);
});

test('river lanes retain only logs and lily pads; railroad lanes retain only trains', () => {
  const objects = [
    { id: 'car', x: 1, length: 1.5, kind: 'vehicle' },
    { id: 'log', x: 2, length: 2, kind: 'log' },
    { id: 'lily', x: 4, length: 1, kind: 'lilyPad' },
    { id: 'train', x: 5, length: 7.4, kind: 'train' },
  ];
  assert.deepEqual(sanitizeCrossyLaneObjects('river', objects).map((item) => item.id), ['log', 'lily']);
  assert.deepEqual(sanitizeCrossyLaneObjects('railRoad', objects).map((item) => item.id), ['train']);
  assert.deepEqual(sanitizeCrossyLaneObjects('grass', objects), []);
});

test('garage catalog items are server-addressable and include a free default', () => {
  assert.equal(getCrossyCosmetic('bird', 'classic')?.price, 0);
  assert.equal(getCrossyCosmetic('map', 'classic')?.price, 0);
  assert.equal(getCrossyCosmetic('bird', 'not-a-skin'), null);
  assert.equal(getCrossyCosmetic('map', 'not-a-map'), null);
  assert.ok(CROSSY_BIRD_SKINS.some((item) => item.id === 'golden'));
  assert.ok(CROSSY_MAPS.some((item) => item.id === 'winter'));
});
