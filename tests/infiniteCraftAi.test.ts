import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInfiniteCraftAiResult } from '../src/services/infiniteCraftAi.ts';

test('AI craft accepts a concise noun and matching emoji', () => {
  assert.deepEqual(parseInfiniteCraftAiResult('{"accepted":true,"noun":"Volcano","emoji":"🌋"}'), { accepted: true, noun: 'Volcano', emoji: '🌋' });
});

test('AI craft may reject combinations and rejects filler names or malformed output', () => {
  assert.deepEqual(parseInfiniteCraftAiResult('{"accepted":false,"reason":"No sensible result"}'), { accepted: false, reason: 'No sensible result' });
  assert.equal(parseInfiniteCraftAiResult('{"accepted":true,"noun":"Nova Banana","emoji":"🍌"}').accepted, false);
  assert.equal(parseInfiniteCraftAiResult('{"accepted":true,"noun":"a long sentence with punctuation.","emoji":"🍌"}').accepted, false);
  assert.equal(parseInfiniteCraftAiResult('{"accepted":true,"noun":"Potato","emoji":"not emoji"}').accepted, false);
});
