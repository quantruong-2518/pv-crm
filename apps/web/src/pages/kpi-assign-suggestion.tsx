import { cn } from '@pv/ui'
import type { KpiAssignmentChild, KpiMetricDef } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { NOTE } from './home-tiles'
import { printShort } from './kpi-model'
import { CoverageLowBadge } from './kpi-unit-parts'

/** What the server suggests beside one person's box (ADR 0157 §3). It is text
 *  only: nothing here writes into the input. The average, the ramp and the
 *  pipeline are all the server's; the screen only prints them. */

export function SuggestionNote({ child, def }: { child: KpiAssignmentChild; def: KpiMetricDef }) {
  const { t } = useI18n()
  if (child.kind !== 'person') return null
  const s = child.suggestions.find((x) => x.metricKey === def.key)
  if (!s) return null
  const ramped = s.ramped === null ? null : printShort(def.unit, s.ramped)
  const pipeline = s.pipeline === null ? null : printShort(def.unit, s.pipeline)
  return (
    <span className="flex min-w-0 flex-col items-end gap-1">
      {s.enough ? (
        ramped !== null && (
          <span className={cn(NOTE, 'tnum font-num')}>
            {t(message(`Gợi ý ${ramped}`, `Suggested ${ramped}`, `제안 ${ramped}`))}
          </span>
        )
      ) : (
        <span className={NOTE}>
          {t(message('Chưa đủ dữ liệu', 'Not enough data yet', '데이터가 아직 부족합니다'))}
          {ramped !== null &&
            ` · ${t(message(`tháng trước ${ramped}`, `last month ${ramped}`, `지난달 ${ramped}`))}`}
        </span>
      )}
      {pipeline !== null && (
        <span className="flex flex-wrap items-center justify-end gap-2">
          <span className={cn(NOTE, 'tnum font-num')}>
            {t(message(`Pipeline ${pipeline}`, `Pipeline ${pipeline}`, `파이프라인 ${pipeline}`))}
          </span>
          {s.low && <CoverageLowBadge />}
        </span>
      )}
    </span>
  )
}
