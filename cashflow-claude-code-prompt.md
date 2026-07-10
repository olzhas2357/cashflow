# CashFlow 101 — Multiplayer Web Game
## Claude Code Master Prompt (Phase 1 + Phase 2)

---

## PROJECT CONTEXT

I am building a multiplayer web implementation of the CashFlow 101 board game.
Tech stack: **Go (Gin)** backend + **React (TypeScript)** frontend + **PostgreSQL** + **WebSocket (gorilla/websocket)** + deployed on **Vercel (frontend) / Railway (backend) / Neon (PostgreSQL)**.

The repository is at: https://github.com/olzhas2357/cashflow

I already have:
- Basic Auditor site (creates game sessions, some data collected)
- Financial statement logic written: `finance/statement.go`, `finance/calculate.go`
- Dice logic: `engine/dice.go`
- Game lobby logic: `game/models.go`, `game/service.go`, `game/joincode.go`

Do NOT rewrite what already exists. Read existing files first, then extend them.

---

## ARCHITECTURE OVERVIEW

```
backend/
  internal/
    finance/          ← statement.go, calculate.go (DONE)
    game/             ← models.go, service.go, joincode.go (DONE)
    engine/           ← dice.go (DONE)
    board/            ← TO BUILD: board.go, cell_types.go
    turn/             ← TO BUILD: turn.go, state_machine.go
    ws/               ← TO BUILD: hub.go, client.go, events.go
  api/
    handlers/         ← TO BUILD: game_handler.go, ws_handler.go
  db/
    migrations/       ← TO BUILD: SQL migration files
    queries/          ← TO BUILD: game_store.go (PostgreSQL impl)
frontend/
  src/
    components/
      Board/          ← TO BUILD: Board.tsx, Cell.tsx, Token.tsx
      Lobby/          ← TO BUILD: CreateGame.tsx, JoinGame.tsx, PlayerList.tsx
      Statement/      ← TO BUILD: FinancialStatement.tsx
    hooks/            ← TO BUILD: useWebSocket.ts, useGame.ts
    types/            ← TO BUILD: game.types.ts
```

---

## BOARD DEFINITION (24 cells, Monopoly-style layout)

The board is a square perimeter with 24 cells. Cell index 0 = START (top-left corner).
Cells go clockwise: top row left→right, right column top→bottom, bottom row right→left, left column bottom→top.

```
Corner cells (special):
  Index 0  = START / Payday corner (top-left)
  Index 7  = Baby corner (top-right)   — player gets a child, expenses increase
  Index 13 = Payday corner (bottom-right) — same as START, receive cashflow
  Index 19 = Bank / Downsized corner (bottom-left) — lose job, miss 2 turns

Regular cells by type:
  Small Deal:  1, 2, 8, 11, 17, 22
  Big Deal:    4, 10, 15, 20
  Doodad:      3, 6, 9, 16, 18, 23
  Market:      5, 12, 21
  Charity:     14
  Downsized:   (only corner index 19)
  Baby:        (only corner index 7)
```

---

## GAME FLOW (implement exactly in this order)

### PHASE 1: Lobby (Auditor creates → Players join → Game starts)

```
1. Auditor calls POST /api/games
   Body: { auditor_name: string, max_players: int (2-6) }
   Response: { game_id, join_code, auditor_id }

2. Players call POST /api/games/:join_code/join
   Body: { player_name: string }
   Response: { game_id, player_id, game_state }

3. Players connect WebSocket: GET /ws/:game_id?player_id=xxx

4. Players call POST /api/games/:game_id/ready
   Body: { player_id, profession_id }
   This creates the player's financial Statement from the chosen profession.

5. Auditor calls POST /api/games/:game_id/start
   Body: { auditor_id }
   Validates: all players ready, requester is auditor.
   Sets: status=in_progress, current_turn_player_id = first player.
   Broadcasts: GAME_STARTED event to all WebSocket clients.
```

### PHASE 2: Turn cycle (Roll → Move → Resolve → Next turn)

