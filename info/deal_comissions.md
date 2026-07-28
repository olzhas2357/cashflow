# Передача сделки с комиссией, всем сразу (кто первый — тот купил) — Claude Code Prompt

## КОНТЕКСТ

Это РАЗВИТИЕ механики передачи сделки. Отличия от базовой версии:

1. **Комиссия**: игрок A назначает сумму комиссии сверху цены карточки.
   Покупатель платит банку цену карточки + платит игроку A комиссию.
2. **Всем сразу**: A не выбирает одного игрока — предложение уходит ВСЕМ
   активным игрокам. Кто первый принял — тот купил. Остальные видят "занято".

### Игровая логика:
```
Игрок A попал на Deal → вытянул House 3/2 (взнос $5000 по карточке)
        ↓
A не хочет сам → назначает комиссию, напр. $2000 → "Предложить всем"
        ↓
ВСЕ активные игроки (B, C, D) видят: "A предлагает House 3/2.
Цена $5000 + комиссия $2000 игроку A. Итого $7000. Принять?"
        ↓
Кто ПЕРВЫЙ нажал "Принять":
  - платит банку $5000 (покупка актива)
  - платит игроку A $2000 (комиссия)
  - получает актив со всем пассивным доходом
        ↓
Остальные видят "Сделку уже забрал игрок B"
        ↓
Ход игрока A завершается
```

---

## КРИТИЧНО — ГОНКА "КТО ПЕРВЫЙ"

Двое игроков могут нажать "Принять" одновременно. Без защиты оба спишут
деньги, а актив один. РЕШЕНИЕ — атомарный захват через условный UPDATE:

```go
// Внутри транзакции: пытаемся "захватить" предложение.
// UPDATE вернёт 1 строку только если предложение ещё не занято.
result := tx.Model(&models.GameSession{}).
    Where("id = ? AND deal_offer_claimed_by IS NULL AND turn_status = ?", gameID, "AWAITING_OFFER_RESPONSE").
    Update("deal_offer_claimed_by", callerID)

if result.RowsAffected == 0 {
    // Кто-то уже забрал — этот игрок опоздал
    return errors.New("offer_already_claimed")
}
// Только ОДИН запрос дойдёт сюда — он и покупает
```

База данных гарантирует, что только один UPDATE выиграет. Это единственный
надёжный способ — не полагайся на проверки в Go-памяти.

---

## ШАГ 1 — Прочитай существующий код

```bash
sed -n '556,620p' backend/handlers/turn.go     # decideBuyOrPass
grep -n "applySmallDealPurchase\|applyBigDealPurchase" backend/handlers/auditor_panel.go
grep -A20 "func.*applySmallDealPurchase" backend/handlers/auditor_panel.go
grep -n "CashOnHand\|cash_on_hand\|Cash " backend/models/models.go
```

Нужно найти как переводить деньги игроку (для выплаты комиссии A).
Проверь есть ли готовая функция перевода:
```bash
grep -rn "Transaction\|transfer\|CashOnHand.*+=\|applyPayday" backend/handlers/auditor_panel.go | head
```

---

## ШАГ 2 — Поля в GameSession

```go
DealOfferedByPlayerID *uuid.UUID `gorm:"type:uuid" json:"deal_offered_by_player_id"` // кто предложил (A)
DealOfferCommission   int64      `gorm:"default:0" json:"deal_offer_commission"`     // комиссия A
DealOfferClaimedBy    *uuid.UUID `gorm:"type:uuid" json:"deal_offer_claimed_by"`     // кто забрал (для гонки)
```

Миграция `database/migrations/0024_deal_offer_commission.sql`:
```sql
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS deal_offered_by_player_id UUID;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS deal_offer_commission BIGINT NOT NULL DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS deal_offer_claimed_by UUID;
```

---

## ШАГ 3 — DecisionRequest: новые поля и действия

