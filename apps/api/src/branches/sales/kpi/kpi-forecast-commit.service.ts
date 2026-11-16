import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  dayNo,
  weekdayOf,
  type KpiForecastMeBody,
  type KpiForecastMeResponse,
  type KpiPeriodKey,
  type KpiUnitForecastBody,
  type KpiUnitForecastResponse,
  type RoleId,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, invalid, notFound } from '@api/platform/http/problem'
import { membersUnder } from '@api/platform/org/org-heads'
import type { KpiCatalog } from './kpi-config.overlay'
import { KpiConfigService } from './kpi-config.service'
import { KpiForecastCommitRepository } from './kpi-forecast-commit.repository'
import { readsInTree } from './kpi-person-access'
import { assertTieredMonth, holdsSigned, monthEnded, vietnamToday } from './kpi-rules'
import { KpiSeatService } from './kpi-seat.service'
import { KpiTeamRepository, type KpiOrgTree } from './kpi-team.repository'

/** Weekly forecast commits (ADR 0158 §1): a signed-value holder's pick and a unit's number.
 *
 *  All four doors sit on `kpi.view`; who may act is the tree's fact (ADR 0117, 0120 §7),
 *  checked here. `today` is a parameter so the week can be pinned; the doors never pass it. */

const DAY_MS = 86_400_000
const addDays = (day: string, n: number): string =>
  new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10)
const mondayOn = (day: string): string => addDays(day, -weekdayOf(dayNo(day)))

export type CommitWeek = {
  week: string
  editable: boolean
  /** Why it is not editable; `null` while it is. */
  why: 'month-over' | 'not-started' | 'past' | null
}

/** The week a period's screen shows (ADR 0158 default): this week when its Monday is in the
 *  period, else the last Monday of the period not after today, else its first. A month that
 *  has ended or closed freezes every week, even one that straddles into the next month. */
export function weekOfPeriod(period: KpiPeriodKey, today: string, closed = false): CommitWeek {
  const current = mondayOn(today)
  const over = closed || monthEnded(period, today)
  if (current.startsWith(period))
    return { week: current, editable: !over, why: over ? 'month-over' : null }
  const first = addDays(`${period}-01`, (7 - weekdayOf(dayNo(`${period}-01`))) % 7)
  const mondays: string[] = []
  for (let d = first; d.startsWith(period); d = addDays(d, 7)) mondays.push(d)
  const past = mondays.filter((d) => d <= today)
  const week = past.at(-1) ?? first
  const why = over ? 'month-over' : past.length === 0 ? 'not-started' : 'past'
  return { week, editable: false, why }
}

const holdsAny = (catalog: KpiCatalog, roles: readonly RoleId[]): boolean =>
  roles.some((r) => catalog[r].some(holdsSigned))

const noSigned = () =>
  conflict('Chỉ người có chỉ tiêu giá trị hợp đồng đã ký mới cam kết theo tuần.')
const refusalOf = (why: NonNullable<CommitWeek['why']>) =>
  conflict(
    {
      'month-over': 'Tháng này đã kết thúc nên không sửa cam kết được.',
      'not-started': 'Tuần này chưa bắt đầu.',
      past: 'Tuần này đã qua nên không sửa cam kết được.',
    }[why],
  )
const companyUnit = () =>
  conflict('Số cam kết của cả công ty cộng từ các phòng ban, không nhập riêng.')

