import { useSyncExternalStore } from 'react'

/** System language — only the auth flow reads it today, but the state lives
 *  HERE (not in a screen's `useState`) because it must survive navigation:
 *  switching language on the sign-in screen and following the forgot-password
 *  link must not fall back to Vietnamese partway through.
 *
 *  Same shape as `useThemeMode`/`toggleTheme` in `@pv/ui` (DOM read + a
 *  `storage` event for cross-tab sync) — one difference: no anti-FOUC script
 *  in `index.html`. The one thing language adds to the page is the Hangul
 *  face, loaded on demand by `loadHangulFace` (ADR 0108). */
export type Lang = 'vi' | 'en' | 'ko'

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

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== LANG_KEY && event.key !== null) return
    current = isLang(event.newValue) ? event.newValue : 'vi'
    loadHangulFace(current)
    onChange()
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

export function onLangChange(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
}

export function setLang(next: Lang) {
  current = next
  loadHangulFace(current)
  try {
    localStorage.setItem(LANG_KEY, current)
  } catch {
    // Still switch for this visit when the browser blocks localStorage.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}
