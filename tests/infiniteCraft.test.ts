import test from 'node:test';
import assert from 'node:assert/strict';
import { findInfiniteCraftRecipe, infiniteCraftRecipeKey, listInfiniteCraftRecipes } from '../src/services/infiniteCraft.ts';

test('known Infinite Craft recipes create named discoveries rather than generated prefixes', () => {
  assert.equal(findInfiniteCraftRecipe('Uncle Sam', 'Shark')?.result, 'Donald Trump');
  assert.equal(findInfiniteCraftRecipe('America', 'Tornado')?.result, 'Trump');
  assert.equal(findInfiniteCraftRecipe('Donald Trump', 'Duck')?.result, 'Donald Duck');
  assert.equal(findInfiniteCraftRecipe('Donald Trump', 'Florida')?.result, 'Mar-a-Lago');
});

test('Infinite Craft recipe lookup is order independent', () => {
  assert.equal(findInfiniteCraftRecipe('Water', 'Earth')?.result, findInfiniteCraftRecipe('Earth', 'Water')?.result);
  assert.equal(infiniteCraftRecipeKey('Fire', 'Water'), infiniteCraftRecipeKey('Water', 'Fire'));
});

test('unknown pairs do not create adjective-prefixed filler discoveries', () => {
  assert.equal(findInfiniteCraftRecipe('Nova Banana', 'Cosmic Potato'), null);
  assert.ok(listInfiniteCraftRecipes().length >= 100);
});
