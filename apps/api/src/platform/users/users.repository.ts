import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { RoleId as EngineRoleId } from '@pv/engines'
import type { AuditEntry } from '../audit/audit.repository'
import { DB, type Db } from '../db/db.module'
import { actor, audit, type ActorRow } from '../db/platform.schema'
import type { ActorColumns, ActorDraft } from './users.mapper'

/** This table's own advisory-lock space. The number means nothing; it only has
 *  to be fixed and not collide with another table's — `SalesConfigRepository`
 *  holds 61_001 for the same reason. */
const LOCK_SPACE = 61_002

/** SQL for the people book. Decides NOTHING.
 *
 *  No "is this the last administrator", no "may this person edit that row", no
 *  clock arithmetic — all of that is `users.service.ts`. What lives here is the
 *  shape of the statements, and three of them are shaped the way they are for
 *  reasons worth stating.
 *
 *  ------------------------------------------------------------------
 *  EVERY WRITE TAKES A TRANSACTION HANDLE, AND MOST OF THEM REQUIRE ONE
 *  ------------------------------------------------------------------
 *  The same contract `AuthRepository` and `LeadWriteRepository` state: `run()`
 *  opens one unit of work and the write methods accept the handle. Here the
 *  handle is not optional on the row writes, and that is deliberate rather than
 *  strict for its own sake — locking an account has to revoke that person's
 *  live sessions in the SAME transaction as the flag, and a signature that
 *  defaults to the pool is a signature somebody eventually calls without a
 *  handle, leaving an account marked locked whose owner keeps browsing for
 *  another half hour.
 *
 *  ------------------------------------------------------------------
 *  THIS FILE WRITES `platform.audit` DIRECTLY INSTEAD OF CALLING `AuditRepository`
 *  ------------------------------------------------------------------
 *  For the first of the two reasons `LeadWriteRepository.writeBatchNote` gives:
 *  `AuditRepository.write` goes through the pool, so it cannot join the
 *  transaction that is doing the writing, and a rollback would leave a record
 *  of a change that did not happen — or, worse the other way, a lock with
 *  nothing saying who applied it. Same table, same append-only rule, one
 *  statement closer to the work. */
