import { z } from 'zod'
import { ContractCode, MoneyVnd } from '../primitives'
import { RoleId } from '../auth'
import { KpiMetricKey, KpiPendingTarget, KpiPeriodKey, KpiTargetActor } from './kpi'
import { KpiAllocation, KpiCounter } from './kpi-allocation'
import { OverdueReasonRow } from './contract-overdue-reason'

/** `GET /sales/kpi/:period/close-gate` (`kpi.set-target`, params `KpiPeriodParams`)
 *  — what is still pending and what looks unusual before a month close (ADR 0116).
 *
 *  Readable for a month not yet over, as a preview; the close itself still refuses
 *  it. Nothing here blocks the close. Each item carries only what a screen needs
 *  to link to the record; `counts` counts everything, the lists are capped.
 *  The close-time snapshot is served only here, not on `KpiMonthClose`: that rides
 *  on every KPI read, open to readers who may not see pending work. */

/** The gate's fixed rules (ADR 0116 §2), declared once so the screen prints the
 *  thresholds the server flags by. */
export const KPI_CLOSE_GATE_RULES = { bigContractRatio: 5, lateShare: 0.4, lateDays: 3 } as const
export const KPI_CLOSE_GATE_LIST_CAP = 5

const capped = <T extends z.ZodType>(item: T) => z.array(item).max(KPI_CLOSE_GATE_LIST_CAP)
const gateCount = z.number().int().nonnegative()

export const KpiCloseGateCounts = z.object({
  /** `null` = this reader may not approve overdue reasons, so the count is withheld — not zero.
   *  Stored in full at close; nulled per reader on the way out. */
  overdueReasons: gateCount.nullable(),
  counters: gateCount,
  packagesSent: gateCount,
  /** Sent back by the decider and not resent: not in force, unlike a superseded package. */
  packagesReturned: gateCount,
  packagesDraft: gateCount,
  targetsProposed: gateCount,
})

/** Stored with the close (ADR 0116 §3, default 3): counts and flagged keys only,
 *  since full lists go stale at once. Overdue reasons are counted in full,
 *  whatever the closer could see, so a later reader's view decides. */
export const KpiCloseGateSnapshot = z.object({
  counts: KpiCloseGateCounts,
  bigContracts: z.array(ContractCode),
  lateHeavyActorIds: z.array(z.string().min(1).max(64)),
})

const PackageRef = KpiAllocation.pick({
  role: true,
  team: true,
  version: true,
  submittedBy: true,
  submittedAt: true,
})

/** `ratio` is `value / average`, the average over every contract signed before the month.
 *  Judged over the room, so a contract with no owner can be flagged: `actor` is then `null`. */
export const KpiCloseGateBigContract = z.object({
  code: ContractCode,
  actor: KpiTargetActor.nullable(),
  value: MoneyVnd,
  average: z.number().nonnegative(),
  ratio: z.number().positive(),
})

/** `share` is `lastDaysValue / monthValue`, over the month's last Vietnam days. */
export const KpiCloseGateLateHeavy = z.object({
  actor: KpiTargetActor,
  monthValue: MoneyVnd,
  lastDaysValue: MoneyVnd,
  share: z.number().min(0).max(1),
})

export const KpiCloseGateResponse = z.object({
  period: KpiPeriodKey,
  counts: KpiCloseGateCounts,
  pending: z.object({
    /** `null` exactly when `counts.overdueReasons` is: hidden from this reader. */
    overdueReasons: capped(
      OverdueReasonRow.pick({ id: true, contractCode: true, installmentNo: true, due: true }),
    ).nullable(),
    counters: capped(
      KpiCounter.pick({
        id: true,
        actorId: true,
        name: true,
        role: true,
        team: true,
        metricKey: true,
      }),
    ),
    packagesSent: capped(PackageRef),
    packagesReturned: capped(PackageRef),
    packagesDraft: capped(PackageRef),
    targetsProposed: capped(KpiPendingTarget.extend({ role: RoleId, metricKey: KpiMetricKey })),
  }),
  flags: z.object({
    bigContracts: z.array(KpiCloseGateBigContract),
    lateHeavy: z.array(KpiCloseGateLateHeavy),
  }),
  /** What the gate showed at close; `null` while open or when closed before migration 0137. */
  atClose: KpiCloseGateSnapshot.nullable(),
})

export type KpiCloseGateCounts = z.infer<typeof KpiCloseGateCounts>
export type KpiCloseGateSnapshot = z.infer<typeof KpiCloseGateSnapshot>
export type KpiCloseGateBigContract = z.infer<typeof KpiCloseGateBigContract>
export type KpiCloseGateLateHeavy = z.infer<typeof KpiCloseGateLateHeavy>
export type KpiCloseGateResponse = z.infer<typeof KpiCloseGateResponse>
