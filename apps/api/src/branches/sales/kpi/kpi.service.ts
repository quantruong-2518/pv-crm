import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  KPI_CATALOG,
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
import { conflict, denied, invalid } from '@api/platform/http/problem'
import { spansOf } from '../performance/performance-period'
import { KpiReadingsRepository } from './kpi-readings.repository'
import { KpiTargetsRepository } from './kpi-targets.repository'
import { elapsedOf, phaseOf } from './kpi-verdict'
import { slotsOf, toReadings, toRoleTargets, toScorecard, type ScoreContext } from './kpi.mapper'

type Holder = { id: string; roleIds: readonly RoleId[] }

/** Vietnam is UTC+7 all year, so its calendar day is a fixed shift. */
const vietnamToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)

/** KPI by role: scorecards computed on read, and the agreed monthly targets.
 *
 *  A scorecard belongs to a ROLE, so a person holding two roles carries two.
 *  Nothing here is stored but what a person decided — a target and an
 *  acknowledgement; no worker, no snapshot.
 *
 *  The clock is read here and handed to `kpi-verdict.ts` as a number, which
 *  is what keeps the verdict pure. */
@Injectable()
export class KpiService {
  constructor(
    private readonly readings: KpiReadingsRepository,
    private readonly targets: KpiTargetsRepository,
    private readonly audit: AuditRepository,
  ) {}

  async me(who: Actor, period: KpiPeriodKey): Promise<KpiMeResponse> {
    const holder = { id: who.id, roleIds: who.roleIds.map(toContractRole) }
    const cards = await this.scorecards(period, [holder], who.id)
    return KpiMeResponse.parse({
      period,
      closed: this.clock(period).phase === 'closed',
      scorecards: cards.get(who.id),
    })
  }

  /** The director's card: every metric on it is a room figure, so it is read
   *  for no actor and carries nothing to acknowledge. */
  async company(period: KpiPeriodKey): Promise<KpiCompanyResponse> {
    const seats = KPI_CATALOG.director.map((def) => ({ role: 'director' as const, def }))
    const [values, rows] = await Promise.all([
      this.readings.values(seats, spansOf(period).current),
      this.targets.ofPeriod(period),
    ])
    const ctx = this.context(period, values, rows)
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
    const rows = await this.targets.ofPeriod(period)
    return KpiTargetsResponse.parse({
      period,
      closed: this.clock(period).phase === 'closed',
      roles: toRoleTargets(slotsOf(rows)),
    })
  }

