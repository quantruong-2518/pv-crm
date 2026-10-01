import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  OpportunityAcceptResponse,
  type ObjectCode,
  type OpportunityAcceptBody,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, notFound } from '@api/platform/http/problem'
import { dealAtOf, OpportunityLifecycle } from './opportunity-lifecycle'
import { actorRoles, assertSellers } from './opportunity-owners'
import { holderOf, toContract, type RefOwner } from './opportunity.mapper'
import { OpportunityRepository, type OpportunityRead } from './opportunity.repository'

/** The accept door (ADR 0071 §3): a head of sales or director takes a `new`
 *  deal to `assigned`, optionally adding SALE owners in the same act.
 *
 *  UNSCOPED on purpose — a head accepts from the queue of every deal, so the
 *  read is `byCode(null, …)` and a missing deal is the only 404. Accepting is
 *  once: a deal past `new` answers 409 naming who accepted it; re-accept and
 *  takeover are not doors (yet).
 *
 *  One transaction, under the deal's row lock: owners union, then the move
 *  through `OpportunityLifecycle.assigned`, which writes the acceptor in the
 *  same UPDATE as the stage, plus the stage event, touch and mirror row. */
@Injectable()
export class OpportunityAccept {
  constructor(
    private readonly deals: OpportunityRepository,
    private readonly lifecycle: OpportunityLifecycle,
  ) {}

  async accept(
    who: Actor,
    code: ObjectCode,
    body: OpportunityAcceptBody,
  ): Promise<OpportunityAcceptResponse> {
    const by = { id: who.id, name: who.name }
    const at = new Date()

    await this.deals.run(async (tx) => {
      const lock = await this.deals.lockDeal(tx, code)
      const found = lock ? await this.deals.byCode(null, code, tx) : null
      if (!lock || !found) throw notFound('cơ hội', code)
      const from = this.lifecycle.onBoard(dealAtOf(found, lock.pendingSign), 'nhận PIC')
      if (from !== 'new') throw alreadyAccepted(found)

      /* Union, never replace: accepting must not drop someone already on the
         deal. Only ids new to the SALE lane are judged as sellers. */
      const onSale = new Set(found.owners.filter((o) => o.role === 'SALE').map((o) => o.id))
      await assertSellers(
        tx,
        (body.saleOwners ?? []).filter((id) => !onSale.has(id)),
      )
      await this.deals.addOwners(
        tx,
        (body.saleOwners ?? []).map((actorId) => ({
          opportunityCode: code,
          actorId,
          role: 'SALE' as const,
        })),
      )
      const fresh = (await this.deals.byCode(null, code, tx)) ?? found
      const owner = await this.holderAfter(tx, fresh, by)
      const moved = await this.lifecycle.assigned(
        tx,
        { row: fresh.row, owner, signed: false, pendingSign: false },
        by,
        at,
      )
      if (!moved) throw alreadyAccepted(found)
    })

    const read = await this.deals.byCode(null, code)
    if (!read) throw notFound('cơ hội', code)
    return OpportunityAcceptResponse.parse(toContract(read))
  }

  /** The holder once `by` is the acceptor — read before the move, because the
   *  move writes the mirror row and must name the right person in it. */
  private async holderAfter(tx: Db, read: OpportunityRead, by: RefOwner): Promise<RefOwner | null> {
    const roles = await actorRoles(
      tx,
      read.owners.map((o) => o.id),
    )
    return holderOf(
      read.owners.map((o) => ({ ...o, roleId: roles.get(o.id) ?? null })),
      by,
    )
  }
}

/** `dd/mm` in Vietnam time. `en-GB`, not `vi-VN`: Node's ICU prints `dd-mm`
 *  for the latter, and the sentence reads the slash form. */
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
})

/** Past `new` already. A deal that reached `assigned` before ADR 0071 with no
 *  head on it has no acceptor to name, so it gets the sentence without one. */
function alreadyAccepted(found: OpportunityRead) {
  const { acceptedBy } = found
  const at = found.row.acceptedAt
  return acceptedBy && at
    ? conflict(`Cơ hội đã được ${acceptedBy.name} nhận PIC ngày ${DAY_MONTH.format(at)}`)
    : conflict(`Cơ hội ${found.row.code} đã qua bước nhận PIC — không nhận lại được.`)
}
