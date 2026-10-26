import type { CSSProperties } from 'react'
import { cn } from '@pv/ui'
import { MARK_EASE, staggerMs } from './home-look'
import { hasData, hasEntries, millions, type RevenueColumn } from './home-revenue-model'
import { PEEK_TRIGGER } from './home-revenue-peek'
import { NOTE } from './home-tiles'

/** The revenue tile's chart: one column per bucket, its x labels, and the
 *  penalty strip on the same columns. A column's frame is all the money the
 *  slice may bring (collected + due unpaid + open deals); inside it, from the
 *  foot, what was collected and then what fell due unpaid. Net actual revenue
 *  is not printed per column: penalties sit in their own strip instead.
 *
 *  A whole column is one button (a segment can be 4px tall, no finger hits
 *  that); penalty cells are their own buttons. Heights ride `--max`, so a short
 *  viewport shrinks the plot in CSS. Every focus ring is inset: the chart sits
 *  in a horizontal scroll box that would clip an outside ring. */

/* A short viewport (1280×800) shrinks the 160px plot to 112px, bars from 120px to 80px. */
const PLOT =
  'flex h-40 items-end [--max:120px] [@media(max-height:860px)]:h-28 [@media(max-height:860px)]:[--max:80px]'
/** A collected bar this tall at the smaller scale has room for its figure inside. */
const FIGURE_ROOM = 22 / 80

export const COLLECTED_FILL = 'bg-success'
/** The installments past due: a hatch of the warning hue, so it reads as owed. */
export const DUE_HATCH =
  'bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--warning)_42%,transparent)_0_3px,color-mix(in_srgb,var(--warning)_12%,transparent)_3px_7px)]'
export const OPEN_FRAME =
  'bg-accent outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-primary/45'
/** Two shadows shifted up-left and up-right: top and sides only, the bar stands on the axis. */
const RING_NOW = '[box-shadow:-2px_-2px_0_0_var(--primary),2px_-2px_0_0_var(--primary)]'

const FOCUS_IN =
  'focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2'

export type PeekKind = 'column' | 'penalty-in' | 'penalty-out'
export type Pick = (key: string, kind: PeekKind, el: HTMLElement) => void
export type Peeked = { key: string; kind: PeekKind } | null

const share = (vnd: number, top: number) => (vnd > 0 ? vnd / top : 0)
const grow = `starting:h-0 transition-[height] ${MARK_EASE}`

function Column({
  col,
  top,
  index,
  count,
  name,
  onPick,
  peeked,
}: {
  col: RevenueColumn
  top: number
  index: number
  count: number
  name: string
  onPick: Pick
  peeked: Peeked
}) {
  const { view, collected, due, total } = col
  const g = share(collected, top)
  const key = view.bucket.key
  const delay = { transitionDelay: `${staggerMs(index, count)}ms` }
  const body = (
    <>
      <span
        aria-hidden
        className="tnum font-num flex flex-col items-center whitespace-nowrap text-[12px] leading-4"
      >
        <span className="text-accent-foreground">{total > collected ? millions(total) : ''}</span>
        <span className="text-on-tint-warning font-semibold">
          {due > 0 ? `thiếu ${millions(due)}` : ''}
        </span>
      </span>
      {total > 0 ? (
        <span
          data-frame
          style={{ ...({ '--f': String(share(total, top)) } as CSSProperties), ...delay }}
          className={cn(
            'flex h-[max(6px,calc(var(--f)*var(--max)))] w-[64%] max-w-14 flex-col justify-end overflow-hidden rounded-t-[10px]',
            grow,
            total > collected + due && OPEN_FRAME,
            view.state === 'now' && RING_NOW,
          )}
        >
          {due > 0 && (
            <span
              style={{ ...({ '--h': String(share(due, top)) } as CSSProperties), ...delay }}
              className={cn('h-[max(4px,calc(var(--h)*var(--max)))] shrink-0', DUE_HATCH, grow)}
            />
          )}
          {g > 0 && (
            <span
              style={{ ...({ '--g': String(g) } as CSSProperties), ...delay }}
              className={cn(
                'text-background tnum font-num flex h-[max(4px,calc(var(--g)*var(--max)))] shrink-0 items-center justify-center text-[12px] font-bold',
                COLLECTED_FILL,
                grow,
              )}
            >
              {g >= FIGURE_ROOM ? millions(collected) : ''}
            </span>
          )}
        </span>
      ) : (
        hasData(col) && <span aria-hidden className="bg-muted-foreground h-1 w-[64%] max-w-14" />
      )}
    </>
  )
  const shell = 'relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1 self-stretch'
  if (!hasEntries(col))
    return (
      <div data-col={key} className={shell}>
        {body}
      </div>
    )
  return (
    <button
      type="button"
      data-col={key}
      {...{ [PEEK_TRIGGER]: '' }}
      aria-label={`${name}: đã thu ${millions(col.money.collectedVnd)} triệu${due > 0 ? `, đến hạn chưa thu ${millions(due)} triệu` : ''}, xem từng khoản`}
      aria-expanded={peeked?.key === key && peeked.kind === 'column'}
      onClick={(e) => onPick(key, 'column', e.currentTarget)}
      className={cn(
        shell,
        'hover:bg-surface-ink/4 duration-(--motion-duration) ease-(--motion-ease) rounded-t-xl transition-colors motion-reduce:transition-none',
        FOCUS_IN,
      )}
    >
      {body}
    </button>
  )
}

