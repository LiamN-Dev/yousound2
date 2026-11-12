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
  createInstantYouCraftDiscovery,
  normalizeYouCraftItem,
  createInitialYouCraftBattleState,
  joinYouCraftBattleState,
  applyYouCraftAction,
  type YouCraftItem,
  type YouCraftBattleState,
  type YouCraftAction,
} from '../services/youcraft.ts';

type Profile = { uid: string; username: string; discoveries: YouCraftItem[]; combinations: number; updatedAt: string };
type RecipeRecord = {
  key: string;
  inputA: string;
  inputB: string;
  item: YouCraftItem | null;
  status: 'ready' | 'no_recipe';
  source: 'local' | 'ai';
  createdAt: string;
};
type PlannedPair = {
  id: string;
  first: YouCraftItem;
  second: YouCraftItem;
  key: string;
  inputA: string;
  inputB: string;
};
type PlannerStatus = {
  configured: boolean;
  running: boolean;
  pending: number;
  planned: number;
  lastError: string | null;
  updatedAt: string;
};
type PlannerRuntime = PlannerStatus & { lastAttemptAt: number };

type MatchRecord = { id: string; code: string; status: 'waiting' | 'active' | 'finished'; createdAt: string; updatedAt: string; state: YouCraftBattleState };
const PROFILE_KEY = 'youcraft_profiles_v1';
const RECIPE_KEY = 'youcraft_recipes_v2';
const MATCH_KEY = 'youcraft_matches_v1';
const PLANNER_BATCH_SIZE = 10;
const MAX_CANDIDATES_PER_PROFILE = 24;
const PLANNER_RETRY_COOLDOWN_MS = 45_000;
const router = express.Router();
const combineAttempts = new Map<string, number[]>();
const plannerRuntime = new Map<string, PlannerRuntime>();
const plannerTasks = new Map<string, Promise<void>>();
const recipesInFlight = new Set<string>();

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

function isOldFabricatedFallback(item: YouCraftItem): boolean {
  return item.category === 'Discovery'
    && item.abilityName === 'Fusion'
    && /combine into a brand-new discovery\.$/i.test(item.description || '');
}

