import { Gamepad2, PlayCircle, Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const ICONS = [Gamepad2, Share2, PlayCircle]

interface Step {
  title: string
  desc: string
}

export default function HowItWorks() {
  const { t } = useTranslation()
  const steps = t('howItWorks.steps', { returnObjects: true }) as Step[]

  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h2 className="text-center text-lg font-medium tracking-tight">{t('howItWorks.title')}</h2>

        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          {steps.map((step, i) => {
            const Icon = ICONS[i] ?? Gamepad2
            return (
              <div
                key={step.title}
                className="flex flex-col items-center text-center sm:items-start sm:text-left"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <p className="mt-3 text-sm font-medium">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
