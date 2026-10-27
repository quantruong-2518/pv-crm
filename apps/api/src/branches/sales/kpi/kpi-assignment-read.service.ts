import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  isTieredPeriod,
  kpiMetricShare,
  KpiAssignmentMineResponse,
  KpiAssignmentPageResponse,
  RoleId,
  type KpiMetricDef,
  type KpiMonthClose,
  type KpiPeriodKey,
  type KpiTargetActor,
} from '@pv/contracts'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, notFound } from '@api/platform/http/problem'
import { headOf } from '@api/platform/org/org-heads'
import { spansOf } from '../performance/performance-period'
import { targetSources } from './kpi-allocation.mapper'
import { KpiAllocationRepository } from './kpi-allocation.repository'
import { KpiAssignmentRepository } from './kpi-assignment.repository'
import {
  deadlineOf,
  defaulted,
  draftOf,
  inForceOf,
  isCompany,
  linesOf,
  needsSet,
  nodeOf,
  personState,
  receivedOf,
  receiversOf,
  shareOf,
  sortLines,
  sumsOf,
  totalsIn,
  toWireLine,
  toWireSet,
  withCopied,
  type Book,
  type Previous,
} from './kpi-assignment.mapper'
import { KpiCloseRepository } from './kpi-close.repository'
import { KpiConfigService } from './kpi-config.service'
import { readsInTree } from './kpi-person-access'
import { assertTieredMonth, nextMonth, vietnamToday } from './kpi-rules'
import { KpiSeatService } from './kpi-seat.service'
import { KpiTargetsRepository } from './kpi-targets.repository'
import { KpiTeamRepository, type KpiOrgTree } from './kpi-team.repository'
import { agreedIn } from './kpi.mapper'

/** Every read of the tiered sets (ADR 0120): a head's page, a person's lines,
 *  the close gate's three counts, what waits on a head's seat, and last month's
 *  figures the late sweep writes. One `book` per month — its sets, lines and
 *  the tree it reads — so the doors, the sweep and the gate judge one shape. */

export const face = (tree: KpiOrgTree, actorId: string): KpiTargetActor => ({
  actorId,
  name: tree.members.find((m) => m.actorId === actorId)?.name ?? actorId,
})

const unitRef = (tree: KpiOrgTree, unitId: string) => {
  const node = nodeOf(tree, unitId)!
  const head = headOf(tree, unitId)
  return { id: unitId, kind: node.kind, name: node.name, head: head ? face(tree, head) : null }
}

const unitState = (set: { byDefault: boolean } | null) =>
  set ? (set.byDefault ? 'sent-by-default' : 'sent') : 'not-sent'

