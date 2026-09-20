import type { Env } from '../config/env'

/** IS THIS `Origin` ONE OF OURS — the single answer, for every fence that asks.
 *
 *  Three places ask: `main.ts` decides which origins CORS answers for,
 *  `CrossSiteGuard` refuses writes from anywhere else, and `LeadIntakeGuard`
 *  keeps the public door to the landing pages it was opened for. Three copies
 *  of one comparison is three places for a trailing slash or a forgotten
 *  `localhost` to diverge, and the failure is silent in both directions — an
 *  origin that should be let in meets a preflight error with no server log, an
 *  origin that should not is simply let in.
 *
 *  ABSENT MEANS ALLOWED, and it has to. A browser always sends `Origin` on a
 *  cross-origin request, including a plain form POST; what arrives without one
 *  is `curl`, a webhook, or a same-origin navigation. Refusing those would shut
 *  the Resend webhooks and every terminal, and would buy nothing — the header a
 *  browser cannot be talked out of sending is the whole basis of this check. */
export function isAllowedOrigin(env: Env, origin: unknown): boolean {
  if (origin === undefined) return true
  /* An array means the header arrived twice. No browser does that, and picking
     one of the two is how a fence gets talked past. */
  if (typeof origin !== 'string') return false

  const local = env.NODE_ENV === 'development' && /^http:\/\/localhost:\d+$/.test(origin)
  return local || env.PV_CORS_ORIGINS.includes(origin)
}
