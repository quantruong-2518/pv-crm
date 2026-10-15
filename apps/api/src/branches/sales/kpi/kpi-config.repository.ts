import { eq, inArray, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { RoleId } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import {
  kpiRoleMetric,
  type KpiRoleMetricRowDb,
  type KpiRoleMetricValues,
} from './kpi-config.schema'

/** SQL of the KPI metric overlay (ADR 0099 §1). Decides nothing: which rows a
 *  role's config becomes is `kpi-config.service.ts`'s call. */
@Injectable()
export class KpiConfigRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Every override — at most one row per role × catalog metric. */
  overrides(handle: Db = this.db): Promise<KpiRoleMetricRowDb[]> {
    return handle.select().from(kpiRoleMetric)
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

/** A role's whole overlay replaced on the approval's `tx`. A free function, not
 *  a method: the config applier (`SalesConfigService.apply`) runs it from a
 *  module that does not hold this repository, as `contract-kind.ts` is used.
 *  An advisory lock per role, not `FOR UPDATE`: a role with no rows yet has
 *  nothing to lock, and two approvals would race to insert the same keys. */
export async function replaceRoleMetrics(
  tx: Db,
  role: RoleId,
  rows: readonly KpiRoleMetricValues[],
): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`kpi-role-metric:${role}`}))`)
  await tx.delete(kpiRoleMetric).where(eq(kpiRoleMetric.role, role))
  if (rows.length > 0) await tx.insert(kpiRoleMetric).values([...rows])
}
