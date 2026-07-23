# CashFlow — Deploy Prompt для Claude Code
# Railway (backend) + Vercel (frontend) + Neon (PostgreSQL)

---

## ШАГ 1 — Прочитай структуру проекта

Перед любыми изменениями выполни:
```bash
ls -la
cat docker-compose.yml
cat go.mod
cat frontend/package.json | grep -E '"name"|"scripts"'
```

---

## ШАГ 2 — Backend для Railway

Railway запускает Go-приложение через Dockerfile или Nixpacks.
Создай `backend/Dockerfile` если его нет:

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o server ./cmd/main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/server .
COPY --from=builder /app/data ./data
EXPOSE 8080
CMD ["./server"]
```

Если точка входа не в `cmd/main.go` — найди её:
```bash
find . -name "main.go" | head -5
```

И подставь правильный путь.

---

## ШАГ 3 — Environment переменные для Railway

Railway передаёт переменные через environment. Убедись что backend читает их так:

```go
// В main.go или config.go — должно быть именно os.Getenv, не хардкод
host     := os.Getenv("DB_HOST")
port     := os.Getenv("DB_PORT")
user     := os.Getenv("DB_USER")
password := os.Getenv("DB_PASSWORD")
dbname   := os.Getenv("DB_NAME")
```

Для Neon PostgreSQL Railway передаст одну переменную `DATABASE_URL` в формате:
```
postgresql://user:password@host/dbname?sslmode=require
```

Убедись что backend умеет читать `DATABASE_URL` напрямую:
```go
dsn := os.Getenv("DATABASE_URL")
if dsn == "" {
    // fallback на отдельные переменные
    dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=require",
        os.Getenv("DB_HOST"),
        os.Getenv("DB_PORT"),
        os.Getenv("DB_USER"),
        os.Getenv("DB_PASSWORD"),
        os.Getenv("DB_NAME"),
    )
}
```

Найди где сейчас создаётся DB connection:
```bash
grep -rn "gorm.Open\|sql.Open\|DATABASE_URL\|DB_HOST" backend/ --include="*.go" | head -10
```

---

## ШАГ 4 — CORS для продакшена

Backend должен принимать запросы с Vercel домена.
Найди где настроен CORS:
```bash
grep -rn "CORS\|cors\|AllowOrigins" backend/ --include="*.go" | head -10
```

Обнови CORS config чтобы принимал и localhost и Vercel:
```go
config := cors.Config{
    AllowOrigins: []string{
        "http://localhost:5173",
        "http://localhost:3000",
        os.Getenv("FRONTEND_URL"), // https://cashflow-xxx.vercel.app
    },
    AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
    AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
    AllowCredentials: true,
}
```

В Railway добавь переменную:
```
FRONTEND_URL=https://твой-проект.vercel.app
```

---

## ШАГ 5 — WebSocket для Railway

Railway поддерживает WebSocket. Убедись что:

1. Backend слушает на порту из переменной `PORT` (Railway сам назначает порт):
```go
port := os.Getenv("PORT")
if port == "" {
    port = "8080"
}
router.Run(":" + port)
```

Найди где сейчас запускается сервер:
```bash
grep -rn "router.Run\|http.Listen\|ListenAndServe" backend/ --include="*.go"
```

2. WebSocket URL на фронтенде должен использовать переменную окружения:
```typescript
// frontend/src/hooks/usePlayGameSocket.ts
const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080'
```

---

## ШАГ 6 — Frontend для Vercel

Создай `frontend/vercel.json`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Это нужно чтобы React Router работал на Vercel (без этого /play/join даёт 404).

Убедись что в `frontend/vite.config.ts` нет хардкода localhost:
```bash
cat frontend/vite.config.ts
```

---

## ШАГ 7 — Environment переменные для Vercel

Создай `frontend/.env.production`:
```
VITE_API_URL=https://твой-backend.railway.app
VITE_WS_URL=wss://твой-backend.railway.app
```

Найди где фронтенд обращается к API:
```bash
grep -rn "localhost:8000\|localhost:8080\|VITE_API" frontend/src --include="*.ts" --include="*.tsx" | head -20
```

Замени все хардкоды localhost на:
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'
```

---

## ШАГ 8 — Миграции на Neon PostgreSQL

Neon требует SSL. Убедись что все миграции запускаются с `sslmode=require`.

Найди как сейчас запускаются миграции:
```bash
grep -rn "AutoMigrate\|migrate\|migration" backend/ --include="*.go" | head -10
ls backend/db/migrations/ 2>/dev/null || ls backend/migrations/ 2>/dev/null
```

Если миграции через SQL файлы — добавь в Railway команду:
```
# Railway → Settings → Deploy → Start Command
./server migrate && ./server
```

Если через GORM AutoMigrate — убедись что запускается при старте.

---

## ШАГ 9 — railway.json (опционально)

Создай `railway.json` в корне:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "backend/Dockerfile"
  },
  "deploy": {
    "startCommand": "./server",
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

Добавь health endpoint в backend:
```go
router.GET("/health", func(c *gin.Context) {
    c.JSON(200, gin.H{"status": "ok"})
})
```

---

## ШАГ 10 — Проверка перед деплоем

Выполни локально и убедись что всё компилируется:

```bash
# Backend
cd backend && go build ./... && echo "✓ Backend builds"

# Frontend
cd frontend && npm run build && echo "✓ Frontend builds"
```

Если есть ошибки — исправь их до деплоя.

---

## ПОРЯДОК ДЕПЛОЯ

### Neon PostgreSQL:
1. Зайди на neon.tech → Create project
2. Скопируй connection string: `postgresql://user:pass@host/dbname?sslmode=require`
3. Сохрани — это будет `DATABASE_URL`

### Railway (backend):
1. railway.app → New Project → Deploy from GitHub
2. Выбери репозиторий olzhas2357/cashflow
3. Укажи Root Directory: `backend` (если Dockerfile там)
4. Добавь переменные:
```
DATABASE_URL=postgresql://...  (из Neon)
FRONTEND_URL=https://cashflow-xxx.vercel.app
PORT=8080
GIN_MODE=release
```
5. Deploy → скопируй Railway URL

### Vercel (frontend):
1. vercel.com → New Project → Import from GitHub
2. Framework: Vite
3. Root Directory: `frontend`
4. Добавь переменные:
```
VITE_API_URL=https://твой-backend.railway.app
VITE_WS_URL=wss://твой-backend.railway.app
```
5. Deploy

---

## ПРАВИЛА

- Читай файл перед изменением
- Не хардкодь URL — только через env переменные
- sslmode=require для Neon
- После каждого шага проверяй: go build ./... и npm run build
- Спрашивай перед изменением существующих файлов