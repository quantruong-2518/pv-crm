import { useRef, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChartAnalysis, Icon, cn } from '@pv/ui'
import {
  salesGrainOf,
  type SalesMoneyResponse,
  type SalesPenaltyFigure,
  type SalesPerformanceResponse,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { periodLabel } from '@/data/period-pick'
import { dealsHref, money, num } from './home-model'
import { ICON_TONE, WASH_HERO } from './home-look'
import { FiguresTable, Labels, Legend, OPEN_FRAME, PenaltyStrip, Plot } from './home-revenue-chart'
import { useMoneyCard } from './home-revenue-hover'
import {
  BUCKET_UNIT,
  KIND_TITLE,
  columnName,
  revenueOf,
  signedMoney,
  type RevenueColumn,
} from './home-revenue-model'
import { MoneyCardView } from './home-revenue-peek'
import { CARD_SHELL, IconTile, NOTE, PILL_LINK } from './home-tiles'

/** The hero tile of the overview for a reader of the whole contract book:
 *  money moved in the period. Three figures (actual, expected, penalties), a
 *  bar of how much of the expected is already recognised, then the chart and
 *  its penalty strip, every mark opening the rows behind it. A reader without
 *  the money read gets `home-signed.tsx` in this slot instead (`home.tsx`). */

/* Under a short viewport (1280×800) the cards tighten so row one still ends at the fold. */
const SHORT_CARD = '[@media(max-height:860px)]:py-2'
const FIGURE_CARD = `flex min-w-0 flex-col gap-1 rounded-2xl px-4 py-3 ${SHORT_CARD}`
const FIGURE_LABEL = 'text-[13px] font-semibold leading-[18px]'
const FIGURE_VALUE =
  'tnum font-num text-[30px] font-bold leading-[38px] tracking-[-0.025em] [@media(max-height:860px)]:text-[24px] [@media(max-height:860px)]:leading-8'

function PenaltyLine({ label, value, ink }: { label: string; value: string; ink: string }) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className={NOTE}>{label}</span>
      <span className={cn('tnum font-num text-[22px] font-bold leading-7', ink)}>{value}</span>
    </span>
  )
}

function penaltyNote(a: SalesPenaltyFigure, b: SalesPenaltyFigure) {
  const count = a.count + b.count
  const pending = a.pending + b.pending
  if (count === 0) return 'Không có hợp đồng bị phạt'
  return `${num(count)} hợp đồng chấm dứt${pending > 0 ? ` · ${num(pending)} chưa trả` : ''}`
}

function Figures({ r }: { r: ReturnType<typeof revenueOf> }) {
  const out = r.penaltyOut.amountVnd
  const inn = r.penaltyIn.amountVnd
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
      <div className={cn(FIGURE_CARD, 'bg-success/10 text-on-tint-success')}>
        <span className={FIGURE_LABEL}>Doanh thu thực tế</span>
        <span className={FIGURE_VALUE}>{signedMoney(r.actual)}</span>
      </div>
      <div className={cn(FIGURE_CARD, OPEN_FRAME, 'text-accent-foreground')}>
        <span className={FIGURE_LABEL}>Doanh thu dự kiến</span>
        <span className={FIGURE_VALUE}>{signedMoney(r.expected)}</span>
        <span className="text-on-tint-primary-muted tnum font-num text-[12px] leading-4">
          {signedMoney(r.actual)} thực tế + {money(r.upcoming)} đợt sắp thu + {money(r.open)} cơ hội
          dự kiến chốt
        </span>
        {r.due > 0 && (
          <span className="text-on-tint-warning tnum font-num text-[12px] font-semibold leading-4">
            Còn {money(r.due)} đến hạn chưa thu
          </span>
        )}
      </div>
      <div className={cn(FIGURE_CARD, 'bg-surface-ink/4')}>
        <span className={cn(FIGURE_LABEL, 'text-muted-foreground')}>Tiền phạt</span>
        <PenaltyLine
          label="Mình thanh toán"
          value={out > 0 ? `−${money(out)}` : money(0)}
          ink={out > 0 ? 'text-destructive-foreground' : 'text-muted-foreground'}
        />
        <PenaltyLine
          label="Khách thanh toán"
          value={inn > 0 ? `+${money(inn)}` : money(0)}
          ink={inn > 0 ? 'text-channel-meeting' : 'text-muted-foreground'}
        />
        <span className={cn(NOTE, 'tnum font-num')}>{penaltyNote(r.penaltyIn, r.penaltyOut)}</span>
      </div>
    </div>
  )
}