  /** A new version per key, or the still-pending one replaced in place. */
  async propose(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    body: KpiProposeBody,
  ): Promise<KpiTargetsResponse> {
    this.stillOpen(period)
    const defs = new Map(KPI_CATALOG[role].map((d) => [d.key, d]))
    const stray = body.targets.filter((t) => !defs.has(t.key)).map((t) => t.key)
    if (stray.length > 0) {
      throw invalid({ targets: [`Vai này không có chỉ số: ${stray.join(', ')}.`] })
    }
    /* A ratio is 0–1 on the wire; 40 where 0.4 was meant can never be met. */
    const over = body.targets.filter((t) => defs.get(t.key)?.unit === 'ratio' && t.value > 1)
    if (over.length > 0) {
      throw invalid({
        targets: [`Chỉ tiêu dạng tỷ lệ không vượt quá 100%: ${over.map((t) => t.key).join(', ')}.`],
      })
    }

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
    })
    return this.targetsOf(period)
  }

  /** Four eyes: the proposer is refused HERE, with a sentence, before the
   *  CHECK `kpi_target_agreed_by_another` would answer with a bare 500.
   *
   *  And never blind: `seen` is what stood on the agreer's screen. The role's
   *  pending rows must be exactly those, stamp for stamp, or nothing is agreed. */
  async agree(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    body: KpiAgreeBody,
  ): Promise<KpiTargetsResponse> {
    this.stillOpen(period)
    const stale = conflict('Chỉ tiêu đang chờ duyệt đã thay đổi. Tải lại rồi duyệt lại.')
    await this.targets.run(async (tx) => {
      const pending = (await this.targets.ofPeriod(period, tx)).filter(
        (r) => r.role === role && r.agreedAt === null,
      )
      if (pending.length === 0) throw conflict('Vai này không có chỉ tiêu nào đang chờ duyệt.')
      if (pending.some((r) => r.proposedById === who.id)) {
        throw conflict('Bạn là người gửi đề nghị chỉ tiêu này nên cần một quản lý khác duyệt.')
      }
      const seenAt = new Map(body.seen.map((s) => [s.key, Date.parse(s.proposedAt)]))
      const same =
        body.seen.length === pending.length &&
        pending.every((r) => seenAt.get(r.metricKey) === r.proposedAt.getTime())
      if (!same) throw stale
      /* The WHERE repeats each stamp, so a row replaced after the read above
         stays pending and the short count undoes the whole agree. */
      if ((await this.targets.agree(tx, pending, who.id, new Date())) !== pending.length) {
        throw stale
      }
      const keys = pending.map((r) => r.metricKey)
      await this.note(tx, who, { kpi: 'target-agreed', period, role, keys })
    })
    return this.targetsOf(period)
  }

  async acknowledge(who: Actor, period: KpiPeriodKey, role: RoleId): Promise<KpiMeResponse> {
    if (!who.roleIds.map(toContractRole).includes(role)) {
      throw denied(
        'permission-denied',
        'Bạn không giữ vai này nên không nhận chỉ tiêu của nó được.',
      )
    }
    this.stillOpen(period)
    await this.targets.acknowledge({ actorId: who.id, role, period, acknowledgedAt: new Date() })
    return this.me(who, period)
  }

  /** One read for however many people: figures grouped by actor, the month's
   *  targets, the month's acknowledgements — then welded per person × role. */
  private async scorecards(
    period: KpiPeriodKey,
    holders: readonly Holder[],
    only?: string,
  ): Promise<Map<string, KpiScorecard[]>> {
    const seats = holders.flatMap((h) =>
      h.roleIds.flatMap((role) => KPI_CATALOG[role].map((def) => ({ role, def }))),
    )
    const [values, rows, acks] = await Promise.all([
      this.readings.values(seats, spansOf(period).current, only),
      this.targets.ofPeriod(period),
      this.targets.acknowledgements(period),
    ])
    const ctx = this.context(period, values, rows)
    const ackAt = new Map(acks.map((a) => [`${a.actorId}|${a.role}`, a.acknowledgedAt]))

    return new Map(
      holders.map((h) => [
        h.id,
        h.roleIds.map((role) => toScorecard(role, h.id, ctx, ackAt.get(`${h.id}|${role}`) ?? null)),
      ]),
    )
  }

  private clock(period: KpiPeriodKey): { elapsed: number; phase: ReturnType<typeof phaseOf> } {
    const { from, to } = spansOf(period).current
    const today = vietnamToday()
    return { elapsed: elapsedOf(from, to, today), phase: phaseOf(from, to, today) }
  }

  private context(
    period: KpiPeriodKey,
    values: ScoreContext['values'],
    rows: Parameters<typeof slotsOf>[0],
  ): ScoreContext {
    const { elapsed, phase } = this.clock(period)
    return { values, slots: slotsOf(rows), elapsed, running: phase === 'running' }
  }

  /** A closed month is read-only: its targets are what the month was judged
   *  against. The running month and every future one stay open — a target is
   *  meant to be agreed before its month starts. */
  private stillOpen(period: KpiPeriodKey): void {
    if (this.clock(period).phase === 'closed') {
      throw conflict('Tháng này đã kết thúc nên chỉ tiêu của nó không còn thay đổi được.')
    }
  }

  /** Same transaction as the rows: a replaced pending value survives only here. */
  private note(tx: Parameters<AuditRepository['write']>[1], who: Actor, payload: object) {
    return this.audit.write({ actorId: who.id, action: 'edit', note: JSON.stringify(payload) }, tx)
  }
}
