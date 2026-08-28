import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { SESSION_LIMITS, SessionView, SessionWindow, type ResetTicketView } from '@pv/contracts'
import { ENV, type Env } from '../config/env'
import { denied, notFound, rateLimited } from '../http/problem'
import type { Db } from '../db/db.module'
import type { ActorRow } from '../db/platform.schema'
import { AttemptThrottle } from './attempt-throttle'
import type { SessionRow } from './auth.schema'
import { toActor, toSessionView, toWindow } from './auth.mapper'
import { AuthRepository } from './auth.repository'
import { dummyPasswordHash, hashPassword, verifyPassword } from './password'
import { RESET_MAILER, resetLink, type ResetMailer } from './reset-mailer'
import { hashToken, newToken } from './token'

/** ONE SENTENCE FOR EVERY WAY SIGN-IN CAN FAIL.
 *
 *  Unknown mailbox, wrong password, an account whose owner has not set a
 *  password yet, an account a manager locked — all four answer with this exact
 *  string and this exact status.
 *
 *  ------------------------------------------------------------------
 *  WHY THE HELPFUL VERSION IS THE WRONG ONE
 *  ------------------------------------------------------------------
 *  "Không tìm thấy tài khoản dùng email này" is a friendlier screen and it is
 *  also a free directory of the company: an outsider walks a list of plausible
 *  addresses and keeps the ones that come back with the other message. That
 *  list is the expensive half of a phishing campaign, and it is worth more than
 *  any single password — the mailboxes are stable, the passwords are not.
 *
 *  The POC does the opposite on purpose, and says so: `apps/web/src/data/auth.ts`
 *  carries a note that its per-field messages are a demo trade-off and must
 *  collapse into one sentence once a real server decides. This is that server,
 *  and this is that sentence.
 *
 *  Splitting "your account is locked" back out is the tempting exception. It is
 *  still an oracle — it confirms the address exists — and the person it would
 *  help is the one case where a human is already involved: they were locked by
 *  a colleague who can tell them. */
const SIGN_IN_REFUSAL = 'Email hoặc mật khẩu không đúng.'

/** What a reset link is worth, in time. One hour, because the person who asked
 *  for it is sitting at the screen waiting — a link that is still live tomorrow
 *  is a link sitting in a mailbox for a day with nobody watching it. */
const RESET_TTL_MS = 60 * 60_000

/** An invitation is a different animal: the recipient does not know it is
 *  coming and may be on leave. Seven days, per `auth.schema.ts`. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60_000

/** How far the sitting-still mark must be behind before a request pays to move
 *  it. See `resolve`. */
const IDLE_TOUCH_FLOOR_MS = 60_000

/** THE RULES OF GETTING IN. Knows the repository; never sees `req` or `res`.
 *
 *  Every method here takes and returns plain values — a token is a string, a
 *  session is a row, a refusal is a `PvError`. Nothing in this file knows that
 *  the token arrives in a cookie, and that is what lets the same rules answer a
 *  future mobile client, a service account or a test without a browser. The
 *  cookie is `auth.controller.ts` and `main.ts`, and it appears nowhere else. */
@Injectable()
export class AuthService {
  private readonly log = new Logger('auth')

  /** One per process, because `AuthService` is a singleton. Not a provider:
   *  nothing else has any business reading or resetting these counters, and a
   *  second injectable would invite exactly that. */
  private readonly throttle = new AttemptThrottle()

  constructor(
    private readonly repo: AuthRepository,
    @Inject(ENV) private readonly env: Env,
    @Inject(RESET_MAILER) private readonly mailer: ResetMailer,
  ) {}

  // -------------------------------------------------------------------------
  // Getting in
  // -------------------------------------------------------------------------

