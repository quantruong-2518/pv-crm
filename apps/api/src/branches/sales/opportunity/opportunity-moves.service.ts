import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  OpportunityMilestoneResponse,
  OpportunityStopResponse,
  type ObjectCode,
  type OpportunityMilestoneBody,
  type OpportunityStopBody,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { notFound } from '@api/platform/http/problem'
import { MailRunRepository } from '@api/platform/mail/mail-run.repository'
import { syncLeadRuns } from '../workstream/workstream-sync'
import { LEAD_NURTURED_WITHHOLD, LeadStateWriter } from '../lead/lead-state'
import { dealAtOf, OpportunityLifecycle, type DealAt } from './opportunity-lifecycle'
import { daysInStageOf, NOTE, toContract, toRef } from './opportunity.mapper'
import { OpportunityRepository, type OpportunityRead } from './opportunity.repository'
import { OpportunityService } from './opportunity.service'

/** The two doors that MOVE a deal (ADR 0064 §3, 0069 §1): record a milestone,
 *  stop it for good. One shape for both, and it is the lead
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
    private readonly leadStates: LeadStateWriter,
    private readonly mailRuns: MailRunRepository,
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
      const fresh = await this.locked(tx, who, code)
      return this.lifecycle.milestone(tx, fresh, body.kind, mover(who), {
        at,
        ...(body.note === undefined ? {} : { note: body.note }),
      })
    })

    return OpportunityMilestoneResponse.parse(this.answer(found, row, at))
  }

  /** `POST /sales/opportunities/:code/stop` — the deal is lost, with a reason.
   *
   *  One transaction for everything the stop causes: the ops mail, the lead
   *  parked when this was its last live deal (ADR 0069 §3), the LEAD's run
   *  re-synced — the deal's own run code may be an older journey of the lead.
   *  The lead is locked BEFORE the deal — the order the lead hand-over takes. */
  async stop(
    who: Actor,
    code: ObjectCode,
    body: OpportunityStopBody,
  ): Promise<OpportunityStopResponse> {
    const found = await this.inScope(who, code)
    const at = new Date()

    const row = await this.deals.run(async (tx) => {
      await this.deals.lockLeads(tx, [found.row.leadCode])
      const fresh = await this.locked(tx, who, code)
      const written = await this.lifecycle.stop(tx, fresh, mover(who), body, at)
      await this.ops.notify(tx, toRef(written, fresh.owner), true)
      const parked =
        (await this.deals.allLost(tx, written.leadCode)) && (await this.parkLead(tx, who, written))
      if (!parked) await syncLeadRuns(tx, [written.leadCode])
      return written
    })

    return OpportunityStopResponse.parse(this.answer(found, row, at))
  }

  /** The lead goes back to waiting (the state writer re-syncs its run); parked
   *  means parked, so its unsent mail is held like the lead's own nurture door
   *  holds it (ADR 0068 §6). `true` when the lead moved. */
  private async parkLead(tx: Db, who: Actor, deal: OpportunityRead['row']): Promise<boolean> {
    const landed = await this.leadStates.dealsLost(tx, deal.leadCode, mover(who), NOTE.lastLost)
    if (landed === 'nurturing') {
      await this.mailRuns.withholdSubject(
        tx,
        { aggregateType: 'lead', aggregateId: deal.leadCode },
        LEAD_NURTURED_WITHHOLD,
      )
    }
    return landed !== null
  }

  /** The same two refusals every read door of this module makes, in the same
   *  words — see `OpportunityService.profile` for why both are a 404. */
  private async inScope(who: Actor, code: ObjectCode): Promise<OpportunityRead> {
    const found = await this.deals.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)
    return found
  }

  /** The deal under `FOR UPDATE`, read back through the same handle — scope
   *  included, so an owners edit that landed while this waited is judged too.
   *  `pendingSign` comes from the LOCK read: it is the fact a move must never
   *  race with the sign door's own apply step. */
  private async locked(tx: Db, who: Actor, code: ObjectCode): Promise<DealAt> {
    const lock = await this.deals.lockDeal(tx, code)
    if (!lock) throw notFound('cơ hội', code)
    const fresh = await this.deals.byCode(who, code, tx)
    if (!fresh || !fresh.inScope) throw notFound('cơ hội', code)
    return dealAtOf(fresh, lock.pendingSign)
  }

  /** The book row, built from the row the move returned plus the labels the read
   *  before the transaction already carried. */
  private answer(found: OpportunityRead, row: OpportunityRead['row'], at: Date) {
    return toContract({
      row,
      account: found.account,
      owners: found.owners,
      contractCodes: found.contractCodes,
      holder: found.holder,
      daysInStage: daysInStageOf(row, at),
      products: found.products,
    })
  }
}

const mover = (who: Actor) => ({ id: who.id, name: who.name })
