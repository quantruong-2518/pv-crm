import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  KpiTeamRosterResponse,
  ROLE_LABEL,
  type KpiPeriodKey,
  type KpiTeamBody,
  type RoleId,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import { KpiReadingsRepository } from './kpi-readings.repository'
import { rosterOf } from './kpi-allocation-team'
import { monthLabel } from './kpi-alert.service'
import { KpiSeatService } from './kpi-seat.service'
import { memberOf, teamsOf } from './kpi-team.mapper'
import { KpiTeamRepository, type ActorFace } from './kpi-team.repository'

/** Roles that carry a personal KPI; director and head-of-sales split them instead. */
const TEAM_ROLES: readonly RoleId[] = ['marketing', 'bd', 'presales', 'sale', 'account-executive']
/** Holding either keeps a person out of every team, whatever else they hold. */
const SPLITTERS: readonly RoleId[] = ['director', 'head-of-sales']

/** The KPI team roster (ADR 0101). A write never edits a month already handed
 *  down: it lands on `effectiveFrom`, the month after the last month anything
 *  was sent for (never before this month), under the roster lock so an
 *  allocation send cannot cross it.
 *
 *  Team edits are direct under `kpi.set-target`, not through the config
 *  approval flow (default 2): a roster is a list of names, not a target.
 *  Renaming is immediate and also relabels past months, since the name lives on
 *  the team row. */
@Injectable()
export class KpiTeamService {
  constructor(
    private readonly repo: KpiTeamRepository,
    private readonly readings: KpiReadingsRepository,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
    private readonly seats: KpiSeatService,
  ) {}

  /** Without `kpi.view-all`: only the caller's own team and no unassigned list. */
  async read(who: Actor, period: KpiPeriodKey): Promise<KpiTeamRosterResponse> {
    const [entries, editableFrom] = await Promise.all([
      this.repo.rosterAt(period),
      this.repo.effectiveFrom(),
    ])
    const mine = entries.find((e) => e.actorId === who.id)
    const all = this.access.allows(who, 'kpi.view-all')
    const faces = new Map(
      (await this.repo.actors([...new Set(entries.map((e) => e.actorId))])).map((a) => [a.id, a]),
    )
    const roster = rosterOf(entries)
    const acting = await this.seats.actingFor(roster, [...new Set(entries.map((e) => e.teamId))])
    const teams = teamsOf(entries, faces, acting).filter((t) => all || t.id === mine?.teamId)
    /* "Acts for my team" (ADR 0117), as the team page's: a stand-in member is true, an away lead false. */
    const actsForLead = mine
      ? ((await this.seats.leadSeats(roster, [mine.teamId])).get(mine.teamId) ?? []).includes(
          who.id,
        )
      : false
    const inTeam = new Set(entries.map((e) => e.actorId))
    const unassigned = all
      ? (await this.eligible()).filter((a) => !inTeam.has(a.id)).map((a) => memberOf(a, false))
      : []
    return KpiTeamRosterResponse.parse({
      period,
      editableFrom,
      teams,
      unassigned,
      myTeamId: mine?.teamId ?? null,
      actsForLead,
    })
  }

  async create(who: Actor, body: KpiTeamBody): Promise<KpiTeamRosterResponse> {
    await this.assertRosterMonth(await this.repo.effectiveFrom())
    await this.assertEligible(body.memberIds)
    return this.write(who, async (tx, at) => {
      await this.assertFree(tx, at, body.memberIds)
      const teamId = await this.repo.insertTeam(tx, body.name, who.id)
      await this.repo.addMembers(tx, membersOf(at, teamId, body))
      return { kpi: 'team-created', teamId }
    })
  }

  /** A team that is also a tree unit keeps its members editable here for months
   *  before the tree, but not its name: one label lives in the tree (ADR 0118). */
  async update(who: Actor, teamId: string, body: KpiTeamBody): Promise<KpiTeamRosterResponse> {
    await this.assertRosterMonth(await this.repo.effectiveFrom())
    await this.assertEligible(body.memberIds)
    return this.write(who, async (tx, at) => {
      const name = await this.assertInRoster(tx, at, teamId)
      if (name !== body.name && (await this.repo.isTreeUnit(teamId, tx)))
        throw conflict('Đổi tên nhóm ở mục Phòng ban & nhóm.')
      await this.repo.removeTeam(tx, at, teamId)
      await this.assertFree(tx, at, body.memberIds)
      await this.repo.addMembers(tx, membersOf(at, teamId, body))
      await this.repo.renameTeam(tx, teamId, body.name)
      return { kpi: 'team-updated', teamId }
    })
  }

