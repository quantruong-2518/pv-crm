import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  KPI_METRIC_LABEL,
  KpiCounterListResponse,
  type KpiAcknowledgeBody,
  type KpiAckStatus,
  type KpiAllocationResponse,
  type KpiCounter,
  type KpiCounterBody,
  type KpiCounterResolveBody,
  type KpiMetricKey,
  type KpiPeriodKey,
  type RoleId,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, notFound } from '@api/platform/http/problem'
import { spansOf } from '../performance/performance-period'
import { KpiAlertService } from './kpi-alert.service'
import { rosterOf, shareTargetOf, shareValues } from './kpi-allocation-team'
import { KpiAllocationRepository, type LineKey } from './kpi-allocation.repository'
import type { KpiAllocationRowDb } from './kpi-allocation.schema'
import { effectOf, toCounter } from './kpi-allocation.mapper'
import {
  handedDown,
  KpiAllocationService,
  stale,
  type KpiPeriodContext,
} from './kpi-allocation.service'
import { KpiConfigService } from './kpi-config.service'
import {
  ackDueOn,
  ackStateOf,
  assertNotLapsed,
  assertTargetValues,
  lapsedAt,
  monthClock,
  stillOpen,
  vietnamToday,
} from './kpi-rules'
import { KpiTargetsRepository } from './kpi-targets.repository'
import { KpiTeamRepository } from './kpi-team.repository'

const RESOLVED = { accept: 'accepted', keep: 'kept', counter: 'countered' } as const
const PENDING = { ackStatus: 'pending' as const, ackedAt: null }

/** A holder's answer to their lines, and a manager's answer to that (ADR 0098 §3).
 *
 *  A line is `countered` exactly while an open counter sits on it; settling
 *  puts it back to `pending`, so the holder answers the new value too.
 *
 *  Where a changed value lands follows the package. Not yet agreed: the line
 *  changes in place and the resolver becomes `submittedBy`, so whoever set the
 *  number last cannot agree it. Agreed: it is locked, so the change opens
 *  version + 1 as a DRAFT carrying every line and the other open counters —
 *  the head rebalances it from `compensators` and sends it again, while cards
 *  keep reading the agreed version (`agreedLines`).
 *
 *  On a team package a counter on the lead's own line leaves the lead as
 *  sender (ADR 0101 default 9). A holder's line is found in whichever tier has it. */
@Injectable()
export class KpiAllocationCounterService {
  constructor(
    private readonly repo: KpiAllocationRepository,
    private readonly targets: KpiTargetsRepository,
    private readonly packages: KpiAllocationService,
    private readonly alerts: KpiAlertService,
    private readonly config: KpiConfigService,
    private readonly teams: KpiTeamRepository,
  ) {}

  async acknowledge(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    body: KpiAcknowledgeBody,
  ): Promise<KpiAllocationResponse> {
    stillOpen(period)
    await this.repo.run(async (tx) => {
      const metricKeys = await this.receive(tx, who, period, role, body.metricKeys ?? null, true)
      await this.packages.note(tx, who, {
        kpi: 'allocation-acknowledged',
        period,
        role,
        metricKeys,
      })
    })
    return this.packages.read(who, period)
  }

