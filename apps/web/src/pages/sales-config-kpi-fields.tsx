import { Input, cn } from '@pv/ui'
import type { KpiFunnelStep, KpiMetricKey, RoleId } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { kpiFunnelStepText, kpiMetricText, kpiRoleText } from '@/data/kpi-i18n'
import type { RoleCheck } from './sales-config-kpi-model'

/** The two typed fields beside the matrix cells: a weight under each counted
 *  metric and a target per funnel step (ADR 0160 §6–7). Read-only, a box shows
 *  its figure as text; empty and read-only shows nothing. The unit stands
 *  beside the box, not in `suffix`, whose shell is 40px, under law 13's 48. */

type BoxProps = {
  label: string
  value: string
  placeholder?: string
  /** Absent: read-only. */
  onType?: (value: string) => void
}

function PercentBox({ label, value, placeholder, onType }: BoxProps) {
  if (!onType) {
    return value ? <span className="tnum font-num text-[12px]">{value}%</span> : null
  }
  return (
    <span className="flex items-center justify-center gap-1">
      <Input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        inputMode="decimal"
        className="pointer-coarse:h-12 tnum font-num min-w-0 text-right"
        onChange={(e) => onType(e.target.value)}
      />
      <span aria-hidden className="text-muted-foreground text-[12px]">
        %
      </span>
    </span>
  )
}

export function WeightBox({
  metric,
  role,
  check,
  onType,
}: {
  metric: KpiMetricKey
  role: RoleId
  check: RoleCheck
  onType?: (value: string) => void
}) {
  const { t, lang } = useI18n()
  const value = check.weights.get(metric)
  if (value === undefined) return null
  return (
    <PercentBox
      label={`${t(message('Trọng số', 'Weight', '가중치'))}: ${kpiMetricText(metric, lang)}, ${kpiRoleText(role, lang)}`}
      value={value}
      placeholder={check.placeholders.get(metric)}
      onType={onType}
    />
  )
}

/** A dash where the step is not in the role's funnel, as the matrix does for a metric. */
export function FunnelBox({
  step,
  role,
  check,
  onType,
}: {
  step: KpiFunnelStep
  role: RoleId
  check: RoleCheck
  onType?: (value: string) => void
}) {
  const { t, lang } = useI18n()
  const value = check.funnel.get(step)
  if (value === undefined) {
    return (
      <span className="text-muted-foreground flex min-h-12 items-center justify-center">
        <span aria-hidden>—</span>
        <span className="sr-only">
          {t(
            message(
              'Bước này không thuộc vai trò',
              'This step does not apply to the role',
              '이 단계는 해당 역할에 적용되지 않습니다',
            ),
          )}
        </span>
      </span>
    )
  }
  return (
    <PercentBox
      label={`${t(message('Mục tiêu bước', 'Step target', '단계 목표'))}: ${kpiFunnelStepText(step, lang)}, ${kpiRoleText(role, lang)}`}
      value={value}
      onType={onType}
    />
  )
}

/** Live total while any weight is typed; it turns to a warning off 100. */
export function WeightTotal({ check }: { check: RoleCheck }) {
  const { t } = useI18n()
  if (check.total === null) return null
  return (
    <p
      className={cn(
        'tnum font-num m-0 text-[11.5px] leading-4',
        check.total === 100 ? 'text-muted-foreground' : 'text-destructive-foreground',
      )}
    >
      {t(message('Tổng trọng số', 'Total weight', '가중치 합계'))}: {check.total}%
    </p>
  )
}
