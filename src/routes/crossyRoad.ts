import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { checkSqlAvailability, createPool } from '../db/index.ts';

const router = Router();

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
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !Number.isSafeInteger(score) || score < 0 || score > 10000) {
    return res.status(400).json({ success: false, error: 'Invalid game result.' });
  }

  let client: any;
  try {
    await ensureCrossySchema();
    const pool = createPool();
    client = await pool.connect();
    await client.query('BEGIN');
    const claimed = await client.query(
      `UPDATE crossy_road_runs
          SET completed_at = NOW(), score = $3, coins_awarded = FLOOR($3 / 10.0)::integer
        WHERE id = $1 AND user_id = $2 AND completed_at IS NULL
        RETURNING EXTRACT(EPOCH FROM (completed_at - started_at)) AS elapsed_seconds, coins_awarded`,
      [runId, user.uid, score]
    );
    if (!claimed.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'This game session was already submitted or is invalid.' });
    }
    const elapsedSeconds = Number(claimed.rows[0].elapsed_seconds || 0);
    if (score > Math.floor(elapsedSeconds * 5) + 3) {
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

export default router;
