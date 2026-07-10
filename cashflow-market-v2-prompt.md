# Market Cell — Точный промпт для Claude Code
# Основан на реальной структуре JSON файлов проекта

---

## КОНТЕКСТ

Market клетки (позиции 5, 12, 21 на доске из 24 клеток) возвращают HTTP 501.
Цель: реализовать полную логику Market так чтобы игра не зависала.

Все JSON файлы с данными находятся в папке `data/`:
- `data/market_events.json` — Market карточки (события продажи)
- `data/small_deal_real_estate.json` — малые сделки недвижимость
- `data/small_deal_business.json` — малые сделки бизнес
- `data/big_deal_real_estate.json` — крупные сделки недвижимость
- `data/big_deal_business.json` — крупные сделки бизнес

---

## ТОЧНАЯ СТРУКТУРА ДАННЫХ (из реальных JSON файлов)

### Market карточка (data/market_events.json):
```json
{
  "id": "mkt_re_21_65k",
  "type": "REAL_ESTATE_BUYER",
  "sub_type": "CONDO_2_1",
  "title": "Покупатель квартиры 2/1",
  "offer_price": 65000,
  "description": "Вам предлагают 65000$ за сдаваемую квартиру 2/1.",
  "is_global": true
}
```

### Актив игрока — недвижимость (data/small_deal_real_estate.json):
```json
{
  "id": "re_3_2_65000_1",
  "category": "real_estate",
  "type": "HOUSE_3_2",
  "title": "House 3/2",
  "price": 65000,
  "down_payment": 5000,
  "mortgage": 60000,
  "cashflow": 160,
  "roi": 38,
  "extra": {
    "resale_range": "65000-135000"
  }
}
```

### Актив игрока — бизнес (data/small_deal_business.json):
```json
{
  "id": "biz_land_10_acres",
  "category": "business",
  "type": "LAND_10_ACRES",
  "title": "Участок земли 10 акров",
  "price": 5000,
  "down_payment": 5000,
  "mortgage": 0,
  "cashflow": 0
}
```

### КЛЮЧЕВОЕ ПРАВИЛО МАТЧИНГА:
```
market_card.sub_type == player_asset.type
```
Примеры:
- market `sub_type: "CONDO_2_1"` → ищем актив с `type: "CONDO_2_1"`
- market `sub_type: "HOUSE_3_2"` → ищем актив с `type: "HOUSE_3_2"`
- market `sub_type: "LAND_10_ACRES"` → ищем актив с `type: "LAND_10_ACRES"`

### ВАЖНО — is_global: true означает:
Когда выпадает Market карточка — ВСЕ игроки в игре могут продать свой актив,
не только тот кто попал на клетку. Это ключевое отличие от Small/Big Deal.

---

## ЛОГИКА ИГРЫ (реализовать точно так)

```
Игрок попадает на Market (позиция 5, 12 или 21)
        ↓
Сервер тянет случайную карточку из market_events.json
        ↓
Сервер проверяет У КАЖДОГО игрока в игре:
  есть ли актив где asset.type == card.sub_type?
        ↓
Рассылает всем игрокам событие MARKET_OPEN:
  {
    card: MarketCard,
    eligible_players: [{ player_id, player_name, asset }]
    — список тех у кого есть этот актив
  }
        ↓
Каждый eligible игрок видит диалог: "Продать за $X?" → Sell / Skip
Игроки у которых нет актива видят карточку но не могут действовать
        ↓
Каждый eligible игрок отдельно решает: SELL или SKIP
        ↓
Когда все eligible игроки приняли решение (или никого нет)
        ↓
Ход завершается → переход к следующему игроку
```

---

## ШАГИ РЕАЛИЗАЦИИ (выполнять строго по порядку)

### Шаг 1 — Прочитай существующий код
Перед любыми изменениями прочитай:
```
handlers/turn.go          — найди где возвращается 501 для MARKET
handlers/lobby.go         — как загружаются small/big deal карточки
services/realtime.go      — как рассылаются события через WebSocket
models/                   — найди модель Asset/активов игрока
data/market_events.json   — прочитай полностью
```
Выполни и покажи результат:
```bash
grep -n "501\|MARKET\|market" handlers/turn.go
grep -n "json\|cards\|deals" handlers/lobby.go | head -30
ls models/
```

