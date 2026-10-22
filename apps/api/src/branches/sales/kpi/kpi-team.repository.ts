import { and, eq, inArray, isNotNull, lte, max, ne, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { KpiPeriodKey, RoleId } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { spansOf } from '../performance/performance-period'
import { kpiAllocation } from './kpi-allocation.schema'
import { vietnamToday } from './kpi-rules'
import { kpiTeam, kpiTeamMember, kpiTeamRoster, type KpiTeamMemberValues } from './kpi-team.schema'

/** One person in one team of one roster; the shape the allocation side reads. */
export type RosterEntry = { teamId: string; teamName: string; actorId: string; lead: boolean }
export type ActorFace = { id: string; name: string; roleIds: RoleId[] }
export type RosterFace = ActorFace & { locked: boolean }

const nextMonth = (period: KpiPeriodKey): KpiPeriodKey => spansOf(period).current.to.slice(0, 7)

/** SQL of the team roster (ADR 0101). Decides nothing: who may be a member,
 *  which month a write lands on, what a refusal says — all the service's.
 *
 *  Writers take `tx` from outside, `kpi-allocation.repository.ts`'s reason: a
 *  roster write and its audit line are one transaction. The roster of month P
 *  is the one whose header has the greatest `from_period <= P`. */
@Injectable()
export class KpiTeamRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** One lock for every roster write and every allocation send, so a team edit
   *  and a send cannot cross (ADR 0101 default 11). Released with the transaction. */
  async lockRoster(tx: Db): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('sales.kpi_team_roster'))`)
  }

  /** The roster in force for `period`; no header at or before it means no teams. */
  async rosterAt(period: string, handle: Db = this.db): Promise<RosterEntry[]> {
    const [head] = await handle
      .select({ from: max(kpiTeamRoster.fromPeriod) })
      .from(kpiTeamRoster)
      .where(lte(kpiTeamRoster.fromPeriod, period))
    if (!head?.from) return []
    return handle
      .select({
        teamId: kpiTeamMember.teamId,
        teamName: kpiTeam.name,
        actorId: kpiTeamMember.actorId,
        lead: kpiTeamMember.lead,
      })
      .from(kpiTeamMember)
      .innerJoin(kpiTeam, eq(kpiTeam.id, kpiTeamMember.teamId))
      .where(eq(kpiTeamMember.fromPeriod, head.from))
  }

  /** The month after the last one anything was sent for, at either tier, and
   *  never before this month: a header written earlier would also be the roster
   *  in force for every later month already sent. `superseded` counts as sent. */
  async effectiveFrom(handle: Db = this.db): Promise<KpiPeriodKey> {
    const now = vietnamToday().slice(0, 7)
    const [row] = await handle
      .select({ last: max(kpiAllocation.period) })
      .from(kpiAllocation)
      .where(and(sql`${kpiAllocation.period} >= ${now}`, ne(kpiAllocation.status, 'draft')))
    return row?.last ? nextMonth(row.last) : now
  }

  /** Names and roles of the given actors, enabled or not: a roster keeps showing
   *  someone who has since left. */
  actors(ids: readonly string[], handle: Db = this.db): Promise<RosterFace[]> {
    if (ids.length === 0) return Promise.resolve([])
    return handle
      .select({
        id: actor.id,
        name: actor.name,
        roleIds: actor.roleIds,
        locked: sql<boolean>`${actor.disabledAt} IS NOT NULL`,
      })
      .from(actor)
      .where(inArray(actor.id, [...ids]))
  }

  /** Which of these actors are locked out (ADR 0101 default: a team whose lead
   *  is locked is run by a `kpi.set-target` holder). */
  async disabledAmong(ids: readonly string[], handle: Db = this.db): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const rows = await handle
      .select({ id: actor.id })
      .from(actor)
      .where(and(inArray(actor.id, [...ids]), isNotNull(actor.disabledAt)))
    return new Set(rows.map((r) => r.id))
  }

  /** Makes sure roster `period` exists and stamps it. A new header starts as a
   *  copy of the roster in force, read BEFORE the header exists — afterwards
   *  `rosterAt(period)` would answer with the empty new one. */
  async openRoster(tx: Db, period: KpiPeriodKey, by: string): Promise<void> {
    const [own] = await tx
      .select({ from: kpiTeamRoster.fromPeriod })
      .from(kpiTeamRoster)
      .where(eq(kpiTeamRoster.fromPeriod, period))
    if (own) {
      await tx
        .update(kpiTeamRoster)
        .set({ savedBy: by, savedAt: new Date() })
        .where(eq(kpiTeamRoster.fromPeriod, period))
      return
    }
    const base = await this.rosterAt(period, tx)
    await tx.insert(kpiTeamRoster).values({ fromPeriod: period, savedBy: by })
    await this.addMembers(
      tx,
      base.map((r) => ({ fromPeriod: period, ...r })),
    )
  }

  async addMembers(
    tx: Db,
    rows: readonly Pick<KpiTeamMemberValues, 'fromPeriod' | 'teamId' | 'actorId' | 'lead'>[],
  ): Promise<void> {
    if (rows.length === 0) return
    await tx.insert(kpiTeamMember).values(
      rows.map((r) => ({
        fromPeriod: r.fromPeriod,
        teamId: r.teamId,
        actorId: r.actorId,
        lead: r.lead,
      })),
    )
  }

  /** Drops one team's members from one roster; the team row itself stays. */
  async removeTeam(tx: Db, period: KpiPeriodKey, teamId: string): Promise<void> {
    await tx
      .delete(kpiTeamMember)
      .where(and(eq(kpiTeamMember.fromPeriod, period), eq(kpiTeamMember.teamId, teamId)))
  }

  async insertTeam(tx: Db, name: string, by: string): Promise<string> {
    const [row] = await tx.insert(kpiTeam).values({ name, createdBy: by }).returning()
    if (!row) throw new Error('kpi_team insert returned no row')
    return row.id
  }

  async renameTeam(tx: Db, teamId: string, name: string): Promise<void> {
    await tx.update(kpiTeam).set({ name }).where(eq(kpiTeam.id, teamId))
  }
}
