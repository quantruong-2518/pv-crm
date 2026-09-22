import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  OpportunityCareResponse,
  OpportunityMilestoneResponse,
  OpportunityReactivateResponse,
  type ObjectCode,
  type OpportunityCareBody,
  type OpportunityMilestoneBody,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, notFound } from '@api/platform/http/problem'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { LEAD_GONE_WORDS } from '../lead/lead-state'
import { OpportunityLifecycle, type DealAt } from './opportunity-lifecycle'
import { daysInStageOf, toContract, toRef } from './opportunity.mapper'
import { OpportunityRepository, type OpportunityRead } from './opportunity.repository'
import { OpportunityService } from './opportunity.service'

/** The three doors that MOVE a deal (ADR 0064 §3): record a milestone, park it
 *  on the care list, bring it back. One shape for all three, and it is the lead
 *  exit door's shape: read for the two refusals (404 / out of scope), open the
 *  transaction, lock the row, re-read it UNDER the lock, hand the move to
 *  `OpportunityLifecycle`, answer with the whole book row.
 *
 *  Re-reading inside the transaction is what makes the guards honest: the stage
 *  they judge is the stage the UPDATE will find, not the one a screen was
 *  looking at while somebody else recorded a quotation.
 *
 *  Separate from `OpportunityService` because it shares nothing with it but the
 *  repository — no import, no mail, no engine. The one thing it borrows is the
 *  notification door, and it borrows rather than copies: a second `plan()` call
 *  in this file would be a second answer to "who hears about a dead deal". */
@Injectable()
export class OpportunityMoves {
  constructor(
    private readonly deals: OpportunityRepository,
    private readonly lifecycle: OpportunityLifecycle,
    private readonly ops: OpportunityService,
    private readonly runs: WorkstreamRepository,
  ) {}

  /** `POST /sales/opportunities/:code/milestones` — a real event was recorded,
   *  and the column follows it. */
  async milestone(
    who: Actor,
    code: ObjectCode,
    body: OpportunityMilestoneBody,
  ): Promise<OpportunityMilestoneResponse> {
    const found = await this.inScope(who, code)
    const at = body.at === undefined ? new Date() : new Date(body.at)

    const row = await this.deals.run(async (tx) => {
      const fresh = await this.locked(tx, code)
      return this.lifecycle.milestone(tx, fresh, body.kind, mover(who), {
        at,
        ...(body.note === undefined ? {} : { note: body.note }),
      })
    })

    return OpportunityMilestoneResponse.parse(this.answer(found, row, at))
  }

  /** `POST /sales/opportunities/:code/care` — park the deal, with a reason.
   *
   *  The run is re-synced and the ops mailbox is told, both inside the move's
   *  own transaction: a deal leaving the board can end its run, and a deal that
   *  died without anybody hearing is the case the mail exists for. */
  async care(
    who: Actor,
    code: ObjectCode,
    body: OpportunityCareBody,
  ): Promise<OpportunityCareResponse> {
    const found = await this.inScope(who, code)
    const at = new Date()

    const row = await this.deals.run(async (tx) => {
      const fresh = await this.locked(tx, code)
      const written = await this.lifecycle.care(tx, fresh, mover(who), body, at)
      await this.ops.notify(tx, toRef(written, fresh.ownerName), true)
      if (written.workstreamCode) await this.runs.syncClosed(tx, [written.workstreamCode])
      return written
    })

    return OpportunityCareResponse.parse(this.answer(found, row, at))
  }

  /** `POST /sales/opportunities/:code/reactivate` — back to the column it failed
   *  at.
   *
   *  The lead is locked and checked first: while the deal sat in care its lead
   *  could have left the funnel, and reopening the deal would leave an OPEN deal
   *  on an exited lead — exactly what the lead exit door refuses to create. */
  async reactivate(who: Actor, code: ObjectCode): Promise<OpportunityReactivateResponse> {
    const found = await this.inScope(who, code)
    const at = new Date()

    const row = await this.deals.run(async (tx) => {
      const fresh = await this.locked(tx, code)
      const exited = await this.deals.exitedLocked(tx, [fresh.row.leadCode])
      if (exited.length > 0) {
        throw conflict(`Lead đang ở trạng thái ${LEAD_GONE_WORDS} — không mở lại cơ hội được`)
      }
      const written = await this.lifecycle.reactivate(tx, fresh, mover(who), at)
      if (written.workstreamCode) await this.runs.syncClosed(tx, [written.workstreamCode])
      return written
    })

    return OpportunityReactivateResponse.parse(this.answer(found, row, at))
  }

  /** The same two refusals every read door of this module makes, in the same
   *  words — see `OpportunityService.profile` for why both are a 404. */
  private async inScope(who: Actor, code: ObjectCode): Promise<OpportunityRead> {
    const found = await this.deals.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)
    return found
  }

  /** The deal under `FOR UPDATE`, read back through the same handle. `pendingSign`
   *  comes from the LOCK read, not `fresh`: it is the fact a move must never
   *  race with the sign door's own apply step. */
  private async locked(tx: Db, code: ObjectCode): Promise<DealAt> {
    const lock = await this.deals.lockDeal(tx, code)
    if (!lock) throw notFound('cơ hội', code)
    const fresh = await this.deals.byCode(null, code, tx)
    if (!fresh) throw notFound('cơ hội', code)
    return dealAt(fresh, lock.pendingSign) satisfies DealAt
  }

  /** The book row, built from the row the move returned plus the labels the read
   *  before the transaction already carried. */
  private answer(found: OpportunityRead, row: OpportunityRead['row'], at: Date) {
    return toContract({
      row,
      account: found.account,
      owners: found.owners,
      signed: found.signed,
      ...(found.contractCode === null ? {} : { contractCode: found.contractCode }),
      daysInStage: daysInStageOf(row, at),
      products: found.products,
    })
  }
}

/** `OpportunityRead` → what a move needs. The mirror row prints the FIRST owner,
 *  a summary line for whoever opens the rail — `opportunity.mapper.ts#toRef`
 *  argues the choice. */
const dealAt = (found: OpportunityRead, pendingSign: boolean): DealAt => ({
  row: found.row,
  ownerName: found.owners[0]?.name ?? null,
  signed: found.signed,
  pendingSign,
})

const mover = (who: Actor) => ({ id: who.id, name: who.name })
