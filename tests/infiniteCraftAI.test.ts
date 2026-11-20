import assert from 'node:assert/strict';
import test from 'node:test';
import { validateInfiniteCraftAiDiscovery } from '../src/services/infiniteCraftAI.ts';

test('accepts and normalizes a concrete noun with one emoji', () => {
  assert.deepEqual(
    validateInfiniteCraftAiDiscovery({ accepted: true, noun: '  Blue   Whale ', emoji: '🐋' }),
    { accepted: true, noun: 'Blue Whale', emoji: '🐋' },
  );
});

test('preserves an AI rejection with a safe reason', () => {
  assert.deepEqual(
    validateInfiniteCraftAiDiscovery({ accepted: false, reason: 'No sensible combination.' }),
    { accepted: false, reason: 'No sensible combination.' },
  );
});

test('uses a default rejection reason when the AI does not provide one', () => {
  assert.equal(
    validateInfiniteCraftAiDiscovery({ accepted: false }).reason,
    'Those ingredients do not make a meaningful discovery.',
  );
});

test('rejects sentences, overlong noun phrases, and missing or multiple emojis', () => {
  assert.throws(() => validateInfiniteCraftAiDiscovery({ accepted: true, noun: 'This is a sentence.', emoji: '✨' }));
  assert.throws(() => validateInfiniteCraftAiDiscovery({ accepted: true, noun: 'An extremely long and unnecessary noun phrase', emoji: '✨' }));
  assert.throws(() => validateInfiniteCraftAiDiscovery({ accepted: true, noun: 'Ocean', emoji: '' }));
  assert.throws(() => validateInfiniteCraftAiDiscovery({ accepted: true, noun: 'Ocean', emoji: '🌊🌊' }));
});