  /** "I have received my targets", ONE stamp for both books: the role's
   *  acknowledgement and the caller's lines in the package handed down, so the
   *  scorecard door and this one answer the same question.
   *
   *  `keys === null` takes every line not countered. `strict` is the allocation
   *  door: no package handed down, or nothing to confirm, is then a refusal. */
  async receive(
    tx: Db,
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    keys: readonly KpiMetricKey[] | null = null,
    strict = false,
  ): Promise<KpiMetricKey[]> {
    const live = await this.holderPackage(tx, period, role, who.id)
    if (!live || !handedDown(live)) {
      if (strict) throw conflict('Vai này chưa có chỉ tiêu được giao cho bạn.')
      await this.targets.acknowledge(
        { actorId: who.id, role, period, acknowledgedAt: new Date() },
        tx,
      )
      return []
    }
    const mine = (await this.repo.lines([live.id], tx)).filter((l) => l.actorId === who.id)
    const wanted = keys
      ? mine.filter((l) => keys.includes(l.metricKey))
      : mine.filter((l) => l.ackStatus !== 'countered')
    if (keys && wanted.length !== keys.length) {
      throw conflict('Có chỉ tiêu không được giao cho bạn trong gói này.')
    }
    assertNotLapsed(this.statesOf(live, wanted))
    const open = wanted.filter((l) => l.ackStatus === 'countered')
    if (open.length > 0) {
      const names = open.map((l) => KPI_METRIC_LABEL[l.metricKey]).join(', ')
      throw conflict(`Chỉ tiêu đang chờ xử lý đề xuất: ${names}.`)
    }
    if (strict && wanted.length === 0) throw conflict('Bạn không có chỉ tiêu nào cần xác nhận.')
    const at = new Date()
    const moved = await this.repo.setLines(tx, live, wanted, {
      ackStatus: 'acknowledged',
      ackedAt: at,
    })
    if (moved !== wanted.length) throw stale()
    await this.targets.acknowledge({ actorId: who.id, role, period, acknowledgedAt: at }, tx)
    return wanted.map((l) => l.metricKey)
  }

  async counter(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    body: KpiCounterBody,
  ): Promise<KpiAllocationResponse> {
    stillOpen(period)
    const proposal = { metricKey: body.metricKey, value: body.proposedValue }
    assertTargetValues(await this.packages.roleDefs(role), [proposal], 'proposedValue')
    const already = conflict('Bạn đã có một đề xuất chờ xử lý cho chỉ tiêu này.')
    await this.repo.run(async (tx) => {
      const live = await this.holderPackage(tx, period, role, who.id)
      if (!live || !handedDown(live)) throw conflict('Vai này chưa có chỉ tiêu được giao cho bạn.')
      const line = (await this.repo.lines([live.id], tx)).find(
        (l) => l.actorId === who.id && l.metricKey === body.metricKey,
      )
      if (!line) throw conflict('Chỉ tiêu này không được giao cho bạn trong gói này.')
      assertNotLapsed(this.statesOf(live, [line]))
      if (line.ackStatus === 'countered') throw already
      const id = await this.repo.insertCounter(tx, {
        allocationId: live.id,
        actorId: who.id,
        metricKey: body.metricKey,
        proposedValue: String(body.proposedValue),
        reason: body.reason,
      })
      if (!id) throw already
      await this.repo.setLines(tx, live, [line], { ackStatus: 'countered', ackedAt: new Date() })
      await this.packages.note(tx, who, { kpi: 'allocation-countered', period, role, counter: id })
    })
    return this.packages.read(who, period)
  }

  /** The package holding the caller's line, room or team; with none, the room
   *  package, which answers a holder without lines as before. */
  private async holderPackage(tx: Db, period: KpiPeriodKey, role: RoleId, actorId: string) {
    return (
      (await this.repo.lockHolding(tx, period, role, actorId)) ??
      (await this.repo.lockLive(tx, period, role, null))
    )
  }

  async list(period: KpiPeriodKey): Promise<KpiCounterListResponse> {
    return KpiCounterListResponse.parse({ period, counters: await this.counterViews(period) })
  }

