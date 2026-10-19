import { Injectable } from '@nestjs/common'
import { OVERDUE_REASON_DECIDED, OVERDUE_REASON_SENT, dueLevelOf, type Actor } from '@pv/engines'
import {
  NOTIFICATION_DETAIL_NO,
  OverdueReasonListResponse,
  OverdueReasonRow,
  OverdueReasonWaitingResponse,
  type ContractCode,
  type OverdueReasonBody,
  type OverdueReasonCurrent,
  type OverdueReasonDecideBody,
  type OverdueReasonWaitingQuery,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { conflict, denied, notFound, type PvError } from '@api/platform/http/problem'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { ContractOverdueReasonRepository } from './contract-overdue-reason.repository'
import { ContractRepository } from './contract.repository'
import { ContractScheduleRepository } from './contract-schedule.repository'

/** Bell `detail` keys of `overdue-reason-decided`, read by the web's line. */
const DETAIL_DECISION = 'decision'
const DETAIL_NOTE = 'note'

const VN_OFFSET_MS = 7 * 60 * 60_000
const DAY_MS = 24 * 60 * 60_000

/** The sweeper's overdue rule, read on Vietnam calendar days: `dueLevelOf`
 *  cuts at the UTC date, so both sides are shifted +7h first. This is the day
 *  the KPI reading counts by, so the door and the figure cannot disagree. */
function isOverdue(due: Date, paidAt: Date | null, now: Date = new Date()): boolean {
  const vn = (at: Date) => new Date(at.getTime() + VN_OFFSET_MS).toISOString()
  const level = dueLevelOf(vn(due), vn(now), paidAt ? vn(paidAt) : undefined)
  return level === 'overdue' || level === 'long-overdue'
}

/** `reasons` is newest first. A reason explains the due it was written for. */
function currentOf(reasons: readonly OverdueReasonRow[]): OverdueReasonCurrent {
  const [newest] = reasons
  if (!newest) return 'none'
  return newest.stale ? 'stale' : newest.state
}

/** What stops `who` writing on this installment, in the order the door checks
 *  it. One copy: `write` throws it and `read` shows `canWrite = no refusal`. */
function refusalOf(
  who: Actor,
  ownerId: string | null,
  installment: { due: Date; paidAt: Date | null },
  reasons: readonly OverdueReasonRow[],
): PvError | null {
  if (ownerId !== who.id) {
    return denied('permission-denied', 'Chỉ người phụ trách hợp đồng mới ghi được lý do.')
  }
  if (!isOverdue(installment.due, installment.paidAt)) {
    return conflict('Đợt này chưa quá hạn nên chưa cần lý do.')
  }
  const present = reasons.filter((r) => !r.stale)
  if (present.some((r) => r.state === 'waiting')) {
    return conflict('Đã có lý do đang chờ duyệt cho đợt này.')
  }
  if (present.some((r) => r.state === 'approved')) {
    return conflict('Lý do của đợt này đã được duyệt.')
  }
  return null
}

/** First instant of the month after `period` (`2026-10`), Vietnam time. */
function monthEnd(period: string): Date {
  const [year, month] = period.split('-').map(Number)
  return new Date(Date.UTC(year ?? 0, month ?? 0, 1) - VN_OFFSET_MS)
}

/** Why an overdue installment is overdue, and the head's yes or no (ADR 0100).
 *  Each write is one transaction with its audit line and its bell. */
@Injectable()
export class ContractOverdueReasonService {
  constructor(
    private readonly contracts: ContractRepository,
    private readonly schedule: ContractScheduleRepository,
    private readonly repo: ContractOverdueReasonRepository,
    private readonly audit: AuditRepository,
    private readonly hub: NotificationHub,
  ) {}

  async list(who: Actor, code: ContractCode, no: number): Promise<OverdueReasonListResponse> {
    await this.fence(who, code)
    const handle = this.schedule.readonlyHandle
    const owner = await this.repo.ownerOf(handle, code)
    return this.read(handle, who, code, no, owner?.ownerId ?? null)
  }

  /** The contract's owner only: the desk may see the reason, not speak for the Sale. */
  write(
    who: Actor,
    code: ContractCode,
    no: number,
    body: OverdueReasonBody,
  ): Promise<OverdueReasonListResponse> {
    return this.fence(who, code).then(() =>
      this.schedule.run(async (tx) => {
        const row = await this.schedule.lock(tx, code)
        if (!row) throw notFound('hợp đồng', code)
        const installment = (await this.schedule.installments(tx, code)).find((i) => i.no === no)
        if (!installment) throw notFound('đợt thanh toán', String(no))
        const before = await this.repo.ofInstallment(tx, code, no)
        const refusal = refusalOf(who, row.ownerId, installment, before)
        if (refusal) throw refusal

        const id = await this.repo.insert(tx, {
          contractCode: code,
          installmentNo: no,
          due: installment.due,
          reason: body.reason,
          writtenById: who.id,
        })
        await this.audit.write(
          {
            actorId: who.id,
            action: 'edit',
            code,
            note: `installment ${no} overdue reason ${id} written`,
          },
          tx,
        )
        /* The writer is left out here as well as by E4: a holder may be the owner. */
        const holders = await this.hub.holding(tx, 'contract.approve-overdue-reason', 'Sales')
        await this.hub.announce(tx, {
          event: {
            name: OVERDUE_REASON_SENT,
            ref: { code },
            actorId: who.id,
            occurrence: `${no}/${id}`,
            audiences: { approvers: holders.filter((h) => h !== who.id) },
          },
          subject: { kind: 'contract', code, label: await this.repo.labelOf(tx, code) },
          detail: { [NOTIFICATION_DETAIL_NO]: no },
        })
        return this.read(tx, who, code, no, row.ownerId)
      }),
    )
  }

  /** 409 on the writer: the database CHECK says the same, but as a 500. */
  decide(who: Actor, id: number, body: OverdueReasonDecideBody): Promise<OverdueReasonRow> {
    return this.schedule.run(async (tx) => {
      const found = await this.repo.lockById(tx, id)
      if (!found) throw notFound('lý do quá hạn', String(id))
      if (found.state !== 'waiting') throw conflict('Lý do này đã được xử lý.')
      if (found.writtenById === who.id) {
        throw conflict('Người ghi lý do không tự duyệt được lý do của mình.')
      }
      const installment = (await this.schedule.installments(tx, found.contractCode)).find(
        (i) => i.no === found.installmentNo,
      )
      if (!installment || installment.due.getTime() !== found.due.getTime()) {
        throw conflict('Hạn của đợt này đã đổi nên lý do không còn áp dụng.')
      }

      const approved = body.decision === 'approve'
      await this.repo.decide(tx, id, {
        state: approved ? 'approved' : 'rejected',
        decidedById: who.id,
        decisionNote: body.note ?? null,
      })
      await this.audit.write(
        {
          actorId: who.id,
          action: 'approve',
          code: found.contractCode,
          note: `installment ${found.installmentNo} overdue reason ${id} ${approved ? 'approved' : 'rejected'}`,
        },
        tx,
      )
      await this.hub.announce(tx, {
        event: {
          name: OVERDUE_REASON_DECIDED,
          ref: { code: found.contractCode },
          actorId: who.id,
          occurrence: `${found.installmentNo}/${id}`,
          audiences: { writer: [found.writtenById] },
        },
        subject: {
          kind: 'contract',
          code: found.contractCode,
          label: await this.repo.labelOf(tx, found.contractCode),
        },
        detail: {
          [NOTIFICATION_DETAIL_NO]: found.installmentNo,
          [DETAIL_DECISION]: approved ? 'approved' : 'rejected',
          ...(body.note ? { [DETAIL_NOTE]: body.note } : {}),
        },
      })
      const done = await this.repo.byId(tx, id)
      return OverdueReasonRow.parse(done)
    })
  }

  async waiting(q: OverdueReasonWaitingQuery): Promise<OverdueReasonWaitingResponse> {
    const dayEnd = monthEnd(q.period)
    const lastDayStart = new Date(dayEnd.getTime() - DAY_MS)
    const reasons = await this.repo.waitingAsOf(this.schedule.readonlyHandle, lastDayStart, dayEnd)
    return OverdueReasonWaitingResponse.parse({ period: q.period, reasons })
  }

  /** Out of scope answers the same 404 as the contract read. */
  private async fence(who: Actor, code: ContractCode): Promise<void> {
    if (!(await this.contracts.inScope(who, code))) throw notFound('hợp đồng', code)
  }

  private async read(
    tx: Db,
    who: Actor,
    code: string,
    no: number,
    ownerId: string | null,
  ): Promise<OverdueReasonListResponse> {
    const installment = (await this.schedule.installments(tx, code)).find((i) => i.no === no)
    if (!installment) throw notFound('đợt thanh toán', String(no))
    const reasons = await this.repo.ofInstallment(tx, code, no)
    return OverdueReasonListResponse.parse({
      current: currentOf(reasons),
      canWrite: refusalOf(who, ownerId, installment, reasons) === null,
      reasons,
    })
  }
}
