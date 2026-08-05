-- +goose Up
-- Stage-2 test feature (design/Task-Testing.md, "Этап 2"): bridge the
-- rooms/room_players lobby into the existing game_sessions turn engine
-- without modifying it — see handlers/rooms_game.go for the approach
-- (session-token exchange, not threading player_token through the engine).

ALTER TABLE rooms
  ADD COLUMN game_session_id uuid REFERENCES game_sessions(id) ON DELETE SET NULL;

ALTER TABLE room_players
  ADD COLUMN profession_id uuid REFERENCES professions(id) ON DELETE SET NULL,
  ADD COLUMN game_player_id uuid REFERENCES players(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE room_players
  DROP COLUMN IF EXISTS game_player_id,
  DROP COLUMN IF EXISTS profession_id;

ALTER TABLE rooms
  DROP COLUMN IF EXISTS game_session_id;