  /** Each counter's effect is read against ITS package's target: the role
   *  target on the room tier, the team's share on a team package. `teamId`
   *  keeps only that team's counters. `loaded` is what the caller has already
   *  read; the month's figures are asked for the people on the counters'
   *  packages, the only ones `effectOf` looks up. */
  async counterViews(
    period: KpiPeriodKey,
    teamId?: string,
    loaded?: KpiPeriodContext,
  ): Promise<KpiCounter[]> {
    const all = await this.repo.counters(period)
    const counters = teamId ? all.filter((c) => c.teamId === teamId) : all
    const allocationIds = [...new Set(counters.map((c) => c.allocationId))]
    const [lines, roleTarget, inForce, shares, tolerance] = await Promise.all([
      this.repo.lines(allocationIds),
      this.packages.roleTargets(period, undefined, loaded?.targetRows),
      loaded?.shares ?? this.packages.sharesInForce(period),
      this.repo.shares(allocationIds),
      loaded?.tolerance ?? this.config.tolerance(),
    ])
    const now = await this.packages.figures(
      spansOf(period).current,
      counters.map((c) => c.role),
      [...new Set(lines.map((l) => l.actorId))],
      loaded?.catalog,
      loaded && { closed: loaded.monthClose !== null },
    )
    const { elapsed } = monthClock(period)
    return counters.map((c) => {
      const pkgLines = lines.filter((l) => l.allocationId === c.allocationId)
      const target = c.teamId ? shareTargetOf(shareValues(inForce, c.role, c.teamId)) : roleTarget
      const own = shares.filter((s) => s.allocationId === c.allocationId)
      return toCounter(
        c,
        effectOf(c, pkgLines, target(c.role, c.metricKey), now, elapsed, tolerance, own),
      )
    })
  }

  /** The states of `lines` under `pkg`'s deadline, as of today in Vietnam. */
  private statesOf(pkg: KpiAllocationRowDb, lines: readonly { ackStatus: KpiAckStatus }[]) {
    const dueOn = ackDueOn(pkg)
    return lines.map((l) => ackStateOf(l.ackStatus, dueOn, vietnamToday()))
  }

  /** The holder never settles their own counter: refused here with a
   *  sentence before the CHECK `kpi_counter_resolved_by_another`. Answers
   *  with the caller's allocation view — the queue itself is `kpi.view-all`. */
  async resolve(
    who: Actor,
    period: KpiPeriodKey,
    counterId: string,
    body: KpiCounterResolveBody,
  ): Promise<KpiAllocationResponse> {
    await this.settleCounter(who, period, counterId, body)
    return this.packages.read(who, period)
  }

  /** `leadOf` set: the team's own door, whose permission is `kpi.view`, so the
   *  roster of the month — read under the same transaction — must name the
   *  caller as that team's lead, and the counter must sit on that team. */
  async settleCounter(
    who: Actor,
    period: KpiPeriodKey,
    counterId: string,
    body: KpiCounterResolveBody,
    leadOf?: string,
  ): Promise<void> {
    stillOpen(period)
    if (leadOf) {
      await this.packages.assertActsFor(who, rosterOf(await this.teams.rosterAt(period)), leadOf)
    }
    await this.repo.run(async (tx) => {
      if (leadOf) {
        const roster = rosterOf(await this.teams.rosterAt(period, tx))
        await this.packages.assertActsFor(who, roster, leadOf, tx)
      }
      /* Matched in JS first: the id comes off the URL and need not be a uuid. */
      const c = (await this.repo.counters(period, tx)).find((x) => x.id === counterId)
      if (!c || (leadOf && c.teamId !== leadOf)) throw notFound('đề xuất chỉ tiêu')
      const pkg = await this.repo.lockPackage(tx, c.allocationId)
      if ((await this.repo.lockCounter(tx, c.id))?.status !== 'open') {
        throw conflict('Đề xuất này đã được xử lý.')
      }
      if (!pkg || pkg.status === 'superseded') throw stale()
      if (c.actorId === who.id) throw conflict('Đề xuất của bạn cần quản lý khác xử lý.')
      if (body.resolution === 'counter') {
        const entry = { metricKey: c.metricKey, value: body.value }
        assertTargetValues(await this.packages.roleDefs(c.role, tx), [entry], 'value')
      }
      const value =
        body.resolution === 'accept'
          ? c.proposedValue
          : body.resolution === 'counter'
            ? String(body.value)
            : null
      await this.repo.resolveCounter(tx, c.id, {
        status: RESOLVED[body.resolution],
        resolvedBy: who.id,
        resolvedAt: new Date(),
        counterValue: body.resolution === 'counter' ? String(body.value) : null,
      })
      await this.settle(tx, who, pkg, c, value)
      await this.alerts.resolved(tx, who, period, c, body.resolution)
      await this.packages.note(tx, who, {
        kpi: 'counter-resolved',
        period,
        counter: c.id,
        resolution: body.resolution,
      })
    })
  }

