import { Inject, Injectable } from '@nestjs/common'
import { CONTRACT_TERMINATED, type AccessControl, type Actor } from '@pv/engines'
import {
  ContractPenaltyResponse,
  ContractTerminateResponse,
  ContractTerminationReasons,
  NOTIFICATION_DETAIL_CONTRACT,
  OPPORTUNITY_STOP_REASON_OTHER,
  type ContractCode,
  type ContractPenaltyBody,
  type ContractPenaltyInput,
  type ContractTerminateBody,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { LEAD_PARK_REASON, LeadStateWriter } from '../lead/lead-state'
import { LEAD_NOTE } from '../lead/lead-write.mapper'
import { MeetingCancel } from '../meeting/meeting-cancel'
import type { MeetingRowDb } from '../meeting/meeting.schema'
import { vnDay } from '../opportunity/opportunity-lifecycle'
import { syncLeadRuns } from '../workstream/workstream-sync'
import { toDetail } from './contract.mapper'
import { ContractRepository } from './contract.repository'
import { ContractScheduleRepository } from './contract-schedule.repository'
import {
  ContractTerminationRepository,
  type PenaltyValues,
} from './contract-termination.repository'
import { assertMayWriteContract, mayEditPenalty, mayWriteContract } from './contract-writer'

/** Ending a signed contract (ADR 0107): a direct door, final, one row. Also the
 *  one guard every other contract write calls, so "terminated means frozen"
 *  is said once. Lock order: lead (the deal stop's), deal (every deal door's),
 *  then contract. A lead left with nothing live parks itself (ADR 0109).
 *  The penalty door (ADR 0124) is the one write that skips `assertLive`: it
 *  only ever writes a terminated contract, and only the penalty columns. */
@Injectable()
export class ContractTerminationService {
  constructor(
    private readonly contracts: ContractRepository,
    private readonly schedule: ContractScheduleRepository,
    private readonly repo: ContractTerminationRepository,
    private readonly audit: AuditRepository,
    private readonly hub: NotificationHub,
    private readonly leadStates: LeadStateWriter,
    private readonly meetings: MeetingCancel,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  /** `OpportunityStopReasons`'s shape, so one picker reads both lists. */
  async reasons(): Promise<ContractTerminationReasons> {
    const rows = await this.repo.reasons()
    return ContractTerminationReasons.parse({
      rows: rows.map((r) => ({ ...r, stage: null, doNotContact: false })),
    })
  }

  /** Call under the contract's row lock: a write queued behind a termination
   *  then reads the committed row and refuses. */
  async assertLive(tx: Db, code: string): Promise<void> {
    if (await this.isTerminated(tx, code)) {
      throw conflict('Hợp đồng này đã chấm dứt nên không sửa được.')
    }
  }

  isTerminated(handle: Db, code: string): Promise<boolean> {
    return this.repo.isTerminated(handle, code)
  }

  async terminate(
    who: Actor,
    code: ContractCode,
    body: ContractTerminateBody,
  ): Promise<ContractTerminateResponse> {
    assertSettledOn(body.penalty ?? null)
    const leadCode = await this.repo.leadOf(code)
    if (leadCode === null || !(await this.contracts.inScope(who, code))) {
      throw notFound('hợp đồng', code)
    }

    const gone = await this.schedule.run(async (tx) => {
      if (!(await this.repo.lockLead(tx, leadCode))) throw notFound('hợp đồng', code)
      await this.repo.lockDeal(tx, code)
      const row = await this.schedule.lock(tx, code)
      if (!row) throw notFound('hợp đồng', code)
      assertMayWriteContract(who, row.ownerId)
      if (await this.isTerminated(tx, code)) throw conflict('Hợp đồng này đã chấm dứt.')
      await this.assertReason(tx, body.reasonKey)
      assertPriced(row.currency, body.penalty ?? null)

      const collected = await this.repo.collected(tx, code)
      if (body.refundedAmount > collected) {
        throw conflict('Số tiền hoàn lại không được lớn hơn số đã thu.', {
          refundedAmount: ['Số tiền hoàn lại không được lớn hơn số đã thu.'],
        })
      }

      await this.repo.insert(tx, {
        contractCode: code,
        reasonKey: body.reasonKey,
        note: body.note ?? null,
        collectedAmount: collected,
        refundedAmount: body.refundedAmount,
        terminatedAt: new Date(),
        terminatedById: who.id,
        ...penaltyValues(who, body.penalty ?? null, null),
      })
      const note = `contract terminated (${body.reasonKey}), refunded ${body.refundedAmount} of ${collected}, ${penaltyNote(body.penalty ?? null)}`
      await this.audit.write({ actorId: who.id, action: 'edit', code, note }, tx)
      await this.ring(tx, who, code)
      if (await this.repo.leadParks(tx, leadCode)) return this.parkLead(tx, who, leadCode)
      /* The lead's run was closed WON on this contract; it re-derives without it. */
      await syncLeadRuns(tx, [leadCode])
      return []
    })
    await this.meetings.forgetCancelled(gone)
    return ContractTerminateResponse.parse(await this.reread(who, code))
  }

  /** ADR 0124: set, change, settle or clear (`null`) the penalty of a
   *  terminated contract. The contract lock alone is enough: it is the tail of
   *  `terminate`'s lock order, and this door writes only the penalty columns. */
  async setPenalty(
    who: Actor,
    code: ContractCode,
    body: ContractPenaltyBody,
  ): Promise<ContractPenaltyResponse> {
    assertSettledOn(body.penalty)
    if (!(await this.contracts.inScope(who, code))) throw notFound('hợp đồng', code)

    await this.schedule.run(async (tx) => {
      const row = await this.schedule.lock(tx, code)
      if (!row) throw notFound('hợp đồng', code)
      assertMayWriteContract(who, row.ownerId)
      const before = await this.repo.penaltyOf(tx, code)
      if (!before) throw conflict('Hợp đồng chưa chấm dứt nên chưa ghi được tiền phạt.')
      assertPriced(row.currency, body.penalty)
      await this.repo.setPenalty(tx, code, penaltyValues(who, body.penalty, before))
      /* The columns are overwritten in place, so the audit row is the only memory of the old value. */
      const note = `contract penalty changed: ${storedNote(before)} -> ${penaltyNote(body.penalty)}`
      await this.audit.write({ actorId: who.id, action: 'edit', code, note }, tx)
    })
    return ContractPenaltyResponse.parse(await this.reread(who, code))
  }

  /** The detail both doors answer with; a terminated paper collects nothing. */
  private async reread(who: Actor, code: string) {
    const found = await this.contracts.byCode(who, code)
    if (!found) throw notFound('hợp đồng', code)
    return {
      ...toDetail(found),
      canEdit: mayWriteContract(who, found.row.ownerId),
      canCollect: false,
      canChangeCollector: false,
      canEditPenalty: mayEditPenalty(this.access, who, found.row.ownerId, true),
    }
  }

  /** The machine's park: no lead door, permission or scope, and EX-09 is
   *  written even when switched off in config. The writer re-syncs the run. */
  private async parkLead(tx: Db, who: Actor, leadCode: string): Promise<MeetingRowDb[]> {
    const reasonId = LEAD_PARK_REASON.contractTerminated
    const note = LEAD_NOTE.nurtured(reasonId, undefined)
    await this.leadStates.parked(tx, leadCode, { by: null, reasonId, note, actorId: who.id })
    return this.meetings.cancelFor(tx, who, [leadCode], 'lead-nurtured')
  }

  /** `other` is virtual (no catalogue row); the body already demanded its note. */
  private async assertReason(tx: Db, reasonKey: string): Promise<void> {
    if (reasonKey === OPPORTUNITY_STOP_REASON_OTHER) return
    if (!(await this.repo.reasonLive(tx, reasonKey))) {
      throw conflict('Không tìm thấy lý do này. Chọn lại.')
    }
  }

  /** The sign line's three audiences (`announceSigned`), keyed on the contract.
   *  The owners are the signing-day lanes the schedule bells already reach. */
  private async ring(tx: Db, who: Actor, code: string): Promise<void> {
    const heard = await this.hub.bellRead(tx, `audience of ${code}`, null, (savepoint) =>
      this.schedule.bellAudience(savepoint, code),
    )
    await this.hub.announce(tx, {
      event: {
        name: CONTRACT_TERMINATED,
        ref: { code },
        actorId: who.id,
        audiences: {
          director: await this.hub.sharedInRoles(tx, ['director'], 'Sales'),
          owners: heard?.participants ?? [],
          /* The collector rides the closer's line: whoever chases the money must hear it stopped. */
          'commission-owner': [
            ...new Set([heard?.ownerId, heard?.collectorId].filter((id): id is string => !!id)),
          ],
        },
      },
      subject: { kind: 'contract', code, label: heard?.label ?? code },
      detail: { [NOTIFICATION_DETAIL_CONTRACT]: code },
    })
  }
}

/** The settled day is the day money moved, so like `markPaid` it may be back-dated, never ahead of today (VN). */
function assertSettledOn(penalty: ContractPenaltyInput | null): void {
  if (penalty?.settledOn && penalty.settledOn > vnDay(new Date())) {
    throw invalid({ 'penalty.settledOn': ['Ngày không được sau hôm nay.'] })
  }
}

/** A contract with no currency converts to NULL VND, and the summary's sums
 *  would drop its penalty without a word, so it takes none. */
function assertPriced(currency: string | null, penalty: ContractPenaltyInput | null): void {
  if (penalty && currency === null) {
    throw conflict('Hợp đồng chưa có giá trị nên chưa ghi được tiền phạt.')
  }
}

/** The four columns for `penalty`. The recorder of an unchanged settled day
 *  stays; a new day is recorded by whoever wrote it. */
function penaltyValues(
  who: Actor,
  penalty: ContractPenaltyInput | null,
  before: PenaltyValues | null,
): PenaltyValues {
  const settledOn = penalty?.settledOn ?? null
  const kept = settledOn !== null && before?.penaltySettledOn === settledOn
  return {
    penaltyDirection: penalty?.direction ?? null,
    penaltyAmount: penalty?.amount ?? null,
    penaltySettledOn: settledOn,
    penaltySettledById:
      settledOn === null ? null : kept ? (before?.penaltySettledById ?? who.id) : who.id,
  }
}

const penaltyNote = (penalty: ContractPenaltyInput | null): string =>
  penalty
    ? `penalty ${penalty.direction} ${penalty.amount}, ${penalty.settledOn ? `settled ${penalty.settledOn}` : 'pending'}`
    : 'no penalty'

const storedNote = (v: PenaltyValues): string =>
  v.penaltyDirection && v.penaltyAmount
    ? penaltyNote({
        direction: v.penaltyDirection,
        amount: v.penaltyAmount,
        settledOn: v.penaltySettledOn ?? null,
      })
    : 'no penalty'
