import express, { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
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
  normalizeYouCraftItem,
  createInitialYouCraftBattleState,
  joinYouCraftBattleState,
  applyYouCraftAction,
  type YouCraftItem,
  type YouCraftBattleState,
  type YouCraftAction,
} from './youcraft.ts';

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
  return typeof value === 'string' ? value.replace(/[<>\\u0000-\\u001f]/g, '').replace(/\\s+/g, ' ').trim().slice(0, 32) : '';
}

async function generateDiscovery(first: YouCraftItem, second: YouCraftItem, recipeKey: string): Promise<YouCraftItem> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error('AI crafting is temporarily unavailable. The server AI key is not configured.');
  const ai = new GoogleGenAI({ apiKey });
  const prompt = [
    'You are the item-combination engine for an original family-friendly discovery game called YouCraft.',
    'Combine the two inputs into one surprising, logical, memorable new discovery. Use wordplay or lateral connections when sensible.',
    'Return only valid JSON with keys: name, emoji, category, description, attack, defense, energyCost, abilityName, abilityDescription.',
    'name must be 1-3 words, description one sentence, category a short noun.',
    'attack and defense must be integers from 1 to 9; energyCost must be 1 to 3.',
    'Make the stats total between 9 and 13; high attack should usually mean lower defense, and vice versa.',
    'Give every result a distinct strategic ability description. Do not copy an existing franchise character or protected fictional universe.',
    'Input A: ' + JSON.stringify(first.name + ' — ' + first.description),
    'Input B: ' + JSON.stringify(second.name + ' — ' + second.description),
  ].join('\\n');
  let lastError: any;
  for (const model of ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite']) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.85, maxOutputTokens: 260 },
      });
      const raw = String(response.text || '').trim().replace(/^\`\`\`json\\s*/i, '').replace(/^\`\`\`/, '').replace(/\`\`\`$/, '');
      const parsed = JSON.parse(raw);
      return normalizeYouCraftItem(parsed, recipeKey);
    } catch (error: any) {
      lastError = error;
      const status = Number(error?.status || error?.statusCode || 0);
      if (![429, 500, 502, 503, 504].includes(status) && !/unavailable|overloaded|rate.?limit/i.test(String(error?.message || ''))) break;
    }
  }
  console.error('[YouCraft] Discovery generation failed:', lastError?.message || lastError);
  throw new Error('The discovery AI could not create this combination right now. Your items were not used.');
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
    if (!a || !b || a.toLowerCase() === b.toLowerCase()) return res.status(400).json({ success: false, error: 'Choose two different items.' });
    const profile = await getProfile(account.uid, account.username);
    const first = profile.discoveries.find((item) => item.id === a);
    const second = profile.discoveries.find((item) => item.id === b);
    if (!first || !second) return res.status(400).json({ success: false, error: 'You can only combine items in your own collection.' });
    if (profile.discoveries.length >= 250) return res.status(409).json({ success: false, error: 'Your discovery collection is full. Remove or archive some items first.' });
    const recipe = canonicalYouCraftRecipe(first.name, second.name);
    const existingRecipes = await getPersistentSettingDb<Record<string, RecipeRecord>>(RECIPE_KEY) || {};
    const existing = existingRecipes[recipe.key];
    let item = existing?.item;
    if (!item) item = await generateDiscovery(first, second, recipe.key);
    if (profile.discoveries.some((entry) => entry.id === item!.id)) {
      return res.status(409).json({ success: false, error: 'You already discovered this combination. Try a different pair.' });
    }
    if (!existing) {
      await mutateMap<RecipeRecord>(RECIPE_KEY, (recipes) => recipes[recipe.key] ? recipes : ({
        ...recipes,
        [recipe.key]: { key: recipe.key, inputA: recipe.inputA, inputB: recipe.inputB, item: item!, createdAt: new Date().toISOString() },
      }));
    }
    const updated: Profile = { ...profile, discoveries: [...profile.discoveries, item], combinations: profile.combinations + 1, updatedAt: new Date().toISOString() };
    await saveProfile(updated);
    combineAttempts.set(account.uid, [...recent, now]);
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
    const matches = await getPersistentSettingDb<Record<string, MatchRecord>>(MATCH_KEY) || {};
    const match = Object.values(matches).find((entry) => entry.code === code && entry.status === 'waiting');
    if (!match) return res.status(404).json({ success: false, error: 'No waiting match was found for that code.' });
    if (match.state.players.some((player) => player.uid === account.uid)) return res.status(409).json({ success: false, error: 'You are already in this match.' });
    const profile = await getProfile(account.uid, account.username);
    await saveProfile(profile);
    const updated = { ...match, status: 'active' as const, updatedAt: new Date().toISOString(), state: joinYouCraftBattleState(match.state, { uid: account.uid, username: account.username }, profile.discoveries) };
    await saveMatch(updated);
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
    const matches = await getPersistentSettingDb<Record<string, MatchRecord>>(MATCH_KEY) || {};
    const match = matches[req.params.id];
    if (!match || !match.state.players.some((player) => player.uid === account.uid)) return res.status(404).json({ success: false, error: 'Match not found.' });
    const state = applyYouCraftAction(match.state, account.uid, action, String(req.body?.itemId || ''));
    const updated: MatchRecord = { ...match, state, status: state.winnerUid ? 'finished' : 'active', updatedAt: new Date().toISOString() };
    await saveMatch(updated);
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
      players: Object.values(profiles || {}).map((profile) => ({ uid: profile.uid, discoveryCount: profile.discoveries.length, combinations: profile.combinations, updatedAt: profile.updatedAt })),
      matches: Object.values(matches || {}).map((match) => ({ id: match.id, code: match.code, status: match.status, players: match.state.players.map((player) => player.username), turnNumber: match.state.turnNumber, winnerUid: match.state.winnerUid, updatedAt: match.updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50),
    });
  } catch (error) {
    console.error('[YouCraft] Admin overview failed:', error);
    return res.status(500).json({ success: false, error: 'Could not load YouCraft activity.' });
  }
});

export default router;
