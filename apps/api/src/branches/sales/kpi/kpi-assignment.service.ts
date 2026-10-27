import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  kpiMetricShare,
  type KpiAssignmentDraftBody,
  type KpiAssignmentMineResponse,
  type KpiAssignmentPageResponse,
  type KpiAssignmentSendResponse,
  type KpiMetricDef,
  type KpiPeriodKey,
  type RoleId,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import type { Db } from '@api/platform/db/db.module'
import { conflict, denied, invalid, notFound } from '@api/platform/http/problem'
import { KpiAssignmentBells } from './kpi-assignment-bells'
import { KpiAssignmentReader } from './kpi-assignment-read.service'
import { KpiAssignmentRepository } from './kpi-assignment.repository'
import {
  deadlineOf,
  draftOf,
  inForceOf,
  isCompany,
  linesOf,
  nodeOf,
  receivedOf,
  receiversOf,
  sumsOf,
  toValues,
  totalsIn,
  withCopied,
  type Book,
  type Line,
} from './kpi-assignment.mapper'
import { KpiCloseRepository } from './kpi-close.repository'
import { KpiConfigService } from './kpi-config.service'
import {
  assertTargetValues,
  assertTieredMonth,
  assignmentRefusal,
  stillOpen,
  vietnamToday,
} from './kpi-rules'
import { KpiSeatService } from './kpi-seat.service'
import { KpiTeamRepository } from './kpi-team.repository'

/** The three write doors of the tiered sets (ADR 0120 §2–§5), all on `kpi.view`:
 *  who sits on a unit's seat is the tree's fact, checked here (§7).
 *
 *  Each is one transaction under the roster lock: the tree is read inside it,
 *  then the row move, the audit line and the bell. Sending is final (Q1): a
 *  change is a draft of version + 1 beside the sent set, which stays in force
 *  until that draft is sent; refused once any unit below has sent (§5). */

const stale = () => conflict('Bộ chỉ tiêu vừa được người khác thay đổi. Tải lại rồi làm lại.')
const notSeat = () => denied('permission-denied', 'Bạn không phụ trách đơn vị này.')
const locked = () =>
  assignmentRefusal('resend-locked', 'Cấp dưới đã giao tiếp nên không sửa lại được bộ này.')

/** ADR 0120 §4: a sum short of what was received is bad input, a 400 like any other. */
const belowReceived = (keys: Line['metricKey'][]) =>
  Object.assign(
    invalid(
      { lines: ['Tổng giao xuống thấp hơn mức đã nhận.'] },
      'Tổng giao xuống thấp hơn mức đã nhận.',
    ),
    {
      extra: { code: 'assignment-below-received', metricKeys: keys },
    },
  )

@Injectable()
export class KpiAssignmentService {
  constructor(
    private readonly repo: KpiAssignmentRepository,
    private readonly reader: KpiAssignmentReader,
    private readonly teams: KpiTeamRepository,
    private readonly seats: KpiSeatService,
    private readonly config: KpiConfigService,
    private readonly closes: KpiCloseRepository,
    private readonly bells: KpiAssignmentBells,
    private readonly audit: AuditRepository,
  ) {}

  /** Replaces the draft whole; over a sent set it opens version + 1 (§5). */
  async draft(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    body: KpiAssignmentDraftBody,
  ): Promise<KpiAssignmentPageResponse> {
    const defs = await this.opening(period, role)
    assertTargetValues(defs, body.lines, 'lines')
    await this.repo.run(async (tx) => {
      const book = await this.seat(tx, who, period, body.unitId)
      const typed = this.typed(book, defs, role, body)
      let id = draftOf(book.sets, role, body.unitId)?.id ?? null
      if (!id) {
        const sent = inForceOf(book.sets, role, body.unitId)
        const to = receiversOf(book.tree, role, body.unitId)
        if (sent && to.units.some((u) => inForceOf(book.sets, role, u))) throw locked()
        id = await this.repo.insertSet(tx, {
          period,
          role,
          unitId: body.unitId,
          version: await this.repo.nextVersion(tx, period, role, body.unitId),
          status: 'draft',
          createdBy: who.id,
        })
        if (!id) throw stale()
      }
      await this.repo.replaceLines(tx, id, toValues(typed))
      await this.note(tx, who, {
        kpi: 'assignment-drafted',
        period,
        role,
        unit: body.unitId,
        lines: body.lines,
      })
    })
    return this.answer(who, period, role, body.unitId, defs)
  }

