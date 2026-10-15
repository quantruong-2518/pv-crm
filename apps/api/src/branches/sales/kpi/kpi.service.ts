import { Injectable } from '@nestjs/common'
import { KPI_TARGET_AGREED, KPI_TARGET_PROPOSED, type Actor } from '@pv/engines'
import {
  ROLE_LABEL,
  KpiCompanyResponse,
  KpiMeResponse,
  KpiPeopleResponse,
  KpiTargetsResponse,
  type KpiAgreeBody,
  type KpiPeriodKey,
  type KpiProposeBody,
  type KpiScorecard,
  type RoleId,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import type { Db } from '@api/platform/db/db.module'
import { conflict, denied } from '@api/platform/http/problem'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { spansOf } from '../performance/performance-period'
import { KpiAllocationCounterService } from './kpi-allocation-counter.service'
import { KpiAllocationRepository } from './kpi-allocation.repository'
import { targetSources } from './kpi-allocation.mapper'
import type { KpiCatalog } from './kpi-config.overlay'
import { KpiConfigService } from './kpi-config.service'
import { KpiReadingsRepository } from './kpi-readings.repository'
import { KpiTargetsRepository } from './kpi-targets.repository'
import { assertTargetValues, monthClock, stillOpen } from './kpi-rules'
import { slotsOf, toReadings, toRoleTargets, toScorecard, type ScoreContext } from './kpi.mapper'

type Holder = { id: string; roleIds: readonly RoleId[] }

/** KPI by role: scorecards computed on read, and the agreed monthly targets.
 *
 *  A scorecard belongs to a ROLE, so a person holding two roles carries two.
 *  Nothing here is stored but what a person decided — a target and an
 *  acknowledgement; no worker, no snapshot. The clock is `kpi-rules.ts`'s. */
@Injectable()
export class KpiService {
  constructor(
    private readonly readings: KpiReadingsRepository,
    private readonly targets: KpiTargetsRepository,
    private readonly audit: AuditRepository,
    private readonly hub: NotificationHub,
    private readonly allocations: KpiAllocationRepository,
    private readonly lines: KpiAllocationCounterService,
    private readonly config: KpiConfigService,
  ) {}

  async me(who: Actor, period: KpiPeriodKey): Promise<KpiMeResponse> {
    const holder = { id: who.id, roleIds: who.roleIds.map(toContractRole) }
    const cards = await this.scorecards(period, [holder], who.id)
    return KpiMeResponse.parse({
      period,
      closed: monthClock(period).phase === 'closed',
      scorecards: cards.get(who.id),
    })
  }

  /** The director's card: every metric on it is a room figure, so it is read
   *  for no actor and carries nothing to acknowledge. */
  async company(period: KpiPeriodKey): Promise<KpiCompanyResponse> {
    const catalog = await this.config.effectiveCatalog()
    const seats = catalog.director.map((def) => ({ role: 'director' as const, def }))
    const [values, rows] = await Promise.all([
      this.readings.values(seats, spansOf(period).current),
      this.targets.ofPeriod(period),
    ])
    const ctx = this.context(period, catalog, values, rows)
    return KpiCompanyResponse.parse({
      period,
      scorecard: { role: 'director', readings: toReadings('director', '', ctx) },
    })
  }

  async people(period: KpiPeriodKey): Promise<KpiPeopleResponse> {
    const people = (await this.readings.people()).map((p) => ({
      ...p,
      roleIds: p.roleIds.map(toContractRole),
    }))
    const cards = await this.scorecards(period, people)
    return KpiPeopleResponse.parse({
      period,
      people: people.map((p) => ({
        actorId: p.id,
        name: p.name,
        roleIds: p.roleIds,
        scorecards: cards.get(p.id),
      })),
    })
  }

  async targetsOf(period: KpiPeriodKey): Promise<KpiTargetsResponse> {
    const [rows, catalog] = await Promise.all([
      this.targets.ofPeriod(period),
      this.config.effectiveCatalog(),
    ])
    return KpiTargetsResponse.parse({
      period,
      closed: monthClock(period).phase === 'closed',
      roles: toRoleTargets(slotsOf(rows), catalog),
    })
  }

  /** A new version per key, or the still-pending one replaced in place. */
  async propose(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    body: KpiProposeBody,
  ): Promise<KpiTargetsResponse> {
    stillOpen(period)
    const entries = body.targets.map((t) => ({ metricKey: t.key, value: t.value }))
    assertTargetValues((await this.config.effectiveCatalog())[role], entries, 'targets')

    const proposedAt = new Date()
    await this.targets.run(async (tx) => {
      const mine = (await this.targets.ofPeriod(period, tx)).filter((r) => r.role === role)
      const rows = body.targets.map((t) => {
        /* Oldest first, so the last row of a key is its top version. */
        const top = mine.filter((r) => r.metricKey === t.key).at(-1)
        const version = top ? top.version + (top.agreedAt ? 1 : 0) : 1
        return {
          role,
          period,
          metricKey: t.key,
          version,
          value: String(t.value),
          proposedById: who.id,
          proposedAt,
        }
      })
      /* Fewer stored than sent = an agree landed between the read and the
         write; thrown so the audit line rolls back with the rows. */
      if ((await this.targets.savePending(tx, rows)) !== rows.length) {
        throw conflict('Chỉ tiêu này vừa được duyệt. Tải lại rồi gửi đề nghị mới.')
      }
      await this.note(tx, who, { kpi: 'target-proposed', period, role, targets: body.targets })
      const setters = await this.hub.holding(tx, 'kpi.set-target', 'Sales')
      await this.ring(tx, who, period, role, KPI_TARGET_PROPOSED, { setters }, proposedAt)
    })
    return this.targetsOf(period)
  }

  /** Four eyes: the proposer is refused HERE, with a sentence, before the
   *  CHECK `kpi_target_agreed_by_another` would answer with a bare 500.
   *
   *  And never blind: `seen` is what stood on the agreer's screen. The role's
   *  pending rows must be exactly those, stamp for stamp, or nothing is agreed.
   *  A metric switched off since its proposal is off that screen, so its
   *  pending row is left as it is rather than agreed unseen. */
  async agree(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    body: KpiAgreeBody,
  ): Promise<KpiTargetsResponse> {
    stillOpen(period)
    const stale = conflict('Chỉ tiêu đang chờ duyệt đã thay đổi. Tải lại rồi duyệt lại.')
    await this.targets.run(async (tx) => {
      const live = new Set((await this.config.effectiveCatalog(tx))[role].map((d) => d.key))
      const pending = (await this.targets.ofPeriod(period, tx)).filter(
        (r) => r.role === role && r.agreedAt === null && live.has(r.metricKey),
      )
      if (pending.length === 0) throw conflict('Vai này không có chỉ tiêu nào đang chờ duyệt.')
      if (pending.some((r) => r.proposedById === who.id)) {
        throw conflict('Bạn là người gửi nên cần quản lý khác duyệt.')
      }
      const seenAt = new Map(body.seen.map((s) => [s.key, Date.parse(s.proposedAt)]))
      const same =
        body.seen.length === pending.length &&
        pending.every((r) => seenAt.get(r.metricKey) === r.proposedAt.getTime())
      if (!same) throw stale
      /* The WHERE repeats each stamp, so a row replaced after the read above
         stays pending and the short count undoes the whole agree. */
      const agreedAt = new Date()
      if ((await this.targets.agree(tx, pending, who.id, agreedAt)) !== pending.length) {
        throw stale
      }
      const keys = pending.map((r) => r.metricKey)
      await this.note(tx, who, { kpi: 'target-agreed', period, role, keys })
      const proposers = [...new Set(pending.map((r) => r.proposedById))]
      await this.ring(tx, who, period, role, KPI_TARGET_AGREED, { proposers }, agreedAt)
    })
    return this.targetsOf(period)
  }

  async acknowledge(who: Actor, period: KpiPeriodKey, role: RoleId): Promise<KpiMeResponse> {
    if (!who.roleIds.map(toContractRole).includes(role)) {
      throw denied('permission-denied', 'Bạn không giữ vai này nên không nhận được chỉ tiêu.')
    }
    stillOpen(period)
    await this.targets.run((tx) => this.lines.receive(tx, who, period, role))
    return this.me(who, period)
  }

  /** One read for however many people: figures grouped by actor, the month's
   *  targets, the month's acknowledgements — then welded per person × role.
   *  Which target a slot reads is `targetSources`' call (ADR 0098 §4). */
  private async scorecards(
    period: KpiPeriodKey,
    holders: readonly Holder[],
    only?: string,
  ): Promise<Map<string, KpiScorecard[]>> {
    const catalog = await this.config.effectiveCatalog()
    const seats = holders.flatMap((h) =>
      h.roleIds.flatMap((role) => catalog[role].map((def) => ({ role, def }))),
    )
    const [values, rows, acks, lines] = await Promise.all([
      this.readings.values(seats, spansOf(period).current, only),
      this.targets.ofPeriod(period),
      this.targets.acknowledgements(period),
      this.allocations.agreedLines(period),
    ])
    const base = this.context(period, catalog, values, rows)
    const sources = targetSources(rows, lines)
    const ackAt = new Map(acks.map((a) => [`${a.actorId}|${a.role}`, a.acknowledgedAt]))

    return new Map(
      holders.map((h) => {
        const ctx = { ...base, slots: sources.slotsFor(h.id) }
        const card = (role: RoleId) =>
          toScorecard(
            role,
            h.id,
            ctx,
            ackAt.get(`${h.id}|${role}`) ?? null,
            sources.acksFor(h.id, role),
          )
        return [h.id, h.roleIds.map(card)]
      }),
    )
  }

  private context(
    period: KpiPeriodKey,
    catalog: KpiCatalog,
    values: ScoreContext['values'],
    rows: Parameters<typeof slotsOf>[0],
  ): ScoreContext {
    const { elapsed, phase } = monthClock(period)
    return { catalog, values, slots: slotsOf(rows), elapsed, running: phase === 'running' }
  }

  /** One role's month on the bell, in the target write's own transaction. `at`
   *  keys the line, so a replaced proposal or a later version rings again. The
   *  month is spelled the way the web's month picker spells it. */
  private ring(
    tx: Db,
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    name: string,
    audiences: Record<string, readonly string[]>,
    at: Date,
  ): Promise<void> {
    const code = `${period}:${role}`
    const month = `Tháng ${Number(period.slice(5))} · ${period.slice(0, 4)}`
    return this.hub.announce(tx, {
      event: { name, ref: { code }, actorId: who.id, audiences, occurrence: String(at.getTime()) },
      subject: { kind: 'kpi-target', code, label: `${ROLE_LABEL[role]} · ${month}` },
    })
  }

  /** Same transaction as the rows: a replaced pending value survives only here. */
  private note(tx: Parameters<AuditRepository['write']>[1], who: Actor, payload: object) {
    return this.audit.write({ actorId: who.id, action: 'edit', note: JSON.stringify(payload) }, tx)
  }
}
