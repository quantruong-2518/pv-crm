import type { Db } from '../db/db.module'

/** One person in one team of the KPI roster, as the first tree version copies it. */
export type OrgSeedEntry = { teamId: string; teamName: string; actorId: string; lead: boolean }

/** THE SEAM BETWEEN THE ORG TREE AND THE KPI THAT STILL OWNS ITS CALENDAR.
 *
 *  A tree edit takes the KPI roster's lock, lands after the last month KPI
 *  already sent and is made by a KPI target setter (ADR 0118 §5); the first
 *  version starts from the roster, and a team unit keeps resolving as
 *  `kpi_team.id` until wave 2e. All are `sales` facts `platform/` may not
 *  import, so the dependency runs backward, the `PIN_REACH` way:
 *  `app.module.ts` names the class (`OrgModule.withHook`). */
export interface OrgHook {
  /** The lock every roster write and allocation send takes; held to commit. */
  lock(tx: Db): Promise<void>
  /** The first month no edit may reach behind (this month at the earliest). */
  floor(handle?: Db): Promise<string>
  /** Who may edit the tree: the seat rule's setters. Read on the pool. */
  setters(): Promise<string[]>
  /** The KPI roster in force at `period`, read while no tree version exists. */
  rosterAt(period: string, handle?: Db): Promise<OrgSeedEntry[]>
  /** A team unit was created or renamed, inside the edit's transaction. */
  teamSaved(tx: Db, team: { id: string; name: string; by: string }): Promise<void>
}

export const ORG_HOOK = Symbol('pv.org.hook')
