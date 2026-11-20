import express, { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { CROSSY_ROAD_ROOM_CODE_ALPHABET, isValidCrossyRoadRoomCode } from '../services/crossyRoadRoomCode.ts';
import { getPersistentSettingDb, ensurePersistentSettingDb, compareAndSetPersistentSettingDb } from '../db/queries.ts';
import { getUserByUid } from '../db/queries.ts';
import { getAuthUser } from '../services/auth.ts';

type Player = { uid: string; username: string; checkpoint: number; lives: number; row: number; col: number; status: 'playing' | 'eliminated' | 'finished'; joinedAt: string; finishedAt?: string | null };
type Room = { id: string; code: string; hostUid: string; status: 'waiting' | 'active' | 'finished'; createdAt: string; updatedAt: string; players: Player[]; winnerUid: string | null };
type RaceResult = { id: string; userId: string; username: string; checkpoint: number; completed: boolean; playedAt: string; roomCode: string };
const ROOM_KEY = 'crossy_road_race_rooms_v1';
const LEADERBOARD_KEY = 'crossy_road_race_leaderboard_v1';
const router = express.Router();

function makeUniqueRoomCode(rooms: Record<string, Room>): string {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const bytes = randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i += 1) code += CROSSY_ROAD_ROOM_CODE_ALPHABET[bytes[i] % CROSSY_ROAD_ROOM_CODE_ALPHABET.length];
    if (!Object.values(rooms).some((room) => room.code === code && room.status !== 'finished')) return code;
  }
  throw new Error('Could not create a unique room code. Please try again.');
}

router.use(async (_req, res, next) => {
  try {
    const catalog = await getPersistentSettingDb<any[]>('arcade_game_catalog_v1');
    const configured = Array.isArray(catalog) ? catalog.find((item) => item?.id === 'crossy-road') : null;
    if (configured && configured.enabled !== true) return res.status(403).json({ success: false, error: 'Crossy Road is currently unavailable in the Arcade.' });
    next();
  } catch {
    return res.status(503).json({ success: false, error: 'Arcade availability could not be checked.' });
  }
});

