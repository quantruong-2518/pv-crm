import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  CONDITION_DONE,
  INSTALLMENT_PAID,
  INSTALLMENT_UNDONE,
  SCHEDULE_REPLACED,
  type AccessControl,
  type Actor,
} from '@pv/engines'
import {
  CONTRACT_INSTALLMENTS_MAX,
  ContractScheduleResponse,
  NOTIFICATION_DETAIL_NO,
  type ContractCode,
  type ContractInstallmentsBody,
  type InstallmentConditionBody,
  type InstallmentPaidBody,
  type InstallmentRecordBody,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, invalid, notFound } from '@api/platform/http/problem'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { vnDay } from '../opportunity/opportunity-lifecycle'
import { toDetail } from './contract.mapper'
import { ContractRepository } from './contract.repository'
import type { ContractInstallmentRowDb, ContractRowDb } from './contract.schema'
import { ContractScheduleRepository } from './contract-schedule.repository'

/** What a door did: the audit note, and the bell it rings, if any. `occurrence`
 *  keeps two acts of one kind on one contract apart in the bell's ledger. */
type Done = {
  note: string
  bell?: { name: string; occurrence: string; no?: number }
}

/** The write doors of a signed contract's schedule (ADR 0090). Every door takes
 *  the scope fence first, then the contract's row lock, and answers the
 *  contract re-read; the audit line commits with the row that caused it. */
@Injectable()
export class ContractScheduleService {
  private readonly log = new Logger('contract')

  constructor(
    private readonly contracts: ContractRepository,
    private readonly schedule: ContractScheduleRepository,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
    private readonly hub: NotificationHub,
  ) {}

  /** The UNPAID instalments become exactly the body's list; paid ones stay. A
   *  line naming a `no` edits that instalment in place, so its conditions,
   *  reminders and labelled files stay with it; a line without one is numbered
   *  after the last `no`; an unpaid instalment the list omits is deleted. */
  replace(who: Actor, code: ContractCode, body: ContractInstallmentsBody) {
    return this.write(who, code, async (tx, row) => {
      if (row.amount === null) {
        throw conflict('Hợp đồng chưa có giá trị nên chưa lập được lịch thanh toán.')
      }
      const edits = body.installments
      const all = await this.schedule.installments(tx, code)
      const paid = all.filter((i) => i.paidAt !== null)
      const unpaid = all.filter((i) => i.paidAt === null).map((i) => i.no)

      const named = edits.flatMap((e) => (e.no === undefined ? [] : [e.no]))
      if (new Set(named).size !== named.length) {
        throw invalid({ installments: ['Một đợt bị ghi hai lần trong danh sách.'] })
      }
      for (const no of named) {
        if (paid.some((i) => i.no === no)) throw conflict(`Đợt ${no} đã thu, không sửa được.`)
        if (!unpaid.includes(no)) throw notFound('đợt thanh toán', String(no))
      }

      if (paid.length + edits.length > CONTRACT_INSTALLMENTS_MAX) {
        throw conflict(`Tối đa ${CONTRACT_INSTALLMENTS_MAX} đợt, tính cả đợt đã thu.`)
      }
      /* An empty schedule is allowed: it is how a schedule typed by mistake
         goes away. Anything else must account for the whole paper. */
      if (paid.length + edits.length > 0) {
        const sum = (key: 'share' | 'amount') =>
          [...paid, ...edits].reduce((total, i) => total + i[key], 0)
        if (sum('share') !== 100) {
          throw conflict('Tổng tỉ lệ các đợt, tính cả đợt đã thu, phải bằng 100%.')
        }
        if (sum('amount') !== row.amount) {
          throw conflict('Tổng tiền các đợt, tính cả đợt đã thu, phải bằng giá trị hợp đồng.')
        }
      }

      let last = Math.max(0, ...all.map((i) => i.no))
      const lines = edits.map((e) => ({ ...e, no: e.no ?? ++last }))
      await this.schedule.replaceUnpaid(tx, code, unpaid, lines)
      const dropped = unpaid.length - named.length
      return {
        note: `schedule replaced: ${named.length} kept, ${edits.length - named.length} added, ${dropped} deleted, ${paid.length} paid untouched`,
        bell: { name: SCHEDULE_REPLACED, occurrence: String(Date.now()) },
      }
    })
  }

  markPaid(who: Actor, code: ContractCode, no: number, body: InstallmentPaidBody) {
    return this.write(who, code, async (tx, row) => {
      const installment = await this.installmentOf(tx, code, no)
      if (installment.paidAt) throw conflict('Đợt này đã ghi thu.')

      const now = new Date()
      const at = new Date(body.paidAt)
      if (Number.isNaN(at.getTime())) {
        throw invalid({ paidAt: ['Thời điểm không đúng định dạng.'] })
      }
      const day = vnDay(at)
      if (day < vnDay(row.signedAt)) {
        throw invalid({ paidAt: ['Ngày thu không được trước ngày ký hợp đồng.'] })
      }
      if (day > vnDay(now)) throw invalid({ paidAt: ['Ngày thu không được sau hôm nay.'] })

      /* The day is what the screen picks, so a later hour on today is clamped to now. */
      const landed = at > now ? now : at
      const written = await this.schedule.markPaid(tx, code, no, {
        at: landed,
        by: who.id,
        recordedAt: now,
      })
      if (!written) throw conflict('Đợt này vừa được ghi thu. Tải lại trang.')
      return {
        note: `installment ${no} marked paid (${vnDay(landed)})`,
        bell: { name: INSTALLMENT_PAID, occurrence: `${no}@${now.getTime()}`, no },
      }
    })
  }

