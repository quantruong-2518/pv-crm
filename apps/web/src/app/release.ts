import { toast } from '@/app/toast'

/** Keeps an open tab from running a bundle the server has already replaced.
 *
 *  Two failure modes, one module. A tab that lazy-loads a chunk the deploy
 *  deleted gets `vite:preloadError`: reload once, since the fresh index names
 *  the new chunk. A tab that merely sits there is told through a toast when
 *  `version.json` (written at build time) stops matching the id baked into the
 *  bundle. The reload is capped at one per 10 s so a truly broken deploy
 *  cannot loop. */

const RELOAD_KEY = 'pv:last-chunk-reload'
const POLL_MS = 5 * 60_000

function reloadOnce(): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Date.now() - last < 10_000) return
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    /* storage blocked: a single reload is still better than a dead screen */
  }
  window.location.reload()
}

let announced = false

async function checkVersion(): Promise<void> {
  if (announced) return
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const { id } = (await res.json()) as { id?: string }
    if (!id || id === __BUILD_ID__) return
    announced = true
    toast('Có bản mới của PV One', {
      tone: 'info',
      detail: 'Tải lại khi tiện để dùng bản mới nhất.',
      action: { label: 'Tải lại', onClick: () => window.location.reload() },
      ttlMs: 3_600_000,
    })
  } catch {
    /* offline or mid-deploy: the next tick asks again */
  }
}

export function startReleaseWatch(): void {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    reloadOnce()
  })
  if (import.meta.env.DEV) return
  window.setInterval(() => void checkVersion(), POLL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkVersion()
  })
}
