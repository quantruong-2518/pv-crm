import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Icon, Skeleton, X, cn } from '@pv/ui'
import type { SalesMoneyEntry, SalesMoneyFigureKind } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { salesMoneyEntriesQuery } from '@/data/home-charts'
import { rangeLabel } from '@/data/period-pick'
import { money } from './home-model'
import { KIND_INK, KIND_TITLE, signedMoney } from './home-revenue-model'
import { NOTE } from './home-tiles'

/** The rows behind one chart column or one penalty cell: which contract, which
 *  installment, which day, how much. Local because `@pv/ui` has no click
 *  popover (InfoTip opens on hover only). Non-modal: focus lands on its close
 *  button; Escape, that button or a press outside shuts it, and focus goes back
 *  to the mark that opened it. Each section is its own read with its own sum. */

/** Marks that open a popover carry this, so pressing one is not "outside". */
export const PEEK_TRIGGER = 'data-peek-trigger'

/** The popover's width in px; the tile clamps its left edge with it. */
export const PEEK_WIDTH = 296

const amountOf = (kind: SalesMoneyFigureKind, vnd: number) =>
  kind === 'penalty-out'
    ? `−${money(Math.abs(vnd))}`
    : kind === 'penalty-in'
      ? `+${money(vnd)}`
      : signedMoney(vnd)

const monthOf = (day: string, home: string) =>
  `T${Number(day.slice(5, 7))}${day.slice(0, 4) === home.slice(0, 4) ? '' : `/${day.slice(0, 4)}`}`

function detailOf(entry: SalesMoneyEntry): string {
  if (entry.kind === 'penalty-in' || entry.kind === 'penalty-out') {
    const signed = `Chấm dứt · ký ${monthOf(entry.signedOn, entry.day)}`
    return entry.pending ? `${signed} · chưa trả` : signed
  }
  const part =
    entry.installmentNo !== null && entry.installmentCount !== null
      ? `Đợt ${entry.installmentNo}/${entry.installmentCount}`
      : (entry.label ?? (entry.kind === 'refund' ? 'Hoàn tiền' : ''))
  const day = rangeLabel({ first: entry.day, last: entry.day })
  return part ? `${part} · ${day}` : day
}

function Section({
  period,
  bucket,
  kind,
  heading,
}: {
  period: string
  bucket: string
  kind: SalesMoneyFigureKind
  /** Printed when the popover holds more than one section. */
  heading: boolean
}) {
  const read = useQuery(salesMoneyEntriesQuery(period, bucket, kind))
  const ink = KIND_INK[kind]
  return (
    <section className="flex flex-col">
      {heading && (
        <h4 className="text-muted-foreground pb-1 text-[12px] font-semibold leading-4">
          {KIND_TITLE[kind]}
        </h4>
      )}
      {read.data ? (
        <>
          {read.data.entries.length === 0 && (
            <span className={cn(NOTE, 'py-2')}>Không có khoản nào.</span>
          )}
          {read.data.entries.map((entry, i) => (
            <div
              key={`${entry.contractCode}-${entry.kind}-${entry.installmentNo ?? ''}-${i}`}
              className="border-surface-ink/6 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t py-2 text-[12px] leading-4"
            >
              <span className="font-mono font-semibold">{entry.contractCode}</span>
              <span className={cn('tnum font-num font-bold', ink)}>
                {amountOf(kind, entry.amountVnd)}
              </span>
              <span className="text-muted-foreground tnum font-num col-span-2">
                {detailOf(entry)}
              </span>
            </div>
          ))}
          <div className="border-surface-ink/12 flex justify-between border-t pt-2 text-[13px] font-bold leading-[18px]">
            <span>Cộng</span>
            <span className={cn('tnum font-num', ink)}>{amountOf(kind, read.data.totalVnd)}</span>
          </div>
        </>
      ) : read.error ? (
        <div className="flex flex-col items-start gap-2">
          <span className={cn(NOTE, 'text-destructive-foreground')}>
            {isApiError(read.error) ? userMessage(read.error) : 'Không tải được.'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-12"
            onClick={() => void read.refetch()}
          >
            Thử lại
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Skeleton />
          <Skeleton width="70%" />
        </div>
      )}
    </section>
  )
}

export function RevenuePeek({
  period,
  bucket,
  kinds,
  title,
  left,
  bottom,
  opener,
  onClose,
}: {
  period: string
  bucket: string
  /** One section per figure, in this order. */
  kinds: SalesMoneyFigureKind[]
  title: string
  /** Px inside the chart box, measured from the column when it was pressed. */
  left: number
  bottom: number
  opener: HTMLElement
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const closer = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closer.current?.focus()
    const outside = (e: PointerEvent) => {
      const target = e.target as Element
      if (!panel.current?.contains(target) && !target.closest(`[${PEEK_TRIGGER}]`)) onClose()
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      onClose()
      opener.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [onClose, opener])

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={title}
      style={{ left, bottom, width: PEEK_WIDTH }}
      className="glass-overlay absolute z-30 flex max-h-80 flex-col gap-3 overflow-y-auto whitespace-normal rounded-2xl p-3 text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold leading-[18px]">{title}</span>
        <button
          ref={closer}
          type="button"
          aria-label="Đóng"
          onClick={() => {
            onClose()
            opener.focus()
          }}
          className="text-muted-foreground hover:bg-surface-ink/8 focus-visible:outline-ring pointer-coarse:size-12 flex size-7 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2"
        >
          <Icon icon={X} size={16} />
        </button>
      </div>
      {kinds.map((kind) => (
        <Section
          key={kind}
          period={period}
          bucket={bucket}
          kind={kind}
          heading={kinds.length > 1}
        />
      ))}
    </div>
  )
}