async function account(req: Request, res: Response) {
  const auth = getAuthUser(req);
  if (!auth) { res.status(401).json({ success: false, error: 'Sign in to race.' }); return null; }
  const user = await getUserByUid(auth.uid);
  if (!user || (user.role !== 'admin' && (!user.isApproved || user.isSuspended || user.isLocked))) {
    res.status(403).json({ success: false, error: 'This account cannot access Crossy Road.' }); return null;
  }
  return { uid: user.uid, username: user.username };
}
async function mutate<T>(key: string, update: (current: Record<string, T>) => Record<string, T>) {
  await ensurePersistentSettingDb(key, {});
  for (let i = 0; i < 12; i++) {
    const before = await getPersistentSettingDb<Record<string, T>>(key);
    const next = update(before && typeof before === 'object' ? before : {});
    if (await compareAndSetPersistentSettingDb(key, before, next)) return next;
  }
  throw new Error('Race data changed repeatedly. Try again.');
}
function publicRoom(room: Room, viewerUid: string) {
  return { id: room.id, code: room.code, isHost: room.hostUid === viewerUid, status: room.status, winnerName: room.players.find(p => p.uid === room.winnerUid)?.username || null,
    players: room.players.map(({ uid, username, checkpoint, lives, row, col, status, finishedAt }) => ({ id: username, username, checkpoint, lives, row, col, status, finishedAt, isMe: uid === viewerUid, isHost: uid === room.hostUid })),
    checkpoints: 5, livesPerCheckpoint: 3, checkpointRows: [25, 50, 75, 100, 125] };
}
async function addResult(room: Room) {
  const results = await getPersistentSettingDb<RaceResult[]>(LEADERBOARD_KEY) || [];
  const existing = Array.isArray(results) ? results : [];
  const next = [...existing, ...room.players.map(p => ({
    id: room.id + ':' + p.uid, userId: p.uid, username: p.username, checkpoint: p.checkpoint, completed: p.status === 'finished',
    playedAt: p.finishedAt || new Date().toISOString(), roomCode: room.code
  }))];
  await ensurePersistentSettingDb(LEADERBOARD_KEY, []);
  // A compare-and-set avoids overwriting another room's results.
  for (let i = 0; i < 10; i++) {
    const before = await getPersistentSettingDb<RaceResult[]>(LEADERBOARD_KEY) || [];
    const current = Array.isArray(before) ? before : [];
    const merged = [...current.filter(x => !next.some(n => n.id === x.id)), ...next].slice(-500);
    if (await compareAndSetPersistentSettingDb(LEADERBOARD_KEY, before, merged)) return;
  }
}
router.post('/rooms', async (req, res) => {
  try {
    const player = await account(req, res); if (!player) return;
    const id = randomBytes(12).toString('hex');
    let createdRoom: Room | null = null;
    const savedRooms = await mutate<Room>(ROOM_KEY, rooms => {
      const code = makeUniqueRoomCode(rooms);
      const now = new Date().toISOString();
      const room: Room = { id, code, hostUid: player.uid, status: 'waiting', createdAt: now, updatedAt: now, winnerUid: null,
        players: [{ ...player, checkpoint: 0, lives: 3, row: 0, col: 0, status: 'playing', joinedAt: now }] };
      createdRoom = room;
      return { ...rooms, [id]: room };
    });
    const room = savedRooms[id] || createdRoom!;
    return res.json({ success: true, room: publicRoom(room, player.uid) });
  } catch (e: any) { return res.status(503).json({ success: false, error: e.message || 'Could not create a race.' }); }
});
router.post('/rooms/join', async (req, res) => {
  try {
    const player = await account(req, res); if (!player) return;
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!isValidCrossyRoadRoomCode(code)) return res.status(400).json({ success: false, error: 'Enter the six-character game code.' });
    let joined: Room | null = null;
    await mutate<Room>(ROOM_KEY, rooms => {
      const room = Object.values(rooms).find(r => r.code === code && r.status === 'waiting');
      if (!room) throw new Error('No waiting race was found for that code.');
      if (room.players.some(p => p.uid === player.uid)) { joined = room; return rooms; }
      if (room.players.length >= 8) throw new Error('This race is full (maximum 8 players).');
      joined = { ...room, players: [...room.players, { ...player, checkpoint: 0, lives: 3, row: 0, col: 0, status: 'playing', joinedAt: new Date().toISOString() }], updatedAt: new Date().toISOString() };
      return { ...rooms, [room.id]: joined };
    });
    return res.json({ success: true, room: publicRoom(joined!, player.uid) });
  } catch (e: any) { return res.status(400).json({ success: false, error: e.message || 'Could not join that race.' }); }
});
router.post('/rooms/:id/start', async (req, res) => {
  try {
    const player = await account(req, res); if (!player) return;
    let updated: Room | null = null;
    await mutate<Room>(ROOM_KEY, rooms => {
      const room = rooms[req.params.id];
      if (!room || room.hostUid !== player.uid) throw new Error('Only the race host can start this game.');
      if (room.status !== 'waiting' || room.players.length < 2) throw new Error('At least two players must join before the race starts.');
      updated = { ...room, status: 'active', updatedAt: new Date().toISOString() };
      return { ...rooms, [room.id]: updated };
    });
    return res.json({ success: true, room: publicRoom(updated!, player.uid) });
  } catch (e: any) { return res.status(400).json({ success: false, error: e.message || 'Could not start the race.' }); }
});
router.post('/rooms/:id/end', async (req, res) => {
  try {
    const player = await account(req, res); if (!player) return;
    let ended: Room | null = null;
    await mutate<Room>(ROOM_KEY, rooms => {
      const room = rooms[req.params.id];
      if (!room || !room.players.some(p => p.uid === player.uid)) throw new Error('Race not found.');
      if (room.hostUid !== player.uid) throw new Error('Only the race host can end this game.');
      if (room.status === 'finished') { ended = room; return rooms; }
      ended = { ...room, status: 'finished', updatedAt: new Date().toISOString() };
      return { ...rooms, [room.id]: ended };
    });
    if (ended) await addResult(ended);
    return res.json({ success: true, room: publicRoom(ended!, player.uid) });
  } catch (e: any) { return res.status(400).json({ success: false, error: e.message || 'Could not end this race.' }); }
});
router.get('/rooms/:id', async (req, res) => {
  try {
    const player = await account(req, res); if (!player) return;
    const rooms = await getPersistentSettingDb<Record<string, Room>>(ROOM_KEY) || {};
    const room = rooms[req.params.id];
    if (!room || !room.players.some(p => p.uid === player.uid)) return res.status(404).json({ success: false, error: 'Race not found.' });
    return res.json({ success: true, room: publicRoom(room, player.uid) });
  } catch { return res.status(500).json({ success: false, error: 'Could not load race status.' }); }
});
router.post('/rooms/:id/progress', async (req, res) => {
  try {
    const player = await account(req, res); if (!player) return;
    const row = Number(req.body?.row);
    const rawCol = req.body?.col;
    const col = rawCol === undefined ? null : Number(rawCol);
    if (!Number.isSafeInteger(row) || row < 0 || row > 10000) return res.status(400).json({ success: false, error: 'Invalid race progress.' });
    if (col !== null && (!Number.isSafeInteger(col) || col < -7 || col > 7)) return res.status(400).json({ success: false, error: 'Invalid racer lane.' });
    const savedRooms = await mutate<Room>(ROOM_KEY, rooms => {
      const room = rooms[req.params.id];
      if (!room || room.status !== 'active') throw new Error('This race is not active.');
      const idx = room.players.findIndex(p => p.uid === player.uid);
      if (idx < 0 || room.players[idx].status !== 'playing') throw new Error('You are not an active player in this race.');
      const players = [...room.players];
      const current = players[idx];
      // One legitimate forward hop is recorded per event; the iframe sends every row change.
      const acceptedRow = Math.min(Math.max(current.row, row), current.row + 1);
      const checkpoint = Math.max(current.checkpoint, Math.min(5, Math.floor(acceptedRow / 25)));
      players[idx] = { ...current, row: acceptedRow, ...(col !== null ? { col } : {}), checkpoint, lives: checkpoint > current.checkpoint ? 3 : current.lives, ...(checkpoint >= 5 ? { status: 'finished', finishedAt: new Date().toISOString() } : {}) };
      const winnerUid = checkpoint >= 5 && !room.winnerUid ? player.uid : room.winnerUid;
      const updatedRoom: Room = { ...room, players, winnerUid, status: winnerUid ? 'finished' : room.status, updatedAt: new Date().toISOString() };
      return { ...rooms, [room.id]: updatedRoom };
    });
    const updated = savedRooms[req.params.id];
    if (!updated) throw new Error('Race not found.');
    if (updated.status === 'finished') await addResult(updated);
    return res.json({ success: true, room: publicRoom(updated, player.uid) });
  } catch (e: any) { return res.status(400).json({ success: false, error: e.message || 'Could not save race progress.' }); }
});
router.post('/rooms/:id/death', async (req, res) => {
  try {
    const player = await account(req, res); if (!player) return;
    const savedRooms = await mutate<Room>(ROOM_KEY, rooms => {
      const room = rooms[req.params.id];
      if (!room || room.status !== 'active') throw new Error('This race is not active.');
      const idx = room.players.findIndex(p => p.uid === player.uid);
      if (idx < 0 || room.players[idx].status !== 'playing') throw new Error('You are not an active player.');
      const players = [...room.players]; const current = players[idx];
      // Death consumes a life at the checkpoint already confirmed by server-side progress.
      const checkpoint = current.checkpoint;
      const lives = Math.max(0, current.lives - 1);
      const checkpointRow = checkpoint * 25;
      const eliminated = lives === 0;
      players[idx] = { ...current, checkpoint, lives, row: checkpointRow, status: eliminated ? 'eliminated' : 'playing', ...(eliminated ? { finishedAt: new Date().toISOString() } : {}) };
      const stillPlaying = players.some(p => p.status === 'playing');
      const updatedRoom: Room = { ...room, players, status: stillPlaying ? room.status : 'finished', updatedAt: new Date().toISOString() };
      return { ...rooms, [room.id]: updatedRoom };
    });
    const updated = savedRooms[req.params.id];
    if (!updated) throw new Error('Race not found.');
    if (updated.status === 'finished') await addResult(updated);
    const savedPlayer = updated.players.find(p => p.uid === player.uid);
    const lives = savedPlayer?.lives || 0;
    const checkpointRow = (savedPlayer?.checkpoint || 0) * 25;
    const eliminated = savedPlayer?.status === 'eliminated';
    const respawn = !eliminated && savedPlayer?.status === 'playing';
    return res.json({ success: true, respawn, eliminated, lives, checkpointRow, room: publicRoom(updated, player.uid) });
  } catch (e: any) { return res.status(400).json({ success: false, error: e.message || 'Could not record that life.' }); }
});
router.get('/leaderboard', async (req, res) => {
  try {
    const player = await account(req, res); if (!player) return;
    const entries = await getPersistentSettingDb<RaceResult[]>(LEADERBOARD_KEY) || [];
    const totals = new Map<string, { username: string; wins: number; bestCheckpoint: number; races: number }>();
    for (const entry of Array.isArray(entries) ? entries : []) {
      const current = totals.get(entry.userId) || { username: entry.username, wins: 0, bestCheckpoint: 0, races: 0 };
      current.races += 1; current.bestCheckpoint = Math.max(current.bestCheckpoint, entry.checkpoint); if (entry.completed) current.wins += 1;
      totals.set(entry.userId, current);
    }
    const leaderboard = [...totals.values()].sort((a, b) => b.wins - a.wins || b.bestCheckpoint - a.bestCheckpoint || a.username.localeCompare(b.username)).slice(0, 25);
    return res.json({ success: true, leaderboard });
  } catch { return res.status(500).json({ success: false, error: 'Could not load race leaderboard.' }); }
});
export default router;
