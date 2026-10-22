import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  KpiTargetHistoryResponse,
  type KpiPeriodKey,
  type KpiTargetHistoryEntry,
  type KpiTargetHistoryQuery,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, invalid } from '@api/platform/http/problem'
import { KpiAllocationRepository, type KpiCounterRow } from './kpi-allocation.repository'
import { catalogDef } from './kpi-config.overlay'
import { KpiConfigRepository } from './kpi-config.repository'
import { readsPerson } from './kpi-person-access'
import { KpiSeatService } from './kpi-seat.service'
import { KpiTargetsRepository } from './kpi-targets.repository'
import { KpiTeamRepository } from './kpi-team.repository'

type Entry = KpiTargetHistoryEntry
const who = (actorId: string, name: string) => ({ actorId, name })
const num = (v: string | null): number | null => (v === null ? null : Number(v))

/** A target's version history (ADR 0099 §5), read-only, from the rows as they
 *  stand — nothing here is stored. No `actorId`: the role target's versions
 *  (`kpi_target`). With one: that person's line across the role's packages
 *  and the counters filed on it (`kpi_allocation*`, `kpi_counter`).
 *
 *  A pending role target is replaced in place, so only its latest proposal
 *  survives to be told; the replaced ones live in the audit log alone. */
@Injectable()
export class KpiHistoryService {
  constructor(
    private readonly targets: KpiTargetsRepository,
    private readonly allocations: KpiAllocationRepository,
    private readonly config: KpiConfigRepository,
    private readonly teams: KpiTeamRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
    private readonly seats: KpiSeatService,
  ) {}

  /** Someone else's line needs `kpi.view-all` — the allocation read's cut — or
   *  to read that person's team in the roster of the month (`readsPerson`). The
   *  role target is not: `GET targets` shows it, names included, on `kpi.view`.
   *  A switched-off metric keeps its history readable, so membership is the code catalog's. */
  async history(
    caller: Actor,
    period: KpiPeriodKey,
    query: KpiTargetHistoryQuery,
  ): Promise<KpiTargetHistoryResponse> {
    const { role, metricKey } = query
    const actorId = query.actorId ?? null
    if (
      actorId &&
      !(await readsPerson(this.access, this.teams, this.seats, caller, period, actorId))
    ) {
      throw denied(
        'permission-denied',
        'Bạn chỉ xem được lịch sử chỉ tiêu của mình và của thành viên nhóm bạn phụ trách.',
      )
    }
    if (!catalogDef(role, metricKey)) {
      throw invalid({ metricKey: ['Vai này không có chỉ số này.'] })
    }
    const entries = actorId
      ? await this.lineHistory(period, query, actorId)
      : await this.roleHistory(period, query)
    /* Stable sort: events of one row keep the order they were built in. */
    entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    return KpiTargetHistoryResponse.parse({ period, role, metricKey, actorId, entries })
  }

  private async roleHistory(period: KpiPeriodKey, q: KpiTargetHistoryQuery): Promise<Entry[]> {
    const rows = (await this.targets.ofPeriod(period)).filter(
      (r) => r.role === q.role && r.metricKey === q.metricKey,
    )
    return rows.flatMap((r): Entry[] => {
      const base = { source: 'role-target' as const, version: r.version, value: Number(r.value) }
      const proposed: Entry = {
        ...base,
        actor: who(r.proposedById, r.proposedBy),
        at: r.proposedAt.toISOString(),
        event: 'proposed',
        note: null,
      }
      if (!r.agreedAt || !r.agreedById) return [proposed]
      const agreer = r.agreedBy ? who(r.agreedById, r.agreedBy) : null
      const at = r.agreedAt.toISOString()
      return [proposed, { ...base, actor: agreer, at, event: 'agreed', note: null }]
    })
  }

  /** A draft was never handed down, so it has no history yet. A superseded
   *  package is stamped by the creation of the version after it — of the same
   *  tier, since versions are counted per tier. */
  private async lineHistory(
    period: KpiPeriodKey,
    q: KpiTargetHistoryQuery,
    actorId: string,
  ): Promise<Entry[]> {
    const ofRole = (await this.allocations.packages(period)).filter((p) => p.role === q.role)
    const [lines, counters] = await Promise.all([
      this.allocations.lines(ofRole.map((p) => p.id)),
      this.allocations.counters(period),
    ])
    const held = new Set(lines.filter((l) => l.actorId === actorId).map((l) => l.allocationId))
    const tiers = new Set(ofRole.filter((p) => held.has(p.id)).map((p) => p.teamId ?? ''))
    const packages = ofRole.filter((p) => tiers.has(p.teamId ?? ''))
    const mine = counters.filter(
      (c) => c.role === q.role && c.actorId === actorId && c.metricKey === q.metricKey,
    )
    const names = await this.config.names(mine.flatMap((c) => (c.resolvedBy ? [c.resolvedBy] : [])))
    const version = new Map(packages.map((p) => [p.id, p.version]))

    const sent = packages.flatMap((p): Entry[] => {
      const line = lines.find(
        (l) => l.allocationId === p.id && l.actorId === actorId && l.metricKey === q.metricKey,
      )
      if (!line || !p.submittedAt) return []
      const base = { source: 'allocation' as const, version: p.version, note: null }
      const value = Number(line.value)
      const out: Entry[] = [
        {
          ...base,
          value,
          actor: who(p.submittedBy, p.submitter),
          at: iso(p.submittedAt),
          event: 'submitted',
        },
      ]
      if (p.decidedAt && p.decidedBy) {
        const decider = p.decider ? who(p.decidedBy, p.decider) : null
        const at = iso(p.decidedAt)
        out.push(
          p.returnReason
            ? { ...base, value: null, actor: decider, at, event: 'returned', note: p.returnReason }
            : { ...base, value, actor: decider, at, event: 'agreed' },
        )
      }
      const next = packages.find((n) => n.version > p.version)
      if (p.status === 'superseded' && next) {
        out.push({
          ...base,
          value: null,
          actor: null,
          at: iso(next.createdAt),
          event: 'superseded',
        })
      }
      return out
    })
    const filed = mine.flatMap((c) => counterEvents(c, version.get(c.allocationId) ?? 1, names))
    return [...sent, ...filed]
  }
}

const iso = (d: Date): string => d.toISOString()

/** The holder's counter, then the manager's answer: `accept` takes the
 *  holder's number, `counter` names another, `keep` holds the old one. */
function counterEvents(c: KpiCounterRow, version: number, names: Map<string, string>): Entry[] {
  const base = { source: 'allocation' as const, version }
  const filed: Entry = {
    ...base,
    value: Number(c.proposedValue),
    actor: who(c.actorId, c.name),
    at: iso(c.createdAt),
    event: 'countered',
    note: c.reason,
  }
  if (c.status === 'open' || !c.resolvedAt || !c.resolvedBy) return [filed]
  const actor = who(c.resolvedBy, names.get(c.resolvedBy) ?? c.resolvedBy)
  const at = iso(c.resolvedAt)
  const answer: Entry =
    c.status === 'accepted'
      ? { ...base, value: Number(c.proposedValue), actor, at, event: 'accepted', note: null }
      : c.status === 'countered'
        ? { ...base, value: num(c.counterValue), actor, at, event: 'countered', note: null }
        : { ...base, value: null, actor, at, event: 'kept', note: null }
  return [filed, answer]
}
