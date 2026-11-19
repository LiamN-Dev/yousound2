import express, { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import {
  getPersistentSettingDb,
  ensurePersistentSettingDb,
  compareAndSetPersistentSettingDb,
  getUserByUid,
} from '../db/queries.ts';
import { getAuthUser } from '../services/auth.ts';
import {
  findInfiniteCraftRecipe,
  infiniteCraftRecipeKey,
  listInfiniteCraftRecipes,
  normalizeCraftName,
} from '../services/infiniteCraft.ts';

type CraftProfile = {
  uid: string;
  username: string;
  score: number;
  discoveries: string[];
  recipes: string[];
  combinations: number;
  raceWins: number;
  updatedAt: string;
};
type CraftRoomPlayer = {
  uid: string;
  username: string;
  score: number;
  discoveries: string[];
  recipes: string[];
  joinedAt: string;
};
type CraftDiscovery = {
  id: string;
  recipeKey: string;
  name: string;
  emoji: string;
  by: string;
  points: number;
  firstDiscovery: boolean;
  createdAt: string;
};
type CraftRoom = {
  id: string;
  code: string;
  hostUid: string;
  status: 'waiting' | 'active' | 'finished';
  mode: 'coop' | 'race';
  raceTarget: string;
  winnerUid: string | null;
  winnerName: string | null;
  players: CraftRoomPlayer[];
  discoveries: CraftDiscovery[];
  createdAt: string;
  updatedAt: string;
};
type SeenRecipe = { result: string; emoji: string; firstUserId: string; firstUsername: string; createdAt: string };
type CraftStore = {
  rooms: Record<string, CraftRoom>;
  profiles: Record<string, CraftProfile>;
  seenRecipes: Record<string, SeenRecipe>;
};
type Account = { uid: string; username: string; isAdmin: boolean };

const STORE_KEY = 'infinite_craft_store_v1';
const router = express.Router();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const attempts = new Map<string, number[]>();

function emptyStore(): CraftStore {
  return { rooms: {}, profiles: {}, seenRecipes: {} };
}

async function getAccount(req: Request, res: Response): Promise<Account | null> {
  const auth = getAuthUser(req);
  if (!auth) {
    res.status(401).json({ success: false, error: 'Sign in to play Infinite Craft.' });
    return null;
  }
  const user = await getUserByUid(auth.uid);
  if (!user || (user.role !== 'admin' && (!user.isApproved || user.isSuspended || user.isLocked))) {
    res.status(403).json({ success: false, error: 'This account is not currently allowed to use games.' });
    return null;
  }
  return { uid: user.uid, username: user.username, isAdmin: user.role === 'admin' };
}

router.use(async (_req, res, next) => {
  try {
    const catalog = await getPersistentSettingDb<any[]>('arcade_game_catalog_v1');
    const configured = Array.isArray(catalog) ? catalog.find((item) => item?.id === 'infinite-craft') : null;
    if (configured && configured.enabled !== true) {
      return res.status(403).json({ success: false, error: 'Infinite Craft is currently unavailable in the Arcade.' });
    }
    next();
  } catch {
    return res.status(503).json({ success: false, error: 'Arcade availability could not be checked.' });
  }
});

async function mutateStore(update: (current: CraftStore) => CraftStore): Promise<CraftStore> {
  await ensurePersistentSettingDb(STORE_KEY, emptyStore());
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const before = await getPersistentSettingDb<CraftStore>(STORE_KEY);
    const current = before && typeof before === 'object' ? {
      rooms: before.rooms || {},
      profiles: before.profiles || {},
      seenRecipes: before.seenRecipes || {},
    } : emptyStore();
    const next = update(current);
    if (await compareAndSetPersistentSettingDb(STORE_KEY, before, next)) return next;
  }
  throw new Error('Infinite Craft data changed repeatedly. Please try again.');
}

function getProfile(store: CraftStore, account: Account): CraftProfile {
  return store.profiles[account.uid] || {
    uid: account.uid,
    username: account.username,
    score: 0,
    discoveries: [],
    recipes: [],
    combinations: 0,
    raceWins: 0,
    updatedAt: new Date().toISOString(),
  };
}

