import {
  KPI_CATALOG,
  KPI_DEFAULT_OFF,
  KPI_METRIC_LABEL,
  KpiAlertPatch,
  KpiRoleMetricsPatch,
  ROLE_LABEL,
  type KpiMetricKey,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, invalid } from '@api/platform/http/problem'
import type { SettingService } from '@api/platform/setting/setting.service'
import { replaceRoleMetrics } from './kpi-config.repository'
import { hasMetricSql } from './kpi-readings.repository'
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

const SCORE_FIELDS = [
  ['gradeA', 'kpi.score.grade-a'],
  ['gradeB', 'kpi.score.grade-b'],
  ['gradeC', 'kpi.score.grade-c'],
] as const

export const isKpiConfigChange = <T extends { kind: string }>(
  change: T,
): change is Extract<T, KpiConfigChange> => KPI_KINDS.includes(change.kind)

/** ADR 0157 §1: a metric nothing can read yet stays off, at the proposal and again at approval. */
export function assertMeasurable(patch: KpiRoleMetricsPatch): void {
  const scopes = new Map(KPI_CATALOG[patch.role].map((d) => [d.key, d.scope]))
  const stray = patch.metrics.filter(
    (m) => m.enabled && !hasMetricSql(m.metricKey, scopes.get(m.metricKey) ?? 'own'),
  )
  if (stray.length === 0) return
  const names = stray.map((m) => KPI_METRIC_LABEL[m.metricKey]).join(', ')
  throw invalid({ metrics: [`Chỉ số này chưa đo được, không bật được: ${names}.`] })
}

/** The sentence the approver reads instead of the payload. `wasOn` is the
 *  role's metrics in force when the change was proposed, so the sentence names
 *  only what flips; without it the code default is the baseline. */
export function kpiConsequenceOf(change: KpiConfigChange): string {
  if (change.kind === 'kpi-alert') {
    const { slipPercent, hitPercent, tolerancePercent } = change.value
    const { gradeA, gradeB, gradeC } = change.value
    /* A proposal stored before the score settings existed has no such fields. */
    const score =
      gradeA === undefined
        ? ''
        : ` · điểm tháng: loại A từ ${gradeA}, B từ ${gradeB}, C từ ${gradeC}`
    return `Đổi ngưỡng cảnh báo KPI: sắp trượt khi dự báo dưới ${slipPercent}%, sắp đạt khi đã đạt từ ${hitPercent}%, thiếu đến ${tolerancePercent}% so với số cần có vẫn tính Đúng tiến độ${score}`
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
    const stored: Record<string, unknown> = { ...change.value }
    /* A proposal stored before ADR 0158 lacks the score fields: current values fill in. */
    for (const [field, key] of SCORE_FIELDS) {
      stored[field] ??= (await settings.value(key)).value
    }
    const pair = KpiAlertPatch.safeParse(stored)
    if (!pair.success) {
      throw conflict('Giới hạn ngưỡng cảnh báo đã đổi từ lúc gửi đề nghị. Gửi lại đề nghị mới.')
    }
    /* All keys in one tx, so slip < hit and the grade order never half-apply. */
    await settings.setIn(tx, proposerId, [
      { key: 'kpi.alert.slip-percent', value: pair.data.slipPercent },
      { key: 'kpi.alert.hit-percent', value: pair.data.hitPercent },
      { key: 'kpi.pace.tolerance-percent', value: pair.data.tolerancePercent },
      { key: 'kpi.score.grade-a', value: pair.data.gradeA },
      { key: 'kpi.score.grade-b', value: pair.data.gradeB },
      { key: 'kpi.score.grade-c', value: pair.data.gradeC },
    ])
    return
  }
  const parsed = KpiRoleMetricsPatch.safeParse(change.value)
  if (!parsed.success) {
    throw conflict('Danh mục chỉ số của vai đã đổi từ lúc gửi đề nghị. Gửi lại đề nghị mới.')
  }
  assertMeasurable(parsed.data)
  await replaceRoleMetrics(tx, parsed.data.role, overlayRows(parsed.data, proposerId))
}
