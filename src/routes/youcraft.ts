import express, { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import {
  getPersistentSettingDb,
  ensurePersistentSettingDb,
  compareAndSetPersistentSettingDb,
} from '../db/queries.ts';
import { getUserByUid } from '../db/queries.ts';
import { getAuthUser, isAdminReq } from '../services/auth.ts';
import {
  YOUCRAFT_STARTER_ITEMS,
  canonicalYouCraftRecipe,
  createInstantYouCraftDiscovery,
  createInitialYouCraftBattleState,
  joinYouCraftBattleState,
  applyYouCraftAction,
  type YouCraftItem,
  type YouCraftBattleState,
  type YouCraftAction,
} from '../services/youcraft.ts';

type Profile = { uid: string; username: string; discoveries: YouCraftItem[]; combinations: number; updatedAt: string };
type RecipeRecord = { key: string; inputA: string; inputB: string; item: YouCraftItem; createdAt: string };
type MatchRecord = { id: string; code: string; status: 'waiting' | 'active' | 'finished'; createdAt: string; updatedAt: string; state: YouCraftBattleState };
const PROFILE_KEY = 'youcraft_profiles_v1';
const RECIPE_KEY = 'youcraft_recipes_v1';
const MATCH_KEY = 'youcraft_matches_v1';
const router = express.Router();
const combineAttempts = new Map<string, number[]>();

async function getAccount(req: Request, res: Response) {
  const auth = getAuthUser(req);
  if (!auth) { res.status(401).json({ success: false, error: 'Sign in to play YouCraft.' }); return null; }
  const user = await getUserByUid(auth.uid);
  if (!user || (user.role !== 'admin' && (!user.isApproved || user.isSuspended || user.isLocked))) {
    res.status(403).json({ success: false, error: 'This account is not currently allowed to use games.' });
    return null;
  }
  return { uid: user.uid, username: user.username, isAdmin: user.role === 'admin' };
}

async function mutateMap<T>(key: string, update: (current: Record<string, T>) => Record<string, T>): Promise<Record<string, T>> {
  await ensurePersistentSettingDb(key, {});
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const before = await getPersistentSettingDb<Record<string, T>>(key);
    const current = before && typeof before === 'object' ? before : {};
    const next = update(current);
    if (await compareAndSetPersistentSettingDb(key, before, next)) return next;
  }
  throw new Error('The game data changed repeatedly. Please try again.');
}

async function getProfile(uid: string, username: string): Promise<Profile> {
  const profiles = await getPersistentSettingDb<Record<string, Profile>>(PROFILE_KEY) || {};
  const saved = profiles[uid];
  return saved ? { ...saved, username: saved.username || username } : { uid, username, discoveries: YOUCRAFT_STARTER_ITEMS.map((item) => ({ ...item })), combinations: 0, updatedAt: new Date().toISOString() };
}

async function saveProfile(profile: Profile): Promise<void> {
  await mutateMap<Profile>(PROFILE_KEY, (profiles) => ({ ...profiles, [profile.uid]: profile }));
}

async function saveMatch(match: MatchRecord): Promise<void> {
  await mutateMap<MatchRecord>(MATCH_KEY, (matches) => ({ ...matches, [match.id]: match }));
}

function safeItemName(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32) : '';
}

function generateDiscovery(first: YouCraftItem, second: YouCraftItem, recipeKey: string): YouCraftItem {
  return createInstantYouCraftDiscovery(first, second, recipeKey);
}

router.get('/profile', async (req, res) => {
  try {
    const account = await getAccount(req, res); if (!account) return;
    const profile = await getProfile(account.uid, account.username);
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({ success: true, profile });
  } catch (error: any) {
    console.error('[YouCraft] Profile load failed:', error);
    return res.status(500).json({ success: false, error: 'Could not load your discoveries.' });
  }
});

