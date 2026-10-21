import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  HoldListResponse,
  LEAD_STATE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  type HoldListQuery,
  type HoldPatchBody,
  type HoldSetBody,
  type HoldSubjectType,
  type LeadHoldEndBody,
  type LeadProfile,
  type LeadState,
  type ObjectCode,
  type OpportunityHoldEndBody,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, invalid, notFound } from '@api/platform/http/problem'
import { MailRunRepository } from '@api/platform/mail/mail-run.repository'
import { LeadExitService } from '../lead/lead-exit.service'
import { leadScope } from '../lead/lead-scope'
import { LeadService } from '../lead/lead.service'
import { MeetingCancel } from '../meeting/meeting-cancel'
import { dealScope } from '../opportunity/opportunity-book.sql'
import { dealAtOf, holdVerdict, vnDay } from '../opportunity/opportunity-lifecycle'
import { peopleOf } from '../opportunity/opportunity.mapper'
import { OpportunityRepository } from '../opportunity/opportunity.repository'
import { OpportunityService } from '../opportunity/opportunity.service'
import { syncLeadRuns } from '../workstream/workstream-sync'
import { toHoldRow } from './hold.mapper'
import { HoldRepository } from './hold.repository'
import { endHolds, shiftDealClock } from './hold.sql'

/** Holds (ADR 0097 §3): the set / change / end doors on a lead and on a
 *  deal, and the one shared list. Each door is scoped and locked exactly like
 *  its sibling — the lead's like the park door (`LeadExitService`), the
 *  deal's like the stop door — then answers with the subject's profile.
 *  At the date nothing moves: only these doors, a real exchange, a park, a
 *  stop or a new deal end a hold. */

/** States a lead may be held from: it has a holder and is still being cared
 *  for. The `nurturing` pool has no holder, so no hold (ADR 0109). */
const LEAD_HOLDABLE: readonly LeadState[] = ['assigned', 'verifying', 'working']

/** Why a held lead's unsent mail is held back (ADR 0068 §6's mechanism). */
const LEAD_HELD_WITHHOLD = {
  code: 'lead-held',
  summary: 'lead đang tạm hoãn: thư chưa gửi bị giữ lại',
} as const

/** The same for a held deal's letters. No deal door withheld mail before
 *  this; the reason code mirrors the lead's so the delivery row reads alike. */
const DEAL_HELD_WITHHOLD = {
  code: 'opportunity-held',
  summary: 'cơ hội đang tạm hoãn: thư chưa gửi bị giữ lại',
} as const