```go
Commission *int64 `json:"commission"` // сумма комиссии (для offer_deal_all)
```

Действия в Action:
```
"offer_deal_all" — A предлагает сделку всем с комиссией (нужен commission)
"accept_offer"   — игрок принимает (гонка — кто первый)
"cancel_offer"   — A отменяет своё предложение (вернуться к buy/pass)
```

Диспетчер в Decision:
```go
switch req.Action {
case "offer_deal_all":
    h.decideOfferDealAll(c, gameID, callerID, game, req)
    return
case "accept_offer":
    h.decideAcceptOffer(c, gameID, callerID, game, req)
    return
case "cancel_offer":
    h.decideCancelOffer(c, gameID, callerID, game, req)
    return
}
```

---

## ШАГ 4 — decideOfferDealAll (A предлагает всем)

```go
func (h *TurnHandler) decideOfferDealAll(c *gin.Context, gameID, callerID uuid.UUID, game models.GameSession, req DecisionRequest) {
    // Валидация: ход A, есть активная сделка, комиссия >= 0
    if game.CurrentTurnPlayerID == nil || *game.CurrentTurnPlayerID != callerID {
        c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "not_your_turn"})
        return
    }
    if game.ActiveSmallDealID == nil && game.ActiveBigDealID == nil {
        c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "no_active_deal"})
        return
    }
    if req.Commission == nil || *req.Commission < 0 {
        c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_commission"})
        return
    }

    game.DealOfferedByPlayerID = &callerID
    game.DealOfferCommission = *req.Commission
    game.DealOfferClaimedBy = nil // никто ещё не забрал
    game.TurnStatus = "AWAITING_OFFER_RESPONSE"
    if err := h.db.Save(&game).Error; err != nil {
        c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "offer_save_failed"})
        return
    }

    // Загружаем карточку для показа
    var dealPayload interface{}
    var basePrice int64
    if game.ActiveSmallDealID != nil {
        var d models.SmallDeal
        h.db.First(&d, "id = ?", *game.ActiveSmallDealID)
        dealPayload = d
        basePrice = d.DownPayment // или d.Price — проверь какое поле = цена входа
    } else {
        var d models.BigDeal
        h.db.First(&d, "id = ?", *game.ActiveBigDealID)
        dealPayload = d
        basePrice = d.DownPayment
    }

    // Broadcast ВСЕМ — каждый активный игрок увидит предложение
    if h.hub != nil {
        h.hub.Broadcast(gameID.String(), "DEAL_OFFERED_ALL", gin.H{
            "from_player_id": callerID.String(),
            "deal":           dealPayload,
            "base_price":     basePrice,
            "commission":     *req.Commission,
            "total_price":    basePrice + *req.Commission,
        })
    }
    c.JSON(http.StatusOK, gin.H{"ok": true, "awaiting_offer_response": true})
}
```

---

## ШАГ 5 — decideAcceptOffer (гонка: кто первый)

ЭТО САМАЯ ВАЖНАЯ ФУНКЦИЯ. Вся покупка + комиссия + захват — в ОДНОЙ транзакции.

