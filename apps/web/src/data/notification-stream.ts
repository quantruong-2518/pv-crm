import { NOTIFICATION_STREAM_PATH, NotificationStreamEvent } from '@pv/contracts'
import { API_BASE_URL } from '@/app/api/base-url'
import { renewSession } from '@/app/auth'

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
/** First wait after the server REFUSED the stream; each refusal in a row
 *  doubles it up to the cap, so a server with no LISTEN is not asked forever. */
const RETRY_MS = 30_000
const RETRY_CAP_MS = 5 * 60_000

const STREAM_URL = `${API_BASE_URL}${NOTIFICATION_STREAM_PATH}`

type Hold = {
  userId: string
  onSignal: (event: NotificationStreamEvent) => void
  source: EventSource | null
  refs: number
  /** Refusals since the last `ready`; sets the next wait. */
  refusals: number
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
  const source = new EventSource(STREAM_URL, { withCredentials: true })
  source.addEventListener(NotificationStreamEvent.enum.ready, () => {
    h.refusals = 0
    setLive(true)
    h.onSignal('ready')
  })
  source.addEventListener(NotificationStreamEvent.enum.changed, () => h.onSignal('changed'))
  /* A dropped line reconnects by itself; a refused one (401, 503 with no
     push, a deploy's 502) is CLOSED for good, so `refused` decides what next. */
  source.onerror = () => {
    setLive(false)
    if (source.readyState !== EventSource.CLOSED) return
    disconnect(h)
    void refused(h)
  }
  h.source = source
}

/** EventSource hides the status of a refusal, so one plain request reads it.
 *  401 belongs to the auth layer: renew once, and if that fails the session
 *  ends, which releases the hold. Anything else waits longer each time. */
async function refused(h: Hold) {
  const status = await probeStatus()
  if (status === 401 && !(await renewSession())) return
  if (hold !== h || h.source) return
  if (status === 401) return connect(h)
  const wait = Math.min(RETRY_MS * 2 ** h.refusals, RETRY_CAP_MS)
  h.refusals += 1
  h.retry = window.setTimeout(() => connect(h), wait)
}

/** `null` when nothing answered. The body is dropped as soon as the headers land. */
async function probeStatus(): Promise<number | null> {
  const abort = new AbortController()
  try {
    return (await fetch(STREAM_URL, { credentials: 'include', signal: abort.signal })).status
  } catch {
    return null
  } finally {
    abort.abort()
  }
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

/** Returns the release. `onSignal` runs on every `ready` and `changed`; the
 *  latest holder's wins, since it belongs to the screen now mounted. */
export function holdNotificationStream(
  userId: string,
  onSignal: (event: NotificationStreamEvent) => void,
): () => void {
  if (typeof EventSource === 'undefined') return () => {}
  if (hold && hold.userId !== userId) shut()
  if (!hold) {
    hold = { userId, onSignal, source: null, refs: 0, refusals: 0 }
    document.addEventListener('visibilitychange', onVisibility)
    connect(hold)
  }
  const mine = hold
  mine.onSignal = onSignal
  window.clearTimeout(mine.timer)
  mine.refs += 1

  return () => {
    mine.refs -= 1
    if (mine.refs === 0 && hold === mine) mine.timer = window.setTimeout(shut, GRACE_MS)
  }
}
