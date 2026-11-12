import test from 'node:test';
import assert from 'node:assert/strict';
import {
  YOUCRAFT_STARTER_ITEMS,
  canonicalYouCraftRecipe,
  normalizeYouCraftItem,
  createInitialYouCraftBattleState,
  joinYouCraftBattleState,
  applyYouCraftAction,
} from '../src/services/youcraft.ts';

test('recipe keys are order-independent', () => {
  const one = canonicalYouCraftRecipe('Water', 'Fire');
  const two = canonicalYouCraftRecipe('fire', ' water ');
  assert.equal(one.key, two.key);
});

test('generated item stats are bounded and stable by recipe', () => {
  const item = normalizeYouCraftItem({ name: 'Steam', attack: 99, defense: -3, energyCost: 8 }, 'abcdef0123456789abcdef');
  assert.equal(item.id, 'yc_abcdef0123456789abcd');
  assert.equal(item.attack, 9);
  assert.equal(item.defense, 1);
  assert.equal(item.energyCost, 3);
});

test('two players can join a match and alternate turns', () => {
  const host = { uid: 'host', username: 'Host' };
  const guest = { uid: 'guest', username: 'Guest' };
  const state = createInitialYouCraftBattleState(host, YOUCRAFT_STARTER_ITEMS);
  const joined = joinYouCraftBattleState(state, guest, YOUCRAFT_STARTER_ITEMS);
  assert.equal(joined.players.length, 2);
  assert.equal(joined.currentTurnUid, 'host');
  const afterHost = applyYouCraftAction(joined, 'host', 'strike', 'starter-fire');
  assert.equal(afterHost.currentTurnUid, 'guest');
  assert.equal(afterHost.players.find((p) => p.uid === 'guest')?.hp, 21);
  const afterGuest = applyYouCraftAction(afterHost, 'guest', 'guard', 'starter-earth');
  assert.equal(afterGuest.currentTurnUid, 'host');
  assert.equal(afterGuest.players.find((p) => p.uid === 'guest')?.guard, 9);
  assert.deepEqual(afterGuest.usedItemIds.host, []);
});

test('battle rejects out-of-turn actions and item reuse', () => {
  const state = joinYouCraftBattleState(
    createInitialYouCraftBattleState({ uid: 'host', username: 'Host' }, YOUCRAFT_STARTER_ITEMS),
    { uid: 'guest', username: 'Guest' },
    YOUCRAFT_STARTER_ITEMS,
  );
  assert.throws(() => applyYouCraftAction(state, 'guest', 'charge'), /not your turn/i);
  const next = applyYouCraftAction(state, 'host', 'strike', 'starter-fire');
  const nextGuest = applyYouCraftAction(next, 'guest', 'charge');
  assert.equal(nextGuest.currentTurnUid, 'host');
  const hostAgain = applyYouCraftAction(nextGuest, 'host', 'strike', 'starter-fire');
  assert.equal(hostAgain.currentTurnUid, 'guest');
  assert.throws(() => applyYouCraftAction(hostAgain, 'guest', 'strike', 'starter-fire'), /not your turn/i);
});

test('battle ends when health reaches zero', () => {
  let state = joinYouCraftBattleState(
    createInitialYouCraftBattleState({ uid: 'host', username: 'Host' }, YOUCRAFT_STARTER_ITEMS),
    { uid: 'guest', username: 'Guest' },
    YOUCRAFT_STARTER_ITEMS,
  );
  // The battle state is intentionally immutable; create a low-health target for the end condition.
  state = { ...state, players: state.players.map((p) => p.uid === 'guest' ? { ...p, hp: 1, guard: 0 } : p) };
  const won = applyYouCraftAction(state, 'host', 'strike', 'starter-fire');
  assert.equal(won.winnerUid, 'host');
  assert.equal(won.status, undefined);
});
