-- +goose Up
ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS join_code varchar(10),
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'lobby',
  ADD COLUMN IF NOT EXISTS current_turn_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS turn_status varchar(30) NOT NULL DEFAULT 'WAITING_ROLL',
  ADD COLUMN IF NOT EXISTS turn_number int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dice_roll int,
  ADD COLUMN IF NOT EXISTS active_big_deal_id uuid REFERENCES big_deals(id) ON DELETE SET NULL;

-- Backfill deterministic, collision-free codes for pre-existing sessions.
UPDATE game_sessions SET join_code = upper(substr(md5(id::text), 1, 6)) WHERE join_code IS NULL;

ALTER TABLE game_sessions ALTER COLUMN join_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_game_sessions_join_code ON game_sessions(join_code);
CREATE INDEX IF NOT EXISTS idx_game_sessions_current_turn_player ON game_sessions(current_turn_player_id);

-- +goose Down
DROP INDEX IF EXISTS idx_game_sessions_current_turn_player;
DROP INDEX IF EXISTS idx_game_sessions_join_code;
ALTER TABLE game_sessions
  DROP COLUMN IF EXISTS active_big_deal_id,
  DROP COLUMN IF EXISTS last_dice_roll,
  DROP COLUMN IF EXISTS turn_number,
  DROP COLUMN IF EXISTS turn_status,
  DROP COLUMN IF EXISTS current_turn_player_id,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS join_code;
