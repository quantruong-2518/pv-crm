import type { Logger } from '@nestjs/common'

/** Retry what waiting can fix, throw what it cannot.
 *
 *  A worker that crashes on a rejected connection is a worker Fly gives up on:
 *  on 17/09 Neon's quota hard-stop killed it ten times in a row and the
 *  machine stayed `stopped` with mail undelivered. A worker that retries
 *  EVERYTHING is the opposite failure — a bad queue option would loop behind a
 *  backoff forever, logging "not reachable" about a database that answered
 *  fine. So the line is drawn by error class, not by where the call sits.
 *  See `docs/runbooks/neon-compute-and-worker.md` §1. */

/** Socket-level failures: the database host was never reached. */
const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
])

/** SQLSTATE classes meaning "not now" rather than "not this": 08 connection
 *  exception, 53 insufficient resources — Neon's quota hard-stop answers
 *  `53000`, as the worker's own crash log shows — and 57P01–57P03, the server
 *  shutting down or not yet accepting connections. */
const TRANSIENT_SQLSTATE = /^(08|53|57P0[123])/

/** `pg` and `pg-pool` raise these without any `code`. */
const CODELESS_DROP = /^Connection terminated|timeout exceeded when trying to connect/

export function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && (NETWORK_CODES.has(code) || TRANSIENT_SQLSTATE.test(code))) {
    return true
  }
  return CODELESS_DROP.test(error.message)
}

/** Fast first retry — most rejections are momentary; the ceiling is what
 *  matters for a real outage. */
const BASE_BACKOFF_MS = 2_000
/** The runbook's ceiling: long enough to ride out a quota hard-stop, short
 *  enough that recovery is noticed within minutes of the database returning. */
const MAX_BACKOFF_MS = 5 * 60_000

/** Runs `attempt` until it succeeds or fails for a reason that is not the
 *  connection. No attempt limit: once a limit runs out the only move left is
 *  to exit, which hands recovery to Fly's `[[restart]]` — a full context
 *  rebuild that would start this same backoff from zero. `[[restart]]` stays
 *  the net for deaths this loop cannot see (OOM, an unrelated crash). */
export async function connectWithRetry<T>(
  attempt: () => Promise<T>,
  log: Pick<Logger, 'warn' | 'error'>,
): Promise<T> {
  for (let tries = 1; ; tries++) {
    try {
      return await attempt()
    } catch (error) {
      if (!isConnectionError(error)) throw error

      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (tries - 1), MAX_BACKOFF_MS)
      /* Jitter keeps processes that failed in the same instant (one shared
         Neon outage) from all retrying in the same instant too. */
      const wait = Math.round(backoff * (0.8 + Math.random() * 0.4))
      const line =
        `Database not reachable (attempt ${tries}, retrying in ${Math.round(wait / 1_000)}s): ` +
        (error as Error).message
      /* `error` once the wait hits the ceiling — the one line an alert can key
         on, since the process looks `started` to Fly the whole time. */
      if (backoff === MAX_BACKOFF_MS) log.error(line)
      else log.warn(line)

      /* NOT unref'd. While this waits nothing else may hold the event loop, and
         an unref'd timer lets Node exit 0 mid-backoff — a clean exit that
         Fly's default `on-failure` policy never restarts. */
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
}
