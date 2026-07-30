import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Banknote,
  Building2,
  Calculator,
  ClipboardCheck,
  Coins,
  Gamepad2,
  Lock,
  Users,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

type Lang = 'ru' | 'kz' | 'en'

const COPY: Record<
  Lang,
  {
    rules: string
    eyebrow: string
    titleTop: string
    titleAccent: string
    subtitle: string
    formulaLabel: string
    passive: string
    expenses: string
    formulaNote: string
    playerTag: string
    playerTitle: string
    playerDesc: string
    playerCta: string
    playerHint: string
    auditorTag: string
    auditorTitle: string
    auditorDesc: string
    auditorCta: string
    features: { title: string; desc: string }[]
  }
> = {
  ru: {
    rules: 'Правила',
    eyebrow: 'Мультиплеер · до 6 игроков',
    titleTop: 'Выберись из',
    titleAccent: 'Крысиных бег',
    subtitle:
      'Настольная игра про финансовую грамотность. Покупай активы, наращивай пассивный доход, выигрывай первым.',
    formulaLabel: 'УСЛОВИЕ ПОБЕДЫ',
    passive: 'Пассивный доход',
    expenses: 'Расходы',
    formulaNote: 'кто первый — тот выиграл',
    playerTag: 'ИГРОК',
    playerTitle: 'Присоединиться к игре',
    playerDesc: 'Введи код, который дал ведущий, и садись за стол.',
    playerCta: 'Войти',
    playerHint: 'Регистрация не нужна — только код и имя',
    auditorTag: 'ВЕДУЩИЙ',
    auditorTitle: 'Аудитор',
    auditorDesc: 'Создай сессию, раздай код, следи за финансами игроков.',
    auditorCta: 'Войти в консоль',
    features: [
      { title: 'Автоматический бланк', desc: 'Доходы и расходы считаются сами' },
      { title: 'Real-time', desc: 'Все видят ходы друг друга сразу' },
      { title: 'Рынок и аукционы', desc: 'Сделки между игроками' },
    ],
  },
  kz: {
    rules: 'Ережелер',
    eyebrow: 'Мультиплеер · 6 ойыншыға дейін',
    titleTop: 'Тышқан жарысынан',
    titleAccent: 'шық',
    subtitle:
      'Қаржылық сауаттылық туралы үстел ойыны. Активтер сатып ал, пассивті кірісті өсір, бірінші жең.',
    formulaLabel: 'ЖЕҢІС ШАРТЫ',
    passive: 'Пассивті кіріс',
    expenses: 'Шығындар',
    formulaNote: 'кім бірінші — сол жеңеді',
    playerTag: 'ОЙЫНШЫ',
    playerTitle: 'Ойынға қосылу',
    playerDesc: 'Жүргізуші берген кодты енгіз де, үстелге отыр.',
    playerCta: 'Кіру',
    playerHint: 'Тіркелу қажет емес — тек код пен есім',
    auditorTag: 'ЖҮРГІЗУШІ',
    auditorTitle: 'Аудитор',
    auditorDesc: 'Сессия құр, кодты тарат, ойыншылардың қаржысын бақыла.',
    auditorCta: 'Консольге кіру',
    features: [
      { title: 'Автоматты бланк', desc: 'Кіріс пен шығын өзі есептеледі' },
      { title: 'Real-time', desc: 'Барлығы бір-бірінің жүрісін бірден көреді' },
      { title: 'Нарық және аукцион', desc: 'Ойыншылар арасындағы мәмілелер' },
    ],
  },
  en: {
    rules: 'Rules',
    eyebrow: 'Multiplayer · up to 6 players',
    titleTop: 'Escape the',
    titleAccent: 'Rat Race',
    subtitle:
      'A board game about financial literacy. Buy assets, grow passive income, win first.',
    formulaLabel: 'WIN CONDITION',
    passive: 'Passive income',
    expenses: 'Expenses',
    formulaNote: 'first to cross the line wins',
    playerTag: 'PLAYER',
    playerTitle: 'Join a game',
    playerDesc: 'Enter the code your host gave you and take a seat.',
    playerCta: 'Join',
    playerHint: 'No sign-up needed — just a code and a name',
    auditorTag: 'HOST',
    auditorTitle: 'Auditor',
    auditorDesc: 'Create a session, share the code, track player finances.',
    auditorCta: 'Open console',
    features: [
      { title: 'Automatic statement', desc: 'Income and expenses calculated for you' },
      { title: 'Real-time', desc: 'Everyone sees each move instantly' },
      { title: 'Market and auctions', desc: 'Deals between players' },
    ],
  },
}