  /** The draft, or with none the copied lines alone, completed and sent (§3–§5). */
  async send(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    unitId: string,
  ): Promise<KpiAssignmentSendResponse> {
    const defs = await this.opening(period, role)
    const today = vietnamToday()
    const warnings = await this.repo.run(async (tx) => {
      const book = await this.seat(tx, who, period, unitId)
      const node = nodeOf(book.tree, unitId)!
      const company = isCompany(book.tree, unitId)
      if (node.parentId && !inForceOf(book.sets, role, node.parentId))
        throw assignmentRefusal('parent-not-sent', 'Cấp trên chưa giao chỉ tiêu cho đơn vị này.')
      const to = receiversOf(book.tree, role, unitId)
      const before = inForceOf(book.sets, role, unitId)
      if (before && to.units.some((u) => inForceOf(book.sets, role, u))) throw locked()
      const live = draftOf(book.sets, role, unitId)
      if (!live && before)
        throw assignmentRefusal('nothing-to-send', 'Bộ chỉ tiêu này đã gửi và chưa có gì thay đổi.')
      const typed = live ? linesOf(book, live.id) : []
      this.assertReceivers(typed, to)
      const received = receivedOf(book, role, unitId)
      const old = before ? linesOf(book, before.id) : null
      const lines = keepAnswers(withCopied(defs, company, received, typed, to), old)
      if (lines.length === 0)
        throw assignmentRefusal('nothing-to-send', 'Chưa có chỉ tiêu nào để giao.')
      const sums = sumsOf(defs, company ? totalsIn(lines) : received, lines)
      const below = sums.filter((s) => s.flag === 'below')
      if (below.length > 0) throw belowReceived(below.map((s) => s.metricKey))
      const sent = { status: 'sent' as const, sentBy: who.id, sentAt: new Date() }
      const version = live?.version ?? (await this.repo.nextVersion(tx, period, role, unitId))
      /* One `sent` row per slot: the old one steps down first, in this transaction. */
      if (before && !(await this.repo.moveSet(tx, before, { status: 'superseded' }))) throw stale()
      const id = live
        ? (await this.repo.moveSet(tx, live, sent)) && live.id
        : await this.repo.insertSet(tx, {
            period,
            role,
            unitId,
            version,
            ...sent,
            createdBy: who.id,
          })
      if (!id) throw stale()
      await this.repo.replaceLines(tx, id, toValues(lines))
      await this.note(tx, who, { kpi: 'assignment-sent', period, role, unit: unitId, version })
      await this.bells.received(
        tx,
        who.id,
        book,
        { period, role, unitId, version },
        lines,
        old,
        today,
      )
      return sums.filter((s) => s.flag === 'over')
    })
    return { ...(await this.answer(who, period, role, unitId, defs)), warnings }
  }

  /** "I have my targets": every unanswered line of the role, until the 28th.
   *  The line is the only ledger: the card reads its answer there (ADR 0120 §8). */
  async confirm(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
  ): Promise<KpiAssignmentMineResponse> {
    assertTieredMonth(period)
    stillOpen(period)
    if (!who.roleIds.map(toContractRole).includes(role))
      throw denied('permission-denied', 'Bạn không giữ vai này nên không có chỉ tiêu của vai.')
    if (vietnamToday() > deadlineOf(period, 'person'))
      throw assignmentRefusal(
        'confirm-past-deadline',
        'Đã quá hạn xác nhận, mức đã giao được áp dụng.',
      )
    await this.repo.run(async (tx) => {
      await this.teams.lockRoster(tx)
      const book = await this.reader.bookOf(period, tx)
      const held = book.sets.filter((s) => s.role === role && s.status === 'sent')
      const at = new Date()
      const n = await this.repo.confirm(
        tx,
        held.map((s) => s.id),
        who.id,
        at,
      )
      if (n === 0)
        throw assignmentRefusal('nothing-to-confirm', 'Bạn không có chỉ tiêu nào cần xác nhận.')
      await this.note(tx, who, { kpi: 'assignment-confirmed', period, role, lines: n })
    })
    return this.reader.mine(who, period, role)
  }