  /** Verify a password and open a session.
   *
   *  ------------------------------------------------------------------
   *  THE MISSING MAILBOX IS HASHED ANYWAY, AND THAT IS NOT PARANOIA
   *  ------------------------------------------------------------------
   *  Returning early when the lookup misses would make this endpoint answer in
   *  about a millisecond for an unknown address and in about a hundred for a
   *  known one. That is not a subtle side channel needing statistics to read —
   *  it is two orders of magnitude, legible over the public internet from one
   *  request each, and it hands over precisely the directory that
   *  `SIGN_IN_REFUSAL` above refuses to print. So the derivation is spent
   *  against `dummyPasswordHash()`, which no password on earth matches.
   *
   *  The same holds for an account with `password_hash IS NULL` (invited, never
   *  set) and for a locked one: both fall through the identical path at the
   *  identical cost.
   *
   *  ------------------------------------------------------------------
   *  THE TWO MARKS ARE STAMPED HERE AND RE-READ ON EVERY REQUEST
   *  ------------------------------------------------------------------
   *  `SESSION_LIMITS` comes from `@pv/contracts` — the same object the browser
   *  reads to arm its countdown. Retyping 30 and 12 here is the failure that
   *  constant exists to prevent, and it fails quietly: the screen warns two
   *  minutes before a deadline the server no longer agrees with. */
  async signIn(
    email: string,
    password: string,
    remember: boolean,
    userAgent: string | null,
  ): Promise<{ view: SessionView; token: string }> {
    const key = `sign-in:${email}`
    this.refuseWhileThrottled(key)

    const row = await this.repo.actorByEmail(email)
    const stored = row?.passwordHash ?? (await dummyPasswordHash())
    const matches = await verifyPassword(password, stored)

    if (!row || !matches || row.disabledAt) {
      this.throttle.fail(key)
      throw denied('unauthenticated', SIGN_IN_REFUSAL)
    }
    this.throttle.clear(key)

    const now = Date.now()
    const token = newToken()
    const session = await this.repo.createSession({
      actorId: row.id,
      /* The raw token is never written anywhere — only its hash reaches the
         table, and the plain value leaves this method exactly once, as the
         cookie the controller sets. */
      tokenHash: hashToken(token),
      expiresAt: new Date(now + (remember ? SESSION_LIMITS.remembered : SESSION_LIMITS.absolute)),
      /* "Nhớ tôi" turns the sitting-still axis OFF rather than lengthening it.
         Both halves of that are what the tick means — see `SignInBody`. */
      idleUntil: remember ? null : new Date(now + SESSION_LIMITS.idle),
      userAgent,
    })

    return { view: SessionView.parse(toSessionView(row, session)), token }
  }

  /** WHO IS CALLING — the body of the seam `ActorGuard` reserved for it.
   *
   *  `null` for every unusable token, with no distinction between the reasons.
   *  The guard turns that into "not signed in" and lets the request continue to
   *  `AccessGuard`, which is the half that refuses; splitting the reasons here
   *  would only give a caller a way to ask whether a token they found is one
   *  that HAS existed.
   *
   *  ------------------------------------------------------------------
   *  THE IDLE MARK IS NOT PUSHED ON EVERY REQUEST
   *  ------------------------------------------------------------------
   *  The naive version writes `idle_until = now + 30min` on every authenticated
   *  request, which turns a read-only page load — a screen that fires four
   *  parallel GETs — into four `UPDATE`s against the same row. On Neon that is
   *  billed traffic, row-level lock contention between a user's own concurrent
   *  requests, and table bloat on the hottest row in the system, all to move a
   *  timestamp by a few milliseconds.
   *
   *  So the mark only moves when it would move by more than a minute. The cost
   *  of the throttle is that a session can expire up to `IDLE_TOUCH_FLOOR_MS`
   *  earlier than a perfect implementation would allow — one minute out of
   *  thirty, on an axis whose entire purpose is approximate. */
  async resolve(token: string): Promise<Actor | null> {
    const found = await this.living(token)
    if (!found) return null

    const idleUntil = found.session.idleUntil
    if (idleUntil) {
      const next = this.nextIdleMark(found.session)
      if (next.getTime() - idleUntil.getTime() > IDLE_TOUCH_FLOOR_MS) {
        await this.repo.touchSession(found.session.id, next)
      }
    }

    return toActor(found.actor)
  }

  /** `GET /auth/me`. The same two questions the guard asks, answered with the
   *  session WINDOW attached — which is the only thing the browser needs and
   *  cannot compute. */
  async view(token: string): Promise<SessionView> {
    const found = await this.living(token)
    if (!found) throw denied('unauthenticated')
    return SessionView.parse(toSessionView(found.actor, found.session))
  }