```
Turn state machine — server enforces this order strictly:

WAITING_ROLL
  → player calls POST /api/games/:game_id/roll { player_id }
  → server validates: it is this player's turn AND status is WAITING_ROLL
  → server rolls dice, computes new position
  → if new_position passes through 0 or 7 or 13 or 19 → trigger corner event first
  → broadcasts: DICE_ROLLED { die1, die2, total, new_position }
  → state → RESOLVING_CELL

RESOLVING_CELL
  → server calls ResolveCell(cell_type, player)
  → Payday: add cashflow to cash_on_hand automatically, broadcast PAYDAY_RECEIVED
  → Doodad: deduct random amount automatically, broadcast DOODAD_PAID
  → Baby: add child, recalculate statement, broadcast BABY_BORN
  → Downsized: set missed_turns=2, broadcast PLAYER_DOWNSIZED
  → Small Deal / Big Deal: draw a deal card, broadcast DEAL_DRAWN { card }
    → state → AWAITING_DECISION (player must accept or decline)
  → Market: if player owns assets, can sell; broadcast MARKET_OPEN
    → state → AWAITING_DECISION
  → Charity: deduct 10% of monthly income automatically
  → If no decision needed → state → TURN_COMPLETE

AWAITING_DECISION
  → player calls POST /api/games/:game_id/decision
    Body: { player_id, action: "buy"|"pass"|"sell", asset_id?: string }
  → server validates: it is this player's turn AND status is AWAITING_DECISION
  → if buy: deduct cash, add asset, recalculate statement
  → if sell: add cash, remove asset, recalculate statement
  → broadcasts: DECISION_MADE { action, updated_statement }
  → state → TURN_COMPLETE

TURN_COMPLETE
  → server checks win condition: player.Statement.PassiveIncome >= player.Statement.TotalExpenses
  → if win: broadcast PLAYER_WON { player_id }, game status = finished
  → else: advance to next player (skip if missed_turns > 0)
  → broadcasts: TURN_CHANGED { next_player_id }
  → state → WAITING_ROLL (for next player)
```

---

## WEBSOCKET EVENTS (all events broadcast to ALL players in the game)

```go
// Server → Client events:
GAME_UPDATED      { game_state: GameState }          // full state sync
PLAYER_JOINED     { player: Player }
PLAYER_READY      { player_id: string }
GAME_STARTED      { current_turn_player_id: string, statements: map[player_id]Statement }
DICE_ROLLED       { player_id, die1, die2, total, old_position, new_position }
PAYDAY_RECEIVED   { player_id, amount, new_cash }
DOODAD_PAID       { player_id, description, amount, new_cash }
BABY_BORN         { player_id, new_children_count, new_expense }
PLAYER_DOWNSIZED  { player_id, missed_turns }
DEAL_DRAWN        { player_id, card: DealCard }
MARKET_OPEN       { player_id, sellable_assets: []Asset }
DECISION_MADE     { player_id, action, asset?, updated_statement: Statement }
TURN_CHANGED      { next_player_id }
PLAYER_WON        { player_id, final_statement: Statement }
EVENT_LOG         { message: string, player_id: string, timestamp: string }

// Client → Server (via HTTP POST, not WebSocket):
// All game actions go through REST endpoints for easier validation and error handling.
// WebSocket is receive-only for clients.
```

---

## DATABASE SCHEMA

