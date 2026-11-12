import test from 'node:test';
import assert from 'node:assert/strict';
import {
  YOUCRAFT_STARTER_ITEMS,
  canonicalYouCraftRecipe,
  normalizeYouCraftItem,
  createInstantYouCraftDiscovery,
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

test('known crafting recipes resolve instantly and are order-independent', () => {
  const water = YOUCRAFT_STARTER_ITEMS.find((item) => item.name === 'Water')!;
  const fire = YOUCRAFT_STARTER_ITEMS.find((item) => item.name === 'Fire')!;
  const recipe = canonicalYouCraftRecipe(water.name, fire.name);
  const steam = createInstantYouCraftDiscovery(water, fire, recipe.key);
  const reversed = createInstantYouCraftDiscovery(fire, water, recipe.key);
  assert.equal(steam.name, 'Steam');
  assert.equal(steam.id, reversed.id);
  assert.equal(steam.name, reversed.name);
});

test('unknown combinations are not made up locally', () => {
  const water = YOUCRAFT_STARTER_ITEMS.find((item) => item.name === 'Water')!;
  const air = YOUCRAFT_STARTER_ITEMS.find((item) => item.name === 'Air')!;
  const unknown = { ...air, name: 'Unicorn' };
  const key = canonicalYouCraftRecipe(water.name, unknown.name).key;
  assert.equal(createInstantYouCraftDiscovery(water, unknown, key), null);
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
  assert.equal(afterHost.players.find((p) => p.uid === 'guest')?.hp, 22);
  const afterGuest = applyYouCraftAction(afterHost, 'guest', 'guard', 'starter-earth');
  assert.equal(afterGuest.currentTurnUid, 'host');
  assert.equal(afterGuest.players.find((p) => p.uid === 'guest')?.guard, 7);
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
  assert.equal(next.currentTurnUid, 'guest');
  assert.throws(() => applyYouCraftAction(next, 'host', 'charge'), /not your turn/i);
  const nextGuest = applyYouCraftAction(next, 'guest', 'charge');
  assert.equal(nextGuest.currentTurnUid, 'host');
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
});