  /** The month rules every write shares, and the role's effective metrics. */
  private async opening(period: KpiPeriodKey, role: RoleId): Promise<readonly KpiMetricDef[]> {
    assertTieredMonth(period)
    stillOpen(period)
    return (await this.config.effectiveCatalog())[role]
  }

  /** Under the roster lock: the tree as it stands, and the caller on the unit's seat. */
  private async seat(tx: Db, who: Actor, period: KpiPeriodKey, unitId: string): Promise<Book> {
    await this.teams.lockRoster(tx)
    const book = await this.reader.bookOf(period, tx)
    if (!nodeOf(book.tree, unitId)) throw notFound('đơn vị')
    const acting = (await this.seats.unitSeats(book.tree, [unitId], undefined, tx)).get(unitId)
    if (!acting?.includes(who.id)) throw notSeat()
    return book
  }

  /** §4: only additive lines are typed, plus the company's own totals. */
  private typed(
    book: Book,
    defs: readonly KpiMetricDef[],
    role: RoleId,
    body: KpiAssignmentDraftBody,
  ): Line[] {
    const company = isCompany(book.tree, body.unitId)
    const share = new Map(defs.map((d) => [d.key, kpiMetricShare(d)]))
    const lines = body.lines.map((l): Line => ({
      metricKey: l.metricKey,
      kind: l.kind,
      childUnitId: l.kind === 'unit' ? l.childUnitId : null,
      personId: l.kind === 'person' ? l.personId : null,
      value: l.value,
      confirmedAt: null,
    }))
    const typable = (l: Line) =>
      l.kind === 'total' ? company : share.get(l.metricKey) === 'additive'
    const fixed = lines.filter((l) => !typable(l)).map((l) => l.metricKey)
    if (fixed.length > 0)
      throw assignmentRefusal('line-not-editable', 'Có chỉ tiêu không sửa được ở cấp này.', fixed)
    this.assertReceivers(lines, receiversOf(book.tree, role, body.unitId))
    return lines
  }

  /** A line naming a unit or person no longer under this unit: the tree moved. */
  private assertReceivers(lines: readonly Line[], to: ReturnType<typeof receiversOf>): void {
    const stray = lines.filter(
      (l) =>
        (l.childUnitId && !to.units.includes(l.childUnitId)) ||
        (l.personId && !to.people.includes(l.personId)),
    )
    if (stray.length > 0)
      throw assignmentRefusal(
        'unknown-child',
        'Có đơn vị hoặc người không còn thuộc đơn vị này. Tải lại rồi làm lại.',
        stray.map((l) => l.metricKey),
      )
  }

  private async answer(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    unitId: string,
    defs: readonly KpiMetricDef[],
  ) {
    const [book, monthClose] = await Promise.all([
      this.reader.bookOf(period),
      this.closes.of(period),
    ])
    return this.reader.pageOf(who, book, defs, role, unitId, monthClose)
  }

  /** Same transaction as the rows. */
  private note(tx: Db, who: Actor, payload: object): Promise<void> {
    return this.audit.write({ actorId: who.id, action: 'edit', note: JSON.stringify(payload) }, tx)
  }
}

/** §5: a resend keeps a confirmation only where the value did not move. */
export const keepAnswers = (lines: readonly Line[], before: readonly Line[] | null): Line[] =>
  lines.map((l) => {
    const same = before?.find(
      (b) =>
        b.kind === 'person' &&
        b.personId === l.personId &&
        b.metricKey === l.metricKey &&
        b.value === l.value,
    )
    return l.kind === 'person' && same ? { ...l, confirmedAt: same.confirmedAt } : l
  })
