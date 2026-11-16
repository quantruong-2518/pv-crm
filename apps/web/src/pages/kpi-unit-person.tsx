import { useQuery } from '@tanstack/react-query'
import { GlassCard, SectionTitle, Skeleton, cn } from '@pv/ui'
import { stepSalesPeriod, type KpiMonthScore, type KpiPlanResponse } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { KpiCardError } from '@/components/kpi-tabs'
import { kpiPlanQuery } from '@/data/kpi-plan'
import { kpiScoreQuery } from '@/data/kpi-score'
import { kpiMetricText } from '@/data/kpi-i18n'
import { num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { GradeBadge } from './kpi-me-score'
import { CoverageLowBadge } from './kpi-unit-parts'
import { DASH, monthWord, printShort } from './kpi-model'

/** Two read-only cards on a person's page: the score of the last closed month
 *  and, for a seat with a signed-value target, coverage and the backward plan
 *  (ADR 0158 §3, ADR 0157). Each reads and fails on its own. */

const FIGURE = 'tnum font-num'
const BIG = cn(FIGURE, 'text-[20px] font-semibold leading-6')

function ScoreLines({ score }: { score: KpiMonthScore }) {
  return (
    <ul className={cn(NOTE, 'flex flex-col gap-1')}>
      {score.lines.map((line) => (
        <li key={line.key} className="flex flex-wrap justify-between gap-2">
          <span>{kpiMetricText(line.key)}</span>
          <span className={FIGURE}>{line.percent === null ? DASH : `${num(line.percent)}%`}</span>
        </li>
      ))}
    </ul>
  )
}

function ScoreCard({ period, actorId }: { period: string; actorId: string }) {
  const { t } = useI18n()
  const month = stepSalesPeriod(period, -1)
  const read = useQuery(kpiScoreQuery(month, actorId))
  if (read.isPending) return <Skeleton height={64} />
  if (read.error) {
    return (
      <GlassCard className={TILE}>
        <KpiCardError error={read.error} onRetry={() => void read.refetch()} />
      </GlassCard>
    )
  }
  const { score, accuracy } = read.data
  if (!score) return null
  const name = monthWord(month)
  return (
    <GlassCard className={cn(TILE, 'gap-2')}>
      <span className={NOTE}>
        {t(message(`Điểm ${name}`, `Score for ${name}`, `${name} 점수`))}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <span className={BIG}>{num(score.score)}</span>
        <GradeBadge grade={score.grade} />
      </span>
      <ScoreLines score={score} />
      {accuracy && accuracy.accuracy !== null && (
        <span className={NOTE}>
          {t(
            message(
              `Dự báo chính xác ${num(accuracy.accuracy * 100)}% so với số thật.`,
              `Forecast ${num(accuracy.accuracy * 100)}% accurate against the actual.`,
              `예측 정확도 ${num(accuracy.accuracy * 100)}% (실적 대비).`,
            ),
          )}
        </span>
      )}
    </GlassCard>
  )
}

function PlanLine({ plan }: { plan: NonNullable<KpiPlanResponse['plan']> }) {
  const { t } = useI18n()
  const text = plan.enough
    ? t(
        message(
          `Để đủ chỉ tiêu: ký ${plan.dealsToWin ?? DASH} hợp đồng, mở ${plan.oppsToOpen ?? DASH} cơ hội, gửi ${plan.quotesToSend ?? DASH} báo giá.`,
          `To reach target: win ${plan.dealsToWin ?? DASH} deals, open ${plan.oppsToOpen ?? DASH} opportunities, send ${plan.quotesToSend ?? DASH} quotes.`,
          `목표 달성: 계약 ${plan.dealsToWin ?? DASH}건, 기회 ${plan.oppsToOpen ?? DASH}건, 견적 ${plan.quotesToSend ?? DASH}건.`,
        ),
      )
    : t(
        message(
          'Chưa đủ hợp đồng đã ký trong vài tháng gần đây để tính kế hoạch.',
          'Not enough signed deals in recent months to work out a plan.',
          '최근 몇 달간 체결 건수가 적어 계획을 계산할 수 없습니다.',
        ),
      )
  return <p className="text-[12.5px] leading-5">{text}</p>
}

function PlanCard({ period, actorId }: { period: string; actorId: string }) {
  const { t } = useI18n()
  const read = useQuery(kpiPlanQuery(period, actorId))
  if (read.isPending) return <Skeleton height={64} />
  if (read.error) {
    return (
      <GlassCard className={TILE}>
        <KpiCardError error={read.error} onRetry={() => void read.refetch()} />
      </GlassCard>
    )
  }
  const { leading, plan } = read.data
  if (!leading && !plan) return null
  const ratio = leading?.coverage.ratio ?? null
  return (
    <GlassCard className={cn(TILE, 'gap-2')}>
      <span className={NOTE}>
        {t(message('Độ phủ và kế hoạch', 'Coverage and plan', '커버리지와 계획'))}
      </span>
      {leading && (
        <span className="flex flex-wrap items-center gap-2">
          <span className={BIG}>
            {ratio === null ? DASH : `${num(ratio)} ${t(message('lần', 'x', '배'))}`}
          </span>
          {leading.coverage.low && <CoverageLowBadge />}
          <span className={cn(NOTE, FIGURE)}>
            {t(message('Còn thiếu', 'Still missing', '남은 목표'))}{' '}
            {printShort('money', leading.coverage.missing)}
          </span>
        </span>
      )}
      {plan && <PlanLine plan={plan} />}
    </GlassCard>
  )
}

export function PersonScorePlan({ period, actorId }: { period: string; actorId: string }) {
  const { t } = useI18n()
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle size="lg">
        {t(message('Điểm và kế hoạch', 'Score and plan', '점수와 계획'))}
      </SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <ScoreCard period={period} actorId={actorId} />
        <PlanCard period={period} actorId={actorId} />
      </div>
    </section>
  )
}