async function getProfile(uid: string, username: string): Promise<Profile> {
  const profiles = await getPersistentSettingDb<Record<string, Profile>>(PROFILE_KEY) || {};
  const saved = profiles[uid];
  if (!saved) {
    return { uid, username, discoveries: YOUCRAFT_STARTER_ITEMS.map((item) => ({ ...item })), combinations: 0, updatedAt: new Date().toISOString() };
  }
  const discoveries = (Array.isArray(saved.discoveries) ? saved.discoveries : []).filter((item) => !isOldFabricatedFallback(item));
  const cleaned: Profile = {
    ...saved,
    username: saved.username || username,
    discoveries: discoveries.length ? discoveries : YOUCRAFT_STARTER_ITEMS.map((item) => ({ ...item })),
    combinations: Math.max(0, Number(saved.combinations || 0) - (saved.discoveries.length - discoveries.length)),
  };
  if (cleaned.discoveries.length !== saved.discoveries.length) {
    await mutateMap<Profile>(PROFILE_KEY, (current) => ({ ...current, [uid]: { ...cleaned, updatedAt: new Date().toISOString() } }));
    console.log('[YouCraft] Removed legacy placeholder discoveries from one profile.');
  }
  return cleaned;
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

function plannerApiKey(): string {
  // Deliberately do not fall back to GEMINI_API_KEY: game traffic gets its own project/key/quota.
  return String(process.env.YOUCRAFT_GEMINI_API_KEY || '').trim();
}

function candidatePairs(discoveries: YouCraftItem[]): PlannedPair[] {
  const pairs: PlannedPair[] = [];
  const recentStart = Math.max(0, discoveries.length - 2);
  for (let i = 0; i < discoveries.length; i += 1) {
    for (let j = i + 1; j < discoveries.length; j += 1) {
      if (discoveries.length > 12 && i < recentStart && j < recentStart) continue;
      const first = discoveries[i];
      const second = discoveries[j];
      const recipe = canonicalYouCraftRecipe(first.name, second.name);
      if (createInstantYouCraftDiscovery(first, second, recipe.key)) continue;
      pairs.push({ id: 'p' + pairs.length, first, second, key: recipe.key, inputA: recipe.inputA, inputB: recipe.inputB });
    }
  }
  return pairs;
}

async function getUnplannedPairs(discoveries: YouCraftItem[]): Promise<PlannedPair[]> {
  const [recipes] = await Promise.all([
    getPersistentSettingDb<Record<string, RecipeRecord>>(RECIPE_KEY),
  ]);
  const saved = recipes || {};
  return candidatePairs(discoveries)
    .filter((pair) => !saved[pair.key] && !recipesInFlight.has(pair.key))
    .slice(0, MAX_CANDIDATES_PER_PROFILE);
}

async function getPlannerStatus(uid: string, discoveries: YouCraftItem[]): Promise<PlannerStatus> {
  const runtime = plannerRuntime.get(uid);
  const configured = Boolean(plannerApiKey());
  const pending = configured ? (await getUnplannedPairs(discoveries)).length : 0;
  return {
    configured,
    running: Boolean(runtime?.running),
    pending,
    planned: runtime?.planned || 0,
    lastError: runtime?.lastError || null,
    updatedAt: runtime?.updatedAt || new Date().toISOString(),
  };
}

function validatePlannedRecipe(raw: any, pair: PlannedPair, discoveries: YouCraftItem[]): YouCraftItem | null {
  const name = safeItemName(raw?.name);
  const description = typeof raw?.description === 'string' ? raw.description.replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150) : '';
  const category = safeItemName(raw?.category).slice(0, 18);
  const emoji = typeof raw?.emoji === 'string' ? raw.emoji.trim().slice(0, 8) : '';
  const abilityName = safeItemName(raw?.abilityName).slice(0, 28);
  const abilityDescription = typeof raw?.abilityDescription === 'string'
    ? raw.abilityDescription.replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100)
    : '';
  const validName = /^[\p{L}\p{M}][\p{L}\p{M} '\-]{1,30}$/u.test(name)
    && name.split(/\s+/).length <= 4
    && name.toLowerCase() !== pair.first.name.toLowerCase()
    && name.toLowerCase() !== pair.second.name.toLowerCase()
    && !discoveries.some((item) => item.name.toLowerCase() === name.toLowerCase())
    && Number(raw?.confidence) >= 0.82
    && !/^(unknown|mystery|discovery|fusion|something|anything)$/i.test(name);
  if (!validName || description.length < 16 || !category || !emoji || !abilityName || abilityDescription.length < 10) return null;
  const hash = Number.parseInt(pair.key.slice(0, 8), 16) || 0;
  const attack = 3 + (hash % 6);
  const defense = 12 - attack;
  return normalizeYouCraftItem({
    name, description, category, emoji, abilityName, abilityDescription,
    attack, defense, energyCost: 1 + ((hash >>> 8) % 3),
  }, pair.key);
}

async function requestPlannedBatch(pairs: PlannedPair[], discoveries: YouCraftItem[]): Promise<any[]> {
  const apiKey = plannerApiKey();
  if (!apiKey) throw new Error('YouCraft needs its own API key. Add YOUCRAFT_GEMINI_API_KEY to the production service.');
  const ai = new GoogleGenAI({ apiKey });
  const known = discoveries.map((item) => item.name);
  const prompt = [
    'You design recipes for YouCraft, an Infinite-Craft-style discovery game.',
    'Quality matters more than making a result for every pair.',
    'For each pair, return a real, recognizable thing, material, organism, place, natural phenomenon, tool, food, or established concept that has a clear semantic or real-world connection to both inputs.',
    'Never invent nonsense words, mash two input words together, add arbitrary syllables, or return generic filler.',
    'Do not simply concatenate inputs. Do not use a result identical to either input.',
    'If there is no defensible, recognizable result, return status "no_recipe" for that pair instead of making something up.',
    'Include a confidence number from 0 to 1. Set confidence to at least 0.82 only when the result is a clear, established connection; otherwise return no_recipe.',
    'Prefer established combinations and satisfying lateral connections. Descriptions must explain the actual connection in one factual sentence.',
    'Each successful result needs a short real category, emoji, concise description, and a game ability themed around the result.',
    'Do not create attack, defense, or energy stats; the game assigns balanced stats itself.',
    'Avoid returning any of these already-discovered names unless there is no reasonable alternative: ' + JSON.stringify(known.slice(-60)),
    'Return ONLY strict JSON in this exact shape: {"recipes":[{"id":"p0","status":"ok","confidence":0.94,"name":"...","emoji":"...","category":"...","description":"...","abilityName":"...","abilityDescription":"..."},{"id":"p1","status":"no_recipe"}]}. Include exactly one entry per pair ID.',
    'Pairs to plan: ' + JSON.stringify(pairs.map((pair) => ({
      id: pair.id,
      inputA: { name: pair.first.name, description: pair.first.description },
      inputB: { name: pair.second.name, description: pair.second.description },
    }))),
  ].join('\n');

  const response = await ai.models.generateContent({
    model: process.env.YOUCRAFT_GEMINI_MODEL || 'gemini-3.8-flash',
    contents: prompt,
    config: { responseMimeType: 'application/json', temperature: 0.25, maxOutputTokens: 2200 },
  });
  const raw = String(response.text || '').trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\x60{3}$/i, '');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.recipes)) throw new Error('The recipe planner returned an invalid response.');
  return parsed.recipes;
}