/** Columns are keyed by position: a value slides to the next period's value. */
export function Plot({
  columns,
  nameOf,
  onPick,
  peeked,
}: {
  columns: RevenueColumn[]
  nameOf: (col: RevenueColumn) => string
  onPick: Pick
  peeked: Peeked
}) {
  const top = Math.max(1, ...columns.map((c) => c.total))
  return (
    <div className={PLOT}>
      {columns.map((col, index) => (
        <Column
          key={index}
          col={col}
          top={top}
          index={index}
          count={columns.length}
          name={nameOf(col)}
          onPick={onPick}
          peeked={peeked}
        />
      ))}
    </div>
  )
}

export function Labels({ columns }: { columns: RevenueColumn[] }) {
  return (
    <div aria-hidden className="flex pt-2 text-[12px] leading-4">
      {columns.map(({ view }) => (
        <div
          key={view.bucket.key}
          className="flex min-w-0 flex-1 flex-col items-center text-center"
        >
          <span
            className={cn(
              'tnum font-num whitespace-nowrap rounded-lg px-2',
              view.state === 'now'
                ? 'bg-accent text-accent-foreground font-semibold'
                : view.state === 'future'
                  ? 'text-glass-foreground'
                  : 'text-muted-foreground',
            )}
          >
            {view.label}
          </span>
          <span className="tnum font-num text-glass-foreground min-h-4 whitespace-nowrap">
            {view.sub}
          </span>
        </div>
      ))}
    </div>
  )
}

const CELL =
  'tnum font-num pointer-coarse:h-12 pointer-coarse:leading-12 relative h-8 w-full max-w-[76px] truncate rounded-lg px-1 text-center text-[12px] font-bold leading-8'

