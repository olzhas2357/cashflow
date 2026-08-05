import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, KeyRound, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import GhostCursorBackground from './GhostCursorBackground'

export default function Hero() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [joinOpen, setJoinOpen] = useState(false)
  const [code, setCode] = useState('')
  const canJoin = code.trim().length >= 4

  function handleJoinSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canJoin) return
    navigate(`/play/join?code=${encodeURIComponent(code.trim().toUpperCase())}`)
  }

  return (
    <section className="relative overflow-hidden px-6 pb-10 pt-14 text-center">
      <GhostCursorBackground />

      <div className="relative mx-auto max-w-lg">
        <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] text-primary ring-1 ring-primary/25">
          {t('hero.eyebrow')}
        </div>

        <h1 className="text-3xl font-medium leading-[1.15] tracking-tight sm:text-4xl">
          {t('hero.titleTop')}
          <br />
          <span className="text-primary">{t('hero.titleAccent')}</span>
        </h1>

        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t('hero.subtitle')}
        </p>

        <div className="mt-7">
          {!joinOpen ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button size="lg" className="w-full gap-2 sm:w-auto" onClick={() => navigate('/login')}>
                <Play className="h-4 w-4" />
                {t('hero.createGame')}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full gap-2 sm:w-auto"
                onClick={() => setJoinOpen(true)}
              >
                <KeyRound className="h-4 w-4" />
                {t('hero.joinByCode')}
              </Button>
            </div>
          ) : (
            <form
              onSubmit={handleJoinSubmit}
              className="mx-auto flex max-w-xs flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center"
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t('hero.joinPlaceholder')}
                maxLength={6}
                autoFocus
                autoCapitalize="characters"
                spellCheck={false}
                aria-label={t('hero.joinByCode')}
                className="min-w-0 rounded-lg border border-primary/40 bg-primary/[0.04] px-3.5 py-2.5 text-center font-mono text-base tracking-[0.22em] text-primary outline-none transition-colors placeholder:text-primary/30 focus:border-primary/70 sm:w-40"
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={!canJoin} className="flex-1 gap-1.5 sm:flex-none">
                  {t('hero.joinSubmit')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" onClick={() => setJoinOpen(false)}>
                  {t('hero.joinCancel')}
                </Button>
              </div>
            </form>
          )}

          <p className="mt-4 text-[11px] text-muted-foreground">{t('hero.hint')}</p>
        </div>
      </div>
    </section>
  )
}
