import { useSyncExternalStore } from 'react'

/** System language — only the auth flow reads it today, but the state lives
 *  HERE (not in a screen's `useState`) because it must survive navigation:
 *  switching language on the sign-in screen and following the forgot-password
 *  link must not fall back to Vietnamese partway through.
 *
 *  Same shape as `useThemeMode`/`toggleTheme` in `@pv/ui` (DOM read + a
 *  `storage` event for cross-tab sync) — one difference: no anti-FOUC script
 *  in `index.html`, since no CSS depends on language the way it depends on
 *  `data-theme`. */
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

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== LANG_KEY && event.key !== null) return
    current = isLang(event.newValue) ? event.newValue : 'vi'
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

export function setLang(next: Lang) {
  current = next
  try {
    localStorage.setItem(LANG_KEY, current)
  } catch {
    // Still switch for this visit when the browser blocks localStorage.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}
