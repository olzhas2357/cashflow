import { GitFork, Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const REPO_URL = 'https://github.com/olzhas2357/cashflow'

export default function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-3 px-6 py-5 text-xs text-muted-foreground sm:flex-row">
        <span>© {new Date().getFullYear()} CashYOU</span>
        <div className="flex items-center gap-4">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <GitFork className="h-3.5 w-3.5" />
            {t('footer.github')}
          </a>
          <a
            href={`${REPO_URL}/issues`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <Mail className="h-3.5 w-3.5" />
            {t('footer.contact')}
          </a>
        </div>
      </div>
    </footer>
  )
}