@Injectable()
export class KpiForecastCommitService {
  constructor(
    private readonly repo: KpiForecastCommitRepository,
    private readonly teams: KpiTeamRepository,
    private readonly seats: KpiSeatService,
    private readonly config: KpiConfigService,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async mine(
    who: Actor,
    period: KpiPeriodKey,
    today = vietnamToday(),
  ): Promise<KpiForecastMeResponse> {
    await this.assertHolder(who, period)
    return this.meOf(who.id, period, today)
  }

  async saveMine(
    who: Actor,
    period: KpiPeriodKey,
    body: KpiForecastMeBody,
    today = vietnamToday(),
  ): Promise<KpiForecastMeResponse> {
    await this.assertHolder(who, period)
    await this.repo.run(async (tx) => {
      const { week, why } = weekOfPeriod(period, today, await this.repo.isClosed(period, tx))
      if (why) throw refusalOf(why)
      const open = new Map((await this.repo.candidates(who.id, tx)).map((c) => [c.code, c]))
      const stray = body.opportunityIds.filter((id) => !open.has(id))
      if (stray.length > 0)
        throw invalid({
          opportunityIds: [`Không phải cơ hội đang mở của bạn: ${stray.join(', ')}.`],
        })
      const lines = body.opportunityIds.map((code) => ({ code, value: open.get(code)!.value }))
      await this.repo.replaceCommit(tx, { period, week, actorId: who.id, lines })
      await this.note(tx, who, {
        kpi: 'forecast-committed',
        period,
        week,
        codes: body.opportunityIds,
      })
    })
    return this.meOf(who.id, period, today)
  }

  async ofUnit(
    who: Actor,
    period: KpiPeriodKey,
    unitId: string,
    today = vietnamToday(),
  ): Promise<KpiUnitForecastResponse> {
    assertTieredMonth(period)
    const tree = await this.treeOf(period, unitId)
    const seat = (await this.seats.unitSeats(tree, [unitId], today)).get(unitId) ?? []
    const reads =
      this.access.allows(who, 'kpi.view-all') ||
      seat.includes(who.id) ||
      (await readsInTree(this.seats, tree, who, unitId))
    if (!reads) throw denied('permission-denied', 'Bạn không phụ trách đơn vị này.')
    return this.unitView(tree, unitId, period, today, seat.includes(who.id))
  }

  async commitUnit(
    who: Actor,
    period: KpiPeriodKey,
    unitId: string,
    body: KpiUnitForecastBody,
    today = vietnamToday(),
  ): Promise<KpiUnitForecastResponse> {
    assertTieredMonth(period)
    await this.repo.run(async (tx) => {
      await this.teams.lockRoster(tx)
      const tree = await this.treeOf(period, unitId, tx)
      const { week, why } = weekOfPeriod(period, today, await this.repo.isClosed(period, tx))
      const seat = (await this.seats.unitSeats(tree, [unitId], today, tx)).get(unitId) ?? []
      if (!seat.includes(who.id))
        throw denied('permission-denied', 'Bạn không phụ trách đơn vị này.')
      if (why) throw refusalOf(why)
      if (tree.nodes.find((n) => n.unitId === unitId)?.kind === 'company') throw companyUnit()
      if ((await this.holders(tree, unitId, tx)).length === 0) throw noSigned()
      await this.repo.upsertUnitCommit(tx, {
        period,
        week,
        unitId,
        amount: body.amount,
        by: who.id,
      })
      await this.note(tx, who, {
        kpi: 'unit-forecast-committed',
        period,
        week,
        unit: unitId,
        amount: body.amount,
      })
    })
    return this.ofUnit(who, period, unitId, today)
  }

  private async meOf(
    actorId: string,
    period: KpiPeriodKey,
    today: string,
  ): Promise<KpiForecastMeResponse> {
    const { week, editable } = weekOfPeriod(period, today, await this.repo.isClosed(period))
    const [candidates, saved] = await Promise.all([
      this.repo.candidates(actorId),
      this.repo.commitsOf(week, [actorId]),
    ])
    const mine = saved.get(actorId)
    return {
      week,
      editable,
      candidates: candidates.map((c) => ({
        opportunityId: c.code,
        name: c.name,
        customerName: c.customer,
        value: c.value,
        expectedClose: c.expectedClose,
      })),
      picked: mine?.codes ?? [],
      total: mine?.amount ?? 0,
      savedAt: mine?.savedAt.toISOString() ?? null,
    }
  }

  private async unitView(
    tree: KpiOrgTree,
    unitId: string,
    period: KpiPeriodKey,
    today: string,
    acts: boolean,
  ): Promise<KpiUnitForecastResponse> {
    const { week, editable } = weekOfPeriod(period, today, await this.repo.isClosed(period))
    const holders = await this.holders(tree, unitId)
    const [saved, committed] = await Promise.all([
      this.repo.commitsOf(
        week,
        holders.map((h) => h.id),
      ),
      this.repo.unitCommit(unitId, week),
    ])
    const people = holders.map((h) => {
      const c = saved.get(h.id)
      return {
        actorId: h.id,
        name: h.name,
        total: c?.amount ?? null,
        codes: c?.codes ?? [],
        savedAt: c?.savedAt.toISOString() ?? null,
      }
    })
    return {
      week,
      people,
      sum: people.reduce((s, p) => s + (p.total ?? 0), 0),
      committed: committed && {
        amount: committed.amount,
        byName: committed.byName,
        at: committed.at.toISOString(),
      },
      canCommit:
        acts &&
        editable &&
        people.length > 0 &&
        tree.nodes.find((n) => n.unitId === unitId)?.kind !== 'company',
    }
  }

  /** Everyone under the unit whose scorecard holds an own `signed-value`. */
  private async holders(tree: KpiOrgTree, unitId: string, handle?: Db) {
    const catalog = await this.config.effectiveCatalog(handle)
    const under = new Set(membersUnder(tree, unitId))
    return tree.members
      .filter((m) => under.has(m.actorId) && holdsAny(catalog, m.roleIds.map(toContractRole)))
      .map((m) => ({ id: m.actorId, name: m.name }))
  }

  private async treeOf(period: KpiPeriodKey, unitId: string, handle?: Db): Promise<KpiOrgTree> {
    const tree = await this.teams.orgTreeAt(period, handle)
    if (!tree) throw notFound('sơ đồ phòng ban của tháng này')
    if (!tree.nodes.some((n) => n.unitId === unitId)) throw notFound('đơn vị')
    return tree
  }

  private async assertHolder(who: Actor, period: KpiPeriodKey): Promise<void> {
    assertTieredMonth(period)
    if (!holdsAny(await this.config.effectiveCatalog(), who.roleIds.map(toContractRole)))
      throw noSigned()
  }

  /** Same transaction as the rows. */
  private note(tx: Db, who: Actor, payload: object): Promise<void> {
    return this.audit.write({ actorId: who.id, action: 'edit', note: JSON.stringify(payload) }, tx)
  }
}