function PenaltyRow({
  columns,
  kind,
  label,
  onPick,
  peeked,
}: {
  columns: RevenueColumn[]
  kind: 'penalty-in' | 'penalty-out'
  label: string
  onPick: Pick
  peeked: Peeked
}) {
  const incoming = kind === 'penalty-in'
  return (
    <>
      <span className={NOTE}>{label}</span>
      <div className="flex">
        {columns.map(({ view, money: m }) => {
          const figure = incoming ? m.penaltyIn : m.penaltyOut
          const amount = millions(figure.amountVnd)
          return (
            <div key={view.bucket.key} className="flex min-w-0 flex-1 justify-center px-1">
              {figure.amountVnd > 0 ? (
                <button
                  type="button"
                  {...{ [PEEK_TRIGGER]: '' }}
                  aria-label={`${label} ${amount} triệu${figure.fromEarlier > 0 ? ', có hợp đồng ký kỳ trước' : ''}, xem chi tiết`}
                  aria-expanded={peeked?.key === view.bucket.key && peeked.kind === kind}
                  onClick={(e) => onPick(view.bucket.key, kind, e.currentTarget)}
                  className={cn(
                    CELL,
                    FOCUS_IN,
                    incoming
                      ? 'bg-channel-meeting/6 text-channel-meeting'
                      : 'bg-destructive/10 text-on-tint-destructive',
                  )}
                >
                  {incoming ? '+' : '−'}
                  {amount}
                  {figure.fromEarlier > 0 && (
                    <span
                      aria-hidden
                      className="bg-destructive-foreground absolute right-1 top-1 size-1.5 rounded-full"
                    />
                  )}
                </button>
              ) : (
                <span aria-hidden className={cn(CELL, 'bg-surface-ink/3 text-glass-foreground')}>
                  —
                </span>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

/** Penalties on the same columns as the chart, in fixed cells: a long figure
 *  truncates rather than stretching or shifting the row. */
export function PenaltyStrip({
  columns,
  any,
  onPick,
  peeked,
}: {
  columns: RevenueColumn[]
  any: boolean
  onPick: Pick
  peeked: Peeked
}) {
  return (
    <div className="border-muted-foreground/25 mt-3 flex flex-col gap-1 border-t border-dashed pt-3 [@media(max-height:860px)]:mt-2 [@media(max-height:860px)]:pt-2">
      <div className={cn(NOTE, 'flex flex-wrap items-center justify-between gap-3')}>
        <span className="text-foreground font-semibold">Tiền phạt</span>
        {any && (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="bg-destructive-foreground size-1.5 rounded-full" />
            chấm góc ô: hợp đồng ký kỳ trước
          </span>
        )}
      </div>
      {any ? (
        <>
          <PenaltyRow
            columns={columns}
            kind="penalty-in"
            label="Khách thanh toán"
            onPick={onPick}
            peeked={peeked}
          />
          <PenaltyRow
            columns={columns}
            kind="penalty-out"
            label="Mình thanh toán"
            onPick={onPick}
            peeked={peeked}
          />
        </>
      ) : (
        <span className={cn(NOTE, 'py-2')}>Kỳ này không có tiền phạt.</span>
      )}
    </div>
  )
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={cn('size-2.5 rounded-[3px]', className)} />
      {label}
    </span>
  )
}

export function Legend() {
  return (
    <div className={cn(NOTE, 'flex flex-wrap items-center gap-x-4 gap-y-1')}>
      <Swatch className={COLLECTED_FILL} label="Đã thu" />
      <Swatch className={OPEN_FRAME} label="Doanh thu dự kiến" />
      <Swatch className={DUE_HATCH} label="Đến hạn chưa thu" />
    </div>
  )
}

/** The chart's numbers for a screen reader: the marks above carry one figure each. */
export function FiguresTable({ columns, unit }: { columns: RevenueColumn[]; unit: string }) {
  return (
    <table className="sr-only">
      <caption>Doanh thu theo {unit}, triệu đồng</caption>
      <thead>
        <tr>
          <th scope="col">Kỳ</th>
          <th scope="col">Đã thu</th>
          <th scope="col">Đến hạn chưa thu</th>
          <th scope="col">Cơ hội dự kiến chốt</th>
          <th scope="col">Khách thanh toán</th>
          <th scope="col">Mình thanh toán</th>
        </tr>
      </thead>
      <tbody>
        {columns.map(({ view, money: m, due, open }) => (
          <tr key={view.bucket.key}>
            <th scope="row">{view.sub ? `${view.label} ${view.sub}` : view.label}</th>
            <td>{millions(m.collectedVnd)}</td>
            <td>{millions(due)}</td>
            <td>{millions(open)}</td>
            <td>{millions(m.penaltyIn.amountVnd)}</td>
            <td>{millions(m.penaltyOut.amountVnd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
