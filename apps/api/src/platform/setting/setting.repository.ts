import { eq, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { SettingKey } from '@pv/contracts'
import { DB, type Db } from '../db/db.module'
import { setting, type SettingRowDb } from '../db/platform.schema'

/** SQL of `platform.setting`. Decides nothing, merges nothing — the registry
 *  default a missing row stands for is the service's business.
 *
 *  The write takes a `tx` from outside, the contract `IdentityRepository` and
 *  `MeetingRepository` both state: the service is what knows that turning a
 *  dial and recording who turned it are one fact, so it owns the transaction
 *  they share. */
@Injectable()
export class SettingRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Every override there is. No filter, no paging, no ordering: the table
   *  cannot hold more rows than `SettingKey` has members — six — and the
   *  service reads them into a map keyed by `key` anyway, so any order the
   *  planner picks is the right one. */
  all(): Promise<SettingRowDb[]> {
    return this.db.select().from(setting)
  }

  /** One key's override, or `null` for the ordinary case of a key nobody has
   *  tuned. `null` is NOT an error here and no caller may treat it as one —
   *  see `setting.service.ts`. */
  async byKey(key: SettingKey, tx: Db = this.db): Promise<SettingRowDb | null> {
    const [row] = await tx.select().from(setting).where(eq(setting.key, key)).limit(1)
    return row ?? null
  }

  /** The same read, but holding the row until the transaction ends.
   *
   *  It exists for the AUDIT LINE, not for the write — the write below needs no
   *  read in front of it. Two operators moving the same dial in the same second
   *  would otherwise both read the old number and both file a line claiming to
   *  have moved it from there, and the second line would name a value that was
   *  never live when it was written. `FOR UPDATE` makes the second one wait and
   *  read what the first actually left.
   *
   *  It cannot cover the one case with no row to lock: two first-ever writes to
   *  the same key both see the registry default. The table still ends with the
   *  later value — `ON CONFLICT` is what guarantees that — only the losing
   *  line's "before" is optimistic, which is not worth a lock table to fix. */
  async lock(tx: Db, key: SettingKey): Promise<SettingRowDb | null> {
    const [row] = await tx.select().from(setting).where(eq(setting.key, key)).limit(1).for('update')
    return row ?? null
  }

  /** Set or move one override, in ONE statement.
   *
   *  `ON CONFLICT DO UPDATE` rather than "look, then insert or update": the look
   *  answers "no row" to both of two concurrent writers, and the second insert
   *  then dies on the primary key — a 500 on a screen where the honest answer is
   *  that the number did change, just twice.
   *
   *  `updated_at` is set explicitly because `defaultNow()` only fires on INSERT;
   *  left out of the `set`, every later move of a dial would keep advertising
   *  the timestamp of the first one. `now()` and not a `Date` from this process,
   *  so the mark comes off the same clock the insert path uses. */
  async upsert(tx: Db, key: SettingKey, value: number, updatedBy: string): Promise<SettingRowDb> {
    const [row] = await tx
      .insert(setting)
      .values({ key, value, updatedBy })
      .onConflictDoUpdate({
        target: setting.key,
        set: { value, updatedBy, updatedAt: sql`now()` },
      })
      .returning()

    if (!row) throw new Error('platform.setting: upsert returned no row')
    return row
  }
}
