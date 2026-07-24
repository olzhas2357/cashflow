# Онбординг экран для игроков — Claude Code Prompt

## КОНТЕКСТ

Файл: `frontend/src/pages/play/JoinGame.tsx` — уже существует.
Сейчас флоу: Join → сразу /play/lobby

Нужно добавить: Join → **Онбординг экран** → /play/lobby

Онбординг показывается ОДИН РАЗ после успешного входа.
Игрок читает правила → нажимает "Готов играть" → попадает в лобби.

---

## ШАГ 1 — Прочитай существующие файлы

```bash
cat frontend/src/pages/play/JoinGame.tsx
cat frontend/src/store/usePlayStore.ts
cat frontend/src/components/ui/card.tsx
ls frontend/src/pages/play/
```

---

## ШАГ 2 — Создай новый файл OnboardingScreen.tsx

Создай `frontend/src/pages/play/OnboardingScreen.tsx`:

```tsx
// Онбординг показывается после успешного join, до лобби.
// Три языка: RU / EN — переключатель вверху.
// После "Готов" → navigate('/play/lobby')
```

### Структура компонента:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dice5, TrendingUp, Home, Briefcase, BarChart2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Lang = 'ru' | 'en'

// --- КОНТЕНТ НА ТРЁХ ЯЗЫКАХ ---
const CONTENT = {
  ru: {
    badge: 'RU',
    title: 'Добро пожаловать в CashFlow 101',
    subtitle: 'Узнай как работают деньги — прямо в игре',
    sections: [
      {
        icon: 'rat',
        title: '🐀 Что такое Крысиные бега?',
        text: 'Ты работаешь → получаешь зарплату → платишь расходы → снова работаешь. Деньги уходят быстрее чем приходят. Это и есть Rat Race — крысиные бега.',
      },
      {
        icon: 'goal',
        title: '🎯 Цель игры',
        text: 'Выйти из Крысиных бег! Для этого твой пассивный доход (от активов) должен превысить твои ежемесячные расходы.',
        formula: 'Пассивный доход > Расходы = Свобода 🎉',
      },
      {
        icon: 'assets',
        title: '💰 Что такое активы?',
        text: 'Активы — это то, что приносит деньги пока ты спишь: недвижимость (аренда), акции (дивиденды), бизнес (прибыль). Покупай активы — они работают за тебя.',
      },
      {
        icon: 'board',
        title: '🎲 Как играть?',
        steps: [
          'Бросай кубик → двигай фишку по полю',
          'Попал на Deal → реши: купить актив или пропустить',
          'Попал на Doodad → незапланированный расход (нельзя пропустить)',
          'Попал на Payday → получи свой ежемесячный Cashflow',
          'Попал на Market → можно продать актив по рыночной цене',
        ],
      },
      {
        icon: 'tip',
        title: '💡 Главный совет',
        text: 'Не трать все деньги сразу. Каждый раз когда появляется сделка — думай: "Увеличит ли это мой пассивный доход?" Если да — бери!',
      },
    ],
    ready: 'Готов играть! →',
  },
  en: {
    badge: 'EN',
    title: 'Welcome to CashFlow 101',
    subtitle: 'Learn how money works — by playing',
    sections: [
      {
        icon: 'rat',
        title: '🐀 What is the Rat Race?',
        text: 'You work → get a paycheck → pay expenses → work again. Money leaves as fast as it comes. That\'s the Rat Race.',
      },
      {
        icon: 'goal',
        title: '🎯 Goal of the Game',
        text: 'Escape the Rat Race! To do this, your passive income (from assets) must exceed your monthly expenses.',
        formula: 'Passive Income > Expenses = Freedom 🎉',
      },
      {
        icon: 'assets',
        title: '💰 What are Assets?',
        text: 'Assets make money while you sleep: real estate (rent), stocks (dividends), business (profit). Buy assets — they work for you.',
      },
      {
        icon: 'board',
        title: '🎲 How to Play?',
        steps: [
          'Roll the dice → move your token',
          'Land on Deal → decide: buy an asset or skip',
          'Land on Doodad → unexpected expense (cannot skip)',
          'Land on Payday → collect your monthly Cashflow',
          'Land on Market → sell your asset at market price',
        ],
      },
      {
        icon: 'tip',
        title: '💡 Main Tip',
        text: 'Don\'t spend all your money at once. Every time a deal appears, ask yourself: "Will this increase my passive income?" If yes — take it!',
      },
    ],
    ready: 'Ready to Play! →',
  },
}

export default function OnboardingScreen() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<Lang>('ru')
  const content = CONTENT[lang]

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Dice5 className="h-5 w-5 text-primary" />
            <span className="font-semibold">CashFlow 101</span>
          </div>
          {/* Language switcher */}
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {(['ru', 'kz', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  lang === l
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {CONTENT[l].badge}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">{content.title}</h1>
          <p className="mt-1 text-muted-foreground">{content.subtitle}</p>
        </div>

        {/* Sections */}
        {content.sections.map((section, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <h2 className="mb-2 font-semibold">{section.title}</h2>
            {'text' in section && (
              <p className="text-sm text-muted-foreground leading-relaxed">{section.text}</p>
            )}
            {'formula' in section && section.formula && (
              <div className="mt-3 rounded-lg bg-primary/10 px-4 py-2 text-center text-sm font-medium text-primary">
                {section.formula}
              </div>
            )}
            {'steps' in section && section.steps && (
              <ul className="mt-2 space-y-2">
                {section.steps.map((step, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                      {j + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {/* CTA Button */}
        <Button
          className="w-full py-6 text-base font-semibold"
          onClick={() => navigate('/play/lobby', { replace: true })}
        >
          {content.ready}
          <ChevronRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
```

---

## ШАГ 3 — Добавь маршрут в router

Найди где определены маршруты:
```bash
grep -rn "play/lobby\|play/join\|play/board" frontend/src --include="*.tsx" --include="*.ts" | grep -i "route\|path" | head -10
```

Добавь маршрут `/play/onboarding`:
```tsx
{ path: '/play/onboarding', element: <OnboardingScreen /> }
```

---

## ШАГ 4 — Измени JoinGame.tsx

В файле `frontend/src/pages/play/JoinGame.tsx` найди:
```tsx
navigate('/play/lobby', { replace: true })
```

Замени на:
```tsx
navigate('/play/onboarding', { replace: true })
```

---

## ШАГ 5 — Проверь

```bash
npm run build
```

Флоу должен быть:
```
/play/join → (успешный вход) → /play/onboarding → (кнопка "Готов") → /play/lobby
```

---

## ПРАВИЛА

- Читай файлы перед изменением
- Не меняй логику join/auth — только навигацию
- Используй существующие компоненты из @/components/ui/
- Спрашивай перед изменением существующих файлов
- После изменений: npm run build