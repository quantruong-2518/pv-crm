import { GlassCard, cn, percent } from '@pv/ui'
import type { KpiMarketingBudgetResponse, KpiMarketingSourcesResponse } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { StackTable, type StackColumn } from '@/components/stack-table'
import { num } from './home-model'
import { NEUTRAL_MARK, NOTE, TILE } from './home-tiles'
import { DASH, printShort } from './kpi-model'
import { monthPace, share } from './kpi-me-sale-model'

/** Marketing's table by channel and the month's budget bar (ADR 0160 §9). The budget is
 *  the person's unit's, as the sources read already carries it: `null` outside any
 *  unit, an unset `amount` while nobody has set one. The tick is today's pace. */

const SOURCES_TITLE = message(
  'Lead và MQL theo kênh',
  'Leads and MQL by channel',
  '채널별 리드와 MQL',
)

function Budget({ period, budget }: { period: string; budget: KpiMarketingBudgetResponse | null }) {
  const { t } = useI18n()
  const title = t(
    message('Ngân sách Marketing tháng', 'Monthly Marketing budget', '월 마케팅 예산'),
  )
  const spent = budget ? printShort('money', budget.spent) : null
  if (!budget || budget.amount === null) {
    return (
      <p className="m-0 text-[12.5px] leading-5">
        {spent !== null &&
          `${t(message(`Đã chi ${spent}.`, `Spent ${spent}.`, `지출 ${spent}.`))} `}
        {t(
          message(
            'Chưa đặt ngân sách Marketing cho tháng này.',
            'No Marketing budget is set for this month.',
            '이번 달 마케팅 예산이 설정되지 않았습니다.',
          ),
        )}
      </p>
    )
  }
  const { amount } = budget
  const used = amount > 0 ? Math.min(budget.spent / amount, 1) : 1
  const pace = monthPace(period)
  const over = budget.spent > amount
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold">{title}</span>
        <span className="tnum font-num text-[13px]">
          <b>{spent}</b>
          <span className="text-muted-foreground">{` / ${printShort('money', amount)}`}</span>
        </span>
      </div>
      <div aria-hidden className="bg-surface-ink/10 relative h-3 rounded-sm">
        <span
          className={cn('absolute inset-y-0 left-0 rounded-sm', over ? 'bg-warning' : 'bg-primary')}
          style={{ width: `${used * 100}%` }}
        />
        {pace !== null && (
          <span
            className="bg-foreground absolute -inset-y-1 w-0.5 rounded-sm"
            style={{ left: `${pace * 100}%` }}
          />
        )}
      </div>
      {pace !== null && (
        <span className={NOTE}>
          {t(
            message(
              'Vạch đứng: hôm nay nằm ở đâu trong tháng.',
              'The vertical mark: where today falls in the month.',
              '세로선: 이번 달에서 오늘의 위치입니다.',
            ),
          )}
        </span>
      )}
    </div>
  )
}

export function MarketingSourcesCard({
  period,
  data,
}: {
  period: string
  data: KpiMarketingSourcesResponse
}) {
  const { t } = useI18n()
  const { rows, budget } = data
  if (rows.length === 0 && !budget) return null
  const top = Math.max(...rows.map((r) => r.leads), 1)
  const columns: StackColumn[] = [
    { header: t(message('Kênh', 'Channel', '채널')), width: 'minmax(0,1.3fr)' },
    {
      header: t(message('Lead tháng này', 'Leads this month', '이번 달 리드')),
      width: 'minmax(0,2fr)',
      stack: 'wide',
    },
    {
      header: t(message('Lead → MQL', 'Lead → MQL', '리드 → MQL')),
      width: 'minmax(0,1fr)',
      align: 'right',
    },
    { header: t(message('Tỷ lệ', 'Rate', '비율')), width: 'minmax(0,0.8fr)', align: 'right' },
    {
      header: t(message('Chi phí/MQL', 'Cost/MQL', 'MQL당 비용')),
      width: 'minmax(0,1fr)',
      align: 'right',
    },
  ]
  const lines = rows.map((r) => ({
    id: r.sourceCode,
    cells: [
      r.name,
      <span
        key="bar"
        aria-hidden
        className="flex h-3 overflow-hidden rounded-sm"
        style={{ width: `${share(r.leads, top) * 100}%` }}
      >
        <span
          className="bg-primary h-full shadow-[1px_0_0_var(--card)]"
          style={{ width: `${share(r.rate ?? 0, 1) * 100}%` }}
        />
        <span className={cn(NEUTRAL_MARK, 'h-full flex-1')} />
      </span>,
      <span key="n" className="tnum font-num">{`${num(r.leads)} → ${num(r.mql)}`}</span>,
      <span key="rate" className="tnum font-num">
        {r.rate === null ? DASH : percent(r.rate)}
      </span>,
      <span key="cost" className="tnum font-num">
        {r.costPerMql === null ? DASH : printShort('money', r.costPerMql)}
      </span>,
    ],
  }))
  return (
    <GlassCard variant="b" className={TILE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold leading-5">{t(SOURCES_TITLE)}</h3>
        <span className={cn(NOTE, 'flex flex-wrap gap-x-3 gap-y-1')}>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="bg-primary rounded-xs size-2" />
            {t(message('Thành MQL', 'Became MQL', 'MQL 전환'))}
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className={cn(NEUTRAL_MARK, 'rounded-xs size-2')} />
            {t(message('Chưa thành MQL', 'Not yet MQL', 'MQL 미전환'))}
          </span>
        </span>
      </div>
      {lines.length > 0 && (
        <StackTable from="md" flush rowHeight="min-h-12 py-2" columns={columns} rows={lines} />
      )}
      <Budget period={period} budget={budget} />
    </GlassCard>
  )
}
