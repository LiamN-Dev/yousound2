import test from 'node:test';
import assert from 'node:assert/strict';
import { CROSSY_ROAD_ROOM_CODE_ALPHABET, isValidCrossyRoadRoomCode, normalizeCrossyRoadRoomCode } from '../src/services/crossyRoadRoomCode.ts';

test('every generated Crossy Road room-code character is accepted by the join validator', () => {
  for (const character of CROSSY_ROAD_ROOM_CODE_ALPHABET) {
    assert.equal(isValidCrossyRoadRoomCode(character.repeat(6)), true, character);
  }
});

test('room-code input normalization accepts the same alphabet as the server', () => {
  assert.equal(normalizeCrossyRoadRoomCode('abg-km2!'), 'ABGKM2');
  assert.equal(normalizeCrossyRoadRoomCode('io01'), '');
  assert.equal(isValidCrossyRoadRoomCode('ABGKM2'), true);
  assert.equal(isValidCrossyRoadRoomCode('ABGKM0'), false);
});