  /** Push the sitting-still mark out. CANNOT move `expires_at`.
   *
   *  A shift that ends, ends: the absolute mark is the one thing in this system
   *  that no amount of activity extends, and a `renew` that touched it would
   *  quietly convert every session into an unbounded one — the exact failure
   *  `auth.schema.ts` gives `expires_at` its own column to prevent. Somebody
   *  will eventually ask for it, because being signed out mid-afternoon is
   *  annoying; the answer is to raise `SESSION_LIMITS.absolute`, in one place,
   *  visibly.
   *
   *  A remembered session has no idle axis, so renewing it is a no-op that
   *  still succeeds — the screen calls this on a timer and does not need to
   *  know which kind of session it holds. */
  async renew(token: string): Promise<SessionWindow> {
    const found = await this.living(token)
    if (!found) throw denied('unauthenticated')
    if (!found.session.idleUntil) return SessionWindow.parse(toWindow(found.session))

    const next = this.nextIdleMark(found.session)
    await this.repo.touchSession(found.session.id, next)
    return SessionWindow.parse(toWindow({ ...found.session, idleUntil: next }))
  }

  /** Revoke one session. NEVER throws.
   *
   *  Signing out twice is not an error, and neither is signing out with a token
   *  that expired an hour ago or was never real: in every one of those cases
   *  the caller wants the same thing and already has it. The controller clears
   *  the cookie regardless, so a refusal here could only produce a screen that
   *  says sign-out failed while the person is, in fact, signed out. */
  async signOut(token: string): Promise<void> {
    await this.repo.revokeByTokenHash(hashToken(token))
  }

  // -------------------------------------------------------------------------
  // Passwords
  // -------------------------------------------------------------------------

  /** ALWAYS RESOLVES. Reveals nothing about the mailbox.
   *
   *  The controller answers 204 whatever happens here, so this method's job is
   *  to make sure the 204 costs the same and says the same thing for an address
   *  that exists and one that does not. A ticket is created only for a mailbox
   *  that exists AND is not locked — sending a reset link to a locked account
   *  would let somebody walk back in through the door an administrator just
   *  shut.
   *
   *  The throttle counts EVERY call rather than only failures, because there is
   *  no failure to count: this endpoint cannot tell one outcome from the other
   *  without saying so out loud. Counting before the lookup is what keeps the
   *  429 from becoming its own oracle — it fires on the submitted string, known
   *  address or not. Without it, the endpoint is a mail bomb aimed at any
   *  address an outsider can guess. */
  async forgotPassword(email: string): Promise<void> {
    const key = `forgot:${email}`
    this.refuseWhileThrottled(key)
    this.throttle.fail(key)

    const row = await this.repo.actorByEmail(email)
    if (!row || row.disabledAt) return

    await this.issueTicket(row, 'reset', RESET_TTL_MS)
  }

  /** What the set-password screen may show before anything is typed.
   *
   *  The mailbox, and only for a currently valid ticket. Everything else about
   *  the person stays behind the password, because whoever is holding this link
   *  has not yet proved they are that person — see `ResetTicketView`.
   *
   *  Every refusal is the same 404. Used, expired, never existed, belongs to a
   *  locked account: four different facts, one answer, for the same reason
   *  sign-in has one sentence. */
  async readResetTicket(token: string): Promise<ResetTicketView> {
    const found = await this.usableTicket(token)
    return { email: found.actor.email }
  }

