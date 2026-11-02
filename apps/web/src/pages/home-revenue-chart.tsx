import type { CSSProperties } from 'react'
import type { SalesMoneyFigureKind } from '@pv/contracts'
import { cn } from '@pv/ui'
import { message, useI18n, type Message } from '@/app/i18n'
import { MARK_EASE, staggerMs } from './home-look'
import {
  KIND_TITLE,
  columnKinds,
  hasData,
  millions,
  type RevenueColumn,
} from './home-revenue-model'
import type { ZoneProps } from './home-revenue-hover'
import { NOTE } from './home-tiles'

/** The revenue tile's chart: one column per bucket, its x labels, and the
 *  penalty strip on the same columns. A column's frame is all the money the
 *  slice may bring; inside it, from the foot: collected, due unpaid, upcoming
 *  installments. Net actual revenue
 *  is not printed per column: penalties sit in their own strip instead.
 *
 *  A pointer gets the whole column as one zone, through a cover button (a
 *  segment can be 4px tall); the parts of a column and a penalty cell stay their
 *  own buttons for the keyboard, and a penalty cell for the pointer.
 *  Heights ride `--max`, so a short viewport shrinks the plot in CSS. Focus
 *  rings are inset: on a tablet the chart sits in a scroll box that would clip them. */

/* A short viewport (1280×800) shrinks the 160px plot to 112px, bars from 120px to 80px. */
const PLOT =
  'flex h-40 items-end [--max:120px] [@media(max-height:860px)]:h-28 [@media(max-height:860px)]:[--max:80px]'
/** A collected bar this tall at the smaller scale has room for its figure inside. */
const FIGURE_ROOM = 22 / 80

export const COLLECTED_FILL = 'bg-success'
/** The installments past due: a hatch of the warning hue, so it reads as owed. */
export const DUE_HATCH =
  'bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--warning)_42%,transparent)_0_3px,color-mix(in_srgb,var(--warning)_12%,transparent)_3px_7px)]'
/** Installments of signed contracts still to fall due: the collected hue, washed,
 *  with a solid top edge, so it reads as planned and firm. */
export const UPCOMING_FILL = 'bg-success/25 [box-shadow:inset_0_2px_0_0_var(--success)]'
export const OPEN_FRAME =
  'bg-accent outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-primary/45'
/** Two shadows shifted up-left and up-right: top and sides only, the bar stands on the axis. */
const RING_NOW = '[box-shadow:-2px_-2px_0_0_var(--primary),2px_-2px_0_0_var(--primary)]'

const FOCUS_IN =
  'focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2'

/** Hands out the hover-card wiring of one zone. */
export type Zone = (key: string, zone: string, kinds: SalesMoneyFigureKind[]) => ZoneProps

/** A zone that is hovered or shows the card lifts a little and takes the focus ring tone. */
const ZONE_LOOK =
  'hover:brightness-110 aria-expanded:brightness-110 aria-expanded:[box-shadow:inset_0_0_0_2px_var(--ring)]'
/** Segments sit under the column's cover: a pointer never reaches them. */
const SEGMENT = `block w-full shrink-0 ${ZONE_LOOK} ${FOCUS_IN}`

const SEGMENT_FIGURE =
  'text-background tnum font-num flex items-center justify-center text-[12px] font-bold'

const MILLION = (figure: string) => message(`${figure} triệu`, `${figure} million`, `${figure}백만`)

const share = (vnd: number, top: number) => (vnd > 0 ? vnd / top : 0)
const grow = `starting:h-0 transition-[height] ${MARK_EASE}`

