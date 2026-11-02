import { useSyncExternalStore } from 'react'

/** Language shared by every screen. Keep it outside an individual page so a
 *  change survives navigation and reaches the chrome, dialogs and route title.
 *
 *  Same shape as `useThemeMode`/`toggleTheme` in `@pv/ui` (DOM read + a
 *  `storage` event for cross-tab sync). The one extra language asset is the Hangul
 *  face, loaded on demand by `loadHangulFace` (ADR 0108). */
export type Lang = 'vi' | 'en' | 'ko'
export type Message = Record<Lang, string>

export const LOCALE_TAG: Record<Lang, string> = {
  vi: 'vi-VN',
  en: 'en-US',
  ko: 'ko-KR',
}

function applyDocumentLanguage(lang: Lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = LOCALE_TAG[lang]
}

/** Declare one product message with all supported languages present. */
export const message = (vi: string, en: string, ko: string): Message => ({ vi, en, ko })

const LANG_KEY = 'pv-lang'
const CHANGE_EVENT = 'pv-lang-change'

export const LANG_LABEL: Record<Lang, string> = { en: 'EN', vi: 'VN', ko: 'KO' }

function isLang(value: string | null): value is Lang {
  return value === 'en' || value === 'vi' || value === 'ko'
}

function readStored(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    return isLang(stored) ? stored : 'vi'
  } catch {
    return 'vi'
  }
}

let current: Lang = readStored()

/** Pretendard is the Hangul face in every theme's stack; its stylesheet is
 *  fetched the first time the page turns Korean, never for Vietnamese. */
const HANGUL_FACE_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'
/** Pins that exact file: a third-party stylesheet on a page holding customer
 *  data must not be able to change under us. */
const HANGUL_FACE_SRI = 'sha384-GIdEBaqGN9mNkDkMkzMHW8EKUqtpPIe/sLj1X7DIrnc9uPtLROJgmuDlh+3rBw0j'

function loadHangulFace(lang: Lang) {
  if (lang !== 'ko' || document.querySelector('link[data-hangul-face]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = HANGUL_FACE_URL
  link.integrity = HANGUL_FACE_SRI
  link.crossOrigin = 'anonymous'
  link.dataset.hangulFace = ''
  document.head.append(link)
}
loadHangulFace(current)
applyDocumentLanguage(current)

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== LANG_KEY && event.key !== null) return
    const next = isLang(event.newValue) ? event.newValue : 'vi'
    if (next === current) return
    current = next
    loadHangulFace(current)
    applyDocumentLanguage(current)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function useLang(): Lang {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => 'vi',
  )
}

/** Non-React read for code outside the tree (head metadata in `routes.tsx`). */
export const getLang = (): Lang => current

/** Also works in non-React models, route metadata and event handlers. */
export const translate = (copy: Message, lang: Lang = getLang()): string => copy[lang]

export function formatNumber(
  value: number,
  lang: Lang = getLang(),
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(LOCALE_TAG[lang], options).format(value)
}

export function formatCurrency(value: number, currency: string, lang: Lang = getLang()) {
  return new Intl.NumberFormat(LOCALE_TAG[lang], {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
  }).format(value)
}

/** A calendar day has no time zone; a timestamp uses the reader's zone. */
export function formatDate(
  value: string | Date,
  lang: Lang = getLang(),
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
) {
  const date =
    typeof value === 'string'
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
      : value
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat(LOCALE_TAG[lang], options).format(date)
}

export function useI18n() {
  const lang = useLang()
  return {
    lang,
    t: (copy: Message) => translate(copy, lang),
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      formatNumber(value, lang, options),
    currency: (value: number, code: string) => formatCurrency(value, code, lang),
    date: (value: string | Date, options?: Intl.DateTimeFormatOptions) =>
      formatDate(value, lang, options),
  }
}

export function onLangChange(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
}

export function setLang(next: Lang) {
  current = next
  loadHangulFace(current)
  applyDocumentLanguage(current)
  try {
    localStorage.setItem(LANG_KEY, current)
  } catch {
    // Still switch for this visit when the browser blocks localStorage.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}
