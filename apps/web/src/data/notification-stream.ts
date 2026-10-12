import { NOTIFICATION_STREAM_PATH, NotificationStreamEvent } from '@pv/contracts'
import { API_BASE_URL } from '@/app/api/base-url'

/** The one live connection behind the bell (`GET /notifications/stream`, SSE).
 *
 *  Module-level because `useAppChrome` runs on every screen: a hook-owned
 *  stream would close and reopen on each navigation. Holders are counted, and
 *  the last release waits `GRACE_MS` so the old screen's unmount and the new
 *  screen's mount count as one continuous hold. A different user always gets
 *  a fresh connection: the cookie is bound when the stream opens.
 *
 *  Only a VISIBLE tab holds a connection: every open stream is a request the
 *  API's proxy counts against its limit for as long as it lives, and nobody
 *  reads a hidden tab. `ready` on return is the catch-up signal, as it is
 *  after the server's deliberate 15-minute close. `live` is true from `ready`
 *  until the next error or hide; polling covers the rest. */

const GRACE_MS = 1_000
/** How long to wait before asking again after the server REFUSED the stream. */
const RETRY_MS = 30_000

type Hold = {
  userId: string
  onSignal: () => void
  source: EventSource | null
  refs: number
  timer?: number
  retry?: number
}

let hold: Hold | null = null
let live = false
const listeners = new Set<() => void>()

const setLive = (next: boolean) => {
  if (live === next) return
  live = next
  listeners.forEach((listener) => listener())
}

export const streamIsLive = () => live

export const subscribeStreamLive = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function connect(h: Hold) {
  if (h.source || document.visibilityState !== 'visible') return
  const source = new EventSource(`${API_BASE_URL}${NOTIFICATION_STREAM_PATH}`, {
    withCredentials: true,
  })
  source.addEventListener(NotificationStreamEvent.enum.ready, () => {
    setLive(true)
    h.onSignal()
  })
  source.addEventListener(NotificationStreamEvent.enum.changed, h.onSignal)
  /* A dropped line reconnects by itself; a refused one (503 with no push, a
     deploy's 502) is CLOSED for good, so it is reopened by hand. */
  source.onerror = () => {
    setLive(false)
    if (source.readyState !== EventSource.CLOSED) return
    disconnect(h)
    h.retry = window.setTimeout(() => connect(h), RETRY_MS)
  }
  h.source = source
}

function disconnect(h: Hold) {
  window.clearTimeout(h.retry)
  h.source?.close()
  h.source = null
  setLive(false)
}

const onVisibility = () => {
  if (!hold) return
  if (document.visibilityState === 'visible') connect(hold)
  else disconnect(hold)
}

function shut() {
  if (!hold) return
  window.clearTimeout(hold.timer)
  document.removeEventListener('visibilitychange', onVisibility)
  disconnect(hold)
  hold = null
}

/** Returns the release. `onSignal` runs on every `ready` and `changed`. */
export function holdNotificationStream(userId: string, onSignal: () => void): () => void {
  if (typeof EventSource === 'undefined') return () => {}
  if (hold && hold.userId !== userId) shut()
  if (!hold) {
    hold = { userId, onSignal, source: null, refs: 0 }
    document.addEventListener('visibilitychange', onVisibility)
    connect(hold)
  }
  const mine = hold
  window.clearTimeout(mine.timer)
  mine.refs += 1

  return () => {
    mine.refs -= 1
    if (mine.refs === 0 && hold === mine) mine.timer = window.setTimeout(shut, GRACE_MS)
  }
}