const LANG_LABELS: Record<Lang, string> = { ru: 'RU', kz: 'ҚЗ', en: 'EN' }
const FEATURE_ICONS = [Calculator, Zap, Building2]

export default function LandingPage() {
  const navigate = useNavigate()
  const [lang, setLang] = useState<Lang>('ru')
  const [code, setCode] = useState('')
  const rulesRef = useRef<HTMLDivElement>(null)

  const t = COPY[lang]
  const canJoin = code.trim().length >= 4

  function scrollToRules() {
    rulesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function goToJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!canJoin) return
    navigate(`/play/join?code=${encodeURIComponent(code.trim().toUpperCase())}`)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
              <Coins className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium tracking-tight">CashYOU</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={scrollToRules}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.rules}
            </button>
            <div className="flex gap-0.5 rounded-md border border-border p-0.5">
              {(Object.keys(LANG_LABELS) as Lang[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    lang === code
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {LANG_LABELS[code]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="px-6 pb-10 pt-14 text-center">
        <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] text-primary ring-1 ring-primary/25">
          <Users className="h-3 w-3" />
          {t.eyebrow}
        </div>

        <h1 className="text-3xl font-medium leading-[1.15] tracking-tight sm:text-4xl">
          {t.titleTop}
          <br />
          <span className="text-primary">{t.titleAccent}</span>
        </h1>

        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t.subtitle}
        </p>

        <div
          ref={rulesRef}
          className="mx-auto mt-7 max-w-sm rounded-xl border border-border bg-card px-5 py-4"
        >
          <p className="text-[10px] tracking-[0.08em] text-muted-foreground">
            {t.formulaLabel}
          </p>
          <div className="mt-2.5 flex items-center justify-center gap-2.5 text-sm">
            <span className="font-medium text-primary">{t.passive}</span>
            <span className="text-muted-foreground/50">&gt;</span>
            <span className="text-rose-400">{t.expenses}</span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{t.formulaNote}</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-3 px-6 pb-6 md:grid-cols-[1.45fr_1fr]">
        <form
          onSubmit={goToJoin}
          className="flex flex-col rounded-2xl border border-primary/40 bg-primary/[0.06] p-5"
        >
          <div className="mb-3 flex items-center gap-1.5 text-[10px] tracking-[0.06em] text-primary">
            <Gamepad2 className="h-3 w-3" />
            {t.playerTag}
          </div>
          <h2 className="text-[17px] font-medium tracking-tight">{t.playerTitle}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t.playerDesc}
          </p>

          <div className="mt-4 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="7TX56N"
              maxLength={6}
              autoCapitalize="characters"
              spellCheck={false}
              aria-label={t.playerTitle}
              className="min-w-0 flex-1 rounded-lg border border-primary/40 bg-primary/[0.04] px-3.5 py-2.5 font-mono text-base tracking-[0.22em] text-primary outline-none transition-colors placeholder:text-primary/30 focus:border-primary/70"
            />
            <Button type="submit" disabled={!canJoin} className="gap-1.5 px-5">
              {t.playerCta}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <p className="mt-2.5 text-[10px] text-muted-foreground">{t.playerHint}</p>
        </form>

        <div className="flex flex-col rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-1.5 text-[10px] tracking-[0.06em] text-muted-foreground">
            <ClipboardCheck className="h-3 w-3" />
            {t.auditorTag}
          </div>
          <h2 className="text-[17px] font-medium tracking-tight">{t.auditorTitle}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t.auditorDesc}
          </p>

          <Button
            variant="outline"
            className="mt-auto w-full gap-2 pt-2"
            onClick={() => navigate('/login')}
          >
            <Lock className="h-3.5 w-3.5" />
            {t.auditorCta}
          </Button>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto grid max-w-4xl gap-5 px-6 py-5 sm:grid-cols-3">
          {t.features.map((feature, i) => {
            const Icon = FEATURE_ICONS[i] ?? Banknote
            return (
              <div key={feature.title} className="flex gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-[11px] font-medium">{feature.title}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                    {feature.desc}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}