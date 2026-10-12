import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  OpportunitySaleOwnersResponse,
  type ObjectCode,
  type OpportunityAct,
  type OpportunitySaleOwnersBody,
} from '@pv/contracts'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import { TouchService } from '../touch/touch.service'
import { boardVerdict, dealAtOf, type DealAt } from './opportunity-lifecycle'
import {
  assertSellers,
  lanePeople,
  NO_OWNER,
  PRIMARY_REASON_NEEDED,
  primaryOf,
  recordSaleLane,
  salePrimaryOf,
} from './opportunity-owners'
import { ownerRowsOf, toRef } from './opportunity.mapper'
import { OpportunityFacts } from './opportunity-facts'
import { OpportunityRepository, type OpportunityRead } from './opportunity.repository'

/** The assign door (ADR 0071): the head gives an accepted deal its seller, or
 *  changes them. REPLACES the SALE lane — reassigning is the point — where the
 *  accept door only adds. An unchanged lane with the same primary (ADR 0086) is
 *  a no-op; an ADDED id must be an
 *  active seller (a migrated head already on the lane may stay); an empty lane
 *  is fine while someone still holds the deal (the acceptor, after accept).
 *  While a sign request waits the people are frozen (they are its commission
 *  holders) and only the primary may move, with a reason (owner, 12/10/2026).
 *
 *  SCOPED like every deal door, so an `ownOnly` holder of this grant would reach
 *  only its own deals. Head, director and the account-executive seat are not
 *  `ownOnly`: they reassign on every deal, by design. Out of scope = 404.
 *
 *  One transaction under the deal's row lock: the lane, one touch naming the
 *  change, the old holder's open step handed to the new one, the mirror row. */
@Injectable()
export class OpportunityAssign {
  constructor(
    private readonly deals: OpportunityRepository,
    private readonly touch: TouchService,
    private readonly mirror: ObjectMirror,
    private readonly facts: OpportunityFacts,
  ) {}

  async assign(
    who: Actor,
    code: ObjectCode,
    body: OpportunitySaleOwnersBody,
  ): Promise<OpportunitySaleOwnersResponse> {
    const by = { id: who.id, name: who.name }
    const at = new Date()

    await this.deals.run(async (tx) => {
      const lock = await this.deals.lockDeal(tx, code)
      const found = lock ? await this.deals.byCode(who, code, tx) : null
      if (!lock || !found || !found.inScope) throw notFound('cơ hội', code)
      const before = found.owners.filter((o) => o.role === 'SALE')
      const verdict = assignVerdict(dealAtOf(found, lock.pendingSign), before.length)
      if (!verdict.ok) throw conflict(verdict.reason)

      const removed = before.filter((o) => !body.saleOwners.includes(o.id))
      const addedIds = body.saleOwners.filter((id) => !before.some((o) => o.id === id))
      const kept = removed.length === 0 && addedIds.length === 0
      if (lock.pendingSign && !kept) {
        throw conflict(`Cơ hội ${code} đang chờ duyệt ký, chỉ đổi được Sale chính.`)
      }
      const salePrimary = salePrimaryOf(
        await lanePeople(tx, body.saleOwners),
        primaryOf(found.owners),
        body.salePrimary,
      )
      const same = salePrimary === primaryOf(found.owners)
      if (kept && same) return
      if (lock.pendingSign && body.reason === undefined) {
        throw invalid({ reason: [PRIMARY_REASON_NEEDED] }, PRIMARY_REASON_NEEDED)
      }
      await assertSellers(tx, addedIds)

      /* The BD lane is written back as read under the lock: this door owns SALE only. */
      const bdOwners = found.owners.filter((o) => o.role === 'BD').map((o) => o.id)
      await this.deals.replaceOwners(
        tx,
        code,
        ownerRowsOf(code, { saleOwners: body.saleOwners, bdOwners }, salePrimary),
      )
      const fresh = await this.deals.byCode(null, code, tx)
      if (!fresh) throw notFound('cơ hội', code)
      if (!fresh.holder) throw invalid({ saleOwners: [NO_OWNER] }, NO_OWNER)
      await recordSaleLane(tx, this.touch, {
        code,
        added: fresh.owners.filter((o) => o.role === 'SALE' && addedIds.includes(o.id)),
        removed,
        from: found.holder,
        to: fresh.holder,
        by,
        at,
        primary: same ? undefined : primaryMove(found, fresh, body.reason),
      })
      await this.mirror.put(tx, toRef(fresh.row, fresh.holder))
    })

    const read = await this.deals.byCode(null, code)
    if (!read) throw notFound('cơ hội', code)
    return OpportunitySaleOwnersResponse.parse(await this.facts.row(read))
  }
}

/** The primary's name before and after, for the timeline row carrying the
 *  reason; nothing when no reason was given or the lane was emptied. */
function primaryMove(found: OpportunityRead, fresh: OpportunityRead, reason?: string) {
  const nameOf = (read: OpportunityRead) => read.owners.find((o) => o.primary)?.name ?? null
  const to = nameOf(fresh)
  return reason === undefined || to === null ? undefined : { from: nameOf(found), to, reason }
}

/** On the board and past `new` — the door's guard and `acts.assign`, one rule.
 *  A waiting sign request leaves the door open for the primary alone, so only
 *  when the SALE lane (`saleCount` people) has someone else to name. */
export function assignVerdict(deal: DealAt, saleCount: number): OpportunityAct {
  const waiting = deal.pendingSign && saleCount < 2
  const board = boardVerdict({ ...deal, pendingSign: waiting }, 'giao Sale')
  if (!board.ok) return board
  return board.stage === 'new'
    ? { ok: false, reason: 'Cơ hội chưa nhận PIC. Nhận PIC trước rồi giao Sale.' }
    : { ok: true }
}
