import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  OpportunityMilestoneResponse,
  OpportunityStopResponse,
  type LeadAfterStopChoice,
  type ObjectCode,
  type OpportunityMilestoneBody,
  type OpportunityStopBody,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, notFound } from '@api/platform/http/problem'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { endHolds, shiftDealClock } from '../hold/hold.sql'
import { syncLeadRuns } from '../workstream/workstream-sync'
import { LeadExitService } from '../lead/lead-exit.service'
import { LeadStateWriter } from '../lead/lead-state'
import { MeetingCancel } from '../meeting/meeting-cancel'
import type { MeetingRowDb } from '../meeting/meeting.schema'
import { announceOpened } from './opportunity-bell'
import { OpportunityFacts } from './opportunity-facts'
import { dealAtOf, OpportunityLifecycle, type DealAt } from './opportunity-lifecycle'
import { LeadAfterStopRule } from './opportunity-stop-lead'
import { daysInStageOf, NOTE } from './opportunity.mapper'
import { OpportunityRepository, type OpportunityRead } from './opportunity.repository'

/** The two doors that MOVE a deal (ADR 0064 §3, 0069 §1): record a care activity,
 *  stop it for good. One shape for both, and it is the lead
 *  exit door's shape: open the transaction, lock the row, read it UNDER the lock
 *  (the one read that refuses with 404 / out of scope), hand the move to
 *  `OpportunityLifecycle`, answer with the whole book row from that same read.
 *
 *  Reading inside the transaction is what makes the guards honest: the stage
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
    private readonly leadExits: LeadExitService,
    private readonly leadRule: LeadAfterStopRule,
    private readonly facts: OpportunityFacts,
    private readonly meetings: MeetingCancel,
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
    const { row, read } = await this.deals.run(async (tx) => {
      const fresh = await this.locked(tx, who, code)
      const moved = await this.lifecycle.milestone(tx, fresh, body.kind, mover(who), {
        at: body.at === undefined ? undefined : new Date(body.at),
        note: body.note,
      })
      return { row: moved, read: fresh.read }
    })

    return OpportunityMilestoneResponse.parse(await this.answer(read, row, new Date()))
  }

  /** `POST /sales/opportunities/:code/stop` — the deal is lost, with a reason.
   *
   *  One transaction for everything the stop causes: the bell line, the lead
   *  sent where the stopper chose when this was its last live deal (owner,
   *  15/10/2026), the LEAD's run re-synced — the deal's own run code may be an
   *  older journey of the lead.
   *  The lead is locked BEFORE the deal — the order the lead hand-over takes.
   *  Stopping a held deal is allowed and ends its hold (ADR 0097 §3). The
   *  deal's future meetings (and the lead's, when the lead stops too) are
   *  cancelled in it; their Google events go after the commit. */
  async stop(
    who: Actor,
    code: ObjectCode,
    body: OpportunityStopBody,
  ): Promise<OpportunityStopResponse> {
    const leadCode = await this.deals.scopedLeadCode(who, code)
    if (leadCode === null) throw notFound('cơ hội', code)
    const at = new Date()
    const gone: MeetingRowDb[] = []

    const { row, read } = await this.deals.run(async (tx) => {
      /* A lead switched off meanwhile: `locked` re-reads the deal and 404s. */
      const [lead] = await this.deals.lockLeads(tx, [leadCode])
      const fresh = await this.locked(tx, who, code)
      /* The held time leaves the column clock first, so `days_in_from` excludes it. */
      const [ended] = await endHolds(tx, 'opportunity', [code], 'stopped', who.id)
      if (ended) fresh.row = { ...fresh.row, stageSince: await shiftDealClock(tx, code, ended) }
      const written = await this.lifecycle.stop(tx, fresh, mover(who), body, at)
      gone.push(...(await this.meetings.cancelFor(tx, who, [code], 'opportunity-lost')))
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
      /* "Last live" judged here, under both locks and after the stop's own write. */
      const last =
        lead?.state === 'converted' && (await this.deals.allLost(tx, written.leadCode))
          ? lead
          : undefined
      const moved =
        last !== undefined &&
        (await this.leadAfter(tx, who, written, last, fresh.owners, body.lead, gone))
      if (!moved) await syncLeadRuns(tx, [written.leadCode])
      return { row: written, read: fresh.read }
    })
    await this.meetings.forgetCancelled(gone)

    return OpportunityStopResponse.parse(await this.answer(read, row, at))
  }

  /** The stopper's answer to "where does the lead go" (owner, 15/10/2026),
   *  judged by `LeadAfterStopRule.options` as the profile offered it: the
   *  waiting group under one of its holders — handed over, and rung,
   *  when that is someone new — or the lead exit door's own write. The state
   *  writer re-syncs the run and withholds mail. `true` when the lead moved. */
  private async leadAfter(
    tx: Db,
    who: Actor,
    deal: OpportunityRead['row'],
    lead: LockedLead,
    owners: OpportunityRead['owners'],
    choice: LeadAfterStopChoice | undefined,
    gone: MeetingRowDb[],
  ): Promise<boolean> {
    if (!choice) throw conflict('Đây là cơ hội cuối của lead. Chọn lead này đi đâu.')
    const may = await this.leadRule.options(tx, who, lead.ownerId, owners)
    if (choice.to === 'stop') {
      if (!may.canStop) throw conflict('Bạn không được ngừng chăm sóc lead này.')
      const held = { ownerId: lead.ownerId, workstreamCode: lead.workstreamCode }
      const label = lead.company
      gone.push(
        ...(await this.leadExits.disqualify(tx, who, deal.leadCode, { ...held, label }, choice)),
      )
      return true
    }
    const to = may.holders.find((h) => h.id === choice.holderId)
    if (!to) throw conflict('Người này không nhận được lead. Chọn người khác.')
    if (to.id !== lead.ownerId) await this.leadStates.handOver(tx, lead, to, who)
    return this.leadStates.dealsLost(tx, deal.leadCode, mover(who), NOTE.lastLost.nurturing)
  }

  /** The deal under `FOR UPDATE`, read back through the same handle — scope
   *  included, so an owners edit that landed while this waited is judged too:
   *  missing, switched-off lead and out of scope are ONE 404 (see
   *  `OpportunityService.profile`). `pendingSign` is the fact a move must never
   *  race with the sign door's own apply step. `read` is the whole row for the answer. */
  async locked(
    tx: Db,
    who: Actor,
    code: ObjectCode,
  ): Promise<
    DealAt & { ownerIds: string[]; owners: OpportunityRead['owners']; read: OpportunityRead }
  > {
    const read = await this.deals.lockedByCode(who, code, tx)
    if (!read || !read.inScope) throw notFound('cơ hội', code)
    return {
      ...dealAtOf(read, read.pendingSign),
      ownerIds: read.owners.map((o) => o.id),
      owners: read.owners,
      read,
    }
  }

  /** The book row, built from the row the move returned plus the labels the read
   *  under the lock carried. */
  private answer(found: OpportunityRead, row: OpportunityRead['row'], at: Date) {
    return this.facts.row({
      ...found,
      row,
      daysInStage: daysInStageOf(row, at),
    })
  }
}

const mover = (who: Actor) => ({ id: who.id, name: who.name })

type LockedLead = Awaited<ReturnType<OpportunityRepository['lockLeads']>>[number]