@Injectable()
export class UsersRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** One unit of work. Every rule the service enforces is checked and applied
   *  inside one of these — see `UsersService.patch` for why the check has to be
   *  inside rather than in front. */
  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Let ONE edit of the people book happen at a time, until this transaction
   *  ends however it ends.
   *
   *  ------------------------------------------------------------------
   *  A TRANSACTION IS NOT ENOUGH, AND ROW LOCKS ALONE DEADLOCK
   *  ------------------------------------------------------------------
   *  The sole-administrator rule is "count the others, then remove this one",
   *  and at READ COMMITTED two transactions run that pair interleaved: each
   *  sees one other administrator, each proceeds, and the company is left with
   *  a people book nobody can open — recoverable only by hand-editing the
   *  database, which is the exact outcome the rule exists to prevent.
   *
   *  Locking the counted rows instead would close the same hole and open a
   *  worse-shaped one: two managers demoting each other take the same two row
   *  locks in opposite orders, which is a textbook deadlock, and Postgres
   *  resolves it by killing one transaction with a code no layer of this server
   *  translates — a 500 for a request that was perfectly legal. ONE lock taken
   *  BEFORE any row lock has no ordering to get wrong.
   *
   *  The price is that edits to `platform.actor` serialise. That is a staff
   *  book edited by hand a few times a week; there is nothing here to scale. */
  async lockPeopleBook(tx: Db): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(CAST(${LOCK_SPACE} AS int), CAST(0 AS int))`)
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** The whole book, by name.
   *
   *  Not paged and not filtered, because a company has as many accounts as it
   *  has employees and the screen shows all of them. Sorted in SQL rather than
   *  in the browser so that ONE ordering exists: the screen invalidates and
   *  refetches after every write, and a second sort living on the other side of
   *  the wire is how a freshly renamed person jumps to the bottom of a list
   *  that is alphabetical everywhere else. */
  async all(): Promise<ActorRow[]> {
    return this.db.select().from(actor).orderBy(actor.name)
  }

  /** The roster — people who can still sign in, by name.
   *
   *  Same statement as `all()` minus the locked rows, and it stays a separate
   *  method rather than `all(includeDisabled?: boolean)`: the two callers ask
   *  different questions with different permissions behind them, and a boolean
   *  argument is how the wrong one eventually gets passed. `DirectoryResponse`
   *  in `@pv/contracts` carries the reasoning for the filter itself. */
  async active(): Promise<ActorRow[]> {
    return this.db.select().from(actor).where(isNull(actor.disabledAt)).orderBy(actor.name)
  }

  /** One person, WITH the row locked for the rest of the transaction.
   *
   *  Everything the service decides about this row — may it be demoted, may it
   *  be locked, has its lock stamp already been set — is read here and written
   *  back a few statements later, so the row must not move in between.
   *
   *  `lockPeopleBook` already keeps two PATCHes apart, and this is the second
   *  fence: it also holds against a writer that does NOT take the book lock,
   *  which `AuthService.setPasswordHash` is today and any future one will be
   *  unless somebody remembers. A lock that only works while every caller
   *  remembers something is not a lock. */
  async byIdForUpdate(tx: Db, id: string): Promise<ActorRow | null> {
    const [row] = await tx.select().from(actor).where(eq(actor.id, id)).limit(1).for('update')
    return row ?? null
  }

  async byId(id: string): Promise<ActorRow | null> {
    const [row] = await this.db.select().from(actor).where(eq(actor.id, id)).limit(1)
    return row ?? null
  }

  /** Everyone OTHER than `exceptId` who is enabled and holds one of `roleIds`.
   *
   *  Only meaningful while `lockPeopleBook` is held — see that method for the
   *  race this answer is otherwise stale for, and for why the lock is one
   *  advisory lock rather than `FOR UPDATE` on the rows counted here.
   *
   *  Ids rather than `count(*)` because the count is only ever compared against
   *  zero, and a list makes the log line at the refusal say WHO is left instead
   *  of how many. It is bounded by the number of administrators, which is two.
   *
   *  `roleIds` arrives as a parameter rather than being spelled out here: WHICH
   *  roles can administer people is a fact of `ROLE_PERMISSIONS` in
   *  `@pv/engines`, and a repository that knew it would be a second copy of the
   *  permission matrix written in SQL. This file only knows how to ask.
   *
   *  An empty `roleIds` short-circuits rather than emitting `IN ()`, which is a
   *  syntax error in Postgres. It cannot happen while any role holds the
   *  permission, and it must not become a 500 on the day one stops. */
  async enabledIdsWithRoles(tx: Db, exceptId: string, roleIds: EngineRoleId[]): Promise<string[]> {
    if (roleIds.length === 0) return []
    const rows = await tx
      .select({ id: actor.id })
      .from(actor)
      .where(and(ne(actor.id, exceptId), isNull(actor.disabledAt), inArray(actor.roleId, roleIds)))
    return rows.map((r) => r.id)
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /** Open an account. Throws the driver's UNIQUE/PK violation straight through.
   *
   *  No `ON CONFLICT DO NOTHING` and no pre-flight `SELECT`: the primary key
   *  and the mailbox index are the only things that can answer "is this free"
   *  at the moment the answer is used, and the service is written to read their
   *  refusals — `actor_pkey` as "pick another id", `actor_email_unique` as a
   *  409 pointing at the `email` box (`users.constraints.ts`). Swallowing them
   *  here would leave both callers guessing. */
  async insert(tx: Db, draft: ActorDraft): Promise<ActorRow> {
    const [row] = await tx.insert(actor).values(draft).returning()
    /* `INSERT … RETURNING` yields exactly one row or throws; this is here so
       the type is `ActorRow` rather than `ActorRow | undefined`, not because
       the empty case is reachable. */
    if (!row) throw new Error('INSERT platform.actor không trả về dòng nào.')
    return row
  }

  /** Apply a patch to one row. The caller has already locked it with
   *  `byIdForUpdate`, so a miss here is unreachable rather than a case to
   *  handle — same reasoning as the `INSERT … RETURNING` guard above. */
  async update(tx: Db, id: string, columns: ActorColumns): Promise<ActorRow> {
    const [row] = await tx.update(actor).set(columns).where(eq(actor.id, id)).returning()
    if (!row) throw new Error(`UPDATE platform.actor không tìm thấy dòng "${id}".`)
    return row
  }

  /** One append-only line in `platform.audit`, inside the caller's unit of work.
   *
   *  `tx` defaults to the pool for the one caller that has no transaction to
   *  join: sending an invite writes its ticket through `AuthService`, which
   *  owns its own handle, so there is nothing for this line to be atomic with.
   *  Every other caller passes the handle — see the file docblock. */
  async writeNote(entry: AuditEntry, tx: Db = this.db): Promise<void> {
    await tx.insert(audit).values(entry)
  }
}
