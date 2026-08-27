import { sql } from 'drizzle-orm'
import { Injectable } from '@nestjs/common'
import type { ObjectRef } from '@pv/engines'
import { type Db } from '../db/db.module'
import { objectRef } from '../db/platform.schema'

/** Writes the `platform.object` row that every business object must have.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS EXISTS AT ALL
 *  ------------------------------------------------------------------
 *  `platform.object` is the registry E1 walks: `story()` reaches a lead, its
 *  campaign, its opportunity and its contract by hopping edges between rows of
 *  that one table. A branch row with no mirror row is invisible to the graph —
 *  the lead opens fine, every column is right, and its ContextRail is simply
 *  empty. Rule 10 breaks in silence, which is the worst way for a rule to
 *  break.
 *
 *  So the mirror write is not a nicety a service may remember: it is a
 *  precondition of creating the object. `sales.lead.code` carries a foreign key
 *  into `platform.object(code)` precisely so Postgres refuses the insert when
 *  the mirror is missing, instead of trusting whoever writes the next intake
 *  endpoint to recall this paragraph.
 *
 *  ------------------------------------------------------------------
 *  THE CALLER OWNS THE TRANSACTION
 *  ------------------------------------------------------------------
 *  Every method takes the transaction handle rather than opening one. Two
 *  writes that must both land or neither land cannot be two transactions, and
 *  the branch service is the only layer that knows what else belongs in the
 *  same unit of work. `Db` is the shared parent type, and a Drizzle transaction
 *  IS one — so the same signature accepts `db` and `tx` without naming a
 *  driver.
 *
 *  ------------------------------------------------------------------
 *  label · owner · state · amount ARE A SNAPSHOT, NOT THE TRUTH
 *  ------------------------------------------------------------------
 *  The branch table owns those values; the copy here exists so the rail can be
 *  drawn without joining every branch in the system — which platform must not
 *  do, since it is not allowed to know that `sales.lead` exists. A stale copy
 *  shows an old company name on the rail: wrong label, never wrong data. That
 *  is the trade, and it only holds while the snapshot is refreshed by the same
 *  service that changed the branch row — hence `put` upserts rather than
 *  inserts.
 *
 *  This class knows nothing about leads, opportunities or contracts. It speaks
 *  `ObjectRef`, the engine's shared shape, which is what keeps `platform/` from
 *  importing `branches/`. */
@Injectable()
export class ObjectMirror {
  /* No injected `Db` on purpose. Every method takes the handle it writes
     through, so there is no second, transaction-less path into this table for a
     caller to reach for by accident — which is the whole failure this class was
     added to prevent. */

  /** Insert the mirror row, or refresh the snapshot if the code already exists.
   *
   *  Upsert rather than insert because the same call site serves both moments:
   *  creating the object, and updating it after the company, the owner or the
   *  stage changed. One method means a service cannot get the create path right
   *  and the update path wrong. */
  async put(tx: Db, ref: ObjectRef): Promise<void> {
    await this.putMany(tx, [ref])
  }

  /** Same contract, one statement, for batch intake.
   *
   *  A file import writes hundreds of rows; sending one statement per row turns
   *  a single import into hundreds of round trips to Neon, and every one of
   *  them inside an open transaction holding its locks that much longer. */
  async putMany(tx: Db, refs: readonly ObjectRef[]): Promise<void> {
    if (refs.length === 0) return

    await tx
      .insert(objectRef)
      .values(
        refs.map((r) => ({
          code: r.code,
          kind: r.kind,
          branch: r.branch,
          label: r.label,
          /* Explicit null rather than `undefined`: on the update path these
             columns must be CLEARABLE. A lead that leaves the pipeline has no
             stage any more, and `undefined` would quietly leave the old one
             standing on the rail. */
          owner: r.owner ?? null,
          state: r.state ?? null,
          amount: r.amount ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: objectRef.code,
        set: {
          label: sql`excluded.label`,
          owner: sql`excluded.owner`,
          state: sql`excluded.state`,
          amount: sql`excluded.amount`,
        },
      })
  }

  /* `kind` and `branch` are deliberately absent from the update set. They are
     the object's IDENTITY: 'LD-0142' is a Sales lead for as long as that code
     exists, and a write that changes either one has confused two objects rather
     than updated one. Leaving them out means such a write is a no-op here
     instead of a silent rewrite of history the graph already recorded. */
}
