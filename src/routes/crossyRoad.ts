import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { checkSqlAvailability, createPool } from '../db/index.ts';
import { getPersistentSettingDb } from '../db/queries.ts';
import { canAccessCrossyRoad, isPlausibleCrossyRoadScore, resolveCrossyRoadHost } from '../services/crossyRoadPolicy.ts';
import { CROSSY_ROAD_FINISH_RUN_SQL } from '../services/crossyRoadSql.ts';
import { getCrossyCosmetic, CROSSY_BIRD_SKINS, CROSSY_MAPS } from '../services/crossyRoadCatalog.ts';

const router = Router();

router.use(async (_req: any, res, next) => {
  try {
    const catalog = await getPersistentSettingDb<any[]>('arcade_game_catalog_v1');
    const configured = Array.isArray(catalog) ? catalog.find((item) => item?.id === 'crossy-road') : null;
    if (configured && configured.enabled !== true) return res.status(403).json({ success: false, error: 'Crossy Road is currently unavailable in the Arcade.' });
    if (await getPersistentSettingDb<boolean>('arcade_maintenance_v1')) return res.status(503).json({ success: false, error: 'The Arcade is under maintenance.' });
    next();
  } catch {
    return res.status(503).json({ success: false, error: 'Arcade availability could not be checked.' });
  }
});

router.use((req: any, res, next) => {
  const user = req.authUser;
  if (!canAccessCrossyRoad(user)) {
    return res.status(user ? 403 : 401).json({
      success: false,
      error: 'Crossy Road is available to approved, active members. Sign in with an eligible account.',
    });
  }
  next();
});

router.get('/host', (_req, res) => {
  const config = resolveCrossyRoadHost(
    process.env.GOOGLE_CROSSY_ROAD_URL || process.env.VITE_GOOGLE_CROSSY_ROAD_URL
  );
  return res.json({ success: true, ...config });
});

let schemaReady: Promise<void> | null = null;

