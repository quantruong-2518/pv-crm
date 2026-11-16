import { useQuery } from '@tanstack/react-query'
import { Badge, GlassCard, cn, percent } from '@pv/ui'
import { type KpiGrade, type KpiScoreLine } from '@pv/contracts'
import { KpiCardError } from '@/components/kpi-tabs'
import { message, useI18n } from '@/app/i18n'
import { kpiMetricText } from '@/data/kpi-i18n'
import { kpiScoreQuery } from '@/data/kpi-score'
import { num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { Track } from './kpi-me-sale-bars'
import * as copy from './kpi-me-sale-i18n'
import { SCORE_CAP, share } from './kpi-me-sale-model'

/** The score of the last closed month (ADR 0158 §3): the number, the grade as a
 *  worded pill, and every line with its weight and a bar from 0 to the 120 %
 *  cap, ticked at 100 %. `score: null` means the month is not closed, and then
 *  no card is drawn. A line's `percent` is already a percent, so it is printed
 *  as is; only the weight is a ratio. A line with no reading draws an empty bar. */

const GRADE_TONE: Record<KpiGrade, 'success' | 'warning' | 'danger'> = {
  A: 'success',
  B: 'success',
  C: 'warning',
  D: 'danger',
}

export function GradeBadge({ grade }: { grade: KpiGrade }) {
  const { t } = useI18n()
  return (
    <Badge tone={GRADE_TONE[grade]}>
      {t(message(`Xếp loại ${grade}`, `Grade ${grade}`, `${grade} 등급`))}
    </Badge>
  )
}

function Line({ line }: { line: KpiScoreLine }) {
  const { t, lang } = useI18n()
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_48px] items-center gap-3 text-[12.5px] leading-5">
      <span className="min-w-0">
        {kpiMetricText(line.key, lang)}{' '}
        <span className={NOTE}>· {t(copy.weightTag(percent(line.weight)))}</span>
      </span>
      <Track
        fill={line.percent === null ? 0 : share(line.percent, SCORE_CAP)}
        ticks={[{ at: 100 / SCORE_CAP, tone: 'ink' }]}
      />
      <span className="tnum font-num text-right font-semibold">
        {line.percent === null ? '—' : `${num(line.percent)}%`}
      </span>
    </div>
  )
}

export function ScoreCard({ period, actorId }: { period: string; actorId: string | undefined }) {
  const { t } = useI18n()
  const read = useQuery({ ...kpiScoreQuery(period, actorId ?? ''), enabled: actorId !== undefined })
  if (read.error) {
    return (
      <GlassCard className={TILE}>
        <KpiCardError error={read.error} onRetry={() => void read.refetch()} />
      </GlassCard>
    )
  }
  const score = read.data?.score
  if (!score) return null
  /* Month and year always, so a month of another year is never read as this year's. */
  const label = `${score.period.slice(5)}/${score.period.slice(0, 4)}`

  return (
    <GlassCard className={cn(TILE, 'p-5')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold leading-5">
          {t(
            message(
              `Điểm tháng ${label}`,
              `Score for month ${label}`,
              `${score.period.slice(0, 4)}년 ${Number(score.period.slice(5))}월 점수`,
            ),
          )}
        </h3>
        <GradeBadge grade={score.grade} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="tnum font-num text-[34px] font-semibold leading-none tracking-[-1.2px]">
          {num(score.score)}
        </span>
        <span className={NOTE}>{t(copy.scoreMax(SCORE_CAP))}</span>
      </div>
      <div className="flex flex-col gap-3">
        {score.lines.map((line) => (
          <Line key={line.key} line={line} />
        ))}
      </div>
      <span className={NOTE}>
        {t(copy.scoreScale(SCORE_CAP))}{' '}
        {t(
          message(
            'Điểm chỉ tính khi tháng đã chốt.',
            'The score counts once the month is closed.',
            '점수는 월 마감 후에 계산됩니다.',
          ),
        )}
      </span>
    </GlassCard>
  )
}
