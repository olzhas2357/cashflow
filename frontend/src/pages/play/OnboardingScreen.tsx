import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Coins,
  Dice5,
  Lightbulb,
  PlayCircle,
  Rat,
  Target,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const YOUTUBE_VIDEO_ID = 'zoBimWopfgo'

type Lang = 'ru' | 'kz' | 'en'

type Section = {
  key: string
  icon: 'rat' | 'goal' | 'asset' | 'board' | 'tip'
  title: string
  text?: string
  formula?: string
  steps?: string[]
}

type Content = {
  badge: string
  title: string
  subtitle: string
  videoLabel: string
  videoPlaceholder: string
  cta: string
  sections: Section[]
}

const CONTENT: Record<Lang, Content> = {
  ru: {
    badge: 'Правила игры',
    title: 'Добро пожаловать в CashFlow 101',
    subtitle: 'Узнай как работают деньги — прямо в игре',
    videoLabel: 'Посмотри короткое видео перед стартом',
    videoPlaceholder: 'Видео скоро появится',
    cta: 'Готов играть!',
    sections: [
      {
        key: 'rat',
        icon: 'rat',
        title: 'Что такое Крысиные бега?',
        text: 'Ты работаешь → получаешь зарплату → платишь расходы → снова работаешь. Деньги уходят быстрее чем приходят. Это и есть Rat Race.',
      },
      {
        key: 'goal',
        icon: 'goal',
        title: 'Цель игры',
        text: 'Выйти из Крысиных бег! Для этого твой пассивный доход должен превысить ежемесячные расходы.',
        formula: 'Пассивный доход > Расходы = Свобода',
      },
      {
        key: 'asset',
        icon: 'asset',
        title: 'Что такое активы?',
        text: 'Активы приносят деньги пока ты спишь: недвижимость (аренда), акции, бизнес. Покупай активы — они работают за тебя.',
      },
      {
        key: 'board',
        icon: 'board',
        title: 'Как играть?',
        steps: [
          'Бросай кубик → двигай фишку по полю',
          'Deal → купи актив или пропусти',
          'Doodad → незапланированный расход, пропустить нельзя',
          'Payday → получи свой ежемесячный cashflow',
          'Market → продай актив по рыночной цене',
        ],
      },
      {
        key: 'tip',
        icon: 'tip',
        title: 'Главный совет',
        text: 'Каждый раз когда появляется сделка — спроси себя: увеличит ли это мой пассивный доход? Если да — бери.',
      },
    ],
  },
  kz: {
    badge: 'Ойын ережелері',
    title: 'CashYou-ге қош келдіңіз',
    subtitle: 'Ақшаның қалай жұмыс істейтінін ойын арқылы үйрен',
    videoLabel: 'Бастамас бұрын қысқа видео көр',
    videoPlaceholder: 'Видео жақында қосылады',
    cta: 'Ойнауға дайынмын!',
    sections: [
      {
        key: 'rat',
        icon: 'rat',
        title: 'Тышқан жарысы дегеніміз не?',
        text: 'Жұмыс істейсің → жалақы аласың → шығындарды төлейсің → қайта жұмыс істейсің. Бұл — Rat Race, тышқан жарысы.',
      },
      {
        key: 'goal',
        icon: 'goal',
        title: 'Ойынның мақсаты',
        text: 'Тышқан жарысынан шығу! Ол үшін пассивті кірісің ай сайынғы шығындарыңнан асуы керек.',
        formula: 'Пассивті кіріс > Шығындар = Еркіндік',
      },
      {
        key: 'asset',
        icon: 'asset',
        title: 'Активтер дегеніміз не?',
        text: 'Активтер сен ұйықтап жатқанда ақша әкеледі: жылжымайтын мүлік, акциялар, бизнес. Активтер сатып ал — олар сенің орныңа жұмыс істейді.',
      },
      {
        key: 'board',
        icon: 'board',
        title: 'Қалай ойнайды?',
        steps: [
          'Кубик лақтыр → фишканы жылжыт',
          'Deal → актив сатып ал немесе өткізіп жібер',
          'Doodad → жоспарланбаған шығын, өткізуге болмайды',
          'Payday → ай сайынғы cashflow-ды ал',
          'Market → активті нарықтық бағамен сат',
        ],
      },
      {
        key: 'tip',
        icon: 'tip',
        title: 'Басты кеңес',
        text: 'Мәміле пайда болған сайын өзіңнен сұра: бұл менің пассивті кірісімді арттыра ма? Иә болса — ал.',
      },
    ],
  },
  en: {
    badge: 'Game rules',
    title: 'Welcome to CashFlow 101',
    subtitle: 'Learn how money works — by playing',
    videoLabel: 'Watch a short video before you start',
    videoPlaceholder: 'Video coming soon',
    cta: 'Ready to play!',
    sections: [
      {
        key: 'rat',
        icon: 'rat',
        title: 'What is the Rat Race?',
        text: 'You work → get a paycheck → pay expenses → work again. Money leaves as fast as it comes. That is the Rat Race.',
      },
      {
        key: 'goal',
        icon: 'goal',
        title: 'Goal of the game',
        text: 'Escape the Rat Race! To do this, your passive income must exceed your monthly expenses.',
        formula: 'Passive income > Expenses = Freedom',
      },
      {
        key: 'asset',
        icon: 'asset',
        title: 'What are assets?',
        text: 'Assets make money while you sleep: real estate (rent), stocks, business. Buy assets — they work for you.',
      },
      {
        key: 'board',
        icon: 'board',
        title: 'How to play?',
        steps: [
          'Roll the dice → move your token',
          'Deal → buy an asset or skip',
          'Doodad → unexpected expense, cannot be skipped',
          'Payday → collect your monthly cashflow',
          'Market → sell an asset at market price',
        ],
      },
      {
        key: 'tip',
        icon: 'tip',
        title: 'Main tip',
        text: 'Every time a deal appears, ask yourself: will this increase my passive income? If yes — take it.',
      },
    ],
  },
}

