/**
 * Keep each use of $3 explicitly typed as integer before deriving the coin award.
 * PostgreSQL cannot infer one parameter as both integer and numeric in this UPDATE.
 */
export const CROSSY_ROAD_FINISH_RUN_SQL = `
  UPDATE crossy_road_runs
     SET completed_at = NOW(),
         score = $3::integer,
         coins_awarded = LEAST(GREATEST($4::integer, 0), LEAST(5000, FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)) * 8 + 4)::integer))
   WHERE id = $1 AND user_id = $2 AND completed_at IS NULL
   RETURNING EXTRACT(EPOCH FROM (completed_at - started_at)) AS elapsed_seconds, coins_awarded
`;
