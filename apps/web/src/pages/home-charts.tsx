import { GlassCard, cn, percent } from '@pv/ui'
import {
  OPPORTUNITY_STAGE_LABEL,
  type SalesExitsResponse,
  type SalesPerformanceResponse,
} from '@pv/contracts'
import { monthInPeriod, num, periodShort, stopsByStage } from './home-model'
import { GROW_HEIGHT, GROW_WIDTH, NEUTRAL_MARK, NOTE, TILE, TileHead } from './home-tiles'

/** The chart tiles of row two: both read live figures of the picked period. */

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className={cn('rounded-xs size-2', className)} />
      {label}
    </span>
  )
}

/** One column per month of the quarter the period sits in: the leads that
 *  entered the book that month, split into those that have reached the
 *  opportunity book by now and the rest. The fills encode that split, so the
 *  picked period is told by the label's weight, never by dimming a column. */
export function MonthsTile({
  data,
  className,
}: {
  data: SalesPerformanceResponse
  className?: string
}) {
  const top = Math.max(1, ...data.months.map((m) => m.cohort.leads))

  return (
    <GlassCard className={cn(TILE, className)}>
      <TileHead
        title="Lead thành cơ hội theo tháng"
        aside={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <span>cả quý</span>
            <Swatch className="bg-primary" label="thành cơ hội" />
            <Swatch className={NEUTRAL_MARK} label="chưa" />
          </span>
        }
      />
      <div className="flex flex-1 gap-3">
        {data.months.map(({ key, cohort: m }) => (
          <div key={key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="tnum font-num text-[12px] font-semibold leading-4">
              {m.leads > 0 ? percent(m.opportunities / m.leads) : '—'}
            </span>
            {/* A 1px card-colour seam (a shadow, not a gap): the two fills are under 3:1 against each other. */}
            <div className="flex h-36 w-full max-w-10 flex-col justify-end">
              <span
                className={cn(NEUTRAL_MARK, 'rounded-t-sm', GROW_HEIGHT)}
                style={{ height: `${((m.leads - m.opportunities) / top) * 100}%` }}
              />
              <span
                className={cn('bg-primary shadow-[0_-1px_0_var(--card)]', GROW_HEIGHT)}
                style={{ height: `${(m.opportunities / top) * 100}%` }}
              />
            </div>
            <span className={cn(NOTE, 'tnum font-num')}>
              {num(m.opportunities)} / {num(m.leads)}
            </span>
            <span
              className={cn(
                'tnum font-num text-[12px] leading-4',
                monthInPeriod(key, data.period)
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground',
              )}
            >
              {periodShort(key)}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

/** One reason and how many left for it, as a bar scaled to the longest of its list. */
function ReasonRow({ label, count, top }: { label: string; count: number; top: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2 text-[12.5px]">
        <span className="line-clamp-2 min-w-0 flex-1" title={label}>
          {label}
        </span>
        <span className="tnum font-num font-semibold">{num(count)}</span>
      </div>
      <div
        className={cn('bg-primary h-2 min-w-1 rounded-sm', GROW_WIDTH)}
        style={{ width: `${(count / top) * 100}%` }}
      />
    </div>
  )
}

/** Rows a reason list prints before it folds the rest into one line: the tile
 *  shares a row with two others, so an unbounded list would stretch the row. */
const REASON_ROWS = 5

/** The top rows of one reason list, then how many more reasons there are. */
function ReasonList({
  reasons,
  top,
}: {
  reasons: readonly { key: string; label: string; count: number }[]
  top: number
}) {
  const rest = reasons.length - REASON_ROWS
  return (
    <>
      {reasons.slice(0, REASON_ROWS).map((r) => (
        <ReasonRow key={r.key} label={r.label} count={r.count} top={top} />
      ))}
      {rest > 0 && <span className={NOTE}>và {num(rest)} lý do khác</span>}
    </>
  )
}

/** Why leads and deals left in the picked period: two short lists in one card,
 *  most frequent first, deal stops split by the column the deal stood in. The
 *  count beside each bar carries the number, so no bar is read by colour alone. */
export function ReasonsTile({ data, className }: { data: SalesExitsResponse; className?: string }) {
  const stops = stopsByStage(data.dealStops)
  const leadTop = Math.max(1, ...data.leadExits.map((r) => r.count))
  const dealTop = Math.max(1, ...data.dealStops.map((r) => r.count))

  if (data.leadExits.length === 0 && stops.length === 0)
    return (
      <GlassCard className={cn(TILE, className)}>
        <TileHead title="Lý do dừng" aside={periodShort(data.period)} />
        <p className={NOTE}>Kỳ này chưa có lead ngừng chăm sóc hay cơ hội dừng.</p>
      </GlassCard>
    )

  return (
    <GlassCard className={cn(TILE, className)}>
      {data.leadExits.length > 0 && (
        <section className="flex flex-col gap-2">
          <TileHead title="Lý do lead ngừng chăm sóc" aside={periodShort(data.period)} />
          <ReasonList reasons={data.leadExits} top={leadTop} />
        </section>
      )}
      {stops.length > 0 && (
        <section className="flex flex-col gap-2">
          <TileHead
            title="Lý do dừng cơ hội"
            aside={data.leadExits.length === 0 ? periodShort(data.period) : undefined}
          />
          {stops.map(({ stage, reasons }) => (
            <div key={stage} className="flex flex-col gap-2">
              <span className={NOTE}>Dừng ở {OPPORTUNITY_STAGE_LABEL[stage]}</span>
              <ReasonList reasons={reasons} top={dealTop} />
            </div>
          ))}
        </section>
      )}
    </GlassCard>
  )
}