### Шаг 2 — Go структуры (добавить в существующий файл со структурами)

```go
// MarketCard соответствует структуре data/market_events.json
type MarketCard struct {
    ID          string `json:"id"`
    Type        string `json:"type"`        // напр. "REAL_ESTATE_BUYER"
    SubType     string `json:"sub_type"`    // напр. "CONDO_2_1" — ключ матчинга
    Title       string `json:"title"`
    OfferPrice  int64  `json:"offer_price"`
    Description string `json:"description"`
    IsGlobal    bool   `json:"is_global"`   // всегда true — все игроки могут продать
}

// EligibleSeller — игрок у которого есть актив под эту Market карточку
type EligibleSeller struct {
    PlayerID   string `json:"player_id"`
    PlayerName string `json:"player_name"`
    Asset      Asset  `json:"asset"`        // используй существующую модель Asset
}

// MarketResolution — результат розыгрыша Market карточки
type MarketResolution struct {
    Card             MarketCard       `json:"card"`
    EligibleSellers  []EligibleSeller `json:"eligible_sellers"`
}
```

### Шаг 3 — Загрузка market_events.json при старте

Найди где загружаются small/big deal карточки (grep по "json.Unmarshal" или "os.ReadFile" в handlers/).
Добавь загрузку market карточек В ТОМ ЖЕ МЕСТЕ, тем же способом:

```go
// Загрузить data/market_events.json
marketData, err := os.ReadFile("data/market_events.json")
if err != nil {
    log.Fatalf("cannot load market_events.json: %v", err)
}
var marketCards []MarketCard
if err := json.Unmarshal(marketData, &marketCards); err != nil {
    log.Fatalf("cannot parse market_events.json: %v", err)
}
// Передать в handler так же как small/big deal карточки
```

### Шаг 4 — Функция resolveMarket

Добавить в `handlers/turn.go` или `services/market.go`:

```go
func resolveMarket(
    game *models.GameSession,
    allPlayers []models.Player,
    marketCards []MarketCard,
) MarketResolution {
    // 1. Вытащить случайную карточку (используй services.RandomIndex — crypto/rand уже есть)
    card := marketCards[services.RandomIndex(len(marketCards))]

    // 2. Найти у каждого игрока актив где asset.type == card.SubType
    var eligible []EligibleSeller
    for _, player := range allPlayers {
        for _, asset := range player.Assets {
            if asset.Type == card.SubType {
                eligible = append(eligible, EligibleSeller{
                    PlayerID:   player.ID,
                    PlayerName: player.Name,
                    Asset:      asset,
                })
                break // один актив на игрока достаточно
            }
        }
    }

    return MarketResolution{
        Card:            card,
        EligibleSellers: eligible,
    }
}
```

### Шаг 5 — Заменить HTTP 501 на реальную логику

В `handlers/turn.go` найди case/if для MARKET клетки, замени:

```go
case "MARKET":
    // Загрузить всех игроков игры с их активами
    var allPlayers []models.Player
    // используй тот же паттерн что в других местах turn.go для загрузки игроков

    resolution := resolveMarket(game, allPlayers, h.marketCards)

    // Сохранить ID карточки в game session (по аналогии с ActiveSmallDeal/ActiveBigDeal)
    game.ActiveMarketCardID = resolution.Card.ID
    game.TurnStatus = "AWAITING_MARKET_DECISIONS"

    // Сохранить список eligible_player_ids в game session или отдельной таблице
    // чтобы знать кто ещё не ответил

    if err := db.Save(&game).Error; err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }

    // Записать в event_log
    // "Market: {card.title} — предложение ${card.offer_price}"

    // Разослать ВСЕМ игрокам через WebSocket
    broadcast(game.ID, "MARKET_OPEN", map[string]interface{}{
        "card":             resolution.Card,
        "eligible_players": resolution.EligibleSellers,
        // eligible может быть пустым — тогда все просто Skip
    })

    c.JSON(200, gin.H{
        "turn_status":      "AWAITING_MARKET_DECISIONS",
        "market_card":      resolution.Card,
        "eligible_players": resolution.EligibleSellers,
    })
```

