# Финальный экран победителя + механика "3 победителя" — Claude Code Prompt

## КОНТЕКСТ

Сейчас в `handlers/turn.go` функция `finishResolution` завершает игру на ПЕРВОМ
победителе (`game.Status = "completed"`). Нужно изменить:

1. Победитель выходит из игры, но игра ПРОДОЛЖАЕТСЯ для остальных
2. Игра завершается когда набрано 3 победителя (или не осталось активных игроков)
3. Каждый победитель получает личный финальный экран со статистикой партии

Существующие данные:
- `models.Player.FinanciallyFree` — флаг что игрок вышел из Крысиных бег
- `models.GameSession.TurnNumber` — номер хода (уже есть)
- Событие `PLAYER_WON` уже отправляется, но без деталей

---

## ШАГ 1 — Прочитай существующий код

```bash
sed -n '340,410p' backend/handlers/turn.go
grep -n "FinanciallyFree\|Status\|Placement\|finished_place" backend/models/models.go
cat backend/models/models.go | grep -A30 "type Player struct"
cat backend/models/models.go | grep -A20 "type GameSession struct"
```

---

## ШАГ 2 — Добавь поля в модели

В `models.Player` добавь:
```go
Placement    int        `gorm:"default:0" json:"placement"`      // 0 = ещё играет, 1/2/3 = место
FinishedTurn int        `gorm:"default:0" json:"finished_turn"`  // на каком ходу вышел
```

В `models.GameSession` добавь:
```go
WinnersCount int `gorm:"not null;default:0" json:"winners_count"` // сколько уже вышло
```

Создай миграцию `database/migrations/0023_placement_tracking.sql`:
```sql
ALTER TABLE players ADD COLUMN IF NOT EXISTS placement INT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS finished_turn INT NOT NULL DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS winners_count INT NOT NULL DEFAULT 0;
```

---

## ШАГ 3 — Перепиши логику победы в finishResolution

Замени блок `if player.FinanciallyFree { ... }` на:

```go
if player.FinanciallyFree && player.Placement == 0 {
    // Игрок только что вышел из Крысиных бег — присваиваем место
    game.WinnersCount++
    player.Placement = game.WinnersCount   // 1-е, 2-е или 3-е место
    player.FinishedTurn = game.TurnNumber

    if err := h.db.Save(&player).Error; err != nil {
        c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "player_placement_failed"})
        return
    }

    // Собираем статистику партии для этого игрока (см. Шаг 4)
    stats, err := h.buildWinnerStats(gameID, player)
    if err != nil {
        c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "winner_stats_failed"})
        return
    }

    // Проверяем: игра закончена? (3 победителя ИЛИ активных игроков не осталось)
    var activePlayers int64
    h.db.Model(&models.Player{}).
        Where("game_id = ? AND placement = 0", gameID).
        Count(&activePlayers)

    gameOver := game.WinnersCount >= 3 || activePlayers == 0

    if gameOver {
        game.Status = "completed"
        game.TurnStatus = "TURN_COMPLETE"
    }
    if err := h.db.Save(&game).Error; err != nil {
        c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "game_save_failed"})
        return
    }

    // Событие с полной статистикой для финального экрана
    if h.hub != nil {
        h.hub.Broadcast(gameID.String(), "PLAYER_WON", gin.H{
            "player_id":     playerID.String(),
            "player_name":   player.Name,
            "placement":     player.Placement,
            "finished_turn": player.FinishedTurn,
            "stats":         stats,
            "game_over":     gameOver,
        })
    }

    // Если игра НЕ закончена — передаём ход дальше (победитель пропускается)
    if !gameOver {
        h.advanceToNextActivePlayer(c, &game, players, playerID)
        return
    }

    c.JSON(http.StatusOK, gin.H{"ok": true, "won": true, "placement": player.Placement, "game_over": gameOver})
    return
}
```

---

## ШАГ 4 — Функция сбора статистики

Добавь новую функцию в `handlers/turn.go`:

```go
type WinnerStats struct {
    PassiveIncome   int64  `json:"passive_income"`
    TotalExpenses   int64  `json:"total_expenses"`
    Surplus         int64  `json:"surplus"`          // passive - expenses
    AssetsCount     int    `json:"assets_count"`
    PortfolioValue  int64  `json:"portfolio_value"`
    FinishedTurn    int    `json:"finished_turn"`
    BestAssetName   string `json:"best_asset_name"`   // актив с макс. passive income
    BestAssetIncome int64  `json:"best_asset_income"`
    BestAssetCost   int64  `json:"best_asset_cost"`
}

func (h *TurnHandler) buildWinnerStats(gameID uuid.UUID, player models.Player) (WinnerStats, error) {
    var assets []models.Asset
    if err := h.db.Where("player_id = ?", player.ID).Find(&assets).Error; err != nil {
        return WinnerStats{}, err
    }

    stats := WinnerStats{
        PassiveIncome: player.PassiveIncome,  // используй реальные поля из модели Player
        TotalExpenses: player.TotalExpenses,
        AssetsCount:   len(assets),
        FinishedTurn:  player.FinishedTurn,
    }
    stats.Surplus = stats.PassiveIncome - stats.TotalExpenses

    // Находим лучший актив по passive income и суммируем портфель
    for _, a := range assets {
        stats.PortfolioValue += a.Cost   // или a.Price — проверь имя поля
        if a.PassiveIncome > stats.BestAssetIncome {
            stats.BestAssetIncome = a.PassiveIncome
            stats.BestAssetName = a.Name    // или a.Title — проверь имя поля
            stats.BestAssetCost = a.Cost
        }
    }

    return stats, nil
}
```

ВАЖНО: проверь точные имена полей в моделях Player и Asset перед написанием:
```bash
grep -A30 "type Player struct" backend/models/models.go
grep -A20 "type Asset struct" backend/models/models.go
```
Подставь реальные имена (PassiveIncome/TotalExpenses могут называться иначе).

---

## ШАГ 5 — Функция передачи хода следующему активному игроку

Победителей нужно пропускать при передаче хода:

```go
func (h *TurnHandler) advanceToNextActivePlayer(
    c *gin.Context,
    game *models.GameSession,
    players []models.Player,
    currentPlayerID uuid.UUID,
) {
    // Находим индекс текущего игрока
    curIdx := 0
    for i, p := range players {
        if p.ID == currentPlayerID {
            curIdx = i
            break
        }
    }

    // Ищем следующего игрока который ещё НЕ вышел (placement == 0)
    for offset := 1; offset <= len(players); offset++ {
        next := players[(curIdx+offset)%len(players)]
        if next.Placement == 0 {  // ещё играет
            game.CurrentTurnPlayerID = &next.ID
            game.TurnStatus = "WAITING_ROLL"
            game.TurnNumber++
            if err := h.db.Save(game).Error; err != nil {
                c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "turn_advance_failed"})
                return
            }
            if h.hub != nil {
                h.hub.Broadcast(game.ID.String(), "TURN_CHANGED", gin.H{"next_player_id": next.ID.String()})
            }
            c.JSON(http.StatusOK, gin.H{"ok": true, "next_player_id": next.ID.String()})
            return
        }
    }

    // Если все вышли — завершаем игру
    game.Status = "completed"
    game.TurnStatus = "TURN_COMPLETE"
    h.db.Save(game)
    c.JSON(http.StatusOK, gin.H{"ok": true, "game_over": true})
}
```

ВАЖНО: убедись что `players` загружаются с актуальным Placement (перезагрузи из БД
после сохранения победителя, иначе placement будет 0 в памяти).

---

## ШАГ 6 — Frontend: обработка PLAYER_WON

Найди где обрабатываются WebSocket события:
```bash
grep -rn "PLAYER_WON\|TURN_CHANGED" frontend/src --include="*.ts" --include="*.tsx"
```

В обработчике добавь:
```typescript
case 'PLAYER_WON': {
    const isMe = payload.player_id === myPlayerId
    set({
        winnerModal: {
            playerId: payload.player_id,
            playerName: payload.player_name,
            placement: payload.placement,
            finishedTurn: payload.finished_turn,
            stats: payload.stats,
            gameOver: payload.game_over,
            isMe,
        },
    })
    break
}
```

---

## ШАГ 7 — Frontend: компонент WinnerModal.tsx

Создай `frontend/src/components/play/WinnerModal.tsx` в тёмно-зелёном стиле сайта.

Дизайн (точно по стилю проекта — тёмный фон, зелёный акцент primary):