router.post('/combine', async (req, res) => {
  try {
    const account = await getAccount(req, res); if (!account) return;
    const now = Date.now();
    const recent = (combineAttempts.get(account.uid) || []).filter((stamp) => now - stamp < 60_000);
    if (recent.length >= 12) return res.status(429).json({ success: false, error: 'Slow down for a moment before combining more items.' });
    const a = safeItemName(req.body?.itemA);
    const b = safeItemName(req.body?.itemB);
    if (!a || !b) return res.status(400).json({ success: false, error: 'Choose two items.' });
    const profile = await getProfile(account.uid, account.username);
    const first = profile.discoveries.find((item) => item.id === a);
    const second = profile.discoveries.find((item) => item.id === b);
    if (!first || !second) return res.status(400).json({ success: false, error: 'You can only combine items in your own collection.' });
    if (profile.discoveries.length >= 250) return res.status(409).json({ success: false, error: 'Your discovery collection is full. Remove or archive some items first.' });
    combineAttempts.set(account.uid, [...recent, now]);
    const recipe = canonicalYouCraftRecipe(first.name, second.name);
    const existingRecipes = await getPersistentSettingDb<Record<string, RecipeRecord>>(RECIPE_KEY) || {};
    const existing = existingRecipes[recipe.key];
    let item = existing?.item;
    if (!item) item = generateDiscovery(first, second, recipe.key);

    // Only one generated result wins globally for a recipe, even if two users combine it simultaneously.
    const canonicalRecipes = await mutateMap<RecipeRecord>(RECIPE_KEY, (recipes) => recipes[recipe.key] ? recipes : ({
      ...recipes,
      [recipe.key]: { key: recipe.key, inputA: recipe.inputA, inputB: recipe.inputB, item: item!, createdAt: new Date().toISOString() },
    }));
    item = canonicalRecipes[recipe.key].item;

    const savedProfile: { value: Profile | null } = { value: null };
    await mutateMap<Profile>(PROFILE_KEY, (profiles) => {
      const current = profiles[account.uid] || profile;
      if (current.discoveries.some((entry) => entry.id === item!.id)) {
        savedProfile.value = current;
        return profiles;
      }
      if (current.discoveries.length >= 250) throw new Error('Your discovery collection is full.');
      savedProfile.value = {
        ...current,
        username: account.username,
        discoveries: [...current.discoveries, item!],
        combinations: current.combinations + 1,
        updatedAt: new Date().toISOString(),
      };
      return { ...profiles, [account.uid]: savedProfile.value! };
    });
    const updated = savedProfile.value;
    if (!updated || updated.discoveries.every((entry) => entry.id !== item!.id)) {
      return res.status(409).json({ success: false, error: 'You already discovered this combination. Try a different pair.' });
    }
    return res.json({ success: true, item, profile: updated, reusedRecipe: Boolean(existing) });
  } catch (error: any) {
    console.error('[YouCraft] Combine failed:', error);
    return res.status(503).json({ success: false, error: error?.message || 'The combination could not be created.' });
  }
});

router.post('/matches', async (req, res) => {
  try {
    const account = await getAccount(req, res); if (!account) return;
    const profile = await getProfile(account.uid, account.username);
    await saveProfile(profile);
    const matchId = randomBytes(12).toString('hex');
    const code = randomBytes(3).toString('hex').toUpperCase();
    const now = new Date().toISOString();
    const match: MatchRecord = {
      id: matchId, code, status: 'waiting', createdAt: now, updatedAt: now,
      state: createInitialYouCraftBattleState({ uid: account.uid, username: account.username }, profile.discoveries),
    };
    await saveMatch(match);
    return res.json({ success: true, match: { id: match.id, code: match.code, status: match.status, state: match.state } });
  } catch (error: any) {
    console.error('[YouCraft] Match create failed:', error);
    return res.status(500).json({ success: false, error: 'Could not create a match.' });
  }
});