### Шаг 6 — Endpoint для решения по Market

В существующем Decision handler (POST /api/games/:id/decision) добавь обработку:

```go
// action: "MARKET_SELL" или "MARKET_SKIP"
// Body: { player_id, action, asset_id? }

case "MARKET_SELL":
    // Валидация:
    // 1. turn_status == "AWAITING_MARKET_DECISIONS"
    // 2. player_id есть в eligible_sellers
    // 3. У игрока реально есть актив с нужным type

    // Найти актив игрока
    var asset models.Asset
    // asset.Type == activeMarketCard.SubType

    // Продать:
    // player.CashOnHand += activeMarketCard.OfferPrice
    // player.CashOnHand -= asset.Mortgage (погасить ипотеку если есть)
    // удалить asset из БД
    // пересчитать statement: statement.Recalculate()
    // сохранить в БД

    // Записать в event_log:
    // "{player.Name} продал {asset.Title} за ${offer_price}"

    // Отметить что этот игрок ответил (убрать из pending list)
    // Broadcast: MARKET_DECISION { player_id, action: "sell", new_cash, updated_statement }

    // Проверить: все eligible игроки ответили?
    // Если да → завершить Market фазу → endTurn()

case "MARKET_SKIP":
    // Валидация: turn_status == "AWAITING_MARKET_DECISIONS"

    // Отметить что этот игрок ответил
    // Broadcast: MARKET_DECISION { player_id, action: "skip" }
    // Записать в event_log: "{player.Name} пропустил предложение {card.title}"

    // Проверить: все eligible игроки ответили?
    // Если да → endTurn()
    // Если eligible был пустой список → сразу endTurn()
```

### Шаг 7 — Расчёт прибыли при продаже

**ВАЖНО**: при продаже актива считать чистую прибыль правильно:

```go
// Для недвижимости с ипотекой:
netProfit := offerPrice - asset.Mortgage
player.CashOnHand += netProfit

// Для бизнеса/активов без ипотеки (mortgage=0):
player.CashOnHand += offerPrice

// После продажи пересчитать:
// - убрать passive_income этого актива
// - statement.Recalculate() → новый Cashflow
```

Пример из данных:
- Купил `HOUSE_3_2` за down_payment=$5,000, mortgage=$60,000
- Market предлагает $100,000
- Чистая прибыль = $100,000 - $60,000 (ипотека) = $40,000 в карман

### Шаг 8 — Frontend: обработка MARKET_OPEN в usePlayGameSocket.ts

Найди где обрабатывается `DEAL_DRAWN` событие. Добавь рядом:

```typescript
case 'MARKET_OPEN':
    set({
        marketCard: payload.market_card,
        eligiblePlayers: payload.eligible_players,
        // проверить входит ли текущий игрок в eligible_players
        canSellOnMarket: payload.eligible_players.some(
            (p: EligiblePlayer) => p.player_id === get().myPlayerId
        ),
        turnStatus: 'AWAITING_MARKET_DECISIONS'
    })
    break

case 'MARKET_DECISION':
    // обновить список кто уже ответил
    // если action="sell" — обновить statement этого игрока
    break
```

### Шаг 9 — Frontend: MarketDecisionDialog.tsx

Создать `components/play/MarketDecisionDialog.tsx` по образцу `DealDecisionDialog.tsx`:

```tsx
// Показывать когда: marketCard !== null
// Компонент видят ВСЕ игроки (карточка глобальная)

// Если текущий игрок в eligible_players (canSellOnMarket=true):
//   Показать: карточку, offer_price, свой актив который продаётся
//   Кнопки: "Продать за $X" | "Пропустить"
//   При продаже: POST /api/games/:id/decision { action:"MARKET_SELL", player_id }
//   При пропуске: POST /api/games/:id/decision { action:"MARKET_SKIP", player_id }

// Если текущий игрок НЕ в eligible_players:
//   Показать: карточку и сообщение "У вас нет такого актива"
//   Статус: ждём решения других игроков (показать кто ещё не ответил)

// Показать список: кто продал, кто пропустил, кто ещё думает
```

