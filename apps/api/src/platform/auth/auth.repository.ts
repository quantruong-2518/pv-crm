import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '../db/db.module'
import { actor, type ActorRow } from '../db/platform.schema'
import { passwordReset, session, type PasswordResetRow, type SessionRow } from './auth.schema'

/** SQL for the sign-in flow. Decides NOTHING.
 *
 *  No "is this session still alive", no "may this person in", no clock
 *  arithmetic beyond what a `WHERE` clause needs — all of that is
 *  `auth.service.ts`. What lives here is the shape of the statements, and two
 *  of them are shaped the way they are for reasons worth stating.
 *
 *  ------------------------------------------------------------------
 *  EVERY WRITE TAKES AN OPTIONAL TRANSACTION HANDLE
 *  ------------------------------------------------------------------
 *  Same contract `LeadWriteRepository` states: `run()` opens one unit of work
 *  and the write methods accept the handle. Password reset needs it — burning
 *  the ticket, writing the new hash and killing the old sessions are one act,
 *  and a crash between any two of them leaves an account in a state nobody
 *  designed. The handle defaults to the pool because sign-in and sign-out are
 *  single statements with nothing to group them with, and forcing a
 *  transaction around one statement only adds a round trip. */
@Injectable()
export class AuthRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** One unit of work — see the docblock above for the one caller that needs it. */
  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  // -------------------------------------------------------------------------
  // People
  // -------------------------------------------------------------------------

  /** The WHOLE row, `password_hash` and `disabled_at` included.
   *
   *  `ActorRepository.byId` deliberately returns the engine's `Actor` — seven
   *  fields, none of them a credential — because everything downstream of the
   *  guard only ever needs those. This one is the exception and it stays inside
   *  this module: the two columns it adds are the ones that answer "may this
   *  person in at all", and they must never travel further than the service
   *  that asks the question.
   *
   *  The mailbox arrives already lowercased by the `email` primitive in
   *  `@pv/contracts`, so no `lower()` is needed here — and adding one would
   *  quietly disable the UNIQUE index on `email`, turning every sign-in into a
   *  sequential scan of the staff book. */
  async actorByEmail(email: string): Promise<ActorRow | null> {
    const [row] = await this.db.select().from(actor).where(eq(actor.email, email)).limit(1)
    return row ?? null
  }

  async setPasswordHash(actorId: string, hash: string, tx: Db = this.db): Promise<void> {
    await tx.update(actor).set({ passwordHash: hash }).where(eq(actor.id, actorId))
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  async createSession(input: {
    actorId: string
    tokenHash: string
    expiresAt: Date
    idleUntil: Date | null
    userAgent: string | null
  }): Promise<SessionRow> {
    const [row] = await this.db.insert(session).values(input).returning()
    /* `INSERT … RETURNING` yields exactly one row or throws; this is here so
       the type is `SessionRow` rather than `SessionRow | undefined`, not
       because the empty case is reachable. */
    if (!row) throw new Error('INSERT platform.session không trả về dòng nào.')
    return row
  }

  /** The session AND the person, in ONE round trip.
   *
   *  This runs on every authenticated request, so the shape of it is a budget
   *  decision rather than a stylistic one: two queries would double the
   *  per-request database cost of the whole application, and on Neon that is
   *  paid in latency on a connection that may have to wake up. One index seek
   *  on `session_token_hash_unique` plus one primary-key join is what the
   *  session table was accepted for in the first place — see the JWT
   *  comparison in `auth.schema.ts`.
   *
   *  INNER join, not LEFT: `session.actor_id` has a foreign key, so a session
   *  without an actor cannot exist, and a LEFT join would only add a nullable
   *  branch that no code path can reach. */
  async sessionByTokenHash(
    tokenHash: string,
  ): Promise<{ session: SessionRow; actor: ActorRow } | null> {
    const [row] = await this.db
      .select({ session, actor })
      .from(session)
      .innerJoin(actor, eq(actor.id, session.actorId))
      .where(eq(session.tokenHash, tokenHash))
      .limit(1)
    return row ?? null
  }

  /** Push the sitting-still mark forward. Called far less often than it looks —
   *  see the throttle in `AuthService.resolve`. */
  async touchSession(id: string, idleUntil: Date): Promise<void> {
    await this.db.update(session).set({ idleUntil }).where(eq(session.id, id))
  }

  /** Sign-out, by the only identifier the caller holds.
   *
   *  Deliberately keyed on the token hash rather than on a row id. The person
   *  signing out presents a cookie, not a `uuid`, so an id-keyed method would
   *  force a read-then-write: one extra round trip, and a window in which the
   *  row can change between the two statements. One `UPDATE` against a UNIQUE
   *  index has neither problem.
   *
   *  `revoked_at IS NULL` in the predicate so signing out twice writes nothing
   *  the second time — the first revocation's timestamp is the honest one, and
   *  a double-clicked button must not move it. */
  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.db
      .update(session)
      .set({ revokedAt: new Date() })
      .where(and(eq(session.tokenHash, tokenHash), isNull(session.revokedAt)))
  }

  /** Kill every live session of one person. Used by password reset today, and
   *  by "khoá tài khoản" on the admin screen when that arrives — the same act
   *  either way: this person's existing proofs stop working now. */
  async revokeAllForActor(actorId: string, tx: Db = this.db): Promise<number> {
    const rows = await tx
      .update(session)
      .set({ revokedAt: new Date() })
      .where(and(eq(session.actorId, actorId), isNull(session.revokedAt)))
      .returning({ id: session.id })
    return rows.length
  }

  /** Delete sessions past their ABSOLUTE mark. See `SessionSweeper`.
   *
   *  `expires_at`, never `idle_until`: the idle mark moves, and a row whose
   *  idle mark has passed is still a row somebody may legitimately renew
   *  against within the absolute window. Only `expires_at` is final.
   *
   *  A `DELETE` rather than a soft mark, and this is the one place in the auth
   *  path that removes rather than flags. `revoked_at` exists so the table can
   *  answer "who signed me out"; a session that simply ran out of time has no
   *  such story to tell, and keeping every one of them forever turns an
   *  append-only table into a table that is scanned by the sweep it feeds. */
  async sweepExpiredSessions(): Promise<number> {
    const rows = await this.db
      .delete(session)
      .where(lt(session.expiresAt, new Date()))
      .returning({ id: session.id })
    return rows.length
  }

  // -------------------------------------------------------------------------
  // Password-reset tickets
  // -------------------------------------------------------------------------

  async createResetTicket(input: {
    actorId: string
    tokenHash: string
    purpose: 'invite' | 'reset'
    expiresAt: Date
  }): Promise<void> {
    await this.db.insert(passwordReset).values(input)
  }

  async resetTicketByTokenHash(
    tokenHash: string,
  ): Promise<{ ticket: PasswordResetRow; actor: ActorRow } | null> {
    const [row] = await this.db
      .select({ ticket: passwordReset, actor })
      .from(passwordReset)
      .innerJoin(actor, eq(actor.id, passwordReset.actorId))
      .where(eq(passwordReset.tokenHash, tokenHash))
      .limit(1)
    return row ?? null
  }

  /** Burn the ticket. `true` = this call is the one that burned it.
   *
   *  ------------------------------------------------------------------
   *  THE `used_at IS NULL` PREDICATE IS THE WHOLE SINGLE-USE MECHANISM
   *  ------------------------------------------------------------------
   *  Reading the row, seeing `used_at` is null and then updating it is the same
   *  bug as every other check-then-act: two requests carrying the same link —
   *  a double-clicked button, a mail client prefetching the URL, somebody who
   *  found the link in a forwarded mail a week later racing the real owner —
   *  both read null and both proceed. Postgres serialises the two `UPDATE`s
   *  against the same row, so exactly one of them matches `used_at IS NULL` and
   *  the other gets zero rows back. Zero rows is not an error here; it is the
   *  answer "somebody already used this", and it is the ONLY reliable way to
   *  learn that.
   *
   *  `now()` from the database rather than `new Date()` from Node, because this
   *  timestamp is evidence about when a ticket was spent and the process clock
   *  is one more thing that can be wrong. */
  async consumeResetTicket(id: string, tx: Db = this.db): Promise<boolean> {
    const rows = await tx
      .update(passwordReset)
      .set({ usedAt: sql`now()` })
      .where(and(eq(passwordReset.id, id), isNull(passwordReset.usedAt)))
      .returning({ id: passwordReset.id })
    return rows.length > 0
  }
}
