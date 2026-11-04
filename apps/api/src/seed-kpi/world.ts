import { and, eq, gt, inArray, like } from 'drizzle-orm'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { orgMember, orgNode, orgVersion } from '@api/platform/db/org.schema'
import { campaign } from '@api/branches/sales/campaign/campaign.schema'
import { catalogOf, type KpiCatalog } from '@api/branches/sales/kpi/kpi-config.overlay'
import { kpiRoleMetric } from '@api/branches/sales/kpi/kpi-config.schema'
import { kpiAbsence } from '@api/branches/sales/kpi/kpi-absence.schema'
import { kpiAssignment } from '@api/branches/sales/kpi/kpi-assignment.schema'
import { kpiTeam } from '@api/branches/sales/kpi/kpi-team.schema'
import { kpiAcknowledgement, kpiTarget } from '@api/branches/sales/kpi/kpi.schema'
import { lead } from '@api/branches/sales/lead/lead.schema'
import { leadOrigin } from '@api/branches/sales/lead-origin/lead-origin.schema'
import { DIRECTOR, HEAD, PEOPLE, SEED_ID, SEED_MAIL, SEED_UUID, type Person } from './cast'
import { PERIODS } from './targets'
import { SEED_COMPANY, TIERED, type OrgSeen } from './org'

/** What the target database already holds that the book must respect: the
 *  real seats it leans on, rows a previous run planted (skipped, so a second
 *  `--apply` adds nothing), real targets and the real org tree of December.
 *  Reads only. `notes` are told to the operator before anything is written. */

export type World = {
  names: Map<string, string>
  newPeople: Person[]
  leadsTaken: Set<string>
  origin: Map<string, string>
  campaignOf: Map<string, string>
  catalog: KpiCatalog
  targetsTaken: Set<string>
  acksTaken: Set<string>
  absencesTaken: Set<string>
  org: OrgSeen & { version: boolean; hasCompany: boolean }
  notes: string[]
}

export async function readWorld(db: Db): Promise<World> {
  const notes: string[] = []
  const actors = await db.select().from(actor)
  for (const id of [DIRECTOR, HEAD]) {
    const row = actors.find((a) => a.id === id)
    if (!row || row.disabledAt)
      throw new Error(`Thiếu tài khoản thật ${id} (hoặc đang khoá) — dừng.`)
  }
  const clash = actors.filter(
    (a) =>
      a.email.endsWith(SEED_MAIL) !== a.id.startsWith(SEED_ID) ||
      (a.id.startsWith(SEED_ID) && !PEOPLE.some((p) => p.id === a.id)),
  )
  if (clash.length > 0)
    throw new Error(`Dấu thử bị dùng lẫn ở: ${clash.map((a) => a.id).join(', ')} — dừng.`)
  const names = new Map(actors.map((a) => [a.id, a.name]))
  PEOPLE.forEach((p) => names.set(p.id, p.name))

  const leadsTaken = new Set(
    (
      await db
        .select({ email: lead.email })
        .from(lead)
        .where(like(lead.email, `%${SEED_MAIL}`))
    ).map((r) => r.email),
  )
  const origin = new Map((await db.select().from(leadOrigin)).map((o) => [o.name, o.id]))
  const campaigns = await db
    .select({ code: campaign.code, ownerId: campaign.ownerId })
    .from(campaign)
    .where(like(campaign.ownerId, `${SEED_ID}%`))
  const catalog = catalogOf(await db.select().from(kpiRoleMetric)).catalog

  const targets = await db
    .select()
    .from(kpiTarget)
    .where(inArray(kpiTarget.period, [...PERIODS]))
  const acks = await db
    .select()
    .from(kpiAcknowledgement)
    .where(like(kpiAcknowledgement.actorId, `${SEED_ID}%`))
  const absences = await db
    .select()
    .from(kpiAbsence)
    .where(like(kpiAbsence.actorId, `${SEED_ID}%`))
  const real = targets.filter(
    (t) => ![t.proposedById, t.agreedById].some((id) => id?.startsWith(SEED_ID)),
  )
  if (real.length > 0)
    notes.push(
      `${real.length} chỉ tiêu thật tháng 09–11 đã có: giữ nguyên, người thử đọc theo chỉ tiêu đó.`,
    )

  return {
    names,
    newPeople: PEOPLE.filter((p) => !actors.some((a) => a.id === p.id)),
    leadsTaken,
    origin,
    campaignOf: new Map(campaigns.map((c) => [c.ownerId!, c.code])),
    catalog,
    targetsTaken: new Set(targets.map((t) => `${t.role}|${t.period}|${t.metricKey}`)),
    acksTaken: new Set(acks.map((a) => `${a.actorId}|${a.role}|${a.period}`)),
    absencesTaken: new Set(absences.map((a) => `${a.actorId}|${a.fromDay}`)),
    org: await readOrg(db, notes),
    notes,
  }
}

/** December's tree: the version, its root, and what the book already put there. */
async function readOrg(db: Db, notes: string[]): Promise<World['org']> {
  const [version] = await db.select().from(orgVersion).where(eq(orgVersion.fromPeriod, TIERED))
  const [root] = await db
    .select()
    .from(orgNode)
    .where(and(eq(orgNode.fromPeriod, TIERED), eq(orgNode.kind, 'company')))
  const later = await db.select().from(orgVersion).where(gt(orgVersion.fromPeriod, TIERED))
  const company = root?.unitId ?? SEED_COMPANY
  if (!version) notes.push(`Chưa có sơ đồ tháng ${TIERED}: tạo mới, gốc là "[TEST KPI] Công ty".`)
  else if (!root?.unitId.startsWith(SEED_UUID)) {
    notes.push(
      `Sơ đồ tháng ${TIERED} đã có (gốc "${root?.name ?? '—'}"): phòng thử treo dưới gốc đó.`,
    )
  }
  if (later.length > 0) {
    notes.push(
      `Sơ đồ từ ${later.map((v) => v.fromPeriod).join(', ')} đã có: không có phòng thử ở đó.`,
    )
  }
  const nodes = await db.select().from(orgNode).where(eq(orgNode.fromPeriod, TIERED))
  const members = await db.select().from(orgMember).where(eq(orgMember.fromPeriod, TIERED))
  const teams = await db.select({ id: kpiTeam.id }).from(kpiTeam)
  const sets = await db.select().from(kpiAssignment).where(eq(kpiAssignment.period, TIERED))
  const onRealRoot = sets.filter((s) => s.unitId === company && !company.startsWith(SEED_UUID))
  if (onRealRoot.length > 0) {
    notes.push(
      `Công ty đã có bộ chỉ tiêu tháng ${TIERED} cho: ${onRealRoot.map((s) => s.role).join(', ')} — không thêm bộ cấp công ty cho các vai đó.`,
    )
  }
  return {
    version: Boolean(version),
    hasCompany: Boolean(root),
    company,
    nodes: new Set(nodes.map((n) => n.unitId)),
    placed: new Set(members.map((m) => m.actorId)),
    teams: new Set(teams.map((t) => t.id)),
    slots: new Set(sets.map((s) => `${s.role}|${s.unitId}`)),
  }
}