function roomCode(rooms: Record<string, CraftRoom>): string {
  for (let tries = 0; tries < 30; tries += 1) {
    let code = '';
    const bytes = randomBytes(6);
    for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (!Object.values(rooms).some((room) => room.code === code && room.status !== 'finished')) return code;
  }
  throw new Error('Could not create a unique room code. Try again.');
}

function publicRoom(room: CraftRoom, viewerUid: string) {
  return {
    id: room.id,
    code: room.code,
    status: room.status,
    mode: room.mode,
    raceTarget: room.raceTarget,
    isHost: room.hostUid === viewerUid,
    winnerName: room.winnerName,
    players: room.players.map((player) => ({
      id: player.username,
      username: player.username,
      score: player.score,
      discoveries: player.discoveries.length,
      isMe: player.uid === viewerUid,
      isHost: player.uid === room.hostUid,
    })),
    discoveries: room.discoveries,
    maxPlayers: 10,
  };
}

function recordCombination(
  store: CraftStore,
  account: Account,
  ingredientA: string,
  ingredientB: string,
  roomId: string | null,
  soloRaceTarget: string,
) {
  const recipe = findInfiniteCraftRecipe(ingredientA, ingredientB);
  if (!recipe) throw new Error('No known discovery for ' + ingredientA + ' + ' + ingredientB + ' yet. Try another combination.');
  const profile = getProfile(store, account);
  const alreadyUsedRecipe = profile.recipes.includes(recipe.key);
  const firstDiscovery = !store.seenRecipes[recipe.key];
  const points = alreadyUsedRecipe ? 0 : firstDiscovery ? 25 : 10;
  const now = new Date().toISOString();

  if (!store.seenRecipes[recipe.key]) {
    store.seenRecipes[recipe.key] = {
      result: recipe.result,
      emoji: recipe.emoji,
      firstUserId: account.uid,
      firstUsername: account.username,
      createdAt: now,
    };
  }

  const nextProfile: CraftProfile = {
    ...profile,
    username: account.username,
    score: profile.score + points,
    discoveries: profile.discoveries.includes(recipe.result) ? profile.discoveries : [...profile.discoveries, recipe.result],
    recipes: alreadyUsedRecipe ? profile.recipes : [...profile.recipes, recipe.key],
    combinations: profile.combinations + (alreadyUsedRecipe ? 0 : 1),
    updatedAt: now,
  };

  let room: CraftRoom | null = null;
  let won = false;
  let winBonus = 0;
  let roomDiscovery: CraftDiscovery | null = null;

  if (roomId) {
    room = store.rooms[roomId] || null;
    if (!room || room.status !== 'active') throw new Error('This room is not currently running.');
    const playerIndex = room.players.findIndex((player) => player.uid === account.uid);
    if (playerIndex < 0) throw new Error('You are not a member of this room.');
    const roomPlayer = room.players[playerIndex];
    if (roomPlayer.recipes.includes(recipe.key)) {
      return { recipe, points: 0, firstDiscovery: false, won: false, room, profile, alreadyDiscovered: true };
    }

    roomDiscovery = {
      id: room.id + ':' + recipe.key,
      recipeKey: recipe.key,
      name: recipe.result,
      emoji: recipe.emoji,
      by: account.username,
      points,
      firstDiscovery,
      createdAt: now,
    };
    const players = [...room.players];
    players[playerIndex] = {
      ...roomPlayer,
      score: roomPlayer.score + points,
      discoveries: roomPlayer.discoveries.includes(recipe.result) ? roomPlayer.discoveries : [...roomPlayer.discoveries, recipe.result],
      recipes: [...roomPlayer.recipes, recipe.key],
    };

    if (room.mode === 'race' && recipe.result.toLocaleLowerCase() === room.raceTarget.toLocaleLowerCase() && !room.winnerUid) {
      won = true;
      winBonus = 100;
      players[playerIndex] = { ...players[playerIndex], score: players[playerIndex].score + winBonus };
      nextProfile.score += winBonus;
      nextProfile.raceWins += 1;
    }

    room = {
      ...room,
      players,
      discoveries: [...room.discoveries, roomDiscovery],
      winnerUid: won ? account.uid : room.winnerUid,
      winnerName: won ? account.username : room.winnerName,
      status: won ? 'finished' : room.status,
      updatedAt: now,
    };
    store.rooms[roomId] = room;
  } else if (soloRaceTarget && recipe.result.toLocaleLowerCase() === soloRaceTarget.toLocaleLowerCase()) {
    won = true;
    winBonus = 100;
    nextProfile.score += winBonus;
    nextProfile.raceWins += 1;
  }

  store.profiles[account.uid] = nextProfile;
  return { recipe, points, firstDiscovery, won, winBonus, room, profile: nextProfile, discovery: roomDiscovery, alreadyDiscovered: alreadyUsedRecipe };
}

