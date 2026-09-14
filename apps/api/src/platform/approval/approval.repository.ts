import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { RoleId } from '@pv/engines'
import { DB, type Db } from '../db/db.module'
import { actor } from '../db/platform.schema'
import {
  approval,
  approvalLink,
  type ApprovalLinkRowDb,
  type ApprovalRowDb,
  type ApprovalValues,
} from './approval.schema'

/** The only place the approval tables have SQL.
 *
 *  Decides nothing, the way every repository in this codebase decides nothing:
 *  whose turn it is and whether a decision is allowed are answered by `decideOn`
 *  in `@pv/engines`, from rows this class loaded. That split is what lets the
 *  same law run in a browser with no database behind it. */
@Injectable()
export class ApprovalRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Open a request and tie it to whatever objects it touches, in ONE
   *  transaction — a request whose links are missing points at nothing, and a
   *  link with no request is a row no query will ever reach. */
  async open(
    values: ApprovalValues,
    links: readonly { objectCode: string; objectLabel: string }[],
  ): Promise<ApprovalRowDb> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(approval).values(values).returning()
      if (!row) throw new Error('platform.approval: INSERT returned no row')

      if (links.length > 0) {
        await tx.insert(approvalLink).values(links.map((l) => ({ ...l, requestId: row.id })))
      }

      return row
    })
  }

  /** Who currently holds each of these roles, name included.
   *
   *  DISABLED ACCOUNTS ARE NOT SEATS. Off-boarding sets `disabled_at` and never
   *  deletes the row (`users.service.ts`), so without this filter a departed
   *  director keeps collecting approvals: every new request parks on a name that
   *  can no longer sign in, and `decideOn` tells everybody else it is not their
   *  turn. The request is then undecidable forever. `role_permission.repository`
   *  filters the same way on the same table, for the same reason.
   *
   *  Ordered by actor id so a role with two holders resolves to the same person
   *  on every call — an approval that waits on a different person each time it
   *  is read is an approval nobody can finish. */
  async holdersOf(roles: readonly RoleId[]): Promise<{ roleId: RoleId; name: string }[]> {
    if (roles.length === 0) return []
    return this.db
      .select({ roleId: actor.roleId, name: actor.name })
      .from(actor)
      .where(and(inArray(actor.roleId, [...roles]), isNull(actor.disabledAt)))
      .orderBy(actor.id)
  }

  async byId(id: string): Promise<ApprovalRowDb | null> {
    const [row] = await this.db.select().from(approval).where(eq(approval.id, id)).limit(1)
    return row ?? null
  }

  /** Rows that MENTION this person as a waiting link — a PREFILTER, not the
   *  answer.
   *
   *  The containment test (`@>` against a one-element array) is what
   *  `approval_chain_idx` (GIN) indexes, and it is the only part of the question
   *  Postgres can answer cheaply. What it cannot express is the rest of the law:
   *  a chain is walked IN ORDER, so a request mentioning you third is not yours
   *  until the first two have answered. `ApprovalService` applies that with
   *  `isPendingFor`, the same function the browser uses — the alternative,
   *  teaching this query about ordering, would put half of E3's turn rule in
   *  SQL where the other half cannot see it.
   *
   *  Matched on NAME because a `ChainLink` carries a name; see the note on
   *  `decideOn`. The hole that opens when two people share a display name is
   *  the chain's, and it is named there rather than papered over here. */
  async waitingFor(personName: string): Promise<ApprovalRowDb[]> {
    return this.db
      .select()
      .from(approval)
      .where(
        and(
          eq(approval.state, 'waiting'),
          sql`${approval.chain} @> ${JSON.stringify([{ person: personName, state: 'waiting' }])}::jsonb`,
        ),
      )
      .orderBy(desc(approval.raisedAt))
  }

  async linksOf(requestIds: readonly string[]): Promise<ApprovalLinkRowDb[]> {
    if (requestIds.length === 0) return []
    return this.db
      .select()
      .from(approvalLink)
      .where(inArray(approvalLink.requestId, [...requestIds]))
  }

  /** One unit of work, handed to the caller.
   *
   *  Settling a request and APPLYING what it asked for have to land together:
   *  a row that says `approved` while the change it approved never happened is
   *  a lie nobody can spot afterwards. The caller holds the transaction because
   *  the caller is the layer that knows what else belongs in it — the same
   *  shape `ObjectMirror` and `TouchService` follow. */
  run<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction(fn)
  }

  /** Write back a request the engine has just decided.
   *
   *  Guarded on `state = 'waiting'`: two people pressing approve on the same
   *  request within the same second both loaded a waiting row, and without the
   *  guard the second write silently overwrites the first decision with its
   *  own. `returning` says which of them actually moved the row — zero rows
   *  back means somebody else got there first, and the caller turns that into a
   *  refusal rather than a lie. */
  async settle(
    tx: Db,
    id: string,
    patch: Pick<ApprovalValues, 'state' | 'chain' | 'decidedAt' | 'decidedBy' | 'decidedReason'>,
  ): Promise<boolean> {
    const rows = await tx
      .update(approval)
      .set(patch)
      .where(and(eq(approval.id, id), eq(approval.state, 'waiting')))
      .returning({ id: approval.id })

    return rows.length > 0
  }
}
