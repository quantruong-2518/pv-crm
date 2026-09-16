import { useSyncExternalStore } from 'react'
import { Button } from './button'

export type ThemeMode = 'aurora' | 'stone'
const THEME_KEY = 'pv-theme'
const CHANGE_EVENT = 'pv-theme-change'

function snapshot(): ThemeMode {
  return document.documentElement.dataset.theme === 'stone' ? 'stone' : 'aurora'
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
      applyTheme(event.newValue === 'stone' ? 'stone' : 'aurora')
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

/** Shared by the standalone switch and the account menu row, so both remember
 *  the choice the same way. */
export function toggleTheme() {
  const next: ThemeMode = snapshot() === 'stone' ? 'aurora' : 'stone'
  applyTheme(next)
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    // Still switch for this visit when browser storage is unavailable.
  }
}

export function ThemeSwitch() {
  const theme = useThemeMode()
  const stone = theme === 'stone'
  return (
    <Button
      className="focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
      size="sm"
      variant="ghost"
      aria-label="Giao diện sáng Đá mịn"
      aria-pressed={stone}
      title={stone ? 'Chuyển sang Aurora tối' : 'Chuyển sang Đá mịn sáng'}
      onClick={toggleTheme}
    >
      <span aria-hidden="true" className="bg-accent shadow-control size-3 shrink-0 rounded-full" />
      {stone ? 'Đá mịn' : 'Aurora'}
    </Button>
  )
}
