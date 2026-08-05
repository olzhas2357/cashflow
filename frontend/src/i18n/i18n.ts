import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import kk from '../locales/kk/common.json'
import ru from '../locales/ru/common.json'
import en from '../locales/en/common.json'

export type SupportedLang = 'kk' | 'ru' | 'en'

const SUPPORTED: SupportedLang[] = ['kk', 'ru', 'en']
const STORAGE_KEY = 'cashflow_lang'

function isSupported(value: string | null): value is SupportedLang {
  return !!value && (SUPPORTED as string[]).includes(value)
}

function detectLanguage(): SupportedLang {
  const fromUrl = new URLSearchParams(window.location.search).get('lang')
  if (isSupported(fromUrl)) return fromUrl

  const fromStorage = window.localStorage.getItem(STORAGE_KEY)
  if (isSupported(fromStorage)) return fromStorage

  const browserLang = window.navigator.language.slice(0, 2).toLowerCase()
  if (isSupported(browserLang)) return browserLang

  return 'ru'
}

i18n.use(initReactI18next).init({
  resources: {
    kk: { common: kk },
    ru: { common: ru },
    en: { common: en },
  },
  lng: detectLanguage(),
  fallbackLng: 'ru',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lng) => {
  window.localStorage.setItem(STORAGE_KEY, lng)
})

export default i18n