function schedulePlanning(uid: string, profile: Profile): void {
  const apiKey = plannerApiKey();
  const existing = plannerRuntime.get(uid);
  if (!apiKey) {
    plannerRuntime.set(uid, {
      configured: false, running: false, pending: 0, planned: existing?.planned || 0,
      lastError: 'A separate YouCraft API key has not been configured yet.',
      updatedAt: new Date().toISOString(), lastAttemptAt: existing?.lastAttemptAt || 0,
    });
    return;
  }
  if (existing?.running || plannerTasks.has(uid)) return;
  if (existing?.lastError && Date.now() - existing.lastAttemptAt < PLANNER_RETRY_COOLDOWN_MS) return;

  const task = (async () => {
    const startedAt = Date.now();
    const state: PlannerRuntime = {
      configured: true, running: true, pending: 0, planned: existing?.planned || 0,
      lastError: null, updatedAt: new Date().toISOString(), lastAttemptAt: startedAt,
    };
    plannerRuntime.set(uid, state);
    let batch: PlannedPair[] = [];
    try {
      batch = (await getUnplannedPairs(profile.discoveries)).slice(0, PLANNER_BATCH_SIZE);
      state.pending = batch.length;
      if (!batch.length) return;
      batch.forEach((pair) => recipesInFlight.add(pair.key));
      const generated = await requestPlannedBatch(batch, profile.discoveries);
      const byId = new Map<string, any>();
      for (const item of generated) {
        if (typeof item?.id === 'string' && batch.some((pair) => pair.id === item.id)) byId.set(item.id, item);
      }
      const now = new Date().toISOString();
      await mutateMap<RecipeRecord>(RECIPE_KEY, (recipes) => {
        const next = { ...recipes };
        for (const pair of batch) {
          if (next[pair.key]) continue;
          const raw = byId.get(pair.id);
          if (!raw || raw.status === 'no_recipe') {
            next[pair.key] = {
              key: pair.key, inputA: pair.inputA, inputB: pair.inputB,
              item: null, status: 'no_recipe', source: 'ai', createdAt: now,
            };
            continue;
          }
          const item = validatePlannedRecipe(raw, pair, profile.discoveries);
          if (!item) {
            next[pair.key] = {
              key: pair.key, inputA: pair.inputA, inputB: pair.inputB,
              item: null, status: 'no_recipe', source: 'ai', createdAt: now,
            };
            continue;
          }
          next[pair.key] = {
            key: pair.key, inputA: pair.inputA, inputB: pair.inputB,
            item, status: 'ready', source: 'ai', createdAt: now,
          };
        }
        return next;
      });
      state.planned += batch.length;
    } catch (error: any) {
      state.lastError = String(error?.message || 'The YouCraft recipe planner failed.').slice(0, 240);
      console.error('[YouCraft] Recipe planning failed:', state.lastError);
    } finally {
      batch.forEach((pair) => recipesInFlight.delete(pair.key));
      state.running = false;
      state.updatedAt = new Date().toISOString();
      state.pending = (await getUnplannedPairs(profile.discoveries).catch(() => [] as PlannedPair[])).length;
    }
  })();
  plannerTasks.set(uid, task);
  void task.finally(() => {
    if (plannerTasks.get(uid) === task) plannerTasks.delete(uid);
  });
}

router.get('/profile', async (req, res) => {
  try {
    const account = await getAccount(req, res); if (!account) return;
    const profile = await getProfile(account.uid, account.username);
    schedulePlanning(account.uid, profile);
    const planner = await getPlannerStatus(account.uid, profile.discoveries);
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({ success: true, profile, planner });
  } catch (error: any) {
    console.error('[YouCraft] Profile load failed:', error);
    return res.status(500).json({ success: false, error: 'Could not load your discoveries.' });
  }
});

router.get('/planning', async (req, res) => {
  try {
    const account = await getAccount(req, res); if (!account) return;
    const profile = await getProfile(account.uid, account.username);
    schedulePlanning(account.uid, profile);
    const planner = await getPlannerStatus(account.uid, profile.discoveries);
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({ success: true, planner });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Could not read the recipe planner status.' });
  }
});

