import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { CookieSerializeOptions } from '@fastify/cookie'
import type { FastifyRequest } from 'fastify'
import type { Env } from '../config/env'

/** THE ONE COOKIE THIS SERVER SETS — its name, its attributes, and how to read
 *  it back. Everything about `pv_session` that is not "when does it expire" is
 *  in this file.
 *
 *  ------------------------------------------------------------------
 *  NOT A SIGNED COOKIE, AND THAT IS A DECISION
 *  ------------------------------------------------------------------
 *  `@fastify/cookie` will sign cookies for you, and the guard's original
 *  docblock even said "đọc cookie đã ký". It is the wrong tool here. A
 *  signature proves the server issued the value; that matters when the value
 *  MEANS something on its own — a user id, a role, an expiry the client could
 *  otherwise edit. This value means nothing: it is 256 bits of noise whose only
 *  property is that a row in `platform.session` has its hash. A forged token
 *  matches no row, so it fails for free.
 *
 *  What a signature would add is a second secret that has to exist in `fly
 *  secrets`, be rotated, and be present in every environment — and rotating it
 *  signs everybody out, which is a real outage bought with no security.
 *
 *  ------------------------------------------------------------------
 *  NO `PV_SESSION_COOKIE_NAME` VARIABLE — CONSIDERED AND REFUSED
 *  ------------------------------------------------------------------
 *  `env.ts` is documented to the point of being hostile to knobs nobody turns,
 *  and this would be one. The cookie is host-only (no `Domain` attribute), so
 *  two deployments never collide even on the same parent domain; there is one
 *  web app; and a name that can differ between the machine that sets it and the
 *  machine that reads it is a way to be silently signed out with no error
 *  anywhere. A constant is the honest shape. */
export const SESSION_COOKIE = 'pv_session'

/** Attributes for a cookie that carries a live session.
 *
 *  ------------------------------------------------------------------
 *  `SameSite` IS DECIDED BY DEPLOYMENT SHAPE, NOT BY TASTE
 *  ------------------------------------------------------------------
 *  In production the web app is served from one origin and this API from
 *  `pvone-crm-api.fly.dev` — different registrable domains, therefore
 *  CROSS-SITE, therefore `SameSite=None`, which browsers only honour together
 *  with `Secure`. Both are on HTTPS, so that costs nothing.
 *
 *  Locally the pair is `http://localhost:5173` and `http://localhost:4123`.
 *  SameSite ignores the PORT, so those are the same site and `Lax` works —
 *  which is what we want, because `Secure` cookies do not travel over plain
 *  http and a `None` cookie without `Secure` is dropped outright. See the note
 *  in `main.ts` about `127.0.0.1` versus `localhost`; they are not the same
 *  site, and that difference is what makes this whole paragraph load-bearing.
 *
 *  `httpOnly` is the one attribute with no environment: script must never be
 *  able to read this value. It is also why `@pv/contracts` refuses to carry a
 *  token in any response body — a second copy in a place XSS can reach undoes
 *  the only thing `httpOnly` buys.
 *
 *  `maxAge` is in SECONDS (the `Max-Age` attribute), while everything else in
 *  this codebase counts milliseconds. Passing a millisecond figure here yields
 *  a cookie that outlives its own row by a factor of a thousand: the browser
 *  keeps presenting a token the server stopped honouring, and the person is
 *  bounced to the sign-in screen on every load with a perfectly valid-looking
 *  cookie in their jar. */
export function sessionCookie(env: Env, maxAgeSeconds: number): CookieSerializeOptions {
  const cross = env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    path: '/',
    sameSite: cross ? 'none' : 'lax',
    secure: cross,
    maxAge: maxAgeSeconds,
  }
}

/** Attributes for the delete.
 *
 *  A browser matches a `Set-Cookie` that removes a cookie against name, path
 *  and domain — so these MUST agree with `sessionCookie` above or the deletion
 *  lands on nothing and the old cookie stays in the jar. That failure looks
 *  exactly like "sign-out does not work", and the network tab shows a perfectly
 *  correct-looking `Set-Cookie` while it happens. The `maxAge` is left to
 *  `clearCookie`, which supplies its own expiry in the past. */
export function clearedSessionCookie(env: Env): CookieSerializeOptions {
  const cross = env.NODE_ENV === 'production'
  return { httpOnly: true, path: '/', sameSite: cross ? 'none' : 'lax', secure: cross }
}

/** The raw token off the request, or `''` when there is none.
 *
 *  `''` rather than `null` so every caller can hand it straight to the service,
 *  which treats an empty token as an unusable one like any other. One shape,
 *  one path, no `if` at three call sites. */
export function readSessionToken(req: FastifyRequest): string {
  return req.cookies?.[SESSION_COOKIE] ?? ''
}

/** `@SessionToken() token: string` — the controller's only view of the cookie.
 *
 *  Same reasoning as `@CurrentActor()`: a handler that takes `FastifyRequest`
 *  is a handler that can reach anything, and the next person to touch it will.
 *  This hands over one string and nothing else, so the auth controller stays a
 *  controller — receive, validate, call, answer — even though it is the one
 *  place in the system that has to know a cookie exists. */
export const SessionToken = createParamDecorator((_data: unknown, ctx: ExecutionContext): string =>
  readSessionToken(ctx.switchToHttp().getRequest<FastifyRequest>()),
)