```go
func (h *TurnHandler) decideAcceptOffer(c *gin.Context, gameID, callerID uuid.UUID, game models.GameSession, req DecisionRequest) {
    if game.TurnStatus != "AWAITING_OFFER_RESPONSE" {
        c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "no_pending_offer"})
        return
    }
    // Предложивший (A) не может принять своё же предложение
    if game.DealOfferedByPlayerID != nil && *game.DealOfferedByPlayerID == callerID {
        c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "cannot_accept_own_offer"})
        return
    }

    opener := *game.DealOfferedByPlayerID
    commission := game.DealOfferCommission

    // ВСЁ в одной транзакции — атомарный захват + покупка + комиссия
    err := h.db.Transaction(func(tx *gorm.DB) error {
        // 1. АТОМАРНЫЙ ЗАХВАТ — только один игрок выиграет гонку
        claim := tx.Model(&models.GameSession{}).
            Where("id = ? AND deal_offer_claimed_by IS NULL AND turn_status = ?", gameID, "AWAITING_OFFER_RESPONSE").
            Update("deal_offer_claimed_by", callerID)
        if claim.Error != nil {
            return claim.Error
        }
        if claim.RowsAffected == 0 {
            return errors.New("offer_already_claimed") // опоздал
        }

        // 2. Покупка актива для callerID (buyer). Переиспользуем существующую логику.
        // ВНИМАНИЕ: applySmallDealPurchase использует h.db, не tx. Нужно либо
        // передать tx, либо вызвать её вне транзакции ПОСЛЕ успешного захвата.
        // Если функция не принимает tx — см. примечание ниже.

        // 3. Выплата комиссии игроку A (перевод callerID -> opener)
        if commission > 0 {
            // Списываем комиссию у покупателя
            if err := tx.Model(&models.Player{}).
                Where("id = ?", callerID).
                Update("cash_on_hand", gorm.Expr("cash_on_hand - ?", commission)).Error; err != nil {
                return err
            }
            // Начисляем комиссию игроку A
            if err := tx.Model(&models.Player{}).
                Where("id = ?", opener).
                Update("cash_on_hand", gorm.Expr("cash_on_hand + ?", commission)).Error; err != nil {
                return err
            }
        }
        return nil
    })

    if err != nil {
        if err.Error() == "offer_already_claimed" {
            c.JSON(http.StatusConflict, typ.ErrorResponse{Error: "offer_already_claimed"})
            return
        }
        c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
        return
    }

    // Покупка актива (если applySmallDealPurchase не встроилась в транзакцию выше)
    var purchaseErr error
    switch {
    case game.ActiveSmallDealID != nil:
        purchaseErr = h.auditor.applySmallDealPurchase(gameID, EventRequest{
            PlayerID: callerID, DealID: game.ActiveSmallDealID,
            Shares: req.Shares, AllowLoan: req.AllowLoan,
        })
    case game.ActiveBigDealID != nil:
        purchaseErr = h.auditor.applyBigDealPurchase(gameID, callerID, *game.ActiveBigDealID)
    }
    if purchaseErr != nil {
        c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: purchaseErr.Error()})
        return
    }

    // Очищаем состояние
    var g models.GameSession
    h.db.First(&g, "id = ?", gameID)
    g.DealOfferedByPlayerID = nil
    g.DealOfferCommission = 0
    g.DealOfferClaimedBy = nil
    g.ActiveSmallDealID = nil
    g.ActiveSmallDealOpenedBy = nil
    g.ActiveBigDealID = nil
    h.db.Save(&g)

    if h.hub != nil {
        h.hub.Broadcast(gameID.String(), "OFFER_CLAIMED", gin.H{
            "buyer_id":   callerID.String(),
            "seller_id":  opener.String(),
            "commission": commission,
        })
    }

    // Ход завершается для A (opener), не для покупателя
    h.finishResolution(c, gameID, opener)
}
```

ВАЖНОЕ ПРИМЕЧАНИЕ про транзакцию:
Проверь принимает ли applySmallDealPurchase параметр *gorm.DB (tx). Если да —
передавай tx внутрь транзакции для полной атомарности. Если нет (использует
h.db напрямую) — оставь как в примере: захват+комиссия в транзакции, покупка
сразу после. Захват гарантирует что покупает только один игрок, так что
рассинхрона не будет, хотя идеал — всё в одной tx. Отметь это в PR для рефактора.

---

## ШАГ 6 — decideCancelOffer (A передумал)

