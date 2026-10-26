import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Icon, Skeleton, X, cn } from '@pv/ui'
import type { SalesMoneyEntry, SalesMoneyFigureKind } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { salesMoneyEntriesQuery } from '@/data/home-charts'
import { rangeLabel } from '@/data/period-pick'
import { money } from './home-model'
import { CARD_WIDTH, type MoneyCard, type useMoneyCard } from './home-revenue-hover'
import { KIND_INK, KIND_TITLE, signedMoney } from './home-revenue-model'
import { NOTE } from './home-tiles'

/** The rows behind one money zone: contract, installment or label, day, amount,
 *  one line each. Local because `@pv/ui` has no hover card (InfoTip has no
 *  pinning and portals out of the chart). Drawn inside the chart content, so
 *  it scrolls with the columns. Not a modal: no backdrop, no focus trap.
 *  Rows and their skeletons share one height, so the card keeps its size when
 *  the read lands; each section is its own read with its own sum. */

/** One line per row; a row naming its customer takes a second line under it. */
const ROW =
  'grid min-h-7 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 py-1 text-[12px] leading-4'

const amountOf = (kind: SalesMoneyFigureKind, vnd: number) =>
  kind === 'penalty-out'
    ? `−${money(Math.abs(vnd))}`
    : kind === 'penalty-in'
      ? `+${money(vnd)}`
      : signedMoney(vnd)

const monthOf = (day: string, home: string) =>
  `T${Number(day.slice(5, 7))}${day.slice(0, 4) === home.slice(0, 4) ? '' : `/${day.slice(0, 4)}`}`

function detailOf(entry: SalesMoneyEntry): string {
  const day = rangeLabel({ first: entry.day, last: entry.day })
  if (entry.kind === 'penalty-in' || entry.kind === 'penalty-out') {
    const ended = entry.signedOn
      ? `Chấm dứt · ký ${monthOf(entry.signedOn, entry.day)}`
      : 'Chấm dứt'
    return entry.pending ? `${ended} · chưa trả` : ended
  }
  if (entry.kind === 'open-deal') return `Dự kiến chốt ${day}`
  const part =
    entry.installmentNo !== null && entry.installmentCount !== null
      ? `Đợt ${entry.installmentNo}/${entry.installmentCount}`
      : (entry.label ?? (entry.kind === 'refund' ? 'Hoàn tiền' : ''))
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
  /** Printed when the card holds more than one section. */
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
            <span className={cn(NOTE, 'flex h-7 items-center')}>Không có khoản nào.</span>
          )}
          {read.data.entries.map((entry, i) => (
            <div
              key={`${entry.contractCode ?? entry.opportunityCode ?? ''}-${entry.kind}-${entry.installmentNo ?? ''}-${i}`}
              className={cn(ROW, 'border-surface-ink/6 border-t')}
            >
              <span className="font-mono font-semibold">
                {entry.contractCode ?? entry.opportunityCode ?? '—'}
              </span>
              <span
                className="text-muted-foreground tnum font-num truncate"
                title={detailOf(entry)}
              >
                {detailOf(entry)}
              </span>
              <span className={cn('tnum font-num font-bold', ink)}>
                {amountOf(kind, entry.amountVnd)}
              </span>
              {entry.title && (
                <span className="col-span-3 truncate" title={entry.title}>
                  {entry.title}
                </span>
              )}
            </div>
          ))}
          <div className="border-surface-ink/12 flex h-7 items-center justify-between border-t text-[13px] font-bold leading-[18px]">
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
        [0, 1, 2].map((i) => (
          <div key={i} className="flex h-7 items-center">
            <Skeleton width={i === 2 ? '50%' : '100%'} />
          </div>
        ))
      )}
    </section>
  )
}

export function MoneyCardView({
  card,
  title,
  cardProps,
  onClose,
}: {
  card: MoneyCard
  title: string
  cardProps: ReturnType<typeof useMoneyCard>['cardProps']
  onClose: () => void
}) {
  const closer = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (card.focus) closer.current?.focus()
  }, [card.focus])

  return (
    <div
      {...cardProps}
      role="dialog"
      aria-label={title}
      style={{ ...card.place, width: CARD_WIDTH }}
      className="glass-overlay absolute z-30 flex flex-col gap-2 overflow-y-auto overscroll-contain whitespace-normal rounded-2xl p-3 text-left"
    >
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="text-[13px] font-semibold leading-[18px]">{title}</span>
        {card.pinned && (
          <button
            ref={closer}
            type="button"
            aria-label="Đóng"
            onClick={() => {
              onClose()
              card.opener.focus()
            }}
            className="text-muted-foreground hover:bg-surface-ink/8 focus-visible:outline-ring pointer-coarse:size-12 flex size-7 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2"
          >
            <Icon icon={X} size={16} />
          </button>
        )}
      </div>
      {card.kinds.map((kind) => (
        <Section
          key={kind}
          period={card.period}
          bucket={card.key}
          kind={kind}
          heading={card.kinds.length > 1}
        />
      ))}
    </div>
  )
}