### Шаг 10 — Типы TypeScript (добавить в types/game.types.ts)

```typescript
export interface MarketCard {
    id: string
    type: string          // "REAL_ESTATE_BUYER"
    sub_type: string      // "CONDO_2_1" — ключ матчинга
    title: string
    offer_price: number
    description: string
    is_global: boolean
}

export interface EligiblePlayer {
    player_id: string
    player_name: string
    asset: Asset
}
```

### Шаг 11 — Добавить в Board.tsx

```tsx
// Импортировать MarketDecisionDialog
// Показывать когда marketCard !== null (аналогично DealDecisionDialog)
{marketCard && (
    <MarketDecisionDialog
        card={marketCard}
        eligiblePlayers={eligiblePlayers}
        canSell={canSellOnMarket}
        gameId={gameId}
        playerId={myPlayerId}
        onClose={() => set({ marketCard: null })}
    />
)}
```

### Шаг 12 — Тесты

```go
func TestResolveMarket_FindsEligiblePlayers(t *testing.T) {
    // Игрок 1 владеет HOUSE_3_2
    // Игрок 2 владеет CONDO_2_1
    // Market карточка sub_type = "HOUSE_3_2"
    // Ожидаем: eligible = [игрок1], игрок2 не в списке
}

func TestResolveMarket_NoEligiblePlayers(t *testing.T) {
    // Ни у кого нет активов
    // eligible = [] пустой список
    // Ход должен завершиться автоматически (не зависать)
}

func TestMarketSell_CalculatesNetProfit(t *testing.T) {
    // HOUSE_3_2: mortgage=60000, offer_price=100000
    // Ожидаем: player.CashOnHand += 40000 (не 100000!)
    // Ожидаем: passive_income уменьшился на cashflow этого актива
}

func TestMarketSell_BusinessNoMortgage(t *testing.T) {
    // LAND_10_ACRES: mortgage=0, offer_price=15000
    // Ожидаем: player.CashOnHand += 15000 (полная сумма)
}

func TestMarketSkip_TurnEndsWhenAllAnswered(t *testing.T) {
    // 2 eligible игрока, оба SKIP
    // После второго SKIP → turn_status = TURN_COMPLETE
}
```

### Шаг 13 — Ручная проверка

Последовательность тестирования:
```
1. Запусти: docker compose up --build
2. Создай игру с 2 игроками
3. Один игрок купи Small Deal — HOUSE_3_2 (дом 3/2)
4. Бросай кубики пока кто-нибудь не попадёт на клетку 5, 12 или 21
5. Проверь что НЕ возвращается HTTP 501
6. Если нет HOUSE_3_2 у игроков → карточка появляется но оба Skip → ход идёт дальше
7. Если есть HOUSE_3_2 → диалог с ценой → нажми Продать
8. Проверь: cash увеличился на (offer_price - mortgage)
9. Проверь: passive income уменьшился (актив убран из Statement)
10. Проверь: ход перешёл к следующему игроку
```

---

## ПРАВИЛА (обязательно соблюдать)

1. **Сначала читай, потом пиши** — перед каждым файлом сделай Read/cat
2. **Используй services.RandomIndex** (crypto/rand) — не math/rand
3. **Чистая прибыль = offer_price - asset.Mortgage** — не полная сумма
4. **is_global=true = все игроки могут продать** — не только тот кто попал на клетку
5. **Пустой eligible список = автоматический Skip** — игра не должна зависать
6. **Следуй паттерну SmallDeal/BigDeal** — не изобретай новые подходы
7. **Каждое действие пиши в event_log** — для истории игры
8. **Спрашивай перед изменением существующих файлов**
9. **После каждого шага: go test ./...**
10. **Statement.Recalculate() после каждого изменения активов**
