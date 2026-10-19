import type { BadgeProps } from '@pv/ui'
import {
  KPI_CATALOG,
  KPI_COUNTER_STATUS_LABEL,
  type KpiAckState,
  type KpiAllocation,
  type KpiAllocationStatus,
  type KpiCounter,
  type KpiCounterStatus,
  type KpiMetricDef,
  type KpiTeam,
  type KpiTeamRef,
  type KpiUnit,
  type RoleId,
} from '@pv/contracts'
import { userMessage, type ApiError } from '@/app/api'
import { dmhm } from '@/lib/date'
import { MONTH_PARAM } from './kpi-model'

/** What the allocation, proposal and receipt screens share and is not a
 *  component: the status words, the two paths, a role carried in the address,
 *  and how a refused write is told. No render, no fetch.
 *
 *  The label maps live here rather than in `@pv/contracts` only because no
 *  other screen prints them yet. */

type Tone = NonNullable<BadgeProps['tone']>

export const PACKAGE_LABEL: Record<KpiAllocationStatus, { text: string; tone: Tone }> = {
  draft: { text: 'Bản nháp', tone: 'draft' },
  submitted: { text: 'Chờ duyệt', tone: 'warning' },
  returned: { text: 'Bị trả lại', tone: 'danger' },
  agreed: { text: 'Đã duyệt', tone: 'success' },
  superseded: { text: 'Đang áp dụng', tone: 'success' },
}

/** A holder's answer to a line, one wording for the holder and the manager alike.
 *  `lapsed`: the deadline passed unanswered, so the head's level applies. */
export const ACK_LABEL: Record<KpiAckState, { text: string; tone: Tone }> = {
  pending: { text: 'Chưa xác nhận', tone: 'warning' },
  countered: { text: 'Xin đổi mức', tone: 'running' },
  acknowledged: { text: 'Đã xác nhận', tone: 'success' },
  lapsed: { text: 'Hết hạn trả lời', tone: 'draft' },
}

export const COUNTER_LABEL: Record<KpiCounterStatus, { text: string; tone: Tone }> = {
  open: { text: KPI_COUNTER_STATUS_LABEL.open, tone: 'warning' },
  accepted: { text: KPI_COUNTER_STATUS_LABEL.accepted, tone: 'success' },
  kept: { text: KPI_COUNTER_STATUS_LABEL.kept, tone: 'draft' },
  countered: { text: KPI_COUNTER_STATUS_LABEL.countered, tone: 'running' },
}

export const ALLOCATE_PATH = '/sales/kpi/allocation'
export const PROPOSALS_PATH = '/sales/kpi/proposals'
export const TARGETS_PATH = '/sales/kpi/targets'

/** The team page reads the month from the same query name as every KPI screen. */
export const teamPath = (teamId: string, period: string) =>
  `/sales/kpi/team/${encodeURIComponent(teamId)}?${MONTH_PARAM}=${period}`

export const monthQuery = (period: string) => `?${MONTH_PARAM}=${period}`
export const roleQuery = (period: string, role: RoleId, teamId?: string) =>
  `${monthQuery(period)}&role=${encodeURIComponent(role)}${
    teamId ? `&team=${encodeURIComponent(teamId)}` : ''
  }`

/** The team's name after a role, for a package or counter that sits on a team. */
export const teamSuffix = (team: KpiTeamRef | null) => (team ? ` · Nhóm ${team.name}` : '')

/** A team the room package splits a share to. */
export type TeamRow = { id: string; name: string; memberCount: number }

/** Teams with someone holding the role, plus any team a saved share still names
 *  after the roster moved: a share must stay visible to be cleared. */
export function teamRowsOf(
  role: RoleId,
  teams: readonly KpiTeam[],
  room: KpiAllocation | undefined,
): TeamRow[] {
  const rows = teams.flatMap((t) => {
    const memberCount = t.members.filter((m) => m.roleIds.includes(role)).length
    return memberCount > 0 ? [{ id: t.id, name: t.name, memberCount }] : []
  })
  const known = new Set(rows.map((r) => r.id))
  const strays = (room?.shares ?? []).filter((s) => !known.has(s.team.id) && known.add(s.team.id))
  return [
    ...rows,
    ...strays.map((s) => ({ id: s.team.id, name: s.team.name, memberCount: s.memberCount })),
  ]
}

/** A team's box key, prefixed so it never meets an actor's key in one `edits` map. */
export const teamCellKey = (teamId: string, metric: string) => `team/${teamId}|${metric}`

/** The share the room package holds for a team and metric, if saved. */
export const savedShare = (pkg: KpiAllocation | undefined, teamId: string, metric: string) =>
  pkg?.shares.find((s) => s.team.id === teamId && s.metricKey === metric)

/** Where a team's own package stands, as the head reads it under the team row.
 *  A changed share outranks the stored status: the package in force no longer
 *  matches what the room gave the team. */
export function teamStatusOf(pkg: KpiAllocation | undefined): { text: string; tone: Tone } {
  if (!pkg || pkg.status === 'draft') return { text: 'Chưa chia cho thành viên', tone: 'draft' }
  if (pkg.shareChanged) return { text: 'Phần của nhóm đã đổi, chờ chia lại', tone: 'warning' }
  if (pkg.status === 'submitted') return { text: 'Chờ duyệt', tone: 'warning' }
  if (pkg.status === 'returned') return { text: 'Bị trả lại', tone: 'danger' }
  return { text: 'Đã duyệt', tone: 'success' }
}

/** A stored value as the text a manager would type: `parseTyped` reads it back. */
export function typedOf(unit: KpiUnit, value: number): string {
  if (unit === 'count' || unit === 'money') {
    return value.toLocaleString('vi-VN', { maximumFractionDigits: 0 })
  }
  const shown = unit === 'ratio' ? value * 100 : value
  return shown.toLocaleString('vi-VN', { maximumFractionDigits: 2, useGrouping: false })
}

/** Name, verb and time; the verb and time alone when the name is missing. */
export function actedAt(who: { name: string } | null, verb: string, at: string): string {
  const when = `lúc ${dmhm(at)}`
  return who
    ? `${who.name} ${verb} ${when}`
    : `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${when}`
}

/** Said after a 409 where the refusal means the line moved under the reader. */
export const MOVED = 'Số vừa thay đổi, xem lại rồi bấm lại.'

/** A 409 carries the server's own sentence; a 400 names the field it refused. */
export function failText(error: ApiError): string {
  if (error.kind !== 'invalid-data') return userMessage(error)
  return Object.values(error.errors ?? {}).flat()[0] ?? userMessage(error)
}

/** The code catalog, not the effective one (`data/kpi-catalog.ts`): a counter
 *  filed before its metric was switched off still needs its unit to be printed
 *  and answered — the server reads it the same way (`catalogDef`). */
export const defOfCounter = (c: KpiCounter): KpiMetricDef | undefined =>
  KPI_CATALOG[c.role].find((d) => d.key === c.metricKey)
