import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import {
  ForgotPasswordBody,
  ResetPasswordBody,
  SignInBody,
  type ResetTicketView,
  type SessionView,
  type SessionWindow,
} from '@pv/contracts'
import { Public } from '@api/platform/access/need.decorator'
import { ENV, type Env } from '@api/platform/config/env'
import { zod } from '@api/platform/http/zod.pipe'
import { AuthService } from './auth.service'
import { clearedSessionCookie, SESSION_COOKIE, sessionCookie, SessionToken } from './cookie'

/** `/auth` — the seven doors of getting in, and the only place a cookie exists.
 *
 *  ------------------------------------------------------------------
 *  EVERY ROUTE IS `@Public()`, AND THIS IS THE SHORT LIST THAT ALLOWS IT
 *  ------------------------------------------------------------------
 *  `need.decorator.ts` says the correct list of public endpoints is very short
 *  — the sign-in flow and `/healthz` — and asks anyone about to add a third
 *  kind to stop and ask. This controller IS the sign-in flow, so it is that
 *  list rather than an exception to it.
 *
 *  `@Public()` means `AccessGuard` waves the request through; it does NOT mean
 *  the endpoint is unguarded. Four of these seven refuse on their own terms:
 *  `/auth/me` and `/auth/renew` throw `denied('unauthenticated')` without a
 *  live session, and both reset doors answer 404 to a token that is used,
 *  expired or invented. What `@Public()` actually buys is that a person with NO
 *  session can reach the endpoints whose entire purpose is to get them one —
 *  requiring a session to sign in is a loop nobody escapes.
 *
 *  ------------------------------------------------------------------
 *  THE COOKIE STOPS HERE
 *  ------------------------------------------------------------------
 *  `AuthService` takes and returns strings and rows; it has no idea how the
 *  token travels. So the two lines in this file that touch `reply` are the
 *  entire cookie surface of the server, plus the plugin registration in
 *  `main.ts` and the attribute table in `cookie.ts`. That is the split that
 *  lets a second client — a mobile app, a service account, a test with no
 *  browser — reuse every rule without inheriting a cookie. */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** 200, not 201.
   *
   *  Nest defaults `POST` to 201 Created, which is a claim about a resource
   *  that now has a URL. Signing in creates a session row, but that row has no
   *  address anybody can `GET`, and answering 201 with no `Location` is a
   *  sentence with the object missing — the same call `lead/import/preview`
   *  makes for the same reason.
   *
   *  The user agent is read for `session.user_agent`, which exists ONLY so a
   *  person reading their own session list can tell which machine is which. It
   *  is a client-supplied string and decides nothing — see the column. */
  @Post('sign-in')
  @HttpCode(200)
  @Public()
  async signIn(
    @Body(zod(SignInBody)) body: SignInBody,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionView> {
    const { view, token } = await this.auth.signIn(
      body.email,
      body.password,
      body.remember,
      userAgent ?? null,
    )
    reply.setCookie(
      SESSION_COOKIE,
      token,
      sessionCookie(this.env, secondsUntil(view.session.expiresAt)),
    )
    return view
  }

  /** 204 and a cleared cookie — WHATEVER happened server-side.
   *
   *  The cookie is cleared before anything can go wrong and regardless of
   *  whether the token matched a row, because the browser's copy is the half
   *  the person can see. A sign-out that answers "failed" while the session is
   *  gone, or that answers "done" while the cookie is still in the jar, are
   *  both worse than doing the two unconditionally. */
  @Post('sign-out')
  @HttpCode(204)
  @Public()
  async signOut(
    @SessionToken() token: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    reply.clearCookie(SESSION_COOKIE, clearedSessionCookie(this.env))
    if (token) await this.auth.signOut(token)
  }

  /** Who am I, and how long have I got. 401 when the answer is nobody.
   *
   *  This is what the web app calls on boot to decide between the app shell and
   *  the sign-in screen, so its refusal has to be a clean 401 rather than an
   *  empty 200 — `apps/web/src/app/api/errors.ts` routes on the status. */
  @Get('me')
  @Public()
  me(@SessionToken() token: string): Promise<SessionView> {
    return this.auth.view(token)
  }

  /** Push the sitting-still mark out. Cannot move the absolute one.
   *
   *  Wrapped in `{ session }` rather than returned bare because that is the
   *  half of `SessionView` this answers with, and a naked object with three
   *  timestamps in it tells a reader nothing about which three. */
  @Post('renew')
  @HttpCode(200)
  @Public()
  async renew(@SessionToken() token: string): Promise<{ session: SessionWindow }> {
    return { session: await this.auth.renew(token) }
  }

  /** 204, always, for every address.
   *
   *  Known mailbox, unknown mailbox, locked account — one answer, because any
   *  difference between them is a way to test whether an address belongs to
   *  somebody here. The service is where that promise is kept; this signature
   *  is where it is stated. */
  @Post('forgot-password')
  @HttpCode(204)
  @Public()
  forgotPassword(@Body(zod(ForgotPasswordBody)) body: ForgotPasswordBody): Promise<void> {
    return this.auth.forgotPassword(body.email)
  }

  /** What the set-password screen may show before anything is typed.
   *
   *  The token is validated against the SAME schema the write door uses —
   *  `ResetPasswordBody.shape.token`, reached through the contract rather than
   *  retyped — so a token too short to be real dies in the pipe with a 400 that
   *  names the field, and never reaches a query. */
  @Get('reset-password/:token')
  @Public()
  readResetTicket(
    @Param('token', zod(ResetPasswordBody.shape.token)) token: string,
  ): Promise<ResetTicketView> {
    return this.auth.readResetTicket(token)
  }

  /** Set the password. 204 — nothing is created at a URL, and the one thing
   *  worth returning (a session) is deliberately not returned: whoever just
   *  reset a password proves control of a MAILBOX, and turning that into a
   *  signed-in browser in one step skips the step where they type the password
   *  they just chose. */
  @Post('reset-password')
  @HttpCode(204)
  @Public()
  resetPassword(@Body(zod(ResetPasswordBody)) body: ResetPasswordBody): Promise<void> {
    return this.auth.resetPassword(body.token, body.password)
  }
}

/** `Max-Age`, in seconds, from the absolute mark the service just stamped.
 *
 *  Derived from the ROW rather than recomputed from `SESSION_LIMITS`, so the
 *  cookie cannot outlive the session it points at even by a rounding error —
 *  and `Math.floor` rounds the right way, towards the cookie dying first.
 *  Floored at 1 because `Max-Age: 0` means "delete this cookie now", which
 *  would turn a session that is merely short into no session at all. */
function secondsUntil(iso: string): number {
  return Math.max(1, Math.floor((Date.parse(iso) - Date.now()) / 1_000))
}
