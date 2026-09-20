import {
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import { ENV, type Env } from '../config/env'
import { isAllowedOrigin } from './origin'
import { PvError } from './problem'

export const MACHINE_DOOR_KEY = 'pv:machine-door'

/** `@MachineDoor()` — this door is opened by a PROGRAM, not by a browser, so
 *  the two browser-shaped fences below must not be held against it.
 *
 *  It is not an exemption from authentication: every door carrying it proves
 *  itself another way — an HMAC over the raw bytes on the Resend webhooks, a
 *  signed token in the path on one-click unsubscribe. What it waives is a
 *  check that can only ever produce a false refusal for a caller that is not a
 *  browser, and a false refusal here is a mail event silently dropped.
 *
 *  Metadata rather than a path list, for `@NeedsReauth()`'s reason: a path list
 *  is a second place to edit when a route moves, and the guard stops matching
 *  with nothing to show for it. */
export const MachineDoor = () => SetMetadata(MACHINE_DOOR_KEY, true)

/** Methods that change nothing, so nothing is worth forging into them. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** The three content types a browser may send CROSS-SITE with no preflight —
 *  the CORS "simple request" set. Everything else, `application/json` included,
 *  earns an `OPTIONS` first, which is where CORS becomes a real fence. */
const NO_PREFLIGHT_TYPES = [
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
]

/** THE FENCE THAT MAKES `SameSite=None` SURVIVABLE — read
 *  `docs/decisions/0059-write-doors-refuse-cross-site-requests.md` first.
 *
 *  In production the web app and this API are different registrable domains,
 *  so the session cookie must be `SameSite=None` (`auth/cookie.ts`). That means
 *  the browser attaches it to CROSS-SITE requests too, and CORS stops a
 *  response being read, never a request being sent. So a form auto-submitted
 *  from anywhere reaches a write door with the victim's cookie on it.
 *
 *  Two rules, on every method that changes something. ORIGIN is load-bearing
 *  and the only one that reaches a write carrying no body. CONTENT TYPE covers
 *  the case the first cannot — a caller that sends no `Origin` — by refusing
 *  the three types a browser may send with no preflight.
 *
 *  RUNS FIRST, before `ActorGuard`: refuse before it costs a session lookup. */
@Injectable()
export class CrossSiteGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>()
    if (READ_METHODS.has(req.method)) return true

    const machine = this.reflector.getAllAndOverride<boolean>(MACHINE_DOOR_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (machine) return true

    if (!isAllowedOrigin(this.env, req.headers.origin)) {
      throw this.refuse('Origin này không được phép gọi cửa ghi.')
    }
    if (NO_PREFLIGHT_TYPES.includes(mediaTypeOf(req.headers['content-type']))) {
      throw this.refuse('Cửa ghi chỉ nhận application/json.')
    }
    return true
  }

  /** Plain `forbidden`, carrying no `reason`: `reason` is E2's vocabulary and
   *  E2 did not refuse this — the same call `reauthRequired()` makes. No screen
   *  renders it either, because no request the web app sends can reach it. */
  private refuse(title: string): PvError {
    return new PvError({ kind: 'forbidden', status: 403, title })
  }
}

/** `application/json; charset=utf-8` → `application/json`. Absent → `''`, which
 *  matches nothing above — a write with no body carries no type, and that is
 *  the ordinary shape of `POST /sales/leads/:code/contacted`. */
function mediaTypeOf(value: string | string[] | undefined): string {
  if (typeof value !== 'string') return ''
  return (value.split(';')[0] ?? '').trim().toLowerCase()
}