  /** Set the password, burn the ticket, and END EVERY OTHER SESSION.
   *
   *  ------------------------------------------------------------------
   *  THE REVOCATION IS THE POINT, NOT A TIDY-UP
   *  ------------------------------------------------------------------
   *  Leaving old sessions alive across a password change is the most common
   *  hole in this whole flow, and it defeats the feature entirely in the case
   *  that matters: people change their password BECAUSE somebody else has their
   *  access. A thief holding a stolen session cookie is unaffected by a new
   *  password — the cookie was never a password — and stays signed in for up to
   *  seven days while the victim believes they have just locked them out.
   *
   *  ------------------------------------------------------------------
   *  ONE TRANSACTION, AND THE HASHING HAPPENS OUTSIDE IT
   *  ------------------------------------------------------------------
   *  Burning the ticket, writing the hash and killing the sessions are one act;
   *  a crash between any two of them leaves an account nobody designed — a
   *  spent ticket and the old password, or a new password with the old sessions
   *  still live. `scrypt` runs BEFORE the transaction opens, because it costs
   *  ~100 ms and holding a database connection and a row lock through it is
   *  paying for the safety of one user with the throughput of everybody.
   *
   *  The re-check inside the transaction is not redundant with the one above
   *  it: `consumeResetTicket` is the only thing that can distinguish "valid"
   *  from "valid a millisecond ago", and two requests carrying the same link
   *  race exactly there. */
  async resetPassword(token: string, password: string): Promise<void> {
    const found = await this.usableTicket(token)
    const hash = await hashPassword(password)

    await this.repo.run(async (tx) => {
      const burned = await this.repo.consumeResetTicket(found.ticket.id, tx)
      if (!burned) throw notFound('liên kết đặt mật khẩu')
      await this.repo.setPasswordHash(found.actor.id, hash, tx)
      const killed = await this.repo.revokeAllForActor(found.actor.id, tx)
      this.log.log(`Đặt lại mật khẩu · ${found.actor.id} · thu hồi ${killed} phiên`)
    })

    /* Somebody who just proved control of the mailbox should not then meet the
       lockout their own failed guesses built. */
    this.throttle.clear(`sign-in:${found.actor.email}`)
  }

  /** A set-password ticket for an account somebody else opened.
   *
   *  Called by the `/users` door, which owns the letter: `InviteView` decides
   *  whether the link also comes back to the manager's screen, and that
   *  decision belongs beside the endpoint that answers with it, not here.
   *  This method's whole responsibility is that the ticket is real, single-use
   *  and correctly dated.
   *
   *  It does NOT verify the actor exists — the foreign key on
   *  `password_reset.actor_id` does, and the caller has just written or read
   *  the row anyway. */
  async issueInvite(actorId: string): Promise<{ token: string; link: string; expiresAt: Date }> {
    const token = newToken()
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    await this.repo.createResetTicket({
      actorId,
      tokenHash: hashToken(token),
      purpose: 'invite',
      expiresAt,
    })
    return { token, link: resetLink(this.env, token), expiresAt }
  }