```go
func (h *TurnHandler) decideCancelOffer(c *gin.Context, gameID, callerID uuid.UUID, game models.GameSession, req DecisionRequest) {
    // Только автор предложения может отменить, и только пока никто не забрал
    if game.DealOfferedByPlayerID == nil || *game.DealOfferedByPlayerID != callerID {
        c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "not_offer_owner"})
        return
    }
    if game.DealOfferClaimedBy != nil {
        c.JSON(http.StatusConflict, typ.ErrorResponse{Error: "offer_already_claimed"})
        return
    }
    // Возвращаемся в обычный AWAITING_DECISION (buy/pass)
    game.DealOfferedByPlayerID = nil
    game.DealOfferCommission = 0
    game.TurnStatus = "AWAITING_DECISION"
    h.db.Save(&game)
    if h.hub != nil {
        h.hub.Broadcast(gameID.String(), "OFFER_CANCELLED", gin.H{"player_id": callerID.String()})
    }
    c.JSON(http.StatusOK, gin.H{"ok": true})
}
```

---

## ШАГ 7 — Frontend

### В DealDecisionDialog добавь кнопку "Предложить всем"
При клике — поле ввода комиссии + кнопка "Отправить":
```tsx
// [Купить] [Предложить всем] [Пропустить]
// "Предложить всем" → показать input комиссии → POST { action:"offer_deal_all", commission }
```

### Обработка DEAL_OFFERED_ALL (у всех кроме A)
```typescript
case 'DEAL_OFFERED_ALL': {
    if (payload.from_player_id !== myPlayerId) {
        set({ incomingOffer: {
            fromPlayerId: payload.from_player_id,
            deal: payload.deal,
            basePrice: payload.base_price,
            commission: payload.commission,
            totalPrice: payload.total_price,
        }})
    }
    break
}
case 'OFFER_CLAIMED': {
    // Показать всем: "Игрок X забрал сделку"
    set({ incomingOffer: null })
    break
}
case 'OFFER_CANCELLED':
    set({ incomingOffer: null })
    break
```

### OfferAcceptDialog.tsx (видят все кроме A)
```tsx
// Показывает: "Игрок A предлагает House 3/2"
// Цена карточки: $5000 + Комиссия игроку A: $2000 = Итого $7000
// Кнопка: [Принять за $7000]
// При клике: POST { action:"accept_offer" }
// Если ответ 409 offer_already_claimed → показать "Сделку уже забрали"
// Кнопка [Пропустить] просто закрывает диалог (не обязателен ответ)
```

ВАЖНО обработать HTTP 409 — игрок опоздал, показать дружелюбно.

---

## ШАГ 8 — Проверка

```bash
cd backend && go build ./... && go test ./...
cd frontend && npm run build
```

Ручной тест (3 игрока A, B, C):
1. A тянет Deal, назначает комиссию $2000, жмёт "Предложить всем"
2. B и C оба видят предложение с итоговой ценой
3. B жмёт "Принять" первым → B получает актив, платит $5000 банку + $2000 игроку A
4. C видит "Сделку забрал B"
5. Проверь: у A прибавилось $2000, у B актив и списание, у C ничего
6. Проверь: ход перешёл к следующему за A
7. Тест гонки: B и C жмут одновременно → только один получает актив, второй видит 409

---

## ПРАВИЛА

1. Атомарный захват через UPDATE ... WHERE claimed_by IS NULL — единственный
   надёжный способ против гонки. Не полагайся на проверки в Go-памяти.
2. Переиспользуй applySmallDealPurchase/applyBigDealPurchase для покупки
3. Комиссия: списать у покупателя, начислить A — в той же транзакции что захват
4. finishResolution вызывается для A (opener), не для покупателя
5. A не может принять своё предложение
6. Обработай HTTP 409 на фронте дружелюбно ("уже забрали")
7. Проверь реальные имена полей (DownPayment/Price, cash_on_hand)
8. Не ломай существующий buy/pass — добавляй рядом
9. Спрашивай перед изменением существующих файлов
10. После изменений: go build ./... && go test ./... && npm run build