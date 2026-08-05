import { Coins } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from './LanguageSwitcher'

export default function Header() {
  const { t } = useTranslation()

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
            <Coins className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-medium tracking-tight">{t('header.logo')}</span>
        </div>

        <LanguageSwitcher />
      </div>
    </header>
  )
}