router.post('/matches/join', async (req, res) => {
  try {
    const account = await getAccount(req, res); if (!account) return;
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!/^[A-F0-9]{6}$/.test(code)) return res.status(400).json({ success: false, error: 'Enter the six-character match code.' });
    const profile = await getProfile(account.uid, account.username);
    await saveProfile(profile);
    const savedMatch: { value: MatchRecord | null } = { value: null };
    await mutateMap<MatchRecord>(MATCH_KEY, (current) => {
      const match = Object.values(current).find((entry) => entry.code === code && entry.status === 'waiting');
      if (!match) throw new Error('No waiting match was found for that code.');
      if (match.state.players.some((player) => player.uid === account.uid)) throw new Error('You are already in this match.');
      const nextMatch: MatchRecord = { ...match, status: 'active', updatedAt: new Date().toISOString(), state: joinYouCraftBattleState(match.state, { uid: account.uid, username: account.username }, profile.discoveries) };
      savedMatch.value = nextMatch;
      return { ...current, [match.id]: nextMatch };
    });
    const updated = savedMatch.value!;
    return res.json({ success: true, match: { id: updated.id, code: updated.code, status: updated.status, state: updated.state } });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error?.message || 'Could not join that match.' });
  }
});

router.get('/matches/:id', async (req, res) => {
  try {
    const account = await getAccount(req, res); if (!account) return;
    const matches = await getPersistentSettingDb<Record<string, MatchRecord>>(MATCH_KEY) || {};
    const match = matches[req.params.id];
    if (!match || !match.state.players.some((player) => player.uid === account.uid) && !account.isAdmin) return res.status(404).json({ success: false, error: 'Match not found.' });
    return res.json({ success: true, match: { id: match.id, code: match.code, status: match.status, state: match.state } });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Could not load this match.' });
  }
});

router.post('/matches/:id/action', async (req, res) => {
  try {
    const account = await getAccount(req, res); if (!account) return;
    const action = String(req.body?.action || '') as YouCraftAction;
    if (!['strike', 'guard', 'charge'].includes(action)) return res.status(400).json({ success: false, error: 'Choose a valid battle action.' });
    const savedMatch: { value: MatchRecord | null } = { value: null };
    await mutateMap<MatchRecord>(MATCH_KEY, (current) => {
      const match = current[req.params.id];
      if (!match || !match.state.players.some((player) => player.uid === account.uid)) throw new Error('Match not found.');
      const state = applyYouCraftAction(match.state, account.uid, action, String(req.body?.itemId || ''));
      const nextMatch: MatchRecord = { ...match, state, status: state.winnerUid ? 'finished' : 'active', updatedAt: new Date().toISOString() };
      savedMatch.value = nextMatch;
      return { ...current, [match.id]: nextMatch };
    });
    const updated = savedMatch.value!;
    return res.json({ success: true, match: { id: updated.id, code: updated.code, status: updated.status, state: updated.state } });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error?.message || 'That move could not be played.' });
  }
});

router.get('/admin/overview', async (req, res) => {
  if (!isAdminReq(req)) return res.status(403).json({ success: false, error: 'Administrators only.' });
  try {
    const [profiles, matches] = await Promise.all([
      getPersistentSettingDb<Record<string, Profile>>(PROFILE_KEY),
      getPersistentSettingDb<Record<string, MatchRecord>>(MATCH_KEY),
    ]);
    return res.json({
      success: true,
      players: Object.values(profiles || {}).map((profile) => ({ uid: profile.uid, username: profile.username, discoveryCount: profile.discoveries.length, combinations: profile.combinations, updatedAt: profile.updatedAt })),
      matches: Object.values(matches || {}).map((match) => ({ id: match.id, code: match.code, status: match.status, players: match.state.players.map((player) => player.username), turnNumber: match.state.turnNumber, winnerUid: match.state.winnerUid, updatedAt: match.updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50),
    });
  } catch (error) {
    console.error('[YouCraft] Admin overview failed:', error);
    return res.status(500).json({ success: false, error: 'Could not load YouCraft activity.' });
  }
});

export default router;