```tsx
import { Trophy, Medal, Building2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type WinnerStats = {
  passive_income: number
  total_expenses: number
  surplus: number
  assets_count: number
  portfolio_value: number
  finished_turn: number
  best_asset_name: string
  best_asset_income: number
  best_asset_cost: number
}

type Props = {
  playerName: string
  placement: number       // 1, 2, 3
  finishedTurn: number
  stats: WinnerStats
  isMe: boolean
  gameOver: boolean
  onClose: () => void
  onWatch: () => void     // "смотреть за игрой" — закрыть модалку, остаться зрителем
}

const PLACE_LABEL: Record<number, string> = {
  1: '1-е место',
  2: '2-е место',
  3: '3-е место',
}

export default function WinnerModal({
  playerName, placement, finishedTurn, stats, isMe, gameOver, onClose, onWatch,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-primary/40 bg-card">
        {/* Header */}
        <div className="relative border-b border-primary/20 px-6 py-6 text-center">
          <button
            onClick={onClose}
            className="absolute right-3.5 top-3.5 flex h-6 w-6 items-center justify-center rounded-md border border-primary/40 text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="mx-auto mb-3.5 flex h-13 w-13 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Trophy className="h-6 w-6" />
          </div>
          <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] text-primary ring-1 ring-primary/25">
            <Medal className="h-3 w-3" />
            {PLACE_LABEL[placement] ?? `${placement}-е место`}
          </div>
          <h2 className="text-lg font-medium">
            {isMe ? 'Ты вышел из Крысиных бег!' : `${playerName} вышел из Крысиных бег`}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {playerName} · за {finishedTurn} ходов
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Formula */}
          <div className="mb-4 flex items-center justify-center gap-2.5 rounded-lg border border-primary/20 bg-primary/[0.04] py-3 text-[13px]">
            <span className="font-medium text-primary">${stats.passive_income.toLocaleString()}</span>
            <span className="text-muted-foreground/50">пассивный &gt;</span>
            <span className="text-muted-foreground">${stats.total_expenses.toLocaleString()} расходы</span>
          </div>

          {/* Stats grid */}
          <div className="mb-4 grid grid-cols-2 gap-2.5">
            <Stat value={`+$${stats.surplus.toLocaleString()}`} label="запас над расходами" green />
            <Stat value={String(stats.assets_count)} label="активов куплено" />
            <Stat value={`$${Math.round(stats.portfolio_value / 1000)}K`} label="стоимость портфеля" />
            <Stat value={String(finishedTurn)} label="ходов до выхода" />
          </div>

          {/* Best asset */}
          {stats.best_asset_name && (
            <div className="mb-4 rounded-lg border border-border bg-background/50 p-3.5">
              <p className="mb-2 text-[10px] tracking-wider text-muted-foreground">ЛУЧШАЯ СДЕЛКА</p>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/25">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[13px] font-medium">{stats.best_asset_name}</div>
                  <div className="text-[10px] text-muted-foreground">купил за ${stats.best_asset_cost.toLocaleString()}</div>
                </div>
                <div className="ml-auto text-[13px] font-medium text-primary">
                  +${stats.best_asset_income.toLocaleString()}/мес
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {gameOver ? (
              <Button className="w-full" onClick={onClose}>Итоги партии</Button>
            ) : (
              <>
                <Button className="w-full" onClick={onWatch}>Смотреть за игрой</Button>
                <p className="text-center text-[10px] text-muted-foreground">
                  Игра продолжается для остальных игроков
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, green }: { value: string; label: string; green?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className={`text-lg font-medium ${green ? 'text-primary' : 'text-foreground'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}
```

---

## ШАГ 8 — Подключи модалку в Board.tsx

```tsx
{winnerModal && (
  <WinnerModal
    playerName={winnerModal.playerName}
    placement={winnerModal.placement}
    finishedTurn={winnerModal.finishedTurn}
    stats={winnerModal.stats}
    isMe={winnerModal.isMe}
    gameOver={winnerModal.gameOver}
    onClose={() => setWinnerModal(null)}
    onWatch={() => setWinnerModal(null)}  // остаётся зрителем
  />
)}
```

---

## ШАГ 9 — Проверка

```bash
# Backend
cd backend && go build ./... && go test ./...

# Frontend
cd frontend && npm run build
```

Ручной тест:
1. Играй пока игрок не выйдет из Крысиных бег
2. Проверь: показывается финальный экран с местом и статистикой
3. Проверь: игра НЕ завершилась, ход перешёл следующему
4. Доведи до 3 победителей — на третьем игра завершается
5. Проверь: "лучшая сделка" показывает правильный актив

---

## ПРАВИЛА

1. Читай модели ПЕРЕД написанием — подставь реальные имена полей (PassiveIncome, TotalExpenses, Cost/Price, Name/Title)
2. Перезагружай players из БД после сохранения placement (иначе placement=0 в памяти)
3. Победитель пропускается при передаче хода (placement != 0)
4. Игра завершается при 3 победителях ИЛИ когда активных не осталось
5. Не ломай существующую логику Payday/Doodad/Deal — трогай только finishResolution
6. Спрашивай перед изменением существующих файлов
7. После изменений: go build ./... и npm run build