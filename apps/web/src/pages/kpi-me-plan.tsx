import type { UseQueryResult } from '@tanstack/react-query'
import { Badge, GlassCard, cn, percent } from '@pv/ui'
import {
  KPI_COVERAGE_LOW,
  KPI_PLAN_MIN_WON,
  KPI_PLAN_MONTHS,
  type KpiMyPlan,
  type KpiPlanResponse,
  type KpiStageRate,
} from '@pv/contracts'
import { KpiCardError } from '@/components/kpi-tabs'
import { COVERAGE_AXIS_MAX } from '@/lib/kpi-scale'
import { message, useI18n } from '@/app/i18n'
import { kpiFunnelStepText } from '@/data/kpi-i18n'
import { num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { bottleneckOf } from './kpi-me-bottleneck'
import { DASH, printTile } from './kpi-model'
import { Track, type Tick } from './kpi-me-sale-bars'
import * as copy from './kpi-me-sale-i18n'
import { share } from './kpi-me-sale-model'

/** The plan card and pipeline coverage (ADR 0157): shown, never scored. Both
 *  come from one read that answers null halves to anyone without `signed-value`,
 *  and then neither card is drawn. Pipeline money is hidden when the server
 *  sends `pipeline: null`; the coverage flag still shows. A stage is named by
 *  itself: the read carries no "next stage" to word a transition with.
 *  The gauge runs 0 to twice the low-coverage line, ticked at the line. */

const money = (value: number | null) => (value === null ? DASH : printTile('money', value))
const whole = (value: number | null) => (value === null ? DASH : num(value))

function Stat({ figure, label }: { figure: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="tnum font-num text-[24px] font-semibold leading-none tracking-[-.6px]">
        {figure}
      </span>
      <span className={NOTE}>{label}</span>
    </div>
  )
}

function PlanCard({ plan, signed }: { plan: KpiMyPlan; signed: number | null }) {
  const { t } = useI18n()
  const missing = money(plan.missing)
  return (
    <GlassCard className={TILE}>
      <h3 className="text-[13px] font-semibold leading-5">
        {t(message('Kế hoạch của tôi', 'My plan', '내 계획'))}
      </h3>
      {signed !== null && (
        <>
          <Track tall fill={share(signed, signed + plan.missing)} />
          <p className={cn(NOTE, 'tnum font-num m-0')}>
            {t(copy.planSigned(money(signed)))} · {t(copy.planMissing(missing))}
          </p>
        </>
      )}
      {plan.enough ? (
        <>
          <p className="tnum font-num m-0 text-[12.5px] leading-5">
            {t(
              message(
                `Để lấp ${missing}, theo số của chính bạn ${KPI_PLAN_MONTHS} tháng qua, cần:`,
                `To fill ${missing}, by your own figures of the last ${KPI_PLAN_MONTHS} months, you need:`,
                `${missing}을(를) 채우려면 최근 ${KPI_PLAN_MONTHS}개월 본인 실적 기준으로 필요한 수:`,
              ),
            )}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              figure={whole(plan.dealsToWin)}
              label={t(
                message(
                  `hợp đồng nữa (trung bình ${money(plan.averageDeal)})`,
                  `more contracts (average ${money(plan.averageDeal)})`,
                  `추가 계약 (평균 ${money(plan.averageDeal)})`,
                ),
              )}
            />
            <Stat
              figure={whole(plan.oppsToOpen)}
              label={t(
                message(
                  `cơ hội cần mở (thắng ${plan.winRate === null ? DASH : percent(plan.winRate)})`,
                  `opportunities to open (win rate ${plan.winRate === null ? DASH : percent(plan.winRate)})`,
                  `생성할 기회 (수주율 ${plan.winRate === null ? DASH : percent(plan.winRate)})`,
                ),
              )}
            />
            <Stat
              figure={whole(plan.quotesToSend)}
              label={t(message('báo giá cần gửi', 'quotes to send', '발송할 견적'))}
            />
          </div>
          <span className={NOTE}>
            {t(
              message(
                'Chỉ để tham khảo, không tính điểm.',
                'For reference only, not scored.',
                '참고용이며 점수에 반영되지 않습니다.',
              ),
            )}
          </span>
        </>
      ) : (
        <p className="m-0 text-[12.5px] leading-5">
          {t(
            message(
              `Còn thiếu ${missing}. Chưa đủ ${KPI_PLAN_MIN_WON} hợp đồng thắng trong ${KPI_PLAN_MONTHS} tháng qua nên chưa tính được kế hoạch.`,
              `${missing} still to go. Fewer than ${KPI_PLAN_MIN_WON} contracts won in the last ${KPI_PLAN_MONTHS} months, so there is no plan yet.`,
              `${missing} 남음. 최근 ${KPI_PLAN_MONTHS}개월 수주가 ${KPI_PLAN_MIN_WON}건 미만이라 아직 계획을 계산할 수 없습니다.`,
            ),
          )}
        </p>
      )}
    </GlassCard>
  )
}

function StageRow({ stage }: { stage: KpiStageRate }) {
  const { t, lang } = useI18n()
  const ticks: Tick[] = [
    ...(stage.unitRate === null ? [] : [{ at: stage.unitRate, tone: 'ink' as const }]),
    ...(stage.target === null ? [] : [{ at: stage.target, tone: 'soft' as const }]),
  ]
  const notes = [
    stage.unitRate === null ? null : t(copy.unitRateTag(percent(stage.unitRate))),
    stage.target === null ? null : t(copy.targetTag(percent(stage.target))),
  ].filter(Boolean)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_48px] items-center gap-3 text-[12.5px] leading-5">
      <span className="flex min-w-0 flex-col">
        {kpiFunnelStepText(stage.stage, lang)}
        {notes.length > 0 && <span className={cn(NOTE, 'tnum font-num')}>{notes.join(' · ')}</span>}
      </span>
      <Track fill={stage.rate ?? 0} ticks={ticks} />
      <span className="tnum font-num text-right font-semibold">
        {stage.rate === null ? DASH : percent(stage.rate)}
      </span>
    </div>
  )
}

