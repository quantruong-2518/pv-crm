import type { BadgeProps } from '@pv/ui'
import {
  KPI_CATALOG,
  KPI_COUNTER_STATUS_LABEL,
  type KpiAckState,
  type KpiAllocationStatus,
  type KpiCounter,
  type KpiCounterStatus,
  type KpiMetricDef,
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

export const monthQuery = (period: string) => `?${MONTH_PARAM}=${period}`
export const roleQuery = (period: string, role: RoleId) =>
  `${monthQuery(period)}&role=${encodeURIComponent(role)}`

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
