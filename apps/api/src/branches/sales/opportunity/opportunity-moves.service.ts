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
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { endHolds, shiftDealClock } from '../hold/hold.sql'
import { syncLeadRuns } from '../workstream/workstream-sync'
import { LeadStateWriter } from '../lead/lead-state'
import { announceOpened } from './opportunity-bell'
import { OpportunityFacts } from './opportunity-facts'
import { dealAtOf, OpportunityLifecycle, type DealAt } from './opportunity-lifecycle'
import { daysInStageOf, NOTE } from './opportunity.mapper'
import { OpportunityRepository, type OpportunityRead } from './opportunity.repository'

/** The two doors that MOVE a deal (ADR 0064 §3, 0069 §1): record a care activity,
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
 *  repository — no import, no engine. A dead deal is reported through the same
 *  `announceOpened` the create door calls: one answer to "who hears of a deal". */
@Injectable()
export class OpportunityMoves {
  constructor(
    private readonly deals: OpportunityRepository,
    private readonly lifecycle: OpportunityLifecycle,
    private readonly hub: NotificationHub,
    private readonly leadStates: LeadStateWriter,
    private readonly facts: OpportunityFacts,
  ) {}

  /** `POST /sales/opportunities/:code/milestones` — a care activity was
   *  recorded, and the column follows where ADR 0072 says so. Care activities
   *  only: the body's zod refuses a quotation, which has its own door and
   *  ledger (ADR 0090). */
  async milestone(
    who: Actor,
    code: ObjectCode,
    body: OpportunityMilestoneBody,
  ): Promise<OpportunityMilestoneResponse> {
    const found = await this.inScope(who, code)

    const row = await this.deals.run(async (tx) => {
      const fresh = await this.locked(tx, who, code)
      return this.lifecycle.milestone(tx, fresh, body.kind, mover(who), {
        at: body.at === undefined ? undefined : new Date(body.at),
        note: body.note,
      })
    })

    return OpportunityMilestoneResponse.parse(await this.answer(found, row, new Date()))
  }

  /** `POST /sales/opportunities/:code/stop` — the deal is lost, with a reason.
   *
   *  One transaction for everything the stop causes: the bell line, the lead
   *  parked when this was its last live deal (ADR 0069 §3), the LEAD's run
   *  re-synced — the deal's own run code may be an older journey of the lead.
   *  The lead is locked BEFORE the deal — the order the lead hand-over takes.
   *  Stopping a held deal is allowed and ends its hold (ADR 0097 §3). */
  async stop(
    who: Actor,
    code: ObjectCode,
    body: OpportunityStopBody,
  ): Promise<OpportunityStopResponse> {
    const found = await this.inScope(who, code)
    const at = new Date()

    const row = await this.deals.run(async (tx) => {
      /* A lead switched off meanwhile: `locked` re-reads the deal and 404s. */
      const [lead] = await this.deals.lockLeads(tx, [found.row.leadCode])
      const fresh = await this.locked(tx, who, code)
      /* The held time leaves the column clock first, so `days_in_from` excludes it. */
      const [ended] = await endHolds(tx, 'opportunity', [code], 'stopped', who.id)
      if (ended) fresh.row = { ...fresh.row, stageSince: await shiftDealClock(tx, code, ended) }
      const written = await this.lifecycle.stop(tx, fresh, mover(who), body, at)
      const accepted = written.acceptedById !== null
      const dead = { code, name: written.name, actorId: who.id, accepted }
      const holders = [...fresh.ownerIds, written.acceptedById]
      await announceOpened(tx, this.hub, { ...dead, holders, lost: true })
      /* A lead owner off the deal may not open it: they hear it on the lead (ADR 0093 §7). */
      if (lead?.ownerId && !holders.includes(lead.ownerId)) {
        const subject = { kind: 'lead' as const, code: written.leadCode, label: lead.company }
        await announceOpened(
          tx,
          this.hub,
          { ...dead, holders: [lead.ownerId], lost: true, subject },
          [],
        )
      }
      const parked =
        (await this.deals.allLost(tx, written.leadCode)) &&
        (await this.parkLead(tx, who, written, { lead, sale: primarySaleOf(fresh.owners) }))
      if (!parked) await syncLeadRuns(tx, [written.leadCode])
      return written
    })

    return OpportunityStopResponse.parse(await this.answer(found, row, at))
  }

  /** The lead goes back to waiting (the state writer re-syncs its run and
   *  withholds its mail, ADR 0068 §6). A lead nobody holds first takes the lost
   *  deal's primary Sale, else the stopper (ADR 0097 §2), credited to the
   *  stopper — no `lead-received` line: the stop's `opportunity-lost` reaches
   *  them already. `true` when the lead moved. */
  private async parkLead(
    tx: Db,
    who: Actor,
    deal: OpportunityRead['row'],
    on: { lead: LockedLead | undefined; sale: { id: string } | null },
  ): Promise<boolean> {
    if (on.lead && on.lead.ownerId === null && on.lead.state === 'converted') {
      /* A locked primary Sale cannot hold a lead: the stopper takes it. */
      const sale = on.sale ? await this.deals.liveActor(tx, on.sale.id) : undefined
      await this.leadStates.claimed(tx, [on.lead], sale ?? who, who, false)
    }
    return this.leadStates.dealsLost(tx, deal.leadCode, mover(who), NOTE.lastLost.nurturing)
  }

  /** The same two refusals every read door of this module makes, in the same
   *  words — see `OpportunityService.profile` for why both are a 404. */
  async inScope(who: Actor, code: ObjectCode): Promise<OpportunityRead> {
    const found = await this.deals.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)
    return found
  }

  /** The deal under `FOR UPDATE`, read back through the same handle — scope
   *  included, so an owners edit that landed while this waited is judged too.
   *  `pendingSign` comes from the LOCK read: it is the fact a move must never
   *  race with the sign door's own apply step. */
  async locked(
    tx: Db,
    who: Actor,
    code: ObjectCode,
  ): Promise<DealAt & { ownerIds: string[]; owners: OpportunityRead['owners'] }> {
    const lock = await this.deals.lockDeal(tx, code)
    if (!lock) throw notFound('cơ hội', code)
    const fresh = await this.deals.byCode(who, code, tx)
    if (!fresh || !fresh.inScope) throw notFound('cơ hội', code)
    return {
      ...dealAtOf(fresh, lock.pendingSign),
      ownerIds: fresh.owners.map((o) => o.id),
      owners: fresh.owners,
    }
  }

  /** The book row, built from the row the move returned plus the labels the read
   *  before the transaction already carried. */
  private answer(found: OpportunityRead, row: OpportunityRead['row'], at: Date) {
    return this.facts.row({
      ...found,
      row,
      daysInStage: daysInStageOf(row, at),
    })
  }
}

const mover = (who: Actor) => ({ id: who.id, name: who.name })

/** The deal's primary Sale (ADR 0086), or none when its SALE lane is empty. */
const primarySaleOf = (owners: OpportunityRead['owners']) => {
  const sale = owners.find((o) => o.role === 'SALE' && o.primary)
  return sale ? { id: sale.id } : null
}

type LockedLead = Awaited<ReturnType<OpportunityRepository['lockLeads']>>[number]