  /** `value === null` is "keep": only the holder's answer resets. A returned
   *  package keeps its sender — it is decided, and will be redrafted anyway. */
  private async settle(
    tx: Db,
    who: Actor,
    pkg: KpiAllocationRowDb,
    at: LineKey,
    value: string | null,
  ): Promise<void> {
    if (value !== null && pkg.status === 'agreed') return this.reissue(tx, who, pkg, at, value)
    const set = value === null ? PENDING : { ...PENDING, value }
    if ((await this.repo.setLines(tx, pkg, [at], set)) !== 1) throw stale()
    if (value !== null && (pkg.status === 'submitted' || pkg.status === 'draft')) {
      const sender = await this.senderOf(tx, who, pkg, at.actorId)
      if (!(await this.repo.movePackage(tx, pkg, { submittedBy: sender }))) throw stale()
    }
  }

  /** The sender is whoever resolved last. The one exception (amendment A2): a
   *  counter on the LEAD's own line, whoever resolves it, leaves the lead as
   *  sender — otherwise the head resolving it could no longer agree the package. */
  private async senderOf(
    tx: Db,
    who: Actor,
    pkg: KpiAllocationRowDb,
    counterBy: string,
  ): Promise<string> {
    if (!pkg.teamId) return who.id
    const lead = rosterOf(await this.teams.rosterAt(pkg.period, tx)).leadOf(pkg.teamId)
    return lead === counterBy ? lead : who.id
  }

  /** An agreed package that must change takes a new version (ADR 0098 §3). */
  private async reissue(
    tx: Db,
    who: Actor,
    pkg: KpiAllocationRowDb,
    at: LineKey,
    value: string,
  ): Promise<void> {
    /* The old line stays in force until the next agreement, answered. */
    if ((await this.repo.setLines(tx, pkg, [at], PENDING)) !== 1) throw stale()
    const lines = await this.repo.lines([pkg.id], tx)
    if (!(await this.repo.movePackage(tx, pkg, { status: 'superseded' }))) throw stale()
    const id = await this.repo.insertPackage(tx, {
      period: pkg.period,
      role: pkg.role,
      teamId: pkg.teamId,
      version: await this.repo.nextVersion(tx, pkg.period, pkg.role, pkg.teamId),
      status: 'draft',
      submittedBy: await this.senderOf(tx, who, pkg, at.actorId),
      ackDays: pkg.ackDays,
    })
    if (!id) throw stale()
    if (!pkg.teamId) await this.repo.copyShares(tx, pkg.id, id)
    const same = (l: LineKey) => l.actorId === at.actorId && l.metricKey === at.metricKey
    /* A lapsed line is copied answered, at its lapse: the new version's own
       deadline must not reopen a deadline already missed. */
    const dueOn = ackDueOn(pkg)
    const carried = (l: (typeof lines)[number]) =>
      dueOn !== null && ackStateOf(l.ackStatus, dueOn, vietnamToday()) === 'lapsed'
        ? { ackStatus: 'acknowledged' as const, ackedAt: lapsedAt(dueOn) }
        : { ackStatus: l.ackStatus, ackedAt: l.ackedAt }
    await this.repo.insertLines(
      tx,
      lines.map((l) => ({
        allocationId: id,
        actorId: l.actorId,
        metricKey: l.metricKey,
        ...(same(l) ? { ...PENDING, value } : { ...carried(l), value: l.value }),
      })),
    )
    await this.repo.repointOpenCounters(tx, pkg.id, id)
  }
}
