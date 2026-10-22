import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  OrgTreeResponse,
  type OrgMemberBody,
  type OrgUnitCreateBody,
  type OrgUnitKind,
  type OrgUnitUpdateBody,
} from '@pv/contracts'
import { AuditRepository } from '../audit/audit.repository'
import type { Db } from '../db/db.module'
import type { OrgMemberRowDb, OrgNodeRowDb } from '../db/org.schema'
import { ACCESS } from '../engines/tokens'
import { conflict, denied, invalid, notFound } from '../http/problem'
import { RolePermissionRepository } from '../roles/role-permission.repository'
import { ORG_HOOK, type OrgHook } from './org-hook'
import { ownPath, seedOf, unitsOf } from './org.mapper'
import { OrgRepository, type OrgSeed } from './org.repository'

/** Where the tree starts when no version exists yet (ADR 0118 §8); once one
 *  does, its first month is read, not this. */
const TREE_START = '2026-12'
const COMPANY_NAME = 'Công ty'

/** Who may hang under whom (ADR 0118 §1). Strict enough that no move can make
 *  a cycle: only the company takes departments, and nothing hangs under a team. */
const PARENT_KINDS: Record<Exclude<OrgUnitKind, 'company'>, readonly OrgUnitKind[]> = {
  department: ['company'],
  team: ['company', 'department'],
}

type Tree = { nodes: Map<string, OrgNodeRowDb>; members: OrgMemberRowDb[] }
type Note = Record<string, unknown>

/** The org tree (ADR 0118). Every write is a KPI target setter's, runs under
 *  the KPI roster's lock, picks `editableFrom` inside it, copies the version in
 *  force there if that month has no header yet (the KPI roster if no version
 *  exists at all), checks the door rules against that copy, writes one audit
 *  line, and answers with the tree at that month. The database holds every
 *  invariant but the kind ladder and the view-all rule; the checks here exist
 *  so a refusal names the field instead of surfacing as a constraint error. */
@Injectable()
export class OrgService {
  constructor(
    private readonly repo: OrgRepository,
    private readonly audit: AuditRepository,
    private readonly roles: RolePermissionRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
    @Inject(ORG_HOOK) private readonly hook: OrgHook,
  ) {}

  /** Without `kpi.view-all`: the caller's own path only (`ownPath`), and names
   *  only of the people shown unless the caller also edits. */
  async read(who: Actor, period: string): Promise<OrgTreeResponse> {
    const from = await this.repo.versionAt(period)
    const editableFrom = await this.editableFrom()
    const { nodes, members } = await this.rowsAt(period, from, editableFrom)
    const faces = await this.repo.people([...new Set(members.map((m) => m.actorId))])
    const all = this.access.allows(who, 'kpi.view-all')
    const units = all
      ? unitsOf(nodes, members, faces)
      : ownPath(unitsOf(nodes, members, faces), who.id)
    const shown = new Set(units.flatMap((u) => u.memberIds))
    const named = all && this.access.allows(who, 'kpi.set-target')
    return OrgTreeResponse.parse({
      period,
      fromPeriod: from,
      editableFrom,
      units,
      people: faces
        .filter((p) => named || shown.has(p.id))
        .map((p) => ({ actorId: p.id, name: p.name, roleIds: p.roleIds })),
    })
  }

  /** The version's rows; with no version at all, from the month the first write
   *  would land on, the seed it would write (`fromPeriod` stays null). */
  private async rowsAt(
    period: string,
    from: string | null,
    editableFrom: string,
  ): Promise<OrgSeed> {
    if (from) {
      const [nodes, members] = await Promise.all([this.repo.nodes(from), this.repo.members(from)])
      return { nodes, members }
    }
    if (period < editableFrom || (await this.repo.firstVersion()) !== null)
      return { nodes: [], members: [] }
    return seedOf(await this.hook.rosterAt(editableFrom), COMPANY_NAME)
  }

  create(who: Actor, body: OrgUnitCreateBody): Promise<OrgTreeResponse> {
    return this.write(who, async (tx, at, tree) => {
      assertParent(tree, body.kind, body.parentId)
      const unitId = crypto.randomUUID()
      await this.repo.insertNode(tx, { fromPeriod: at, unitId, ...body })
      if (body.kind === 'team')
        await this.hook.teamSaved(tx, { id: unitId, name: body.name, by: who.id })
      return { org: 'unit-created', unitId, ...body }
    })
  }

  update(who: Actor, unitId: string, body: OrgUnitUpdateBody): Promise<OrgTreeResponse> {
    return this.write(who, async (tx, at, tree) => {
      const unit = unitIn(tree, unitId)
      const { headId, name, parentId } = body
      if (parentId !== undefined) {
        if (unit.kind === 'company') throw invalid({ parentId: ['Công ty luôn ở gốc cây.'] })
        assertParent(tree, unit.kind, parentId)
      }
      if (headId && !tree.members.some((m) => m.unitId === unitId && m.actorId === headId))
        throw invalid({ headId: ['Trưởng đơn vị phải là người trong đơn vị này.'] })
      if (headId && !(await this.repo.isPlaceable(headId, tx)))
        throw invalid({ headId: ['Chỉ chọn được người đang làm việc ở Kinh doanh.'] })
      if (name !== undefined) await this.repo.renameUnit(tx, unitId, name)
      if (parentId !== undefined) await this.repo.moveNode(tx, at, unitId, parentId)
      if (headId !== undefined) {
        await this.repo.clearHead(tx, at, unitId)
        if (headId) await this.repo.markHead(tx, at, headId)
        await this.assertViewersHead(tx, at, unit, 'headId')
      }
      if (unit.kind === 'team' && name !== undefined)
        await this.hook.teamSaved(tx, { id: unitId, name, by: who.id })
      return { org: 'unit-updated', unitId, ...body }
    })
  }

