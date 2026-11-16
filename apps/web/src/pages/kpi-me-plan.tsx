import type { UseQueryResult } from '@tanstack/react-query'
import { Badge, GlassCard, percent } from '@pv/ui'
import {
  KPI_COVERAGE_LOW,
  KPI_PLAN_MIN_WON,
  KPI_PLAN_MONTHS,
  type KpiMyPlan,
  type KpiPlanResponse,
  type StageKey,
} from '@pv/contracts'
import { KpiCardError } from '@/components/kpi-tabs'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { message, useI18n, type Message } from '@/app/i18n'
import { num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { DASH, printTile } from './kpi-model'

/** The plan card and pipeline coverage (ADR 0157): shown, never scored. Both
 *  come from one read that answers null halves to anyone without `signed-value`,
 *  and then neither card is drawn. Pipeline money is hidden when the server
 *  sends `pipeline: null`; the coverage flag still shows. A stage is named by
 *  itself: the read carries no "next stage" to word a transition with. */

const STAGE: Record<StageKey, Message> = {
  new: message('Khởi tạo', 'Created', '생성'),
  assigned: message('Đang phân công', 'Being assigned', '배정 중'),
  engaged: message('Chăm sóc', 'In care', '관리 중'),
  quotation: message('Báo giá', 'Quotation', '견적'),
}

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

function PlanCard({ plan }: { plan: KpiMyPlan }) {
  const { t } = useI18n()
  const missing = money(plan.missing)
  return (
    <GlassCard className={TILE}>
      <h3 className="text-[13px] font-semibold leading-5">
        {t(message('Kế hoạch của tôi', 'My plan', '내 계획'))}
      </h3>
      {plan.enough ? (
        <>
          <p className="tnum font-num m-0 text-[12.5px] leading-5">
            {t(
              message(
                `Còn thiếu ${missing}. Theo số của chính bạn ${KPI_PLAN_MONTHS} tháng qua:`,
                `${missing} still to go. By your own figures of the last ${KPI_PLAN_MONTHS} months:`,
                `${missing} 남음. 최근 ${KPI_PLAN_MONTHS}개월 본인 실적 기준:`,
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

function CoverageCard({ leading }: { leading: NonNullable<KpiPlanResponse['leading']> }) {
  const { t } = useI18n()
  const { coverage, stages } = leading
  const columns: StackColumn[] = [
    { header: t(message('Giai đoạn', 'Stage', '단계')), width: 'minmax(0,1.6fr)' },
    {
      header: t(
        message(
          `Tỷ lệ đi tiếp (${KPI_PLAN_MONTHS} tháng)`,
          `Moved on (${KPI_PLAN_MONTHS} months)`,
          `다음 단계 이동률 (${KPI_PLAN_MONTHS}개월)`,
        ),
      ),
      width: 'minmax(0,1fr)',
      align: 'right',
    },
  ]
  const rows = stages.map((s) => ({
    id: s.stage,
    cells: [
      t(STAGE[s.stage]),
      <span key="rate" className="tnum font-num">
        {s.rate === null ? DASH : percent(s.rate)}
      </span>,
    ],
  }))
  return (
    <GlassCard variant="b" className={TILE}>
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
      {coverage.pipeline !== null && (
        <p className="tnum font-num m-0 text-[12.5px] leading-5">
          {t(
            message(
              `Pipeline dự kiến ký trong tháng ${money(coverage.pipeline)} (theo xác suất) so với ${money(coverage.missing)} còn thiếu.`,
              `Pipeline expected to sign this month ${money(coverage.pipeline)} (probability-weighted) against ${money(coverage.missing)} still to go.`,
              `이번 달 예상 체결 파이프라인 ${money(coverage.pipeline)} (확률 가중), 남은 목표 ${money(coverage.missing)}.`,
            ),
          )}
        </p>
      )}
      <StackTable from="md" flush rowHeight="min-h-12 py-2" columns={columns} rows={rows} />
    </GlassCard>
  )
}

/** One read, two cards; each shows its own load error (ADR 0159 §8). */
export function PlanSection({ read }: { read: UseQueryResult<KpiPlanResponse> }) {
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
      {data.plan && <PlanCard plan={data.plan} />}
      {data.leading && <CoverageCard leading={data.leading} />}
    </div>
  )
}