  async remove(who: Actor, teamId: string): Promise<KpiTeamRosterResponse> {
    return this.write(who, async (tx, at) => {
      await this.assertInRoster(tx, at, teamId)
      if (await this.repo.isTreeUnit(teamId, tx)) throw conflict('Xoá nhóm ở mục Phòng ban & nhóm.')
      await this.repo.removeTeam(tx, at, teamId)
      return { kpi: 'team-removed', teamId }
    })
  }

  /** Lock first, then pick the month: the answer to "which month is still
   *  unsent" must not change between the pick and the write. */
  private async write(
    who: Actor,
    apply: (tx: Db, at: KpiPeriodKey) => Promise<{ kpi: string; teamId: string }>,
  ): Promise<KpiTeamRosterResponse> {
    const at = await this.repo.run(async (tx) => {
      await this.repo.lockRoster(tx)
      const month = await this.repo.effectiveFrom(tx)
      await this.assertRosterMonth(month, tx)
      await this.repo.openRoster(tx, month, who.id)
      const note = await apply(tx, month)
      await this.audit.write(
        { actorId: who.id, action: 'edit', note: JSON.stringify({ ...note, from: month }) },
        tx,
      )
      return month
    })
    return this.read(who, at)
  }

  private async eligible(): Promise<ActorFace[]> {
    return (await this.readings.people()).filter(
      (p) =>
        p.roleIds.some((r) => TEAM_ROLES.includes(r)) &&
        !p.roleIds.some((r) => SPLITTERS.includes(r)),
    )
  }

  /** 400 naming the people, so the form can say whom to take out. */
  private async assertEligible(ids: readonly string[]): Promise<void> {
    const ok = new Set((await this.eligible()).map((a) => a.id))
    const bad = ids.filter((id) => !ok.has(id))
    if (bad.length === 0) return
    const names = (await this.repo.actors(bad)).map((a) => a.name)
    const roles = TEAM_ROLES.map((r) => ROLE_LABEL[r]).join(', ')
    const splitters = SPLITTERS.map((r) => ROLE_LABEL[r]).join(', ')
    throw invalid({
      memberIds: [
        `${names.length > 0 ? names.join(', ') : 'Người được chọn'} chưa vào nhóm được. Cần đang làm việc, giữ vai ${roles} và không giữ vai ${splitters}.`,
      ],
    })
  }

  /** The roster at `at` as it stands now, minus the team being rewritten. */
  private async assertFree(tx: Db, at: KpiPeriodKey, ids: readonly string[]): Promise<void> {
    const taken = (await this.repo.rosterAt(at, tx)).filter((e) => ids.includes(e.actorId))
    if (taken.length === 0) return
    const names = new Map(
      (
        await this.repo.actors(
          taken.map((e) => e.actorId),
          tx,
        )
      ).map((a) => [a.id, a.name]),
    )
    throw conflict(
      taken.map((e) => `${names.get(e.actorId) ?? e.actorId} đang ở nhóm ${e.teamName}.`).join(' '),
      { memberIds: taken.map((e) => e.actorId) },
    )
  }

  /** The team's name, or 404 when it is not in the roster at `at`. */
  private async assertInRoster(tx: Db, at: KpiPeriodKey, teamId: string): Promise<string> {
    const entry = (await this.repo.rosterAt(at, tx)).find((e) => e.teamId === teamId)
    if (!entry) throw notFound('nhóm')
    return entry.teamName
  }

  /** The tree owns every month from its first (ADR 0118 §7): a roster header
   *  there would never be read. Months before it stay this door's. */
  private async assertRosterMonth(month: KpiPeriodKey, handle?: Db): Promise<void> {
    const start = await this.repo.treeStart(handle)
    if (start !== null && month >= start)
      throw conflict(`Nhóm từ ${monthLabel(month)} được sửa ở mục Phòng ban & nhóm.`)
  }
}

const membersOf = (at: KpiPeriodKey, teamId: string, body: KpiTeamBody) =>
  body.memberIds.map((actorId) => ({
    fromPeriod: at,
    teamId,
    actorId,
    lead: actorId === body.leadId,
  }))
