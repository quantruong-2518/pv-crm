import { GlassCard, cn } from '@pv/ui'
import type { KpiForecastAccuracy, KpiMetricDef, KpiMonthScore, KpiScoreLine } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import type { KpiCatalog } from '@/data/kpi-catalog'
import { kpiMetricText } from '@/data/kpi-i18n'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { DASH, printShort } from './kpi-model'

/** The three facts and the score table of a closed month's 1:1 (ADR 0158 §3–4).
 *  Every figure is the server's frozen close value; only the print is here. */

const BIG = 'tnum font-num text-[22px] font-bold leading-7'

const defOf = (catalog: KpiCatalog, line: KpiScoreLine): KpiMetricDef | undefined =>
  Object.values(catalog)
    .flat()
    .find((d) => d.key === line.key)

/** The line that costs the score most: its gap to 100% times its weight. */
function weakestOf(lines: readonly KpiScoreLine[]): KpiScoreLine | null {
  const cost = (l: KpiScoreLine) => (100 - (l.percent ?? 100)) * l.weight
  const worst = lines.reduce<KpiScoreLine | null>((a, l) => (a && cost(a) >= cost(l) ? a : l), null)
  return worst && cost(worst) > 0 ? worst : null
}

const weightText = (weight: number) => `${num(weight * 100)}%`

function Fact({ label, children, note }: { label: string; children: string; note?: string }) {
  return (
    <GlassCard className={TILE}>
      <span className={NOTE}>{label}</span>
      <span className={BIG}>{children}</span>
      {note && <span className={cn(NOTE, 'tnum font-num')}>{note}</span>}
    </GlassCard>
  )
}

export function Facts({
  score,
  accuracy,
}: {
  score: KpiMonthScore
  accuracy: KpiForecastAccuracy | null
}) {
  const { t } = useI18n()
  const weakest = weakestOf(score.lines)
  const money = (v: number | null) => (v === null ? DASH : printShort('money', v))
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Fact
        label={t(message('Điểm tháng', 'Month score', '월 점수'))}
        note={t(message(`Xếp loại ${score.grade}`, `Grade ${score.grade}`, `${score.grade} 등급`))}
      >
        {num(score.score)}
      </Fact>
      <Fact
        label={t(message('Độ chính xác dự báo', 'Forecast accuracy', '예측 정확도'))}
        note={
          accuracy
            ? t(
                message(
                  `Ghi chắc chắn ký ${money(accuracy.committed)}, ký thật ${money(accuracy.actual)}.`,
                  `Committed ${money(accuracy.committed)}, actually signed ${money(accuracy.actual)}.`,
                  `확정 ${money(accuracy.committed)}, 실제 계약 ${money(accuracy.actual)}.`,
                ),
              )
            : undefined
        }
      >
        {!accuracy || accuracy.accuracy === null ? DASH : `${num(accuracy.accuracy * 100)}%`}
      </Fact>
      <Fact
        label={t(
          message(
            'Chỉ số kéo điểm xuống',
            'Metric pulling the score down',
            '점수를 가장 낮춘 지표',
          ),
        )}
        note={
          weakest
            ? t(
                message(
                  `${weakest.key === score.primary ? 'Chỉ số chính, ' : ''}trọng số ${weightText(weakest.weight)}.`,
                  `${weakest.key === score.primary ? 'Main metric, ' : ''}weight ${weightText(weakest.weight)}.`,
                  `${weakest.key === score.primary ? '주요 지표, ' : ''}비중 ${weightText(weakest.weight)}.`,
                ),
              )
            : undefined
        }
      >
        {weakest
          ? `${kpiMetricText(weakest.key)}${weakest.percent === null ? '' : ` ${num(weakest.percent)}%`}`
          : DASH}
      </Fact>
    </div>
  )
}

export function ScoreTable({ score, catalog }: { score: KpiMonthScore; catalog: KpiCatalog }) {
  const { t } = useI18n()
  const columns: StackColumn[] = [
    { header: t(message('Chỉ số', 'Metric', '지표')), width: 'minmax(180px,2fr)' },
    { header: t(message('Đạt', 'Actual', '실적')), width: 'minmax(100px,1fr)', align: 'right' },
    {
      header: t(message('Chỉ tiêu', 'Target', '목표')),
      width: 'minmax(100px,1fr)',
      align: 'right',
    },
    {
      header: t(message('% (tối đa 120)', '% (max 120)', '% (최대 120)')),
      width: 'minmax(100px,1fr)',
      align: 'right',
    },
    { header: t(message('Trọng số', 'Weight', '비중')), width: 'minmax(80px,1fr)', align: 'right' },
  ]
  const rows = score.lines.map((line) => {
    const unit = defOf(catalog, line)?.unit ?? 'count'
    const actual = line.actual === null ? DASH : printShort(unit, line.actual)
    const target = line.target === null ? DASH : printShort(unit, line.target)
    return {
      id: line.key,
      cells: [
        <span key="m" className="font-semibold">
          {kpiMetricText(line.key)}
        </span>,
        <span key="a" className="tnum font-num">
          {actual}
        </span>,
        <span key="t" className="tnum font-num">
          {line.lowerIsBetter && line.target !== null ? `≤ ${target}` : target}
        </span>,
        <span key="p" className="tnum font-num">
          {line.percent === null ? DASH : num(line.percent)}
        </span>,
        <span key="w" className="tnum font-num">
          {weightText(line.weight)}
        </span>,
      ],
    }
  })
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 py-4">
      <StackTable from="md" flush columns={columns} rows={rows} />
      <p className={cn(NOTE, 'px-5')}>
        {t(
          message(
            'Chỉ số càng thấp càng tốt tính bằng chỉ tiêu ÷ thực tế.',
            'For lower-is-better metrics the percent is target ÷ actual.',
            '낮을수록 좋은 지표는 목표 ÷ 실적으로 계산합니다.',
          ),
        )}
      </p>
    </GlassCard>
  )
}