const ICONS = {
  rat: Rat,
  goal: Target,
  asset: Wallet,
  board: Dice5,
  tip: Lightbulb,
}

const ICON_STYLES: Record<Section['icon'], string> = {
  rat: 'bg-rose-500/10 text-rose-400 ring-rose-500/25',
  goal: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25',
  asset: 'bg-sky-500/10 text-sky-400 ring-sky-500/25',
  board: 'bg-amber-500/10 text-amber-400 ring-amber-500/25',
  tip: 'bg-violet-500/10 text-violet-400 ring-violet-500/25',
}

const LANG_LABELS: Record<Lang, string> = { ru: 'RU', kz: 'ҚЗ', en: 'EN' }

export default function OnboardingScreen() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<Lang>('ru')
  const [readCount, setReadCount] = useState(0)

  const cardsRef = useRef<HTMLDivElement>(null)
  const seenRef = useRef<Set<string>>(new Set())

  const content = CONTENT[lang]
  const total = content.sections.length

  useEffect(() => {
    const root = cardsRef.current
    if (!root) return

    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const key = entry.target.getAttribute('data-key')
          if (key && !seenRef.current.has(key)) {
            seenRef.current.add(key)
            changed = true
          }
        })
        if (changed) setReadCount(seenRef.current.size)
      },
      { threshold: 0.5 },
    )

    root.querySelectorAll('[data-key]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [lang])

  const progress = Math.round((readCount / total) * 100)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
              <Coins className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Cashflow 101</span>
          </div>

          <div className="flex gap-0.5 rounded-lg border border-border p-0.5">
            {(Object.keys(LANG_LABELS) as Lang[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  lang === code
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/25'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {LANG_LABELS[code]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="border-b border-border px-4 py-8 text-center">
        <div className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary ring-1 ring-primary/25">
          <BookOpen className="h-3 w-3" />
          {content.badge}
        </div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{content.title}</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
          {content.subtitle}
        </p>
      </section>

      <div className="mx-auto max-w-2xl px-4 pt-6">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{content.videoLabel}</p>
        <div className="aspect-video overflow-hidden rounded-2xl border border-border bg-card shadow-lg ring-1 ring-black/5">
          {YOUTUBE_VIDEO_ID ? (
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&mute=1&rel=0`}
              title="Cashflow 101 intro"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/10 to-transparent text-muted-foreground">
              <PlayCircle className="h-10 w-10" />
              <span className="text-xs">{content.videoPlaceholder}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {readCount} / {total}
        </span>
      </div>

      <div ref={cardsRef} className="mx-auto max-w-2xl space-y-2.5 px-4 pb-2">
        {content.sections.map((section) => {
          const Icon = ICONS[section.icon]
          return (
            <article
              key={section.key}
              data-key={section.key}
              className="flex gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${ICON_STYLES[section.icon]}`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-medium">{section.title}</h2>

                {section.text && (
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {section.text}
                  </p>
                )}

                {section.formula && (
                  <div className="mt-2.5 rounded-lg bg-primary/10 px-3 py-2 text-center text-[13px] font-medium text-primary ring-1 ring-primary/20">
                    {section.formula}
                  </div>
                )}

                {section.steps && (
                  <ol className="mt-2 space-y-1.5">
                    {section.steps.map((step, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-[13px] text-muted-foreground"
                      >
                        <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary ring-1 ring-primary/20">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </article>
          )
        })}
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-10 pt-4">
        <Button
          className="w-full gap-2 py-6 text-base font-semibold"
          onClick={() => navigate('/play/lobby', { replace: true })}
        >
          {content.cta}
          <ArrowRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}