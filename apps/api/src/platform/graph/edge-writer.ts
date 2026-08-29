import { Injectable } from '@nestjs/common'
import type { Edge } from '@pv/engines'
import { type Db } from '../db/db.module'
import { edge } from '../db/platform.schema'

/** Writes the `platform.edge` rows that turn a pile of objects into a chain.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS EXISTS, AND WHY IT IS NOT A FEW LINES IN A BRANCH SERVICE
 *  ------------------------------------------------------------------
 *  Until module 4 only `seed.ts` ever wrote an edge; `ObjectMirror` writes the
 *  NODE table and nothing else. So `story()` could reach every object in the
 *  system and connect none of them, and the rail stopped dead at the contract —
 *  rule 10 breaking in silence, which is the worst way for a rule to break.
 *
 *  The convention for a table that belongs to nobody's branch has to be opened
 *  where the table lives. `opportunity.service.ts` said so in a docblock before
 *  this file existed: writing the first edge inside a signing door would mean
 *  the second branch that needs one copies the door rather than the rule, and
 *  the two copies then disagree about direction.
 *
 *  ------------------------------------------------------------------
 *  THE CALLER OWNS THE TRANSACTION, AND OWNS THE ORDER
 *  ------------------------------------------------------------------
 *  Same contract as `ObjectMirror`, for the same reason: two writes that must
 *  both land or neither land cannot be two transactions, and only the branch
 *  service knows what else belongs in the unit of work.
 *
 *  Both endpoints must already have a row in `platform.object` — the edge table
 *  carries a foreign key at each end. That is a fence, not a nuisance: an edge
 *  pointing at a code with no node is a rail that renders a gap nobody can
 *  explain. So the mirror write comes FIRST, always.
 *
 *  This class knows nothing about deals, quotes or contracts. It speaks the
 *  engine's own `Edge` shape, which is what keeps `platform/` from importing
 *  `branches/`. */
@Injectable()
export class EdgeWriter {
  /* No injected `Db`, deliberately — same reasoning as `ObjectMirror`. Every
     method takes the handle it writes through, so there is no second,
     transaction-less path into this table for a caller to reach for by
     accident. */

  /** Draw one edge. Drawing it twice is a no-op, not an error.
   *
   *  `onConflictDoNothing` against the `(from, to, kind)` primary key, because
   *  the honest answer to "link these two again" is that they are already
   *  linked. Letting the duplicate throw would make every write door carry an
   *  existence check that races with itself under two clicks. */
  async link(tx: Db, e: Edge): Promise<void> {
    await this.linkMany(tx, [e])
  }

  /** Same contract, one statement. */
  async linkMany(tx: Db, edges: readonly Edge[]): Promise<void> {
    if (edges.length === 0) return

    await tx
      .insert(edge)
      .values(edges.map((e) => ({ fromCode: e.from, toCode: e.to, kind: e.kind })))
      .onConflictDoNothing()
  }
}
