# Внутриигровой чат (эфемерный, текст + эмодзи) — Claude Code Prompt

## КОНТЕКСТ

Добавить общий чат в игру. Требования:
- **Эфемерный** — без сохранения в БД. Сообщения живут только в открытых
  вкладках. Нет таблицы, нет миграции.
- **Текст + быстрые эмодзи** (👍😂🔥😮💰)
- Переиспользует существующий WebSocket-хаб (Broadcast по game_id)

Всё соединение, реконнект и фильтрация по игре уже готовы:
- `services/realtime.go` — Hub с Broadcast(gameID, event)
- `hooks/usePlayGameSocket.ts` — WS с реконнектом
- События уже рассылаются: DICE_ROLLED, DEAL_DRAWN, PLAYER_WON и т.д.

Чат — это просто новый тип события CHAT_MESSAGE рядом с существующими.

---

## ШАГ 1 — Прочитай существующий код

```bash
grep -n "Broadcast\|func.*Hub" backend/services/realtime.go
sed -n '1,50p' backend/handlers/realtime.go
grep -rn "DICE_ROLLED\|case '" frontend/src/hooks/usePlayGameSocket.ts | head -20
grep -rn "GetPlayerID\|player_id\|middleware" backend/handlers/turn.go | head -5
```

Нужно понять:
- Как Hub рассылает события (сигнатура Broadcast)
- Как обработчик WS на фронте разбирает события (switch по type)
- Как получить player_id и имя из JWT в хендлере

---

## ШАГ 2 — Backend: эндпоинт отправки сообщения

Создай `backend/handlers/chat.go`:

```go
package handlers

import (
    "net/http"
    "strings"
    "time"

    "cashflow/services"
    "cashflow/typ"

    "github.com/gin-gonic/gin"
    "github.com/google/uuid"
    "gorm.io/gorm"
)

type ChatHandler struct {
    db  *gorm.DB
    hub *services.RealtimeHub
}

func NewChatHandler(db *gorm.DB, hub *services.RealtimeHub) *ChatHandler {
    return &ChatHandler{db: db, hub: hub}
}

type ChatMessageRequest struct {
    Text  string `json:"text"`
    Emoji string `json:"emoji"` // либо text, либо emoji — одно из двух
}

const maxChatLen = 300 // защита от спама простынями

func (h *ChatHandler) SendMessage(c *gin.Context) {
    gameIDStr := c.Param("id")
    gameID, err := uuid.Parse(gameIDStr)
    if err != nil {
        c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
        return
    }

    // player_id и имя берём из JWT (middleware), НЕ из тела запроса —
    // иначе игрок сможет писать от чужого имени
    playerID := middlewareGetPlayerID(c) // используй вашу функцию из middleware
    playerName := middlewareGetPlayerName(c) // если нет — загрузи из БД по playerID

    var req ChatMessageRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
        return
    }

    // Валидация: либо эмодзи, либо текст
    if req.Emoji != "" {
        // Разрешаем только конкретный набор эмодзи (защита от произвольных строк)
        allowed := map[string]bool{"👍": true, "😂": true, "🔥": true, "😮": true, "💰": true}
        if !allowed[req.Emoji] {
            c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_emoji"})
            return
        }
        h.broadcast(gameID, playerID, playerName, "", req.Emoji)
        c.JSON(http.StatusOK, gin.H{"ok": true})
        return
    }

    text := strings.TrimSpace(req.Text)
    if text == "" {
        c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "empty_message"})
        return
    }
    if len([]rune(text)) > maxChatLen {
        text = string([]rune(text)[:maxChatLen]) // обрезаем, не отклоняем
    }

    h.broadcast(gameID, playerID, playerName, text, "")
    c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *ChatHandler) broadcast(gameID, playerID uuid.UUID, name, text, emoji string) {
    if h.hub == nil {
        return
    }
    h.hub.Broadcast(gameID.String(), "CHAT_MESSAGE", gin.H{
        "player_id": playerID.String(),
        "name":      name,
        "text":      text,  // пусто если это эмодзи
        "emoji":     emoji, // пусто если это текст
        "ts":        time.Now().UnixMilli(),
    })
}
```

ВАЖНО: проверь как в проекте получают player_id из JWT. Найди:
```bash
grep -rn "GetPlayerID\|c.Get(\|MustGet\|player_id" backend/middleware/ | head
```
Подставь реальную функцию вместо middlewareGetPlayerID. Имя игрока — если
его нет в JWT, загрузи одним запросом: h.db.First(&player, "id = ?", playerID).

---

## ШАГ 3 — Backend: зарегистрируй маршрут

В `router/router.go` в группе auth (требует JWT):
```go
chatHandler := handlers.NewChatHandler(cfg.DB, hub)
auth.POST("/games/:id/chat", chatHandler.SendMessage)
```

Проверь что hub доступен в NewServer — он уже создаётся там:
```bash
grep -n "NewRealtimeHub\|hub :=" backend/router/router.go
```

---

## ШАГ 4 — Frontend: обработка CHAT_MESSAGE

В `hooks/usePlayGameSocket.ts` (или в zustand store где разбираются события)
добавь в switch:
```typescript
case 'CHAT_MESSAGE': {
    const msg = {
        id: `${payload.player_id}-${payload.ts}`,
        playerId: payload.player_id,
        name: payload.name,
        text: payload.text,
        emoji: payload.emoji,
        ts: payload.ts,
    }
    // добавляем в конец, храним только последние 100 (эфемерно, в памяти)
    set((state) => ({
        chatMessages: [...state.chatMessages, msg].slice(-100),
    }))
    break
}
```