async function ensureCrossySchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      if (!(await checkSqlAvailability())) throw new Error('The persistent game database is unavailable.');
      const pool = createPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS crossy_road_stats (
          user_id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          coins BIGINT NOT NULL DEFAULT 0,
          high_score INTEGER NOT NULL DEFAULT 0,
          total_games INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS crossy_road_runs (
          id UUID PRIMARY KEY,
          user_id TEXT NOT NULL,
          username TEXT NOT NULL,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ,
          score INTEGER,
          coins_awarded INTEGER
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS idx_crossy_road_leaderboard ON crossy_road_stats(high_score DESC, updated_at ASC)');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS crossy_road_inventory (
          user_id TEXT NOT NULL,
          category TEXT NOT NULL CHECK (category IN ('bird', 'map')),
          item_id TEXT NOT NULL,
          purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, category, item_id)
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS crossy_road_loadout (
          user_id TEXT PRIMARY KEY,
          bird_skin_id TEXT NOT NULL DEFAULT 'classic',
          map_id TEXT NOT NULL DEFAULT 'classic',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        INSERT INTO crossy_road_inventory (user_id, category, item_id)
        SELECT user_id, 'bird', 'classic' FROM crossy_road_stats
        ON CONFLICT DO NOTHING
      `);
      await pool.query(`
        INSERT INTO crossy_road_inventory (user_id, category, item_id)
        SELECT user_id, 'map', 'classic' FROM crossy_road_stats
        ON CONFLICT DO NOTHING
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function identity(req: any) {
  const user = req.authUser;
  if (!user?.uid || !user?.username) return null;
  return { uid: String(user.uid), username: String(user.username) };
}

router.get('/stats', async (req, res) => {
  try {
    const user = identity(req);
    if (!user) return res.status(401).json({ success: false, error: 'Please sign in again.' });
    await ensureCrossySchema();
    const pool = createPool();
    await pool.query(
      'INSERT INTO crossy_road_stats (user_id, username) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username',
      [user.uid, user.username]
    );
    const result = await pool.query(
      'SELECT coins, high_score, total_games FROM crossy_road_stats WHERE user_id = $1',
      [user.uid]
    );
    const row = result.rows[0];
    return res.json({ success: true, coins: Number(row.coins || 0), highScore: Number(row.high_score || 0), totalGames: Number(row.total_games || 0) });
  } catch (error: any) {
    console.error('[Crossy Road] Stats failed:', error?.message || error);
    return res.status(503).json({ success: false, error: 'Crossy Road account data is temporarily unavailable.' });
  }
});

router.get('/leaderboard', async (_req, res) => {
  try {
    await ensureCrossySchema();
    const result = await createPool().query(
      'SELECT username, high_score, total_games FROM crossy_road_stats WHERE high_score > 0 ORDER BY high_score DESC, updated_at ASC LIMIT 25'
    );
    return res.json({
      success: true,
      leaderboard: result.rows.map((row: any, index: number) => ({
        rank: index + 1,
        username: String(row.username),
        highScore: Number(row.high_score || 0),
        totalGames: Number(row.total_games || 0),
      })),
    });
  } catch (error: any) {
    console.error('[Crossy Road] Leaderboard failed:', error?.message || error);
    return res.status(503).json({ success: false, error: 'The Crossy Road leaderboard is temporarily unavailable.' });
  }
});

router.get('/high-score-leaderboard', async (_req, res) => {
  try {
    await ensureCrossySchema();
    const result = await createPool().query(
      'SELECT username, high_score, total_games FROM crossy_road_stats WHERE high_score > 0 ORDER BY high_score DESC, updated_at ASC LIMIT 25'
    );
    return res.json({
      success: true,
      leaderboard: result.rows.map((row: any, index: number) => ({
        rank: index + 1,
        username: String(row.username),
        highScore: Number(row.high_score || 0),
        totalGames: Number(row.total_games || 0),
      })),
    });
  } catch (error: any) {
    console.error('[Crossy Road] High-score leaderboard failed:', error?.message || error);
    return res.status(503).json({ success: false, error: 'The Crossy Road high-score leaderboard is temporarily unavailable.' });
  }
});

router.post('/start', async (req, res) => {
  try {
    const user = identity(req);
    if (!user) return res.status(401).json({ success: false, error: 'Please sign in again.' });
    await ensureCrossySchema();
    const runId = randomUUID();
    await createPool().query(
      'INSERT INTO crossy_road_runs (id, user_id, username) VALUES ($1, $2, $3)',
      [runId, user.uid, user.username]
    );
    return res.json({ success: true, runId });
  } catch (error: any) {
    console.error('[Crossy Road] Start failed:', error?.message || error);
    return res.status(503).json({ success: false, error: 'Could not start a saved game session.' });
  }
});

router.post('/finish', async (req, res) => {
  const user = identity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Please sign in again.' });
  const runId = String(req.body?.runId || '');
  const score = Number(req.body?.score);
  const coinsCollected = Number(req.body?.coinsCollected ?? 0);
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !Number.isSafeInteger(score) || score < 0 || score > 10000 || !Number.isSafeInteger(coinsCollected) || coinsCollected < 0 || coinsCollected > 10000) {
    return res.status(400).json({ success: false, error: 'Invalid game result.' });
  }

  let client: any;
  try {
    await ensureCrossySchema();
    const pool = createPool();
    client = await pool.connect();
    await client.query('BEGIN');
    const claimed = await client.query(CROSSY_ROAD_FINISH_RUN_SQL, [runId, user.uid, score, coinsCollected]);
    if (!claimed.rowCount) {
      // A retry can arrive after the first request committed but its response was lost.
      // Return the already-saved account totals without awarding coins a second time.
      const previous = await client.query(
        `SELECT r.score, s.coins, s.high_score, s.total_games
           FROM crossy_road_runs r
           JOIN crossy_road_stats s ON s.user_id = r.user_id
          WHERE r.id = $1 AND r.user_id = $2 AND r.completed_at IS NOT NULL`,
        [runId, user.uid]
      );
      if (previous.rowCount && Number(previous.rows[0].score) === score) {
        await client.query('COMMIT');
        const row = previous.rows[0];
        return res.json({
          success: true,
          score,
          coinsAwarded: 0,
          coins: Number(row.coins || 0),
          highScore: Number(row.high_score || 0),
          totalGames: Number(row.total_games || 0),
        });
      }
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'This game session was already submitted or is invalid.' });
    }
    const elapsedSeconds = Number(claimed.rows[0].elapsed_seconds || 0);
    if (!isPlausibleCrossyRoadScore(score, elapsedSeconds)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'That score is not valid for the recorded game duration.' });
    }
    const awarded = Number(claimed.rows[0].coins_awarded || 0);
    const updated = await client.query(
      `INSERT INTO crossy_road_stats (user_id, username, coins, high_score, total_games)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (user_id) DO UPDATE SET
         username = EXCLUDED.username,
         coins = crossy_road_stats.coins + EXCLUDED.coins,
         high_score = GREATEST(crossy_road_stats.high_score, EXCLUDED.high_score),
         total_games = crossy_road_stats.total_games + 1,
         updated_at = NOW()
       RETURNING coins, high_score, total_games`,
      [user.uid, user.username, awarded, score]
    );
    await client.query('COMMIT');
    const row = updated.rows[0];
    return res.json({
      success: true,
      score,
      coinsAwarded: awarded,
      coins: Number(row.coins || 0),
      highScore: Number(row.high_score || 0),
      totalGames: Number(row.total_games || 0),
    });
  } catch (error: any) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    console.error('[Crossy Road] Finish failed:', error?.message || error);
    return res.status(503).json({ success: false, error: 'Could not save this Crossy Road result.' });
  } finally {
    client?.release();
  }
});



