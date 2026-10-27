import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  isTieredPeriod,
  KPI_CLOSE_GATE_LIST_CAP,
  KpiCloseGateResponse,
  type KpiCloseGateSnapshot,
  type KpiPeriodKey,
  type RoleId,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { ContractOverdueReasonService } from '../contract/contract-overdue-reason.service'
import { spansOf } from '../performance/performance-period'
import { KpiAllocationRepository, type KpiPackageRow } from './kpi-allocation.repository'
import { KpiAssignmentReader } from './kpi-assignment-read.service'
import { bigContracts, lateHeavy } from './kpi-close-gate.mapper'
import { KpiCloseRepository } from './kpi-close.repository'
import { catalogDef } from './kpi-config.overlay'
import { KpiConfigService } from './kpi-config.service'
import { KpiReadingsRepository, type KpiSeat } from './kpi-readings.repository'
import { KpiTargetsRepository } from './kpi-targets.repository'
import { slotsOf, toRoleTargets } from './kpi.mapper'

/** The close gate (ADR 0116): what is still pending for a month and which
 *  figures look unusual, read before the month close and snapshotted by it.
 *
 *  Every list is an existing read — the waiting-reasons door's rows, the
 *  allocation repository's packages and counters, the target slots — so the
 *  gate cannot disagree with the screen each item links to. `facts` is the
 *  system's view; `read` cuts it for one reader, `snapshot` stores it whole.
 *  Nothing here blocks a close. */

const cap = <T>(rows: readonly T[]): T[] => rows.slice(0, KPI_CLOSE_GATE_LIST_CAP)

/** `signed-value` as a seat: `director` carries the room series (every live
 *  contract), `sale` the own one (credited to the contract's owner). */
const signedSeat = (role: RoleId): KpiSeat => {
  const def = catalogDef(role, 'signed-value')
  if (!def) throw new Error(`kpi: ${role} carries no signed-value`)
  return { role, def }
}

const packageRef = (p: KpiPackageRow) => ({
  role: p.role,
  team: p.teamId && p.teamName ? { id: p.teamId, name: p.teamName } : null,
  version: p.version,
  submittedBy: { actorId: p.submittedBy, name: p.submitter },
  submittedAt: p.submittedAt?.toISOString() ?? null,
})

type Facts = Awaited<ReturnType<KpiCloseGateService['facts']>>

@Injectable()
export class KpiCloseGateService {
  constructor(
    private readonly readings: KpiReadingsRepository,
    private readonly targets: KpiTargetsRepository,
    private readonly allocations: KpiAllocationRepository,
    private readonly config: KpiConfigService,
    private readonly reasons: ContractOverdueReasonService,
    private readonly closes: KpiCloseRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
    private readonly assignments: KpiAssignmentReader,
  ) {}

  /** Overdue reasons, live or as stored at close, only for whoever may approve them. */
  async read(who: Actor, period: KpiPeriodKey): Promise<KpiCloseGateResponse> {
    const approves = this.access.allows(who, 'contract.approve-overdue-reason')
    const [facts, atClose] = await Promise.all([this.facts(period), this.closes.gateOf(period)])
    const counts = countsOf(facts)
    const hide = <T extends { overdueReasons: number | null }>(c: T): T =>
      approves ? c : { ...c, overdueReasons: null }
    return KpiCloseGateResponse.parse({
      period,
      counts: hide(counts),
      pending: {
        overdueReasons: approves ? cap(facts.reasons) : null,
        counters: cap(facts.counters).map((c) => ({
          ...c,
          team: c.teamId && c.teamName ? { id: c.teamId, name: c.teamName } : null,
        })),
        packagesSent: cap(facts.sent).map(packageRef),
        packagesReturned: cap(facts.returned).map(packageRef),
        packagesDraft: cap(facts.drafts).map(packageRef),
        targetsProposed: cap(facts.proposed),
      },
      flags: { bigContracts: facts.big, lateHeavy: facts.late },
      atClose: atClose && { ...atClose, counts: hide(atClose.counts) },
    })
  }

  /** What a close stores (ADR 0116 §3, default 3): the system's counts — every
   *  waiting overdue reason, whoever closes — and the flagged keys. */
  async snapshot(tx: Db, period: KpiPeriodKey): Promise<KpiCloseGateSnapshot> {
    const facts = await this.facts(period, tx)
    return {
      counts: countsOf(facts),
      bigContracts: facts.big.map((b) => b.code),
      lateHeavyActorIds: facts.late.map((l) => l.actor.actorId),
    }
  }

  /** Everything the gate knows for `period`, uncut and unfiltered by reader. */
  private async facts(period: KpiPeriodKey, handle?: Db) {
    const span = spansOf(period).current
    /* "Every contract signed before the month": no window (ADR 0116, default 1). */
    const before = { ...span, from: '1970-01-01', to: span.from }
    const room = signedSeat('director')
    const own = signedSeat('sale')
    const [catalog, reasons, counters, packages, targetRows, month, owned, earlier] =
      await Promise.all([
        this.config.effectiveCatalog(handle),
        this.reasons.waitingIn(period, handle),
        this.allocations.counters(period, handle),
        this.allocations.packages(period, handle),
        this.targets.ofPeriod(period, handle),
        this.readings.basisRows(room, span, handle),
        this.readings.basisRows(own, span, handle),
        this.readings.basisAverage(room, before, handle),
      ])
    /* Tiered months only, so an old month's counts keep their old keys (ADR 0120 §9). */
    const tiered = isTieredPeriod(period) ? await this.assignments.gateCounts(period, handle) : {}
    const proposed = toRoleTargets(slotsOf(targetRows), catalog).flatMap(({ role, metrics }) =>
      metrics.flatMap((m) => (m.pending ? [{ role, metricKey: m.key, ...m.pending }] : [])),
    )
    return {
      reasons,
      counters: counters.filter((c) => c.status === 'open'),
      sent: packages.filter((p) => p.status === 'submitted'),
      returned: packages.filter((p) => p.status === 'returned'),
      drafts: packages.filter((p) => p.status === 'draft'),
      proposed,
      big: bigContracts(month, owned, earlier),
      late: lateHeavy(owned, span.to),
      tiered,
    }
  }
}

const countsOf = (f: Facts) => ({
  overdueReasons: f.reasons.length,
  counters: f.counters.length,
  packagesSent: f.sent.length,
  packagesReturned: f.returned.length,
  packagesDraft: f.drafts.length,
  targetsProposed: f.proposed.length,
  ...f.tiered,
})