Добавь в store начальное состояние:
```typescript
chatMessages: [] as ChatMessage[],
```

---

## ШАГ 5 — Frontend: api/play.ts

Добавь функцию отправки:
```typescript
export async function sendChatMessage(gameId: string, token: string, payload: { text?: string; emoji?: string }) {
    return apiFetch(`/api/games/${gameId}/chat`, {
        method: 'POST',
        token,
        body: JSON.stringify(payload),
    })
}
```

---

## ШАГ 6 — Frontend: ChatPanel.tsx

Создай `frontend/src/components/play/ChatPanel.tsx`. Дизайн — тёмно-синий стиль
проекта (фон #0d1420, границы #1c2838, бирюзовый акцент #4addd0).

```tsx
import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { sendChatMessage } from '@/api/play'

type ChatMessage = {
  id: string
  playerId: string
  name: string
  text?: string
  emoji?: string
  ts: number
}

const QUICK_EMOJIS = ['👍', '😂', '🔥', '😮', '💰']

// Стабильный цвет имени по player_id — тот же принцип что цвета фишек
const NAME_COLORS = ['#4addd0', '#c0a050', '#a08ad0', '#5aca7a', '#d08a8a', '#7a9ad0']
function colorForPlayer(playerId: string, roster: string[]): string {
  const idx = roster.indexOf(playerId)
  return NAME_COLORS[idx % NAME_COLORS.length] ?? '#8a9aaa'
}

type Props = {
  gameId: string
  token: string
  myPlayerId: string
  messages: ChatMessage[]
  roster: string[]  // массив player_id в порядке присоединения (для цветов)
}

export default function ChatPanel({ gameId, token, messages, roster }: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // автоскролл вниз при новом сообщении
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  async function send(payload: { text?: string; emoji?: string }) {
    if (sending) return
    setSending(true)
    try {
      await sendChatMessage(gameId, token, payload)
    } catch {
      // тихо игнорируем — эфемерный чат, не критично
    } finally {
      setSending(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    send({ text: t })
    setText('')
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="flex-1 text-[13px] font-medium">Чат</span>
        <span className="text-[11px] text-muted-foreground">{roster.length} игроков</span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3.5">
        {messages.length === 0 && (
          <p className="py-8 text-center text-[11px] text-muted-foreground">
            Пока сообщений нет. Общайтесь и договаривайтесь о сделках!
          </p>
        )}
        {messages.map((m) =>
          m.emoji ? (
            <div key={m.id} className="w-fit rounded-2xl border border-border bg-background/50 px-2.5 py-1 text-lg">
              {m.emoji}
            </div>
          ) : (
            <div key={m.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: colorForPlayer(m.playerId, roster) }}
                >
                  {m.name}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-[13px] leading-snug text-foreground/90">{m.text}</p>
            </div>
          ),
        )}
      </div>

      <div className="border-t border-border px-3 py-2.5">
        <div className="mb-2 flex gap-1.5">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => send({ emoji: e })}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/50 text-base transition-transform hover:scale-110 hover:border-primary/40"
            >
              {e}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            placeholder="Написать сообщение…"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary/40"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="flex w-9 items-center justify-center rounded-lg border border-primary/40 bg-primary/15 text-primary disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
```

---

## ШАГ 7 — Подключи ChatPanel в Board

Найди раскладку страницы игры:
```bash
grep -rn "FinancialStatement\|Board\|grid\|flex" frontend/src/pages/play/Board.tsx | head
```

Добавь ChatPanel сбоку (например под финансовым бланком или в отдельной колонке):
```tsx
<ChatPanel
  gameId={gameId}
  token={token}
  myPlayerId={myPlayerId}
  messages={chatMessages}
  roster={players.map((p) => p.id)}  // порядок = порядок присоединения
/>
```

На мобильных — можно сделать сворачиваемым (кнопка "Чат" открывает панель),
но для первой версии достаточно колонки на десктопе.

---

## ШАГ 8 — Проверка

```bash
cd backend && go build ./... && go test ./...
cd frontend && npm run build
```

Ручной тест (2 вкладки):
1. Игрок A пишет сообщение → у игрока B появляется мгновенно
2. Игрок B жмёт эмодзи 🔥 → у A появляется пузырь
3. Имена разного цвета
4. Автоскролл вниз при новом сообщении
5. Длинное сообщение (>300) обрезается, не ломает вёрстку
6. Перезагрузка страницы → чат пустой (эфемерный, это ожидаемо)

---

## ПРАВИЛА

1. player_id и имя берём из JWT, НЕ из тела запроса (защита от подмены имени)
2. Эмодзи только из белого списка (защита от произвольных строк)
3. Текст обрезаем до 300 символов, не отклоняем
4. Чат эфемерный — никакой БД, храним последние 100 в памяти фронта
5. Переиспользуй существующий Hub.Broadcast — не создавай новый WS
6. Цвет имени по player_id — тот же принцип что цвета фишек
7. Ошибку отправки игнорируем тихо (чат не критичен для игры)
8. Спрашивай перед изменением существующих файлов
9. После изменений: go build ./... && go test ./... && npm run build
```