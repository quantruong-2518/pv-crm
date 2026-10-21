import { Injectable } from '@nestjs/common'
import { CONTRACT_TERMINATED, type Actor } from '@pv/engines'
import {
  ContractTerminateResponse,
  ContractTerminationReasons,
  NOTIFICATION_DETAIL_CONTRACT,
  OPPORTUNITY_STOP_REASON_OTHER,
  type ContractCode,
  type ContractTerminateBody,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { conflict, notFound } from '@api/platform/http/problem'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { syncLeadRuns } from '../workstream/workstream-sync'
import { toDetail } from './contract.mapper'
import { ContractRepository } from './contract.repository'
import { ContractScheduleRepository } from './contract-schedule.repository'
import { ContractTerminationRepository } from './contract-termination.repository'

/** Ending a signed contract (ADR 0107): a direct door, final, one row. Also the
 *  one guard every other contract write calls, so "terminated means frozen"
 *  is said once. Lock order: lead (the deal stop's), deal (every deal door's),
 *  then contract. */
@Injectable()
export class ContractTerminationService {
  constructor(
    private readonly contracts: ContractRepository,
    private readonly schedule: ContractScheduleRepository,
    private readonly repo: ContractTerminationRepository,
    private readonly audit: AuditRepository,
    private readonly hub: NotificationHub,
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
    const leadCode = await this.repo.leadOf(code)
    if (leadCode === null || !(await this.contracts.inScope(who, code))) {
      throw notFound('hợp đồng', code)
    }

    await this.schedule.run(async (tx) => {
      if (!(await this.repo.lockLead(tx, leadCode))) throw notFound('hợp đồng', code)
      await this.repo.lockDeal(tx, code)
      const row = await this.schedule.lock(tx, code)
      if (!row) throw notFound('hợp đồng', code)
      if (await this.isTerminated(tx, code)) throw conflict('Hợp đồng này đã chấm dứt.')
      await this.assertReason(tx, body.reasonKey)

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
      })
      const note = `contract terminated (${body.reasonKey}), refunded ${body.refundedAmount} of ${collected}`
      await this.audit.write({ actorId: who.id, action: 'edit', code, note }, tx)
      /* The lead's run was closed WON on this contract; it re-derives without it. */
      await syncLeadRuns(tx, [leadCode])
      await this.ring(tx, who, code)
    })

    const found = await this.contracts.byCode(who, code)
    if (!found) throw notFound('hợp đồng', code)
    return ContractTerminateResponse.parse(toDetail(found))
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
          'commission-owner': heard?.ownerId ? [heard.ownerId] : [],
        },
      },
      subject: { kind: 'contract', code, label: heard?.label ?? code },
      detail: { [NOTIFICATION_DETAIL_CONTRACT]: code },
    })
  }
}