```sql
-- Run these migrations in order

CREATE TABLE games (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code       VARCHAR(6) UNIQUE NOT NULL,
  auditor_id      UUID NOT NULL,
  max_players     INT NOT NULL CHECK (max_players BETWEEN 2 AND 6),
  status          VARCHAR(20) NOT NULL DEFAULT 'waiting',
  current_turn_player_id UUID,
  turn_status     VARCHAR(30) NOT NULL DEFAULT 'waiting_roll',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ
);

CREATE TABLE players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES games(id),
  name            VARCHAR(100) NOT NULL,
  role            VARCHAR(20) NOT NULL DEFAULT 'player',
  profession_id   VARCHAR(50),
  position        INT NOT NULL DEFAULT 0,
  missed_turns    INT NOT NULL DEFAULT 0,
  ready           BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE financial_statements (
  player_id       UUID PRIMARY KEY REFERENCES players(id),
  game_id         UUID NOT NULL REFERENCES games(id),
  -- profession base
  salary          BIGINT NOT NULL DEFAULT 0,
  taxes_expense   BIGINT NOT NULL DEFAULT 0,
  home_expense    BIGINT NOT NULL DEFAULT 0,
  school_loan_expense BIGINT NOT NULL DEFAULT 0,
  car_loan_expense    BIGINT NOT NULL DEFAULT 0,
  credit_card_expense BIGINT NOT NULL DEFAULT 0,
  other_expense       BIGINT NOT NULL DEFAULT 0,
  per_child_expense   BIGINT NOT NULL DEFAULT 0,
  -- mutable state
  cash_on_hand    BIGINT NOT NULL DEFAULT 0,
  children        INT NOT NULL DEFAULT 0,
  bank_loan       BIGINT NOT NULL DEFAULT 0,
  -- NEVER store computed fields (total_income, cashflow, etc.) — always recalculate
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES players(id),
  game_id         UUID NOT NULL REFERENCES games(id),
  asset_type      VARCHAR(30) NOT NULL, -- real_estate, stock, mutual_fund, business
  name            VARCHAR(200) NOT NULL,
  cost            BIGINT NOT NULL,
  passive_income  BIGINT NOT NULL DEFAULT 0,
  quantity        INT NOT NULL DEFAULT 1,
  acquired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE event_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES games(id),
  player_id       UUID,
  event_type      VARCHAR(50) NOT NULL,
  message         TEXT NOT NULL,
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON players(game_id);
CREATE INDEX ON financial_statements(game_id);
CREATE INDEX ON assets(player_id);
CREATE INDEX ON assets(game_id);
CREATE INDEX ON event_log(game_id);
```

---

## PROFESSIONS SEED DATA

```go
// Seed these into a professions map or JSON file at startup
var Professions = map[string]finance.Profession{
  "engineer": {
    ID: "engineer", Name: "Engineer",
    Salary: 5000, TaxesExpense: 900, HomeExpense: 1200,
    SchoolLoanExpense: 300, CarLoanExpense: 400,
    CreditCardExpense: 200, OtherExpense: 500,
    PerChildExpense: 200, StartingSavings: 3000,
  },
  "teacher": {
    ID: "teacher", Name: "Teacher",
    Salary: 3500, TaxesExpense: 600, HomeExpense: 900,
    SchoolLoanExpense: 150, CarLoanExpense: 200,
    CreditCardExpense: 100, OtherExpense: 300,
    PerChildExpense: 150, StartingSavings: 2000,
  },
  "doctor": {
    ID: "doctor", Name: "Doctor",
    Salary: 13200, TaxesExpense: 3420, HomeExpense: 1900,
    SchoolLoanExpense: 1300, CarLoanExpense: 380,
    CreditCardExpense: 270, OtherExpense: 1050,
    PerChildExpense: 380, StartingSavings: 4000,
  },
  "manager": {
    ID: "manager", Name: "Manager",
    Salary: 4600, TaxesExpense: 760, HomeExpense: 1100,
    SchoolLoanExpense: 200, CarLoanExpense: 320,
    CreditCardExpense: 150, OtherExpense: 420,
    PerChildExpense: 170, StartingSavings: 2500,
  },
  "janitor": {
    ID: "janitor", Name: "Janitor",
    Salary: 1600, TaxesExpense: 280, HomeExpense: 400,
    SchoolLoanExpense: 60, CarLoanExpense: 100,
    CreditCardExpense: 50, OtherExpense: 140,
    PerChildExpense: 70, StartingSavings: 500,
  },
}
```

---

## DEAL CARDS DATA (sample — generate full deck)

```go
type DealCard struct {
  ID            string  `json:"id"`
  Type          string  `json:"type"`  // "small_deal" or "big_deal"
  Name          string  `json:"name"`
  Description   string  `json:"description"`
  Cost          int64   `json:"cost"`
  PassiveIncome int64   `json:"passive_income"`
  AssetType     string  `json:"asset_type"`
}

// Small deals (cost under $5000):
{ id:"sd1", type:"small_deal", name:"2BR/1BA House",
  description:"Rental property. Cost: $0 down, Cash flow: $100/mo",
  cost:0, passive_income:100, asset_type:"real_estate" },
{ id:"sd2", type:"small_deal", name:"Stock: MYT4U @ $1",
  description:"Buy stock at $1/share. Sell when Market card appears.",
  cost:1, passive_income:0, asset_type:"stock" },

// Big deals (cost over $5000):
{ id:"bd1", type:"big_deal", name:"Duplex for sale",
  description:"Duplex. Cost: $18,000 down. Cash flow: $400/mo",
  cost:18000, passive_income:400, asset_type:"real_estate" },
{ id:"bd2", type:"big_deal", name:"Car wash business",
  description:"Business. Cost: $65,000. Cash flow: $1,600/mo",
  cost:65000, passive_income:1600, asset_type:"business" },
```