/** Actual over expected: what is already revenue, and what still has to come in. */
function Recognised({ actual, expected }: { actual: number; expected: number }) {
  const share = expected > 0 ? Math.min(100, Math.max(0, (actual / expected) * 100)) : 0
  return (
    <div className="flex flex-col gap-2">
      <div aria-hidden className="flex h-3 gap-1">
        {share > 0 && <span className="bg-success rounded-md" style={{ flex: `0 0 ${share}%` }} />}
        {share < 100 && (
          <span
            className={cn('flex-1 rounded-md', expected > 0 ? OPEN_FRAME : 'bg-surface-ink/8')}
          />
        )}
      </div>
      <div className={cn(NOTE, 'tnum font-num flex flex-wrap justify-between gap-x-3')}>
        <span>
          <strong className="text-on-tint-success font-semibold">{signedMoney(actual)}</strong> đã
          ghi nhận
        </span>
        <span>
          <strong className="text-accent-foreground font-semibold">
            {signedMoney(expected - actual)}
          </strong>{' '}
          chưa ghi nhận
        </span>
      </div>
    </div>
  )
}

export function RevenueTile({
  perf,
  cash,
  className,
}: {
  perf: SalesPerformanceResponse
  /** Same period as `perf`: the two pair bucket by bucket. */
  cash: SalesMoneyResponse
  className?: string
}) {
  const canViewContracts = useCan('contract.view')
  const canViewDeals = useCan('opportunity.view')
  const r = revenueOf(perf, cash)
  const unit = BUCKET_UNIT[salesGrainOf(perf.period)]
  const content = useRef<HTMLDivElement>(null)
  const { card, zoneProps, cardProps, close } = useMoneyCard(perf.period, content)
  const nameOf = (col: RevenueColumn) => columnName(perf, col.view)
  const shown = card && r.columns.find((c) => c.view.bucket.key === card.key)

  return (
    <section
      className={cn(
        CARD_SHELL,
        'flex-col gap-4 p-6 [@media(max-height:860px)]:gap-3 [@media(max-height:860px)]:p-5',
        WASH_HERO,
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile icon={ChartAnalysis} size="size-9 rounded-xl" className={ICON_TONE.primary} />
          <div className="flex flex-col">
            <h3 className="text-[16px] font-semibold leading-6">Doanh thu trong kỳ</h3>
            <span className={NOTE}>{periodLabel(perf.period)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canViewContracts && (
            <Link
              to={`/sales/contracts?signedFrom=${perf.span.first}&signedTo=${perf.span.last}`}
              className={PILL_LINK}
            >
              Xem hợp đồng
              <Icon icon={ArrowRight} size={14} />
            </Link>
          )}
          {canViewDeals && perf.open.count > 0 && (
            <Link to={dealsHref('open')} className={PILL_LINK}>
              Xem cơ hội
              <Icon icon={ArrowRight} size={14} />
            </Link>
          )}
        </div>
      </div>

      <Figures r={r} />
      <Recognised actual={r.actual} expected={r.expected} />

      <div className="mt-auto flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={NOTE}>Theo {unit} · triệu đồng</span>
          <Legend />
        </div>
        {/* On a coarse pointer a column keeps 56px, so a penalty cell inside it is
            48px; twelve months then scroll sideways, the card with them. */}
        <div className="pointer-coarse:overflow-x-auto">
          <div
            ref={content}
            style={{ '--cols': String(r.columns.length) } as CSSProperties}
            className="pointer-coarse:min-w-[calc(var(--cols)*56px)] relative flex flex-col"
          >
            <Plot columns={r.columns} nameOf={nameOf} zone={zoneProps} />
            <div className="bg-muted-foreground/35 h-px" />
            <Labels columns={r.columns} />
            <PenaltyStrip
              columns={r.columns}
              any={r.penaltyIn.count + r.penaltyOut.count > 0}
              nameOf={nameOf}
              zone={zoneProps}
            />
            {card && shown && (
              <MoneyCardView
                key={`${card.key}-${card.zone}`}
                card={card}
                title={
                  card.kinds.length > 1
                    ? nameOf(shown)
                    : `${KIND_TITLE[card.kinds[0]!]} · ${nameOf(shown)}`
                }
                cardProps={cardProps}
                onClose={close}
              />
            )}
          </div>
        </div>
        <FiguresTable columns={r.columns} unit={unit} />
      </div>
    </section>
  )
}