  remove(who: Actor, unitId: string): Promise<OrgTreeResponse> {
    return this.write(who, async (tx, at, tree) => {
      const unit = unitIn(tree, unitId)
      if (unit.kind === 'company') throw conflict('Công ty là gốc của cây, không xoá được.')
      const children = [...tree.nodes.values()].filter((n) => n.parentId === unitId).length
      const people = tree.members.filter((m) => m.unitId === unitId).length
      if (children > 0 || people > 0)
        throw conflict(
          `Đơn vị còn ${children} đơn vị con và ${people} người. Chuyển hết đi rồi mới xoá được.`,
        )
      await this.repo.deleteNode(tx, at, unitId)
      return { org: 'unit-removed', unitId }
    })
  }

  /** Placing moves: the person leaves their old unit in the same version. */
  place(who: Actor, actorId: string, body: OrgMemberBody): Promise<OrgTreeResponse> {
    return this.write(who, async (tx, at, tree) => {
      const unit = unitIn(tree, body.unitId)
      if (!(await this.repo.isPlaceable(actorId, tx)))
        throw invalid({ actorId: ['Chỉ xếp được người đang làm việc ở Kinh doanh.'] })
      await this.repo.removeMember(tx, at, actorId)
      if (body.head) await this.repo.clearHead(tx, at, body.unitId)
      await this.repo.insertMember(tx, { fromPeriod: at, actorId, ...body })
      await this.assertViewersHead(tx, at, unit, 'head')
      return { org: 'member-placed', actorId, ...body }
    })
  }

  unplace(who: Actor, actorId: string): Promise<OrgTreeResponse> {
    return this.write(who, async (tx, at, tree) => {
      if (!tree.members.some((m) => m.actorId === actorId)) throw notFound('người này trong cây')
      await this.repo.removeMember(tx, at, actorId)
      return { org: 'member-removed', actorId }
    })
  }

  /** A team's head reads its members' KPI (`readsPerson`), so someone who reads
   *  everyone's may sit in a team only as its head. Checked after the write,
   *  inside its transaction, so a refusal rolls it back. A strict read: a
   *  failure is a 500, never "nobody holds it". */
  private async assertViewersHead(
    tx: Db,
    at: string,
    unit: OrgNodeRowDb,
    field: string,
  ): Promise<void> {
    if (unit.kind !== 'team') return
    const plain = (await this.repo.members(at, tx))
      .filter((m) => m.unitId === unit.unitId && !m.head)
      .map((m) => m.actorId)
    const viewing = await this.roles.rolesHolding('kpi.view-all', tx)
    const roles = await this.repo.rolesOf(plain, tx)
    if (plain.some((id) => (roles.get(id) ?? []).some((r) => viewing.includes(r))))
      throw invalid({
        [field]: ['Người xem được KPI của mọi người chỉ vào nhóm với vai trưởng nhóm.'],
      })
  }

  /** Setter first, on the pool; then lock, then pick the month,
   *  `KpiTeamService.write`'s reason: "which month is still unsent" must not
   *  move under the write. */
  private async write(
    who: Actor,
    apply: (tx: Db, at: string, tree: Tree) => Promise<Note>,
  ): Promise<OrgTreeResponse> {
    if (!(await this.hook.setters()).includes(who.id))
      throw denied(
        'permission-denied',
        'Chỉ người giao chỉ tiêu và xem được KPI của mọi người mới sửa được sơ đồ.',
      )
    const at = await this.repo.run(async (tx) => {
      await this.hook.lock(tx)
      const month = await this.editableFrom(tx)
      await this.repo.openVersion(tx, month, who.id, async () =>
        seedOf(await this.hook.rosterAt(month, tx), COMPANY_NAME),
      )
      const nodes = await this.repo.nodes(month, tx)
      const members = await this.repo.members(month, tx)
      const note = await apply(tx, month, {
        nodes: new Map(nodes.map((n) => [n.unitId, n])),
        members,
      })
      await this.audit.write(
        { actorId: who.id, action: 'edit', note: JSON.stringify({ ...note, from: month }) },
        tx,
      )
      return month
    })
    return this.read(who, at)
  }

  /** ADR 0118 §5: never before the tree's first month nor behind the KPI floor. */
  private async editableFrom(handle?: Db): Promise<string> {
    const first = (await this.repo.firstVersion(handle)) ?? TREE_START
    const floor = await this.hook.floor(handle)
    return first > floor ? first : floor
  }
}

function unitIn(tree: Tree, unitId: string): OrgNodeRowDb {
  const unit = tree.nodes.get(unitId)
  if (!unit) throw notFound('đơn vị')
  return unit
}

function assertParent(tree: Tree, kind: Exclude<OrgUnitKind, 'company'>, parentId: string): void {
  const parent = tree.nodes.get(parentId)
  if (!parent) throw invalid({ parentId: ['Không tìm thấy đơn vị cấp trên.'] })
  if (!PARENT_KINDS[kind].includes(parent.kind))
    throw invalid({
      parentId: [
        kind === 'department'
          ? 'Phòng ban chỉ nằm ngay dưới công ty.'
          : 'Nhóm chỉ nằm dưới công ty hoặc một phòng ban.',
      ],
    })
}
