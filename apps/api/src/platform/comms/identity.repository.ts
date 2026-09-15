import { and, asc, desc, eq, ilike, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { IdentityQuery } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { contains } from '@api/platform/db/like'
import { identity, type IdentityRowDb, type IdentityValues } from './comms.schema'
import type { NormalisedAddress } from './comms.mapper'

/** SQL of the identity book. Decides nothing, folds nothing.
 *
 *  Every write takes a `tx` from outside rather than opening one, the same
 *  contract `MeetingRepository` states: the service is what knows a merge is
 *  "read two rows, compare, delete one" and that the read has to see what the
 *  delete will see. A read run on the pool from inside a transaction is a read
 *  OUTSIDE it wearing the right clothes, so `byId` takes the handle too.
 *
 *  There is no `byAddress`, and turn 0 wants none: the anti-duplicate check is
 *  the UNIQUE fence itself, not a lookup in front of it. A lookup answers
 *  between two concurrent inserts and lets the second one through. */
@Injectable()
export class IdentityRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** One page of the book, newest first.
   *
   *  `id` breaks the tie on `created_at`: two rows minted in the same
   *  statement share a timestamp to the microsecond, and a page boundary that
   *  moves between two requests drops or repeats a row with nothing on screen
   *  saying why. */
  async book(q: IdentityQuery): Promise<{ rows: IdentityRowDb[]; total: number }> {
    const where = and(...filtersOf(q))

    const rows = await this.db
      .select()
      .from(identity)
      .where(where)
      .orderBy(desc(identity.createdAt), asc(identity.id))
      .limit(q.size)
      .offset((q.page - 1) * q.size)

    const [tally] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(identity)
      .where(where)

    return { rows, total: tally?.n ?? 0 }
  }

  async byId(tx: Db, id: string): Promise<IdentityRowDb | null> {
    const [row] = await tx.select().from(identity).where(eq(identity.id, id)).limit(1)
    return row ?? null
  }

  /** `address` is narrowed to `NormalisedAddress`, so this signature only
   *  accepts a string that came out of `normaliseAddress`. See the type's
   *  docblock: it is the fence that makes an un-folded write a red build
   *  rather than two rows for one mailbox. */
  async insert(tx: Db, values: IdentityInsert): Promise<IdentityRowDb> {
    const [row] = await tx.insert(identity).values(values).returning()
    if (!row) throw new Error('comms.identity: INSERT returned no row')
    return row
  }

  async patch(tx: Db, id: string, values: Partial<IdentityValues>): Promise<IdentityRowDb | null> {
    const [row] = await tx.update(identity).set(values).where(eq(identity.id, id)).returning()
    return row ?? null
  }

  async remove(tx: Db, id: string): Promise<void> {
    await tx.delete(identity).where(eq(identity.id, id))
  }
}

export type IdentityInsert = Omit<IdentityValues, 'address'> & { address: NormalisedAddress }

function filtersOf(q: IdentityQuery): SQL[] {
  const parts: SQL[] = []

  if (q.channel !== undefined) parts.push(eq(identity.channel, q.channel))

  /* The needle does NOT go through `normaliseAddress`, and that is not an
     oversight. It is a SUBSTRING, not an address — `?address=0912` is a
     perfectly sensible thing to type — and `channel` is optional here, so
     there is often no channel to key the folding rule on. The one folding an
     address needle would want, case, `ILIKE` already does. */
  if (q.address !== undefined) parts.push(ilike(identity.address, contains(q.address)))

  return parts
}