router.get('/recipe-status', async (req, res) => {
  try {
    const account = await getAccount(req, res); if (!account) return;
    const itemA = safeItemName(req.query.itemA);
    const itemB = safeItemName(req.query.itemB);
    const profile = await getProfile(account.uid, account.username);
    const first = profile.discoveries.find((item) => item.id === itemA);
    const second = profile.discoveries.find((item) => item.id === itemB);
    if (!first || !second) return res.status(400).json({ success: false, error: 'Those ingredients are not in your collection.' });
    const recipe = canonicalYouCraftRecipe(first.name, second.name);
    const recipes = await getPersistentSettingDb<Record<string, RecipeRecord>>(RECIPE_KEY) || {};
    const saved = recipes[recipe.key];
    if (saved?.status === 'ready' && saved.item) return res.json({ success: true, status: 'ready', planner: await getPlannerStatus(account.uid, profile.discoveries) });
    if (saved?.status === 'no_recipe') return res.json({ success: true, status: 'no_recipe', planner: await getPlannerStatus(account.uid, profile.discoveries) });
    schedulePlanning(account.uid, profile);
    const planner = await getPlannerStatus(account.uid, profile.discoveries);
    return res.json({ success: true, status: planner.configured ? (planner.running ? 'planning' : 'queued') : 'needs_api_key', planner });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Could not check that recipe yet.' });
  }
});

router.post('/combine', async (req, res) => {
  try {
    const account = await getAccount(req, res); if (!account) return;
    const a = safeItemName(req.body?.itemA);
    const b = safeItemName(req.body?.itemB);
    if (!a || !b) return res.status(400).json({ success: false, error: 'Choose two items.' });
    const profile = await getProfile(account.uid, account.username);
    const first = profile.discoveries.find((item) => item.id === a);
    const second = profile.discoveries.find((item) => item.id === b);
    if (!first || !second) return res.status(400).json({ success: false, error: 'You can only combine items in your own collection.' });
    if (profile.discoveries.length >= 250) return res.status(409).json({ success: false, error: 'Your discovery collection is full. Remove or archive some items first.' });

    const recipe = canonicalYouCraftRecipe(first.name, second.name);
    const existingRecipes = await getPersistentSettingDb<Record<string, RecipeRecord>>(RECIPE_KEY) || {};
    const existing = existingRecipes[recipe.key];
    let item = existing?.item || null;
    let source: 'local' | 'ai' = existing?.source || 'ai';
    if (existing?.status === 'no_recipe') {
      return res.status(409).json({ success: false, error: 'The recipe planner could not find a clear, meaningful result for those two items. Try another pair.' });
    }
    if (!item && !existing) {
      item = createInstantYouCraftDiscovery(first, second, recipe.key);
      if (item) {
        source = 'local';
      } else {
        schedulePlanning(account.uid, profile);
        return res.status(202).json({ success: true, pending: true, message: 'The AI is preparing a real recipe for this pair.' });
      }
    }
    if (!item) return res.status(503).json({ success: false, error: 'That recipe is not ready yet. The AI planner will retry shortly.' });

    const now = Date.now();
    const recent = (combineAttempts.get(account.uid) || []).filter((stamp) => now - stamp < 60_000);
    if (recent.length >= 12) return res.status(429).json({ success: false, error: 'Slow down for a moment before combining more items.' });
    combineAttempts.set(account.uid, [...recent, now]);

    // Only one canonical result wins globally for a recipe, even if two users combine it simultaneously.
    const canonicalRecipes = await mutateMap<RecipeRecord>(RECIPE_KEY, (recipes) => recipes[recipe.key] ? recipes : ({
      ...recipes,
      [recipe.key]: {
        key: recipe.key, inputA: recipe.inputA, inputB: recipe.inputB,
        item: item!, status: 'ready', source, createdAt: new Date().toISOString(),
      },
    }));
    const canonical = canonicalRecipes[recipe.key];
    if (canonical.status === 'no_recipe' || !canonical.item) {
      return res.status(409).json({ success: false, error: 'The recipe planner could not find a clear, meaningful result for those two items.' });
    }
    item = canonical.item;

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
    if (!updated) return res.status(500).json({ success: false, error: 'Could not save that discovery.' });
    if (updated.discoveries.some((entry) => entry.id === item!.id) && updated.discoveries.length === profile.discoveries.length) {
      return res.status(409).json({ success: false, error: 'You already discovered that result.' });
    }
    schedulePlanning(account.uid, updated);
    return res.json({ success: true, item, profile: updated, reusedRecipe: Boolean(existing), planner: await getPlannerStatus(account.uid, updated.discoveries) });
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