  /** Issue an invite ticket AND post the letter. The `/users` door's one call.
   *
   *  ------------------------------------------------------------------
   *  WHY THIS EXISTS BESIDE `issueInvite` RATHER THAN THE CALLER DOING BOTH
   *  ------------------------------------------------------------------
   *  `RESET_MAILER` is a provider of this module and is deliberately NOT
   *  exported — `auth.module.ts` hands out `AuthService` and nothing else, so
   *  that the rules stated in this file hold because there is one way in. The
   *  admin door therefore cannot post the letter itself, and the choice is
   *  between exporting the mailer token or letting the module that already
   *  holds it do the posting. This is the second, and it is also the better
   *  one for the reason `reset-mailer.ts` states as rule 2: the raw token is a
   *  credential that sets a password, and this way it never crosses a module
   *  boundary at all — only `link` comes back, and `InviteView` decides whether
   *  even that may be shown.
   *
   *  Takes the three fields it needs rather than an id: every caller has just
   *  read the row, and re-reading it here would be a round trip spent on data
   *  the caller is holding. `name` is for the greeting — the letter says a
   *  name, not a mailbox.
   *
   *  A failure to post is logged and swallowed, exactly as in `issueTicket`.
   *  The ticket is already written and works; raising here would send the
   *  manager back to press the button again, minting a second live ticket for
   *  the same person and telling them nothing they can act on. */
  async sendInvite(person: {
    id: string
    name: string
    email: string
  }): Promise<{ link: string; expiresAt: Date }> {
    const { token, link, expiresAt } = await this.issueInvite(person.id)

    try {
      await this.mailer.send({
        purpose: 'invite',
        actorId: person.id,
        name: person.name,
        email: person.email,
        token,
        link,
        expiresAt,
      })
    } catch (error: unknown) {
      this.log.error(
        `Không gửi được thư invite: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    return { link, expiresAt }
  }

  /** End every live session one person holds. Returns how many died.
   *
   *  `resetPassword` above already does this through the repository, for the
   *  reason written out there: a stolen cookie is not affected by a new
   *  password. The `/users` door needs the same act for a different reason —
   *  locking an account has to take effect NOW, not at the end of a session
   *  that may run for seven days — and it cannot reach `AuthRepository`, which
   *  stays unexported so that this file remains the only way into
   *  `platform.session`.
   *
   *  `tx` is REQUIRED, not optional with a pool default. The revocation and
   *  whatever set `disabled_at` are one act: a crash between them leaves either
   *  an account marked locked whose owner keeps working, or sessions killed for
   *  an account that is still open — two states nobody designed. A signature
   *  that could be called without a handle is a signature that eventually is. */
  revokeAllSessions(actorId: string, tx: Db): Promise<number> {
    return this.repo.revokeAllForActor(actorId, tx)
  }

  // -------------------------------------------------------------------------
  // Shared internals
  // -------------------------------------------------------------------------

  /** A session that may be used RIGHT NOW, or `null`.
   *
   *  Five ways to be dead, checked in the order they cost nothing:
   *   · no row              — token never existed, or the sweep removed it
   *   · `revoked_at`        — signed out, password changed, account locked
   *   · past `expires_at`   — the shift ended
   *   · past `idle_until`   — sat still too long (absent = "Nhớ tôi")
   *   · actor `disabled_at` — locked AFTER this session was opened, which is
   *                           why it is read here and not only at sign-in.
   *                           Without this line, locking an account would take
   *                           effect at the lock-holder's next sign-in, i.e.
   *                           never, and the button on the admin screen would
   *                           be decorative. */
  private async living(token: string): Promise<{ session: SessionRow; actor: ActorRow } | null> {
    if (!token) return null
    const found = await this.repo.sessionByTokenHash(hashToken(token))
    if (!found) return null

    const now = Date.now()
    if (found.session.revokedAt) return null
    if (now >= found.session.expiresAt.getTime()) return null
    if (found.session.idleUntil && now >= found.session.idleUntil.getTime()) return null
    if (found.actor.disabledAt) return null
    return found
  }

  /** Where the sitting-still mark goes next, never past the absolute one.
   *
   *  Clamping is not cosmetic: an `idle_until` beyond `expires_at` would be a
   *  row that describes a window it does not have, and it would keep every
   *  request in the last half hour of a session paying for an `UPDATE` that
   *  changes nothing anyone can use. */
  private nextIdleMark(session: SessionRow): Date {
    const next = Date.now() + SESSION_LIMITS.idle
    return new Date(Math.min(next, session.expiresAt.getTime()))
  }

  private refuseWhileThrottled(key: string): void {
    const waitMs = this.throttle.retryAfterMs(key)
    if (waitMs <= 0) return
    throw rateLimited(
      `Quá nhiều lần thử. Vui lòng đợi ${Math.ceil(waitMs / 1_000)} giây rồi thử lại.`,
    )
  }

  private async usableTicket(token: string) {
    const found = token ? await this.repo.resetTicketByTokenHash(hashToken(token)) : null
    if (
      !found ||
      found.ticket.usedAt ||
      Date.now() >= found.ticket.expiresAt.getTime() ||
      found.actor.disabledAt
    ) {
      throw notFound('liên kết đặt mật khẩu')
    }
    return found
  }

  private async issueTicket(
    row: ActorRow,
    purpose: 'invite' | 'reset',
    ttlMs: number,
  ): Promise<void> {
    const token = newToken()
    const expiresAt = new Date(Date.now() + ttlMs)
    await this.repo.createResetTicket({
      actorId: row.id,
      tokenHash: hashToken(token),
      purpose,
      expiresAt,
    })

    /* The mailer's contract says `send` does not throw; this catch is the
       belt for that braces. An exception escaping to the controller would make
       `/auth/forgot-password` answer differently for a known mailbox than for
       an unknown one — undoing, at the very last step, the one property the
       endpoint exists to have. */
    try {
      await this.mailer.send({
        purpose,
        actorId: row.id,
        name: row.name,
        email: row.email,
        token,
        link: resetLink(this.env, token),
        expiresAt,
      })
    } catch (error: unknown) {
      this.log.error(
        `Không gửi được thư ${purpose}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