  undoPaid(who: Actor, code: ContractCode, no: number) {
    return this.write(who, code, async (tx) => {
      const installment = await this.installmentOf(tx, code, no)
      if (!installment.paidAt) throw conflict('Đợt này chưa ghi thu.')
      if (!installment.paidById) {
        throw conflict('Đợt này đã thu từ trước khi có nhật ký ghi thu, chưa hoàn tác ở đây được.')
      }
      if (installment.paidById !== who.id) {
        throw denied('permission-denied', 'Chỉ người đã ghi thu mới hoàn tác được.')
      }
      if (!(await this.schedule.undoPaid(tx, code, no, who.id))) {
        throw conflict('Đợt này vừa thay đổi. Tải lại trang.')
      }
      return {
        note: `installment ${no} payment undone`,
        bell: { name: INSTALLMENT_UNDONE, occurrence: `${no}@${Date.now()}`, no },
      }
    })
  }

  /** Either permission opens this door, and `@Need` names one — the controller
   *  asks the floor both share, this is the real gate. */
  addRecord(who: Actor, code: ContractCode, no: number, body: InstallmentRecordBody) {
    if (
      !this.access.allows(who, 'contract.edit') &&
      !this.access.allows(who, 'contract.record-payment')
    ) {
      throw denied('permission-denied', 'Bạn không có quyền ghi lần nhắc.')
    }
    return this.write(who, code, async (tx) => {
      await this.installmentOf(tx, code, no)
      const at = body.at ? new Date(body.at) : new Date()
      await this.schedule.addRecord(tx, code, no, {
        at,
        channel: body.channel,
        what: body.what,
        detail: body.detail,
      })
      return { note: `installment ${no} reminder recorded (${body.channel})` }
    })
  }

  addCondition(who: Actor, code: ContractCode, no: number, body: InstallmentConditionBody) {
    return this.write(who, code, async (tx) => {
      await this.installmentOf(tx, code, no)
      await this.schedule.addCondition(tx, code, no, { ...body, due: new Date(body.due) })
      return { note: `installment ${no} condition added (${body.side})` }
    })
  }

  doneCondition(who: Actor, code: ContractCode, no: number, id: string) {
    return this.write(who, code, async (tx) => {
      const condition = await this.schedule.conditionOf(tx, code, no, id)
      if (!condition) throw notFound('điều kiện', id)
      if (condition.doneAt) throw conflict('Điều kiện này đã xong.')
      await this.schedule.markConditionDone(tx, id, new Date())
      return {
        note: `installment ${no} condition ${id} done`,
        bell: { name: CONDITION_DONE, occurrence: id, no },
      }
    })
  }

  /** Scope fence, then one transaction: lock the contract, run the change, write
   *  the audit line and ring the bell it returns. Out of scope answers the same
   *  404 as the read. */
  private async write(
    who: Actor,
    code: ContractCode,
    work: (tx: Db, contract: ContractRowDb) => Promise<Done>,
  ): Promise<ContractScheduleResponse> {
    if (!(await this.contracts.inScope(who, code))) throw notFound('hợp đồng', code)

    await this.schedule.run(async (tx) => {
      const row = await this.schedule.lock(tx, code)
      if (!row) throw notFound('hợp đồng', code)
      const { note, bell } = await work(tx, row)
      await this.audit.write({ actorId: who.id, action: 'edit', code, note }, tx)
      if (bell) await this.ring(tx, who, code, bell)
    })

    const found = await this.contracts.byCode(who, code)
    if (!found) throw notFound('hợp đồng', code)
    return ContractScheduleResponse.parse(toDetail(found))
  }

  /** The actor is passed so E4 skips them: nobody is told about their own act.
   *  The audience read sits under a savepoint, like `NotificationHub.holding`:
   *  a failed bell must never roll back the payment it describes. */
  private async ring(tx: Db, who: Actor, code: string, bell: NonNullable<Done['bell']>) {
    const heard = await tx
      .transaction((savepoint) => this.schedule.bellAudience(savepoint, code))
      .catch((error: unknown) => {
        this.log.error(`Audience for ${bell.name} on ${code} was not read: ${String(error)}`)
        return null
      })
    if (!heard) return
    await this.hub.announce(tx, {
      event: {
        name: bell.name,
        ref: { code },
        actorId: who.id,
        audiences: {
          owner: heard.ownerId ? [heard.ownerId] : [],
          participants: heard.participants,
        },
        occurrence: bell.occurrence,
      },
      subject: { kind: 'contract', code, label: heard.label },
      detail: bell.no === undefined ? null : { [NOTIFICATION_DETAIL_NO]: bell.no },
    })
  }

  private async installmentOf(tx: Db, code: string, no: number): Promise<ContractInstallmentRowDb> {
    const found = (await this.schedule.installments(tx, code)).find((i) => i.no === no)
    if (!found) throw notFound('đợt thanh toán', String(no))
    return found
  }
}