router.get('/recipes', (_req, res) => {
  return res.json({ success: true, recipes: listInfiniteCraftRecipes() });
});

router.get('/profile', async (req, res) => {
  try {
    const account = await getAccount(req, res);
    if (!account) return;
    const store = await getPersistentSettingDb<CraftStore>(STORE_KEY) || emptyStore();
    return res.json({ success: true, profile: getProfile(store, account) });
  } catch (error: any) {
    console.error('[Infinite Craft] Profile load failed:', error?.message || error);
    return res.status(500).json({ success: false, error: 'Could not load your Infinite Craft profile.' });
  }
});

router.post('/rooms', async (req, res) => {
  try {
    const account = await getAccount(req, res);
    if (!account) return;
    const id = randomBytes(12).toString('hex');
    let createdRoom: CraftRoom | null = null;
    const store = await mutateStore((current) => {
      const code = roomCode(current.rooms);
      const now = new Date().toISOString();
      const room: CraftRoom = {
        id, code, hostUid: account.uid, status: 'waiting', mode: 'coop', raceTarget: '',
        winnerUid: null, winnerName: null,
        players: [{ uid: account.uid, username: account.username, score: 0, discoveries: [], recipes: [], joinedAt: now }],
        discoveries: [],
        createdAt: now,
        updatedAt: now,
      };
      createdRoom = room;
      return { ...current, rooms: { ...current.rooms, [id]: room } };
    });
    const room = store.rooms[id] || createdRoom!;
    return res.json({ success: true, room: publicRoom(room, account.uid) });
  } catch (error: any) {
    console.error('[Infinite Craft] Room creation failed:', error?.message || error);
    return res.status(503).json({ success: false, error: error?.message || 'Could not create a room.' });
  }
});

router.post('/rooms/join', async (req, res) => {
  try {
    const account = await getAccount(req, res);
    if (!account) return;
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!new RegExp('^[' + CODE_ALPHABET + ']{6}$').test(code)) {
      return res.status(400).json({ success: false, error: 'Enter the six-character room code.' });
    }
    let joinedRoomId = '';
    const store = await mutateStore((current) => {
      const room = Object.values(current.rooms).find((candidate) =>
        candidate.code === code &&
        candidate.status === 'waiting' &&
        Date.now() - new Date(candidate.createdAt).getTime() < ROOM_TTL_MS
      );
      if (!room) throw new Error('No waiting room was found for that code. Check the code or ask the host to make a new room.');
      if (room.players.some((player) => player.uid === account.uid)) {
        joinedRoomId = room.id;
        return current;
      }
      if (room.players.length >= 10) throw new Error('This room is full (maximum 10 players).');
      const now = new Date().toISOString();
      const updatedRoom: CraftRoom = {
        ...room,
        players: [...room.players, { uid: account.uid, username: account.username, score: 0, discoveries: [], recipes: [], joinedAt: now }],
        updatedAt: now,
      };
      joinedRoomId = room.id;
      return { ...current, rooms: { ...current.rooms, [room.id]: updatedRoom } };
    });
    const room = store.rooms[joinedRoomId];
    return res.json({ success: true, room: publicRoom(room, account.uid) });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error?.message || 'Could not join that room.' });
  }
});