function Column({
  col,
  top,
  index,
  count,
  name,
  zone,
}: {
  col: RevenueColumn
  top: number
  index: number
  count: number
  name: string
  zone: Zone
}) {
  const { view, collected, due, upcoming, total } = col
  const g = share(collected, top)
  const key = view.bucket.key
  const delay = { transitionDelay: `${staggerMs(index, count)}ms` }
  /* Top-down in the DOM, since the frame stacks from its foot. */
  const segments = [
    { kind: 'upcoming', vnd: upcoming, look: UPCOMING_FILL },
    { kind: 'due-unpaid', vnd: due, look: DUE_HATCH },
    { kind: 'collected', vnd: collected, look: cn(COLLECTED_FILL, SEGMENT_FIGURE) },
  ] as const
  const { t } = useI18n()
  const kinds = columnKinds(col)
  const said = (kind: SalesMoneyFigureKind, vnd: number) =>
    `${t(KIND_TITLE[kind]).toLowerCase()} ${t(MILLION(millions(vnd)))}`
  return (
    <div className="relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1 self-stretch">
      <span
        aria-hidden
        className="tnum font-num flex flex-col items-center whitespace-nowrap text-[12px] leading-4"
      >
        <span className="text-accent-foreground">{total > collected ? millions(total) : ''}</span>
        <span className="text-on-tint-warning font-semibold">
          {due > 0
            ? t(
                message(
                  `thiếu ${millions(due)}`,
                  `${millions(due)} short`,
                  `${millions(due)} 부족`,
                ),
              )
            : ''}
        </span>
      </span>
      {total > 0 ? (
        <span
          style={{ ...({ '--f': String(share(total, top)) } as CSSProperties), ...delay }}
          className={cn(
            'flex h-[max(6px,calc(var(--f)*var(--max)))] w-[64%] max-w-14 flex-col justify-end overflow-hidden rounded-t-[10px]',
            grow,
            view.state === 'now' && RING_NOW,
          )}
        >
          {segments.map(
            ({ kind, vnd, look }) =>
              vnd > 0 && (
                <button
                  key={kind}
                  type="button"
                  aria-label={`${name}: ${said(kind, vnd)}`}
                  {...zone(key, kind, [kind])}
                  style={{ ...({ '--s': String(share(vnd, top)) } as CSSProperties), ...delay }}
                  className={cn('h-[max(4px,calc(var(--s)*var(--max)))]', grow, SEGMENT, look)}
                >
                  {kind === 'collected' && g >= FIGURE_ROOM ? millions(collected) : ''}
                </button>
              ),
          )}
        </span>
      ) : (
        hasData(col) && <span aria-hidden className="bg-muted-foreground h-1 w-[64%] max-w-14" />
      )}
      {kinds.length > 0 && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${name}: ${kinds
            .map((k) =>
              said(
                k,
                {
                  collected: col.money.collectedVnd,
                  'due-unpaid': due,
                  upcoming,
                  'penalty-in': col.money.penaltyIn.amountVnd,
                  'penalty-out': col.money.penaltyOut.amountVnd,
                  settled: col.money.settledVnd,
                }[k],
              ),
            )
            .join(', ')}`}
          {...zone(key, 'column', kinds)}
          className="aria-expanded:bg-surface-ink/4 absolute inset-0 block rounded-t-xl"
        />
      )}
    </div>
  )
}

/** Columns are keyed by position: a value slides to the next period's value. */
export function Plot({
  columns,
  nameOf,
  zone,
}: {
  columns: RevenueColumn[]
  nameOf: (col: RevenueColumn) => string
  zone: Zone
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
          zone={zone}
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
  nameOf,
  zone,
}: {
  columns: RevenueColumn[]
  kind: 'penalty-in' | 'penalty-out'
  label: string
  nameOf: (col: RevenueColumn) => string
  zone: Zone
}) {
  const { t } = useI18n()
  const incoming = kind === 'penalty-in'
  return (
    <>
      <span className={NOTE}>{label}</span>
      <div className="flex">
        {columns.map((col) => {
          const { view, money: m } = col
          const figure = incoming ? m.penaltyIn : m.penaltyOut
          const amount = millions(figure.amountVnd)
          return (
            <div key={view.bucket.key} className="flex min-w-0 flex-1 justify-center px-1">
              {figure.amountVnd > 0 ? (
                <button
                  type="button"
                  aria-label={`${nameOf(col)}: ${label.toLowerCase()} ${t(MILLION(amount))}${figure.fromEarlier > 0 ? t(message(', có hợp đồng ký kỳ trước', ', includes contracts signed in an earlier period', ', 이전 기간에 체결된 계약 포함')) : ''}`}
                  {...zone(view.bucket.key, kind, [kind])}
                  className={cn(
                    CELL,
                    FOCUS_IN,
                    ZONE_LOOK,
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
  nameOf,
  zone,
}: {
  columns: RevenueColumn[]
  any: boolean
  nameOf: (col: RevenueColumn) => string
  zone: Zone
}) {
  const { t } = useI18n()
  return (
    <div className="border-muted-foreground/25 mt-3 flex flex-col gap-1 border-t border-dashed pt-3 [@media(max-height:860px)]:mt-2 [@media(max-height:860px)]:pt-2">
      <div className={cn(NOTE, 'flex flex-wrap items-center justify-between gap-3')}>
        <span className="text-foreground font-semibold">
          {t(message('Tiền phạt', 'Penalties', '위약금'))}
        </span>
        {any && (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="bg-destructive-foreground size-1.5 rounded-full" />
            {t(
              message(
                'chấm góc ô: hợp đồng ký kỳ trước',
                'corner dot: contract signed in an earlier period',
                '모서리 점: 이전 기간에 체결된 계약',
              ),
            )}
          </span>
        )}
      </div>
      {any ? (
        <>
          <PenaltyRow
            columns={columns}
            kind="penalty-in"
            label={t(KIND_TITLE['penalty-in'])}
            nameOf={nameOf}
            zone={zone}
          />
          <PenaltyRow
            columns={columns}
            kind="penalty-out"
            label={t(KIND_TITLE['penalty-out'])}
            nameOf={nameOf}
            zone={zone}
          />
        </>
      ) : (
        <span className={cn(NOTE, 'py-2')}>
          {t(
            message(
              'Kỳ này không có tiền phạt.',
              'No penalties this period.',
              '이 기간에는 위약금이 없습니다.',
            ),
          )}
        </span>
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
  const { t } = useI18n()
  return (
    <div className={cn(NOTE, 'flex flex-wrap items-center gap-x-4 gap-y-1')}>
      <Swatch className={COLLECTED_FILL} label={t(KIND_TITLE.collected)} />
      <Swatch className={DUE_HATCH} label={t(KIND_TITLE['due-unpaid'])} />
      <Swatch className={UPCOMING_FILL} label={t(KIND_TITLE.upcoming)} />
    </div>
  )
}

/** The chart's numbers for a screen reader: the marks above carry one figure each. */
export function FiguresTable({ columns, unit }: { columns: RevenueColumn[]; unit: Message }) {
  const { t } = useI18n()
  return (
    <table className="sr-only">
      <caption>
        {t(
          message(
            `Doanh thu theo ${unit.vi}, triệu đồng`,
            `Revenue by ${unit.en}, VND millions`,
            `${unit.ko}별 매출, 백만 VND`,
          ),
        )}
      </caption>
      <thead>
        <tr>
          <th scope="col">{t(message('Kỳ', 'Period', '기간'))}</th>
          <th scope="col">{t(KIND_TITLE.collected)}</th>
          <th scope="col">{t(KIND_TITLE['due-unpaid'])}</th>
          <th scope="col">{t(KIND_TITLE.upcoming)}</th>
          <th scope="col">{t(KIND_TITLE['penalty-in'])}</th>
          <th scope="col">{t(KIND_TITLE['penalty-out'])}</th>
        </tr>
      </thead>
      <tbody>
        {columns.map(({ view, money: m, due, upcoming }) => (
          <tr key={view.bucket.key}>
            <th scope="row">{view.sub ? `${view.label} ${view.sub}` : view.label}</th>
            <td>{millions(m.collectedVnd)}</td>
            <td>{millions(due)}</td>
            <td>{millions(upcoming)}</td>
            <td>{millions(m.penaltyIn.amountVnd)}</td>
            <td>{millions(m.penaltyOut.amountVnd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
