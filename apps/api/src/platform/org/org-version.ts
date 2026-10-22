import { eq, lte, max, min } from 'drizzle-orm'
import type { Db } from '../db/db.module'
import { orgNode, orgVersion } from '../db/org.schema'

/** Which org tree version answers for a month (ADR 0118 §2), in one place.
 *  Plain functions on a handle, not a provider, so the KPI bridge can call
 *  them without importing `OrgModule` (that module imports KPI's hook). */

/** The version in force for `period`: the greatest `from_period <= period`. */
export async function orgVersionAt(handle: Db, period: string): Promise<string | null> {
  const [row] = await handle
    .select({ from: max(orgVersion.fromPeriod) })
    .from(orgVersion)
    .where(lte(orgVersion.fromPeriod, period))
  return row?.from ?? null
}

/** The tree's first month, or null while no version exists. */
export async function firstOrgVersion(handle: Db): Promise<string | null> {
  const [row] = await handle.select({ from: min(orgVersion.fromPeriod) }).from(orgVersion)
  return row?.from ?? null
}

/** Is this id a unit of any version: its name is then the tree's to change. */
export async function isOrgUnit(handle: Db, unitId: string): Promise<boolean> {
  const [row] = await handle
    .select({ id: orgNode.unitId })
    .from(orgNode)
    .where(eq(orgNode.unitId, unitId))
    .limit(1)
  return row !== undefined
}