---

## FRONTEND COMPONENTS TO BUILD

### Board.tsx
- CSS Grid: `grid-template-columns: 80px repeat(6, 1fr) 80px`
- 24 perimeter cells + 4 corners, center = game info / logo
- Each Cell shows: cell number, cell type (colored), player tokens (as colored dots)
- Token moves with CSS transition `transform` when position changes
- Colors: Small Deal = amber, Big Deal = amber darker, Doodad = blue, Market = green, Charity = purple, Downsized = red, Baby = gray corner, Payday = teal corner

### Lobby UI (CreateGame.tsx + JoinGame.tsx)
- CreateGame: form with auditor name + max players slider (2-6) → shows generated join code
- JoinGame: input join code + player name → lands in lobby
- PlayerList: shows all joined players, profession badge, ready status (green checkmark)
- Start button: visible only to auditor, enabled only when all players ready

### FinancialStatement.tsx
- Two columns: Income (green) | Expenses (red)
- Auto-updates via WebSocket when statement changes
- Shows: Salary, Passive Income, Total Income | all expense lines, Total Expenses
- Big highlighted number: Cashflow = Income - Expenses (green if positive)
- Cash on Hand shown prominently at top

### useWebSocket.ts hook
```typescript
// Connects to ws://backend/ws/:gameId?player_id=xxx
// Dispatches incoming events to a zustand store or React context
// Handles reconnection with exponential backoff
// Types all incoming events with discriminated union
```

---

## CODING RULES (follow strictly)

1. **Read existing files before writing.** Use `cat` or `Read` tool first.
2. **Computed fields are never stored.** `TotalIncome`, `TotalExpenses`, `Cashflow`, `PassiveIncome` are always recalculated via `statement.Recalculate()` — never saved to DB.
3. **crypto/rand for all randomness.** Never use `math/rand` — this is a money game.
4. **State machine is enforced server-side.** Client cannot skip turn phases.
5. **Every action validates player turn.** If it is not your turn, return HTTP 403.
6. **Write tests for every service function.** Use in-memory fakes for store and broadcaster.
7. **WebSocket is broadcast-only from server.** All actions go via HTTP POST, WS is receive-only.
8. **Event log every action.** Every game event writes a human-readable message to event_log table.
9. **Return full game state on every HTTP response.** Client should never need to track partial state.
10. **No hardcoded IDs.** Use the injected idGen function everywhere.

---

## IMPLEMENTATION ORDER (do exactly in this sequence)

Step 1: Read all existing files in the repo. List what exists.
Step 2: Create `board/board.go` — 24 cells with types, corners defined.
Step 3: Create `db/migrations/001_initial.sql` — full schema above.
Step 4: Create `db/queries/game_store.go` — PostgreSQL implementation of game.Store interface.
Step 5: Create `ws/hub.go` + `ws/client.go` + `ws/events.go` — WebSocket hub and event types.
Step 6: Create `api/handlers/game_handler.go` — HTTP handlers for all REST endpoints.
Step 7: Create `api/handlers/ws_handler.go` — WebSocket upgrade handler.
Step 8: Wire everything in `main.go` — Gin routes, DB connection, hub start.
Step 9: Create `turn/turn.go` — full turn state machine (roll → move → resolve → next).
Step 10: Create `turn/resolver.go` — cell resolvers for each cell type.
Step 11: Create frontend `types/game.types.ts` — all TypeScript types mirroring Go structs.
Step 12: Create `hooks/useWebSocket.ts` — WebSocket hook with reconnection.
Step 13: Create `components/Lobby/` — CreateGame, JoinGame, PlayerList components.
Step 14: Create `components/Board/` — Board, Cell, Token components.
Step 15: Create `components/Statement/` — FinancialStatement component.
Step 16: Write integration test: full game from CreateGame → JoinGame → StartGame → 3 turns → win check.

---

## START COMMAND

Begin with Step 1: read the repository structure and existing files.
Then proceed step by step. After each step, confirm what was created and what tests pass.
Do not skip steps. Do not combine steps.
Ask me before making any changes to existing working files.
