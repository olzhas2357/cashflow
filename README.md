# Cashflow Game Platform

Онлайн-платформа для игры в Cashflow (денежный поток) с ролью аудитора, финансовыми отчётами и управлением сделками.

---

## 📌 Описание

Проект реализует цифровую версию игры Cashflow:

* Игроки выбирают профессию
* Ведут финансовый отчёт (как в бумажной версии)
* Покупают активы (недвижимость, бизнес, акции)
* Управляют доходами, расходами и долгами
* Аудитор контролирует корректность всех операций

Цель игры:

> Пассивный доход > Общие расходы → выход из “крысиных бегов”

---

## 🏗 Архитектура

```text
Frontend (React)
        ↓
Backend (Go + Gin)
        ↓
PostgreSQL
```

---

## 🚀 Запуск проекта

### 1. Установить зависимости

* Docker
* Docker Compose

---

### 2. Запуск

```bash
docker compose down
docker compose up --build
```

---

### 3. Если есть проблемы с БД

```bash
docker compose down -v
docker compose up --build
```

---

## ⚙️ Конфигурация

Файл: `docker-compose.yml`

```yaml
POSTGRES_USER: cashflow
POSTGRES_PASSWORD: cashflow
POSTGRES_DB: cashflow

DB_HOST: postgres
DB_PORT: 5432
DB_USER: cashflow
DB_PASSWORD: cashflow
DB_NAME: cashflow
```

---

## 📊 Основные сущности

### Player

* cash (наличные)
* passive_income (пассивный доход)
* total_expenses (расходы)
* monthly_cashflow

---

### Assets

* недвижимость
* бизнес
* акции

---

### Liabilities

* кредиты
* ипотека

---

## 💰 Финансовая логика

### Формула:

```text
monthly_cashflow = total_income - total_expenses
```

---

## 🏠 Покупка актива

При покупке:

1. Вычесть down_payment из cash
2. Добавить актив
3. Добавить mortgage в liabilities
4. Добавить cashflow в passive_income
5. Пересчитать cashflow

---

## 📈 Акции

### Покупка:

```text
total = price * shares
```

* списывается cash
* добавляется asset

---

### Новости (Stock News)

❗ Важно:

* НЕ меняется cash
* НЕ меняется total assets
* меняется только:

  * количество акций
  * цена за акцию

---

## 🏦 Кредит

### Взять кредит:

```text
+ cash
+ liabilities
+ 10% в расходы
```

---

### Погасить кредит:

```text
- cash
- liabilities
- убрать 10% расход
```

---

## 👶 События

### Ребёнок

* +1 ребёнок (макс 3)
* увеличиваются расходы

---

### Payday

* игрок получает monthly_cashflow

---

## 🧾 Аудит

После каждой операции:

* пересчёт финансов
* проверка корректности
* запись в financial_logs

---

## 📂 Структура проекта

```text
backend/
  handlers/
  models/
  seeds/
  utils/

frontend/
  components/
  pages/

data/
  small_deals/
  big_deals/
  professions/
```

---

## 📦 Seed данные

Данные загружаются из JSON:

* professions
* small deals
* big deals
* market

❗ Важно:

Seed не перезаписывает данные автоматически
Для обновления:

```bash
docker compose down -v
```

---

## 🛠 Полезные команды

```bash
# запуск
docker compose up --build

# остановка
docker compose down

# очистка БД
docker compose down -v

# логи backend
docker logs -f cashflow_backend
```

---

## 🎯 Планы развития

* [ ] UI для аудитора
* [ ] рынок (продажа активов)
* [ ] мультиплеер
* [ ] realtime (WebSocket)
* [ ] кредитная система (несколько займов)
* [ ] аналитика игроков

---

## 🧠 Идея проекта

Проект не просто игра, а:

> симулятор финансовой грамотности

Игрок видит, как каждое решение влияет на:

* доход
* расходы
* cashflow
* долг

---

## ⚠️ Важно

Backend — это не просто API, а:

> финансовая модель + бухгалтерия + аудит

---

## 👨‍💻 Автор

Разработка: olzhas2357

---
