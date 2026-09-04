import { create } from 'zustand'
import { API_BASE_URL } from './base-url'

/** Is the SERVER answering — a different question from "did this call fail".
 *
 *  One failed request is the screen's business: `ApiError` carries a `kind` and
 *  `userMessage` turns it into a sentence beside the thing that failed. This
 *  store answers the question no single screen can see, because each one only
 *  ever watches its own call — NOTHING is getting through at all.
 *
 *  That distinction is the whole point. Taking the app over for a 404, or for
 *  one endpoint throwing 500, hides eight working screens to report a fault on
 *  the ninth. Only "nobody is home" earns a takeover, and only two things prove
 *  it: `fetch` itself threw the network kind, or the gateway answered for a
 *  machine that did not (`GATEWAY` below).
 *
 *  The probe deliberately does NOT go through `client.ts`. That chain stamps a
 *  session, refuses dead ones, and reports its failures back into this store —
 *  a probe running through it would keep re-reporting the very thing it was
 *  sent to check, and a dead session would fail the probe while the server is
 *  perfectly alive. */

export type ServerHealth = 'ok' | 'down'

/** Seconds before each of the first probes; after those, `THEN` forever.
 *
 *  Starts at five because the outage this app actually sees is a deploy rolling
 *  a machine, and that comes back inside a minute. Settles at a minute because
 *  a real outage outlasts anyone's patience, and a tab left open overnight must
 *  not spend the night hammering a host that is down. */
const WAITS = [5, 10, 20, 30]
const THEN = 60

/** Statuses that mean NOBODY answered — the platform's proxy speaking on behalf
 *  of a machine that is not running. Every other status, 500 included, proves
 *  the app is up and is one endpoint's problem, not the server's. */
const GATEWAY = new Set([502, 503, 504])

export const isGatewayDown = (status: number | undefined): boolean => GATEWAY.has(status ?? 0)

type ServerHealthState = {
  health: ServerHealth
  /** When the current — or, after recovery, the most recent — outage began.
   *  Kept past recovery on purpose: the screen closes by saying how long it
   *  lasted, and a person who walked away deserves that number. */
  since: number | null
  /** Probes made since the server went down. Drives the backoff AND the probe
   *  count printed on the card, which is what makes the waiting look like work
   *  being done rather than a frozen page. */
  probes: number
  /** Epoch ms of the next automatic probe — what the countdown counts down to.
   *  `null` while a probe is in flight, because then there is nothing to wait
   *  for. */
  nextProbeAt: number | null
  probing: boolean
}

export const useServerHealth = create<ServerHealthState>(() => ({
  health: 'ok',
  since: null,
  probes: 0,
  nextProbeAt: null,
  probing: false,
}))

let timer: ReturnType<typeof setTimeout> | undefined

/** A request came back with nothing behind it. Idempotent: ten screens all
 *  failing at once is ONE outage, and only the first of them starts the clock. */
export function reportUnreachable(): void {
  if (useServerHealth.getState().health === 'down') return
  useServerHealth.setState({ health: 'down', since: Date.now(), probes: 0 })
  scheduleProbe()
}

/** The server said something — anything at all, including a refusal. */
export function reportAnswering(): void {
  if (useServerHealth.getState().health === 'ok') return
  clearTimeout(timer)
  useServerHealth.setState({ health: 'ok', probes: 0, nextProbeAt: null, probing: false })
}

/** Ask right now instead of waiting out the countdown — what the card's
 *  check-now button calls. */
export async function probeServer(): Promise<void> {
  if (useServerHealth.getState().probing) return
  clearTimeout(timer)
  useServerHealth.setState({ probing: true, nextProbeAt: null })

  try {
    /* `credentials: 'omit'`: the probe asks one question — is anyone home — and
       it must not need a session to get an answer. `/healthz` is public and
       says whether the database answered too, so an app that is up but cut off
       from Neon does not read as healthy. */
    const res = await fetch(`${API_BASE_URL}/healthz`, { cache: 'no-store', credentials: 'omit' })
    if (res.ok) return reportAnswering()
  } catch {
    /* Still nothing on the wire. Same outcome as a gateway error below, so
       there is nothing to tell apart here. */
  }

  useServerHealth.setState((s) => ({ probing: false, probes: s.probes + 1 }))
  scheduleProbe()
}

function scheduleProbe(): void {
  const wait = (WAITS[useServerHealth.getState().probes] ?? THEN) * 1000
  useServerHealth.setState({ nextProbeAt: Date.now() + wait })
  timer = setTimeout(() => void probeServer(), wait)
}
