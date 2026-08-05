import { useTranslation } from 'react-i18next'
import type { SupportedLang } from '@/i18n/i18n'

const LANGS: SupportedLang[] = ['ru', 'kk', 'en']

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const active = i18n.language as SupportedLang

  return (
    <div className="flex gap-0.5 rounded-md border border-border p-0.5">
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => i18n.changeLanguage(lang)}
          className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
            active === lang ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-pressed={active === lang}
        >
          {t(`languageSwitcher.${lang}`)}
        </button>
      ))}
    </div>
  )
}