router.post('/rooms/:id/start', async (req, res) => {
  try {
    const account = await getAccount(req, res);
    if (!account) return;
    const mode = req.body?.mode === 'race' ? 'race' : 'coop';
    const raceTarget = normalizeCraftName(req.body?.raceTarget);
    let updatedRoomId = '';
    const store = await mutateStore((current) => {
      const room = current.rooms[req.params.id];
      if (!room || room.hostUid !== account.uid) throw new Error('Only the room host can start this game.');
      if (room.status !== 'waiting') throw new Error('This room has already started.');
      if (room.players.length < 2) throw new Error('At least two players must join before the room starts.');
      if (mode === 'race' && !raceTarget) throw new Error('Choose a target before starting a target race.');
      const updatedRoom: CraftRoom = { ...room, status: 'active', mode, raceTarget: mode === 'race' ? raceTarget : '', updatedAt: new Date().toISOString() };
      updatedRoomId = room.id;
      return { ...current, rooms: { ...current.rooms, [room.id]: updatedRoom } };
    });
    return res.json({ success: true, room: publicRoom(store.rooms[updatedRoomId], account.uid) });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error?.message || 'Could not start this room.' });
  }
});

router.get('/rooms/:id', async (req, res) => {
  try {
    const account = await getAccount(req, res);
    if (!account) return;
    const store = await getPersistentSettingDb<CraftStore>(STORE_KEY) || emptyStore();
    const room = store.rooms[req.params.id];
    if (!room || !room.players.some((player) => player.uid === account.uid)) {
      return res.status(404).json({ success: false, error: 'Room not found.' });
    }
    return res.json({ success: true, room: publicRoom(room, account.uid) });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Could not load this room.' });
  }
});

router.post('/discoveries', async (req, res) => {
  try {
    const account = await getAccount(req, res);
    if (!account) return;
    const a = normalizeCraftName(req.body?.ingredientA);
    const b = normalizeCraftName(req.body?.ingredientB);
    if (!a || !b) return res.status(400).json({ success: false, error: 'Choose two ingredients.' });
    const roomId = typeof req.body?.roomId === 'string' ? req.body.roomId.slice(0, 48) : null;
    const soloRaceTarget = roomId ? '' : normalizeCraftName(req.body?.raceTarget);
    const store = await mutateStore((current) => {
      const next: CraftStore = {
        rooms: { ...current.rooms },
        profiles: { ...current.profiles },
        seenRecipes: { ...current.seenRecipes },
      };
      recordCombination(next, account, a, b, roomId, soloRaceTarget);
      return next;
    });
    const recipe = findInfiniteCraftRecipe(a, b);
    if (!recipe) return res.status(422).json({ success: false, error: 'No known recipe for those ingredients yet.' });
    const profile = store.profiles[account.uid] || getProfile(store, account);
    const room = roomId ? store.rooms[roomId] : null;
    const discovery = room?.discoveries.find((item) => item.recipeKey === recipe.key) || null;
    return res.json({
      success: true,
      item: { name: recipe.result, emoji: recipe.emoji },
      profile,
      room: room ? publicRoom(room, account.uid) : null,
      discovery,
      points: discovery?.points ?? 0,
      firstDiscovery: discovery?.firstDiscovery ?? false,
      alreadyDiscovered: profile.recipes.includes(recipe.key) && !discovery,
      won: room ? room.winnerUid === account.uid : false,
    });
  } catch (error: any) {
    const noRecipe = /No known discovery/.test(String(error?.message || ''));
    return res.status(noRecipe ? 422 : 400).json({ success: false, error: error?.message || 'Could not save that discovery.' });
  }
});

router.get('/leaderboard', async (_req, res) => {
  try {
    const store = await getPersistentSettingDb<CraftStore>(STORE_KEY) || emptyStore();
    const leaderboard = Object.values(store.profiles || {}).map((profile) => ({
      username: profile.username,
      score: profile.score,
      discoveries: profile.discoveries.length,
      combinations: profile.combinations,
      raceWins: profile.raceWins,
    })).sort((a, b) =>
      b.score - a.score ||
      b.discoveries - a.discoveries ||
      b.raceWins - a.raceWins ||
      a.username.localeCompare(b.username)
    ).slice(0, 25).map((entry, index) => ({ rank: index + 1, ...entry }));
    return res.json({ success: true, leaderboard });
  } catch (error: any) {
    console.error('[Infinite Craft] Leaderboard failed:', error?.message || error);
    return res.status(500).json({ success: false, error: 'Could not load the Infinite Craft leaderboard.' });
  }
});

export default router;
