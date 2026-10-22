import { and, arrayContains, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { RoleId } from '@pv/contracts'
import { DB, type Db } from '../db/db.module'
import {
  orgMember,
  orgNode,
  orgVersion,
  type OrgMemberRowDb,
  type OrgMemberValues,
  type OrgNodeRowDb,
  type OrgNodeValues,
} from '../db/org.schema'
import { actor } from '../db/platform.schema'
import { firstOrgVersion, orgVersionAt } from './org-version'

export type OrgFace = { id: string; name: string; roleIds: RoleId[] }
/** The first version's rows, before they get their month. */
export type OrgSeed = {
  nodes: Pick<OrgNodeRowDb, 'unitId' | 'kind' | 'name' | 'parentId'>[]
  members: Pick<OrgMemberRowDb, 'actorId' | 'unitId' | 'head'>[]
}

/** Enabled and licensed for Sales: KPI is the tree's only reader today, and
 *  that is who a Sales scorecard can belong to (`KpiReadingsRepository.people`). */
const placeable = and(isNull(actor.disabledAt), arrayContains(actor.branches, ['Sales']))

/** SQL of the org tree (ADR 0118). Decides nothing; writers take `tx` from
 *  outside so an edit and its audit line are one transaction. Which version
 *  answers for a month is `org-version.ts`'s, shared with the KPI bridge. */
@Injectable()
export class OrgRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  firstVersion(handle: Db = this.db): Promise<string | null> {
    return firstOrgVersion(handle)
  }

  versionAt(period: string, handle: Db = this.db): Promise<string | null> {
    return orgVersionAt(handle, period)
  }

  nodes(from: string, handle: Db = this.db): Promise<OrgNodeRowDb[]> {
    return handle.select().from(orgNode).where(eq(orgNode.fromPeriod, from))
  }

  members(from: string, handle: Db = this.db): Promise<OrgMemberRowDb[]> {
    return handle.select().from(orgMember).where(eq(orgMember.fromPeriod, from))
  }

  /** Makes sure version `at` exists and stamps it. A new header starts as a copy
   *  of the version in force, read BEFORE the header exists; with none at all it
   *  starts from `fresh()`. One INSERT per table, so the parent FK is checked
   *  once every row of the copy is in. */
  async openVersion(tx: Db, at: string, by: string, fresh: () => Promise<OrgSeed>): Promise<void> {
    const base = await this.versionAt(at, tx)
    if (base === at) {
      await tx
        .update(orgVersion)
        .set({ savedBy: by, savedAt: new Date() })
        .where(eq(orgVersion.fromPeriod, at))
      return
    }
    const seed = base ? null : await fresh()
    await tx.insert(orgVersion).values({ fromPeriod: at, savedBy: by })
    if (seed) {
      await tx.insert(orgNode).values(seed.nodes.map((n) => ({ ...n, fromPeriod: at })))
      if (seed.members.length > 0)
        await tx.insert(orgMember).values(seed.members.map((m) => ({ ...m, fromPeriod: at })))
      return
    }
    await tx.execute(sql`
      INSERT INTO platform.org_node (from_period, unit_id, kind, name, parent_id)
      SELECT ${at}, unit_id, kind, name, parent_id FROM platform.org_node WHERE from_period = ${base}`)
    await tx.execute(sql`
      INSERT INTO platform.org_member (from_period, actor_id, unit_id, head)
      SELECT ${at}, actor_id, unit_id, head FROM platform.org_member WHERE from_period = ${base}`)
  }

  async insertNode(tx: Db, row: OrgNodeValues): Promise<void> {
    await tx.insert(orgNode).values(row)
  }

  async moveNode(tx: Db, at: string, unitId: string, parentId: string): Promise<void> {
    await tx.update(orgNode).set({ parentId }).where(this.node(at, unitId))
  }

  /** Every version: a name is the unit's label, not part of its history. */
  async renameUnit(tx: Db, unitId: string, name: string): Promise<void> {
    await tx.update(orgNode).set({ name }).where(eq(orgNode.unitId, unitId))
  }

  async deleteNode(tx: Db, at: string, unitId: string): Promise<void> {
    await tx.delete(orgNode).where(this.node(at, unitId))
  }

  async clearHead(tx: Db, at: string, unitId: string): Promise<void> {
    await tx
      .update(orgMember)
      .set({ head: false })
      .where(and(eq(orgMember.fromPeriod, at), eq(orgMember.unitId, unitId)))
  }

  async markHead(tx: Db, at: string, actorId: string): Promise<void> {
    await tx.update(orgMember).set({ head: true }).where(this.member(at, actorId))
  }

  async insertMember(tx: Db, row: OrgMemberValues): Promise<void> {
    await tx.insert(orgMember).values(row)
  }

  async removeMember(tx: Db, at: string, actorId: string): Promise<void> {
    await tx.delete(orgMember).where(this.member(at, actorId))
  }

  /** Everyone placeable, plus `also` whatever their state: a member who has since
   *  been locked still needs a name on screen. */
  people(also: readonly string[], handle: Db = this.db): Promise<OrgFace[]> {
    return handle
      .select({ id: actor.id, name: actor.name, roleIds: actor.roleIds })
      .from(actor)
      .where(also.length > 0 ? or(placeable, inArray(actor.id, [...also])) : placeable)
      .orderBy(asc(actor.name))
  }

  /** Roles of the given actors, enabled or not. */
  async rolesOf(ids: readonly string[], handle: Db = this.db): Promise<Map<string, RoleId[]>> {
    if (ids.length === 0) return new Map()
    const rows = await handle
      .select({ id: actor.id, roleIds: actor.roleIds })
      .from(actor)
      .where(inArray(actor.id, [...ids]))
    return new Map(rows.map((r) => [r.id, r.roleIds]))
  }

  async isPlaceable(actorId: string, handle: Db = this.db): Promise<boolean> {
    const [row] = await handle
      .select({ id: actor.id })
      .from(actor)
      .where(and(eq(actor.id, actorId), placeable))
    return row !== undefined
  }

  private node(at: string, unitId: string) {
    return and(eq(orgNode.fromPeriod, at), eq(orgNode.unitId, unitId))
  }

  private member(at: string, actorId: string) {
    return and(eq(orgMember.fromPeriod, at), eq(orgMember.actorId, actorId))
  }
}
