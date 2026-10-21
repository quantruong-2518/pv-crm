import { useSyncExternalStore } from 'react'
import { Button } from './button'

/** Cycle order of the switch; Aurora stays the default. The anti-FOUC script
 *  in apps/web/index.html repeats this list — change both together. */
const THEMES = ['aurora', 'stone', 'porcelain'] as const
export type ThemeMode = (typeof THEMES)[number]
const THEME_KEY = 'pv-theme'
const CHANGE_EVENT = 'pv-theme-change'

export const THEME_LABEL: Record<ThemeMode, string> = {
  aurora: 'Aurora',
  stone: 'Đá mịn',
  porcelain: 'Sứ',
}

function asTheme(value: string | null | undefined): ThemeMode {
  return THEMES.find((theme) => theme === value) ?? 'aurora'
}

function snapshot(): ThemeMode {
  return asTheme(document.documentElement.dataset.theme)
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle('dark', theme === 'aurora')
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) {
    meta.content = getComputedStyle(document.documentElement)
      .getPropertyValue('--background')
      .trim()
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) {
      applyTheme(asTheme(event.newValue))
    }
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function useThemeMode() {
  return useSyncExternalStore(subscribe, snapshot, (): ThemeMode => 'aurora')
}

function nextTheme(theme: ThemeMode): ThemeMode {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] ?? 'aurora'
}

/** Shared by the standalone switch and the account menu row, so both remember
 *  the choice the same way. Steps to the next theme in `THEMES`. */
export function toggleTheme() {
  const next = nextTheme(snapshot())
  applyTheme(next)
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    // Still switch for this visit when browser storage is unavailable.
  }
}

export function ThemeSwitch() {
  const theme = useThemeMode()
  return (
    <Button
      className="focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
      size="sm"
      variant="ghost"
      aria-label={`Giao diện ${THEME_LABEL[theme]}`}
      title={`Chuyển sang ${THEME_LABEL[nextTheme(theme)]}`}
      onClick={toggleTheme}
    >
      <span aria-hidden="true" className="bg-accent shadow-control size-3 shrink-0 rounded-full" />
      {THEME_LABEL[theme]}
    </Button>
  )
}