@Injectable()
export class KpiAssignmentReader {
  constructor(
    private readonly repo: KpiAssignmentRepository,
    private readonly teams: KpiTeamRepository,
    private readonly seats: KpiSeatService,
    private readonly config: KpiConfigService,
    private readonly closes: KpiCloseRepository,
    private readonly targets: KpiTargetsRepository,
    private readonly allocations: KpiAllocationRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  /** Sequential reads: on a transaction handle they share one connection. */
  async book(period: KpiPeriodKey, handle?: Db): Promise<Book | null> {
    const tree = await this.teams.orgTreeAt(period, handle)
    if (!tree) return null
    const sets = await this.repo.sets(period, handle)
    const lines = await this.repo.lines(
      sets.map((s) => s.id),
      handle,
    )
    return { period, tree, sets, lines }
  }

  async bookOf(period: KpiPeriodKey, handle?: Db): Promise<Book> {
    const book = await this.book(period, handle)
    if (!book) throw notFound('sơ đồ phòng ban của tháng này')
    return book
  }

  /** Without `unitId`, the unit the caller heads. Read by its seat, by every head
   *  above it and by `kpi.view-all` (ADR 0120 §7). */
  async page(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    unitId?: string,
  ): Promise<KpiAssignmentPageResponse> {
    assertTieredMonth(period)
    const book = await this.bookOf(period)
    const unit = unitId ?? book.tree.members.find((m) => m.actorId === who.id && m.head)?.unitId
    if (!unit || !nodeOf(book.tree, unit)) throw notFound('đơn vị')
    const all = this.access.allows(who, 'kpi.view-all')
    if (!all && !(await readsInTree(this.seats, book.tree, who, unit)))
      throw denied('permission-denied', 'Bạn không phụ trách đơn vị này.')
    const [catalog, monthClose] = await Promise.all([
      this.config.effectiveCatalog(),
      this.closes.of(period),
    ])
    return this.pageOf(who, book, catalog[role], role, unit, monthClose)
  }

  /** A draft shows its copied lines as the send would write them. */
  async pageOf(
    who: Actor,
    book: Book,
    defs: readonly KpiMetricDef[],
    role: RoleId,
    unitId: string,
    monthClose: KpiMonthClose,
  ): Promise<KpiAssignmentPageResponse> {
    const { tree, sets, period } = book
    const today = vietnamToday()
    const node = nodeOf(tree, unitId)!
    const company = isCompany(tree, unitId)
    const head = headOf(tree, unitId)
    const acting = (await this.seats.unitSeats(tree, [unitId])).get(unitId) ?? []
    const inForce = inForceOf(sets, role, unitId)
    const live = draftOf(sets, role, unitId) ?? inForce
    const received = receivedOf(book, role, unitId)
    const to = receiversOf(tree, role, unitId)
    const stored = live ? linesOf(book, live.id) : []
    const shown = sortLines(
      defs,
      live?.status === 'draft' ? withCopied(defs, company, received, stored, to) : stored,
    )
    const held = inForce ? linesOf(book, inForce.id) : []
    const due = deadlineOf(period, 'person')
    return KpiAssignmentPageResponse.parse({
      period,
      role,
      monthClose,
      unit: unitRef(tree, unitId),
      actingFor: head && head !== who.id && acting.includes(who.id) ? face(tree, head) : null,
      canAct: acting.includes(who.id),
      deadline: deadlineOf(period, node.kind),
      parentSent: !node.parentId || inForceOf(sets, role, node.parentId) !== null,
      received: company
        ? []
        : defs
            .filter((d) => kpiMetricShare(d) !== 'total' && received.has(d.key))
            .map((d) => ({
              metricKey: d.key,
              share: kpiMetricShare(d),
              value: received.get(d.key),
            })),
      set: live ? toWireSet(live, shown, company, today) : null,
      inForceVersion: live?.status === 'draft' && inForce ? inForce.version : null,
      resendLocked: to.units.some((u) => inForceOf(sets, role, u) !== null),
      children: [
        ...to.units.map((u) => ({
          kind: 'unit',
          unit: unitRef(tree, u),
          state: unitState(inForceOf(sets, role, u)),
        })),
        ...to.people.map((p) => ({
          kind: 'person',
          person: face(tree, p),
          state: personState(
            held.filter((l) => l.kind === 'person' && l.personId === p),
            today,
            due,
          ),
        })),
      ],
      sums: sumsOf(defs, company ? totalsIn(shown) : received, shown),
    })
  }

  /** The caller's own lines, plus the company's room totals of the role: that is
   *  how a director or a head of sales holds a target (ADR 0120 §4). */
  async mine(who: Actor, period: KpiPeriodKey, role: RoleId): Promise<KpiAssignmentMineResponse> {
    assertTieredMonth(period)
    if (!who.roleIds.map(toContractRole).includes(role))
      throw denied('permission-denied', 'Bạn không giữ vai này nên không có chỉ tiêu của vai.')
    const [book, monthClose] = await Promise.all([this.book(period), this.closes.of(period)])
    const today = vietnamToday()
    const due = deadlineOf(period, 'person')
    const held = (book?.sets ?? []).flatMap((s) => {
      if (s.role !== role || s.status !== 'sent') return []
      const company = isCompany(book!.tree, s.unitId)
      const lines = linesOf(book!, s.id).filter((l) =>
        l.kind === 'person'
          ? l.personId === who.id
          : company && l.kind === 'total' && shareOf(role, l.metricKey) === 'total',
      )
      return lines.length > 0 ? [{ set: s, company, lines }] : []
    })
    const own = held.flatMap((h) => h.lines.filter((l) => l.kind === 'person'))
    const from = held.find((h) => h.lines.some((l) => l.kind === 'person')) ?? held[0]
    const stamps = own.map((l) => l.confirmedAt?.getTime() ?? null)
    const confirmed = own.length > 0 && stamps.every((t) => t !== null)
    return KpiAssignmentMineResponse.parse({
      period,
      role,
      monthClose,
      sentBy:
        from?.set.sentBy && from.set.sender
          ? { actorId: from.set.sentBy, name: from.set.sender }
          : null,
      sentAt: from?.set.sentAt?.toISOString() ?? null,
      version: from?.set.version ?? null,
      lines: held.flatMap((h) => h.lines.map((l) => toWireLine(role, l, h.company, today, due))),
      confirmedAt: confirmed ? new Date(Math.max(...(stamps as number[]))).toISOString() : null,
      acceptedByDefault: own.some((l) => defaulted(l, today, due)),
      deadline: due,
    })
  }

  /** ADR 0120 §9: sets still owed, sets the sweep wrote, people who have not answered. */
  async gateCounts(period: KpiPeriodKey, handle?: Db) {
    const book = await this.book(period, handle)
    if (!book) return { setsNotSent: 0, setsByDefault: 0, peopleNotConfirmed: 0 }
    const catalog = await this.config.effectiveCatalog(handle)
    const { tree, sets } = book
    const slots = RoleId.options.flatMap((role) =>
      tree.nodes
        .filter((n) => needsSet(tree, catalog[role], role, n.unitId))
        .map((n) => inForceOf(sets, role, n.unitId)),
    )
    const held = sets.filter((s) => s.status === 'sent')
    const waiting = held.flatMap((s) =>
      linesOf(book, s.id).flatMap((l) =>
        l.kind === 'person' && !l.confirmedAt ? [l.personId] : [],
      ),
    )
    return {
      setsNotSent: slots.filter((s) => s === null).length,
      setsByDefault: held.filter((s) => s.byDefault).length,
      peopleNotConfirmed: new Set(waiting).size,
    }
  }

  /** The units `actorId` heads in this month's and next month's tree, where
   *  tiered: the seats a stand-in takes over (ADR 0117, 0120 §7). */
  async headedBy(actorId: string, today: string, handle?: Db) {
    const month = today.slice(0, 7)
    const out: { book: Book; unitIds: string[] }[] = []
    for (const period of [month, nextMonth(month)].filter(isTieredPeriod)) {
      const book = await this.book(period, handle)
      const unitIds = (book?.tree.members ?? [])
        .filter((m) => m.actorId === actorId && m.head)
        .map((m) => m.unitId)
      if (book && unitIds.length > 0) out.push({ book, unitIds })
    }
    return out
  }

  /** Sets still owed by the units `actorId` heads: what the stand-in bell counts. */
  async waitingOn(actorId: string, today: string, handle?: Db): Promise<number> {
    const catalog = await this.config.effectiveCatalog(handle)
    const seats = await this.headedBy(actorId, today, handle)
    return seats.flatMap(({ book, unitIds }) =>
      RoleId.options.flatMap((role) =>
        unitIds.filter(
          (u) => needsSet(book.tree, catalog[role], role, u) && !inForceOf(book.sets, role, u),
        ),
      ),
    ).length
  }

  /** ADR 0120 §6: December reads November through the old `targetSources`
   *  (personal line, else role target); later months the previous sets. Read
   *  outside any transaction: `agreedLines` takes no handle. */
  async previous(period: KpiPeriodKey, role: RoleId): Promise<Previous> {
    const prev = spansOf(period).previous.key
    if (!isTieredPeriod(prev)) {
      const [rows, lines] = await Promise.all([
        this.targets.ofPeriod(prev),
        this.allocations.agreedLines(prev),
      ])
      const sources = targetSources(rows, lines)
      const of = (id: string, key: Parameters<Previous['level']>[0]) =>
        Number(agreedIn(sources.slotsFor(id), role, key)?.value ?? 0)
      return { person: of, level: (key) => of('', key) }
    }
    const book = await this.book(prev)
    const held = (book?.sets ?? []).filter((s) => s.role === role && s.status === 'sent')
    const lines = held.flatMap((s) => linesOf(book!, s.id))
    const find = (kind: string, key: string, personId: string | null = null) =>
      lines.find((l) => l.kind === kind && l.metricKey === key && l.personId === personId)?.value ??
      0
    return { person: (id, key) => find('person', key, id), level: (key) => find('total', key) }
  }
}
