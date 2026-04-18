# Cashflow-style Financial Board Game (Starter)

## Stack
- Backend: Go (Gin) + GORM + PostgreSQL
- Frontend: React + TypeScript + TailwindCSS + Framer Motion + Zustand + React Query
- Realtime: WebSocket (`/ws/negotiation`)

## Run (Docker)
1. Start services:
   - `docker compose up --build`
2. API will be available at:
   - `http://localhost:8080`
3. Frontend (separate dev server):
   - See `frontend/README.md`

## Notes
- This is a Cashflow (Денежный поток) digital adaptation: it includes an auditor control panel MVP to run game sessions (profession setup, event logging, finance tracking, and transaction verification).
- SQL migrations are executed on backend startup using Goose.
- Backend auto-loads `.env` in `backend/` via `godotenv` for local development.

## Auditor Control Panel MVP (frontend routes)
- `GET /auditor/games` (list active sessions)
- `POST /auditor/games` (create new session)
- `POST /auditor/games/:id/players` (add players by name)
- `POST /auditor/games/:id/players/:playerId/profession` (assign profession + initialize salary/expenses/cash)
- `GET /auditor/games/:id/finance` (player finance table)
- `GET /auditor/games/:id/logs` (timeline of financial events)
- Event buttons:
  - `/auditor/games/:id/events/payday`
  - `/auditor/games/:id/events/baby`
  - `/auditor/games/:id/events/charity`
  - `/auditor/games/:id/events/downsized`
  - `/auditor/games/:id/events/doodad`
  - `/auditor/games/:id/events/small-deal`
  - `/auditor/games/:id/events/big-deal`
- Market verification:
  - `GET /auditor/games/:id/transactions/pending`
  - `POST /auditor/games/:id/transactions/:txId/approve`
  - `POST /auditor/games/:id/transactions/:txId/reject`