// Account-backed cosmetic garage. Prices and ownership are always verified server-side.
router.get('/garage', async (req, res) => {
  try {
    const user = identity(req);
    if (!user) return res.status(401).json({ success: false, error: 'Please sign in again.' });
    await ensureCrossySchema();
    const pool = createPool();
    await pool.query('INSERT INTO crossy_road_stats (user_id, username) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username', [user.uid, user.username]);
    await pool.query("INSERT INTO crossy_road_inventory (user_id, category, item_id) VALUES ($1, 'bird', 'classic'), ($1, 'map', 'classic') ON CONFLICT DO NOTHING", [user.uid]);
    await pool.query('INSERT INTO crossy_road_loadout (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.uid]);
    const [account, inventory, loadout] = await Promise.all([
      pool.query('SELECT coins FROM crossy_road_stats WHERE user_id = $1', [user.uid]),
      pool.query('SELECT category, item_id FROM crossy_road_inventory WHERE user_id = $1 ORDER BY purchased_at ASC', [user.uid]),
      pool.query('SELECT bird_skin_id, map_id FROM crossy_road_loadout WHERE user_id = $1', [user.uid]),
    ]);
    return res.json({
      success: true,
      coins: Number(account.rows[0]?.coins || 0),
      owned: inventory.rows.map((row: any) => ({ category: String(row.category), id: String(row.item_id) })),
      equipped: { bird: loadout.rows[0]?.bird_skin_id || 'classic', map: loadout.rows[0]?.map_id || 'classic' },
      birds: CROSSY_BIRD_SKINS,
      maps: CROSSY_MAPS,
    });
  } catch (error: any) {
    console.error('[Crossy Road] Garage load failed:', error?.message || error);
    return res.status(503).json({ success: false, error: 'Your Crossy Road garage is temporarily unavailable.' });
  }
});

router.post('/purchase', async (req, res) => {
  const user = identity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Please sign in again.' });
  const category = req.body?.category === 'bird' || req.body?.category === 'map' ? req.body.category : null;
  const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId : '';
  const item = category ? getCrossyCosmetic(category, itemId) : null;
  if (!category || !item) return res.status(400).json({ success: false, error: 'That garage item does not exist.' });
  let client: any;
  try {
    await ensureCrossySchema();
    client = await createPool().connect();
    await client.query('BEGIN');
    const owned = await client.query('SELECT 1 FROM crossy_road_inventory WHERE user_id = $1 AND category = $2 AND item_id = $3', [user.uid, category, itemId]);
    if (owned.rowCount) {
      await client.query('COMMIT');
      const balance = await client.query('SELECT coins FROM crossy_road_stats WHERE user_id = $1', [user.uid]);
      return res.json({ success: true, alreadyOwned: true, coins: Number(balance.rows[0]?.coins || 0) });
    }
    const charged = await client.query('UPDATE crossy_road_stats SET coins = coins - $2, updated_at = NOW() WHERE user_id = $1 AND coins >= $2 RETURNING coins', [user.uid, item.price]);
    if (!charged.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'You do not have enough coins for this item.' });
    }
    await client.query('INSERT INTO crossy_road_inventory (user_id, category, item_id) VALUES ($1, $2, $3)', [user.uid, category, itemId]);
    await client.query('COMMIT');
    return res.json({ success: true, alreadyOwned: false, coins: Number(charged.rows[0].coins) });
  } catch (error: any) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    console.error('[Crossy Road] Purchase failed:', error?.message || error);
    return res.status(503).json({ success: false, error: 'Could not complete this purchase.' });
  } finally {
    client?.release();
  }
});

router.post('/equip', async (req, res) => {
  const user = identity(req);
  if (!user) return res.status(401).json({ success: false, error: 'Please sign in again.' });
  const category = req.body?.category === 'bird' || req.body?.category === 'map' ? req.body.category : null;
  const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId : '';
  if (!category || !getCrossyCosmetic(category, itemId)) return res.status(400).json({ success: false, error: 'That garage item does not exist.' });
  try {
    await ensureCrossySchema();
    const pool = createPool();
    const owned = await pool.query('SELECT 1 FROM crossy_road_inventory WHERE user_id = $1 AND category = $2 AND item_id = $3', [user.uid, category, itemId]);
    if (!owned.rowCount) return res.status(403).json({ success: false, error: 'Unlock this item before equipping it.' });
    const column = category === 'bird' ? 'bird_skin_id' : 'map_id';
    await pool.query(
      `INSERT INTO crossy_road_loadout (user_id, ${column}) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET ${column} = EXCLUDED.${column}, updated_at = NOW()`,
      [user.uid, itemId]
    );
    const loadout = await pool.query('SELECT bird_skin_id, map_id FROM crossy_road_loadout WHERE user_id = $1', [user.uid]);
    return res.json({ success: true, equipped: { bird: loadout.rows[0].bird_skin_id, map: loadout.rows[0].map_id } });
  } catch (error: any) {
    console.error('[Crossy Road] Equip failed:', error?.message || error);
    return res.status(503).json({ success: false, error: 'Could not equip this item.' });
  }
});

export default router;
