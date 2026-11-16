import { and, eq, inArray, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { KpiPeriodKey, RoleId } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import {
  kpiFunnelTarget,
  kpiRoleMetric,
  type KpiFunnelTargetRowDb,
  type KpiFunnelTargetValues,
  type KpiRoleMetricRowDb,
  type KpiRoleMetricValues,
} from './kpi-config.schema'

/** SQL of the KPI metric overlay (ADR 0099 §1, ADR 0160 §2). Decides nothing:
 *  which set a month reads is `kpi-config.overlay.ts`'s call. */
@Injectable()
export class KpiConfigRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Every set of every role — a few rows per role and approved change. */
  overrides(handle: Db = this.db): Promise<KpiRoleMetricRowDb[]> {
    return handle.select().from(kpiRoleMetric)
  }

  /** Funnel step targets, every set's: read beside `overrides`, picked by its month. */
  funnel(handle: Db = this.db): Promise<KpiFunnelTargetRowDb[]> {
    return handle.select().from(kpiFunnelTarget)
  }

  /** Display names of the writers a read must print beside a stamp. */
  async names(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const rows = await this.db
      .select({ id: actor.id, name: actor.name })
      .from(actor)
      .where(inArray(actor.id, [...new Set(ids)]))
    return new Map(rows.map((r) => [r.id, r.name]))
  }
}

/** One role's set from month `from` replaced on the approval's `tx`; other
 *  months' sets stay, the '2000-01' v1 rows included. A free function, not a
 *  method: the config applier (`SalesConfigService.apply`) runs it from a
 *  module that does not hold this repository, as `contract-kind.ts` is used.
 *  An advisory lock per role, not `FOR UPDATE`: a set with no rows yet has
 *  nothing to lock, and two approvals would race to insert the same keys. */
export async function replaceRoleMetrics(
  tx: Db,
  role: RoleId,
  from: KpiPeriodKey,
  rows: readonly KpiRoleMetricValues[],
  funnel: readonly KpiFunnelTargetValues[],
): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`kpi-role-metric:${role}`}))`)
  await tx
    .delete(kpiRoleMetric)
    .where(and(eq(kpiRoleMetric.role, role), eq(kpiRoleMetric.fromPeriod, from)))
  await tx
    .delete(kpiFunnelTarget)
    .where(and(eq(kpiFunnelTarget.role, role), eq(kpiFunnelTarget.fromPeriod, from)))
  if (rows.length > 0) await tx.insert(kpiRoleMetric).values([...rows])
  if (funnel.length > 0) await tx.insert(kpiFunnelTarget).values([...funnel])
}
