import { useQuery } from '@tanstack/react-query'
import { Badge, GlassCard, percent } from '@pv/ui'
import { type KpiGrade } from '@pv/contracts'
import { KpiCardError } from '@/components/kpi-tabs'
import { message, useI18n } from '@/app/i18n'
import { kpiMetricText } from '@/data/kpi-i18n'
import { kpiScoreQuery } from '@/data/kpi-score'
import { num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { monthWord } from './kpi-model'

/** The score of the last closed month (ADR 0158 §3): the number, the grade as a
 *  worded pill, and each line's achieved share. `score: null` means the month
 *  is not closed, and then no card is drawn. A line's `percent` is already a
 *  percent, so it is printed as is; only the weight is a ratio. */

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

export function ScoreCard({ period, actorId }: { period: string; actorId: string | undefined }) {
  const { t, lang } = useI18n()
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
  const summary = score.lines
    .filter((l) => l.percent !== null)
    .map((l) => {
      const weight =
        l.key === score.primary
          ? ` (${t(message('trọng số', 'weight', '비중'))} ${percent(l.weight)})`
          : ''
      return `${kpiMetricText(l.key, lang)} ${num(l.percent ?? 0)}%${weight}`
    })
    .join(' · ')

  return (
    <GlassCard className={TILE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold leading-5">
          {t(
            message(
              `Điểm ${monthWord(score.period)}`,
              `Score for ${monthWord(score.period)}`,
              `${monthWord(score.period)} 점수`,
            ),
          )}
        </h3>
        <GradeBadge grade={score.grade} />
      </div>
      <span className="tnum font-num text-[34px] font-semibold leading-none tracking-[-1.2px]">
        {num(score.score)}
      </span>
      {summary && <p className="tnum font-num m-0 text-[12.5px] leading-5">{summary}</p>}
      <span className={NOTE}>
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
