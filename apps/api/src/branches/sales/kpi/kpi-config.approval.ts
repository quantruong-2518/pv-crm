import {
  KPI_DEFAULT_OFF,
  KPI_METRIC_LABEL,
  KpiAlertPatch,
  KpiRoleMetricsPatch,
  ROLE_LABEL,
  type KpiMetricKey,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict } from '@api/platform/http/problem'
import type { SettingService } from '@api/platform/setting/setting.service'
import { replaceRoleMetrics } from './kpi-config.repository'
import { overlayRows } from './kpi-config.overlay'

/** The KPI members of the sales `ConfigChange` (ADR 0099 §2) — they ride the
 *  `config-change` approval every config list uses, so the one applier
 *  (`SalesConfigService.apply`) hands them back here inside its transaction.
 *  `value` is the very body the contract parsed at the door. */
export type KpiConfigChange =
  | { kind: 'kpi-metrics'; value: KpiRoleMetricsPatch; wasOn?: readonly KpiMetricKey[] }
  | { kind: 'kpi-alert'; value: KpiAlertPatch }

const KPI_KINDS: readonly string[] = [
  'kpi-metrics',
  'kpi-alert',
] satisfies KpiConfigChange['kind'][]

export const isKpiConfigChange = <T extends { kind: string }>(
  change: T,
): change is Extract<T, KpiConfigChange> => KPI_KINDS.includes(change.kind)

/** The sentence the approver reads instead of the payload. `wasOn` is the
 *  role's metrics in force when the change was proposed, so the sentence names
 *  only what flips; without it the code default is the baseline. */
export function kpiConsequenceOf(change: KpiConfigChange): string {
  if (change.kind === 'kpi-alert') {
    const { slipPercent, hitPercent, tolerancePercent } = change.value
    return `Đổi ngưỡng cảnh báo KPI: sắp trượt khi dự báo dưới ${slipPercent}%, sắp đạt khi đã đạt từ ${hitPercent}%, thiếu đến ${tolerancePercent}% so với số cần có vẫn tính Đúng tiến độ`
  }
  const { role, metrics } = change.value
  const primary = metrics.find((m) => m.primary)
  const label = (m: { metricKey: KpiMetricKey }) => KPI_METRIC_LABEL[m.metricKey]
  const was = (key: KpiMetricKey) =>
    change.wasOn ? change.wasOn.includes(key) : !KPI_DEFAULT_OFF.has(key)
  const off = metrics.filter((m) => !m.enabled && was(m.metricKey)).map(label)
  const added = metrics.filter((m) => m.enabled && !was(m.metricKey)).map(label)
  const head = primary ? `chỉ số chính là ${label(primary)}` : ''
  const parts = [
    ...(added.length > 0 ? [`bật thêm ${added.join(', ')}`] : []),
    ...(off.length > 0 ? [`tắt ${off.join(', ')}`] : []),
  ]
  const tail = parts.length > 0 ? parts.join(' · ') : 'giữ các chỉ số đang bật'
  return `Đổi chỉ số KPI của vai ${ROLE_LABEL[role]}: ${head} · ${tail}`
}

/** Short subject for the gate's log line. */
export const kpiSubjectOf = (change: KpiConfigChange): string =>
  change.kind === 'kpi-alert'
    ? `${change.value.slipPercent}/${change.value.hitPercent}/${change.value.tolerancePercent}`
    : change.value.role

/** Applied on the approval's `tx`. The body is parsed again: the catalog is
 *  code, and a deploy between proposing and approving may have changed it. */
export async function applyKpiConfig(
  tx: Db,
  change: KpiConfigChange,
  proposerId: string,
  settings: SettingService,
): Promise<void> {
  if (change.kind === 'kpi-alert') {
    const pair = KpiAlertPatch.safeParse(change.value)
    if (!pair.success) {
      throw conflict('Giới hạn ngưỡng cảnh báo đã đổi từ lúc gửi đề nghị. Gửi lại đề nghị mới.')
    }
    /* All three keys in one tx, so slip < hit never half-applies. */
    await settings.setIn(tx, proposerId, [
      { key: 'kpi.alert.slip-percent', value: pair.data.slipPercent },
      { key: 'kpi.alert.hit-percent', value: pair.data.hitPercent },
      { key: 'kpi.pace.tolerance-percent', value: pair.data.tolerancePercent },
    ])
    return
  }
  const parsed = KpiRoleMetricsPatch.safeParse(change.value)
  if (!parsed.success) {
    throw conflict('Danh mục chỉ số của vai đã đổi từ lúc gửi đề nghị. Gửi lại đề nghị mới.')
  }
  await replaceRoleMetrics(tx, parsed.data.role, overlayRows(parsed.data, proposerId))
}
