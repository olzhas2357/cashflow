# Этап 1: регистрация + создание комнаты (только локально, тест)

## Цель
Зарегистрированный пользователь создаёт игру и получает код + ссылку.
Друзья заходят по ссылке БЕЗ регистрации, только имя.

## База данных (миграция)
```
users   (id, email UNIQUE, password_hash, created_at)
rooms   (id, code UNIQUE, host_user_id, status, settings jsonb, created_at, expires_at)
players (id, room_id, user_id NULL, name, player_token UNIQUE, seat, is_host)
```
- `status`: `WAITING` / `IN_PROGRESS` / `FINISHED`
- `expires_at` заполнять при создании: `now() + 2 hours`. Автоочистку пока НЕ делаем.
- `UNIQUE (room_id, seat)` — два игрока не могут занять одно место
- максимум 6 игроков в комнате, 7-й получает 409

## Endpoints
```
POST /api/auth/register     {email, password}     → JWT (30 дней)
POST /api/auth/login        {email, password}     → JWT
GET  /api/auth/me                                 → текущий пользователь
POST /api/rooms             [нужен JWT]           → {code, join_url}
POST /api/rooms/:code/join  {name}  [БЕЗ JWT]     → {player_token, room}
GET  /api/rooms/:code                             → состояние комнаты
```

## Лимит комнат
```sql
SELECT count(*) FROM rooms
WHERE host_user_id = $1 AND status IN ('WAITING','IN_PROGRESS')
```
Если >= `MAX_ACTIVE_ROOMS` → HTTP 409:
«Лимит 3 активные игры. Заверши одну, чтобы создать новую.»

`MAX_ACTIVE_ROOMS = 3` — константа в одном месте, чтобы потом менять.

## Код комнаты
6 символов A-Z и 2-9, БЕЗ `0 O 1 I L`.
Проверять уникальность в БД, до 5 попыток.

## Безопасность
- bcrypt (cost 10), пароль минимум 8 символов
- JWT-секрет из `.env`, никогда не в коде. `.env` в `.gitignore`
- email в нижний регистр перед сохранением
- на поле `password_hash` в Go-структуре поставить `json:"-"`
- rate limit на `/register` и `/rooms`: 10 запросов/час на IP

## Frontend (4 экрана)
| Путь | Что там |
|---|---|
| `/register` | email + пароль |
| `/login` | email + пароль |
| `/dashboard` | одна большая кнопка «Создать игру» + список моих активных комнат |
| `/room/:code` | лобби: код крупно, список игроков, «Копировать ссылку» |
| `/join/:code` | только поле «Твоё имя», без регистрации |

- `player_token` → `localStorage`. F5 не выкидывает из комнаты
- при ошибке 409 показывать текст с сервера, не «Something went wrong»

## НЕ делать на этом этапе
Игровую логику, кубик, WebSocket, i18n, деплой, дизайн лендинга.
Только auth + комната + лобби.

## Проверка вручную
1. Зарегистрироваться → создать комнату → появился код и ссылка
2. **Открыть ссылку в инкогнито → войти гостем по имени → гость виден в лобби у хоста**
3. **Создать 3 комнаты → 4-я даёт понятную ошибку про лимит**
4. F5 в обоих браузерах → и хост, и гость остались в лобби
5. Пароль и `password_hash` не возвращаются ни в одном ответе API
6. Логин с неверным паролем → 401, без подсказки «такого email нет»