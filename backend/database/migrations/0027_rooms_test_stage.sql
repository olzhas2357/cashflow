-- +goose Up
-- Stage-1 test feature (design/Task-Testing.md): standalone room/lobby system
-- for "register + create room, friends join by link without registering".
-- Deliberately separate from game_sessions/players (turn engine) — see
-- room_auth_service.go / rooms handler for why these are not reused.

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(10) NOT NULL UNIQUE,
  host_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING','IN_PROGRESS','FINISHED')),
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX idx_rooms_host_status ON rooms(host_user_id, status);

CREATE TABLE room_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name varchar(255) NOT NULL,
  player_token uuid NOT NULL UNIQUE,
  seat int NOT NULL,
  is_host boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, seat)
);

CREATE INDEX idx_room_players_room ON room_players(room_id);

-- +goose Down
DROP TABLE IF EXISTS room_players;
DROP TABLE IF EXISTS rooms;