function Legend({ withTarget }: { withTarget: boolean }) {
  const { t } = useI18n()
  const swatch = (tone: string) => <i className={cn('inline-block h-3 w-0.5 rounded-sm', tone)} />
  return (
    <span className={cn(NOTE, 'flex flex-wrap items-center gap-x-4 gap-y-1')}>
      <span className="inline-flex items-center gap-2">
        <i className="bg-primary inline-block h-2 w-4 rounded-sm" />
        {t(copy.LEGEND_YOU)}
      </span>
      <span className="inline-flex items-center gap-2">
        {swatch('bg-foreground')}
        {t(copy.LEGEND_UNIT)}
      </span>
      {withTarget && (
        <span className="inline-flex items-center gap-2">
          {swatch('bg-muted-foreground')}
          {t(copy.LEGEND_STEP_TARGET)}
        </span>
      )}
    </span>
  )
}

function CoverageCard({ leading }: { leading: NonNullable<KpiPlanResponse['leading']> }) {
  const { t, lang } = useI18n()
  const { coverage, stages } = leading
  const fact = bottleneckOf(
    stages.map((s) => ({
      rate: s.rate,
      target: s.target,
      lost: s.rate === null ? 0 : s.left * (1 - s.rate),
    })),
  )
  const stuck = fact ? stages[fact.at]! : null
  const hasTarget = stages.some((s) => s.target !== null)
  return (
    <GlassCard className={TILE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold leading-5">
          {t(message('Độ phủ pipeline', 'Pipeline coverage', '파이프라인 커버리지'))}
        </h3>
        {coverage.low && (
          <Badge tone="warning">
            {t(
              message(
                `Dưới ${KPI_COVERAGE_LOW} lần`,
                `Under ${KPI_COVERAGE_LOW}x`,
                `${KPI_COVERAGE_LOW}배 미만`,
              ),
            )}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="tnum font-num text-[24px] font-semibold leading-none tracking-[-.6px]">
          {coverage.ratio === null
            ? DASH
            : t(
                message(
                  `${num(coverage.ratio)} lần`,
                  `${num(coverage.ratio)}x`,
                  `${num(coverage.ratio)}배`,
                ),
              )}
        </span>
        <span className={NOTE}>{t(copy.needTimes(KPI_COVERAGE_LOW))}</span>
      </div>
      {coverage.ratio !== null && (
        <Track
          tall
          fill={share(coverage.ratio, COVERAGE_AXIS_MAX)}
          fillClass={coverage.low ? 'bg-warning' : 'bg-success'}
          ticks={[{ at: KPI_COVERAGE_LOW / COVERAGE_AXIS_MAX, tone: 'ink' }]}
        />
      )}
      {coverage.pipeline !== null && (
        <p className={cn(NOTE, 'tnum font-num m-0')}>
          {t(
            message(
              `Pipeline dự kiến ký trong tháng ${money(coverage.pipeline)} (theo xác suất) so với ${money(coverage.missing)} còn thiếu.`,
              `Pipeline expected to sign this month ${money(coverage.pipeline)} (probability-weighted) against ${money(coverage.missing)} still to go.`,
              `이번 달 예상 체결 파이프라인 ${money(coverage.pipeline)} (확률 가중), 남은 목표 ${money(coverage.missing)}.`,
            ),
          )}{' '}
          {t(copy.gaugeScale(COVERAGE_AXIS_MAX))}
        </p>
      )}
      <div className="flex flex-col gap-3 pt-3">
        <span className="text-[13px] font-semibold leading-5">
          {t(copy.stagesTitle(KPI_PLAN_MONTHS))}
        </span>
        <Legend withTarget={hasTarget} />
        {stages.map((stage) => (
          <StageRow key={stage.stage} stage={stage} />
        ))}
        {stuck && fact && (
          <p className="tnum font-num m-0 text-[12.5px] leading-5">
            {t(
              copy.bottleneck(
                kpiFunnelStepText(stuck.stage, lang),
                percent(stuck.rate ?? 0),
                fact.kind === 'neck' ? percent(stuck.target ?? 0) : null,
              ),
            )}
          </p>
        )}
      </div>
    </GlassCard>
  )
}

/** One read, two cards; each shows its own load error (ADR 0159 §8). */
export function PlanSection({
  read,
  signed,
}: {
  read: UseQueryResult<KpiPlanResponse>
  /** The reader's signed value this month, for the plan bar. */
  signed: number | null
}) {
  if (read.error) {
    return (
      <GlassCard className={TILE}>
        <KpiCardError error={read.error} onRetry={() => void read.refetch()} />
      </GlassCard>
    )
  }
  const data = read.data
  if (!data || (!data.plan && !data.leading)) return null
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {data.plan && <PlanCard plan={data.plan} signed={signed} />}
      {data.leading && <CoverageCard leading={data.leading} />}
    </div>
  )
}