@Injectable()
export class HoldService {
  constructor(
    private readonly repo: HoldRepository,
    private readonly leadDoors: LeadExitService,
    private readonly leads: LeadService,
    private readonly deals: OpportunityRepository,
    private readonly opportunities: OpportunityService,
    private readonly mailRuns: MailRunRepository,
    private readonly meetings: MeetingCancel,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  /** `POST /sales/leads/:code/hold`. */
  async setLead(who: Actor, code: ObjectCode, body: HoldSetBody): Promise<LeadProfile> {
    await this.repo.run(async (tx) => {
      const found = await this.leadDoors.lockRow(tx, who, code)
      /* After the lock, so a missing or foreign lead still answers 404/403 first. */
      assertLater(body.until)
      if (!LEAD_HOLDABLE.includes(found.state)) {
        throw conflict(
          `Lead ${code} đang ở “${LEAD_STATE_LABEL[found.state]}” nên không tạm hoãn được.`,
        )
      }
      if (found.ownerId === null) {
        throw conflict(`Lead ${code} chưa có người phụ trách. Giao lead cho một người trước.`)
      }
      if (found.held) throw conflict(`Lead ${code} đang tạm hoãn rồi. Bấm Đổi ngày hẹn nếu cần.`)
      await this.repo.insert(tx, { ...setOf(body, who), type: 'lead', code })
      await this.mailRuns.withholdSubject(
        tx,
        { aggregateType: 'lead', aggregateId: code },
        LEAD_HELD_WITHHOLD,
      )
    })
    return this.leads.profile(who, code)
  }

  /** `PATCH /sales/leads/:code/hold`. */
  async patchLead(who: Actor, code: ObjectCode, body: HoldPatchBody): Promise<LeadProfile> {
    await this.repo.run(async (tx) => {
      await this.leadDoors.lockRow(tx, who, code)
      if (body.until !== undefined) assertLater(body.until)
      await this.patched(tx, 'lead', code, body)
    })
    return this.leads.profile(who, code)
  }

  /** `POST /sales/leads/:code/hold/end`. The "to waiting" end is the park
   *  door's own verdict and write, which ends the hold `to-waiting`, so it
   *  also needs the park door's permission (ADR 0109). */
  async endLead(who: Actor, code: ObjectCode, body: LeadHoldEndBody): Promise<LeadProfile> {
    if (body.to === 'waiting' && !this.access.allows(who, 'lead.disqualify')) {
      throw denied('permission-denied', 'Bạn không có quyền chuyển lead vào Nhóm chờ chăm sóc.')
    }
    const gone = await this.repo.run(async (tx) => {
      const found = await this.leadDoors.lockRow(tx, who, code)
      if (!found.held) throw notHeld('Lead', code)
      if (body.to === 'waiting') return this.leadDoors.park(tx, who, code, found, body)
      const [ended] = await endHolds(tx, 'lead', [code], 'resumed', who.id)
      if (ended) await this.repo.shiftLeadClock(tx, code, ended)
      await syncLeadRuns(tx, [code])
      return []
    })
    await this.meetings.forgetCancelled(gone)
    return this.leads.profile(who, code)
  }

  /** `POST /sales/opportunities/:code/hold`. */
  async setDeal(
    who: Actor,
    code: ObjectCode,
    body: HoldSetBody,
  ): Promise<OpportunityProfileResponse> {
    await this.dealInScope(who, code)
    assertLater(body.until)
    await this.repo.run(async (tx) => {
      const verdict = holdVerdict(await this.lockedDeal(tx, who, code))
      if (!verdict.ok) throw conflict(verdict.reason)
      await this.repo.insert(tx, { ...setOf(body, who), type: 'opportunity', code })
      await this.mailRuns.withholdSubject(
        tx,
        { aggregateType: 'opportunity', aggregateId: code },
        DEAL_HELD_WITHHOLD,
      )
    })
    return this.opportunities.profile(who, code)
  }

  /** `PATCH /sales/opportunities/:code/hold`. */
  async patchDeal(
    who: Actor,
    code: ObjectCode,
    body: HoldPatchBody,
  ): Promise<OpportunityProfileResponse> {
    await this.dealInScope(who, code)
    if (body.until !== undefined) assertLater(body.until)
    await this.repo.run(async (tx) => {
      await this.lockedDeal(tx, who, code)
      await this.patched(tx, 'opportunity', code, body)
    })
    return this.opportunities.profile(who, code)
  }

  /** `POST /sales/opportunities/:code/hold/end` — back to its column, the column
   *  clock moved on by the held time. Giving up is the stop door. */
  async endDeal(
    who: Actor,
    code: ObjectCode,
    _body: OpportunityHoldEndBody,
  ): Promise<OpportunityProfileResponse> {
    await this.dealInScope(who, code)
    await this.repo.run(async (tx) => {
      const deal = await this.lockedDeal(tx, who, code)
      if (!deal.held) throw notHeld('Cơ hội', code)
      const [ended] = await endHolds(tx, 'opportunity', [code], 'resumed', who.id)
      if (ended) await shiftDealClock(tx, code, ended)
    })
    return this.opportunities.profile(who, code)
  }

  /** `GET /sales/holds` — leads on the lead book's scope axis; deals only for a
   *  reader holding `opportunity.view`, on the deal book's axis. Nearest date first. */
  async list(who: Actor, q: HoldListQuery): Promise<HoldListResponse> {
    const today = vnDay(new Date())
    const wantsDeals = q.subject !== 'lead' && this.access.allows(who, 'opportunity.view')
    const [leadRows, dealRows] = await Promise.all([
      q.subject === 'opportunity' ? [] : this.repo.leadRows(leadScope(who, true)),
      wantsDeals ? this.repo.dealRows(dealScope(who, true)) : [],
    ])
    const owners = await this.deals.ownersOf(
      this.deals.readonlyHandle,
      dealRows.map((d) => d.code),
    )
    const rows = [
      ...leadRows.map((r) =>
        toHoldRow(r, today, {
          name: r.name,
          customer: r.customer,
          holder: r.holder,
          stepLabel: LEAD_STATE_LABEL[r.state],
        }),
      ),
      ...dealRows.map((r) =>
        toHoldRow(r, today, {
          name: r.name,
          customer: r.customer,
          holder: peopleOf(r, r.acceptorName, owners.get(r.code)).holder,
          stepLabel: r.stage ? OPPORTUNITY_STAGE_LABEL[r.stage] : r.code,
        }),
      ),
    ].sort((a, b) => a.until.localeCompare(b.until) || a.code.localeCompare(b.code))
    return HoldListResponse.parse({ rows })
  }

  private async patched(
    tx: Db,
    type: HoldSubjectType,
    code: ObjectCode,
    body: HoldPatchBody,
  ): Promise<void> {
    const done = await this.repo.patch(tx, type, code, { until: body.until, note: body.note })
    if (!done) throw notHeld(type === 'lead' ? 'Lead' : 'Cơ hội', code)
  }

  /** The stop door's two refusals (404 both, `OpportunityMoves.inScope`). */
  private async dealInScope(who: Actor, code: ObjectCode): Promise<void> {
    const found = await this.deals.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)
  }

  /** The deal under `FOR UPDATE`, re-read through the same handle with scope,
   *  as `OpportunityMoves.locked` does: the verdict judges what the write finds. */
  private async lockedDeal(tx: Db, who: Actor, code: ObjectCode) {
    const lock = await this.deals.lockDeal(tx, code)
    const fresh = lock ? await this.deals.byCode(who, code, tx) : null
    if (!lock || !fresh || !fresh.inScope) throw notFound('cơ hội', code)
    return dealAtOf(fresh, lock.pendingSign)
  }
}

/** "Later than today" on the server's Vietnam day, the day the app prints. */
function assertLater(until: string): void {
  if (until <= vnDay(new Date())) {
    throw invalid({ until: ['Ngày hẹn gặp lại phải sau hôm nay.'] })
  }
}

const setOf = (body: HoldSetBody, who: Actor) => ({
  until: body.until,
  note: body.note || null,
  by: who.id,
})

const notHeld = (kind: 'Lead' | 'Cơ hội', code: string) =>
  conflict(`${kind} ${code} không có tạm hoãn nào đang mở.`)
