import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Icon, Skeleton, X, cn } from '@pv/ui'
import type { SalesMoneyBucket, SalesMoneyEntry, SalesMoneyFigureKind } from '@pv/contracts'
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

const amountOf = (kind: SalesMoneyFigureKind, vnd: number) =>
  kind === 'penalty-out'
    ? `−${money(Math.abs(vnd))}`
    : kind === 'penalty-in'
      ? `+${money(vnd)}`
      : signedMoney(vnd)

const monthOf = (day: string, home: string) =>
  `T${Number(day.slice(5, 7))}${day.slice(0, 4) === home.slice(0, 4) ? '' : `/${day.slice(0, 4)}`}`

/** A date or a range as a tag, so it reads apart from the amount next to it. */
function Day({ first, last }: { first: string; last: string }) {
  return (
    <span className="bg-surface-ink/8 text-foreground mx-1 rounded-md px-2 text-[11px] font-semibold leading-[18px]">
      {rangeLabel({ first, last })}
    </span>
  )
}

const installmentOf = (e: SalesMoneyEntry) =>
  e.installmentNo !== null && e.installmentCount !== null
    ? `Đợt ${e.installmentNo}/${e.installmentCount}`
    : (e.label ?? '')

/** One contract's rows in a section: what it nets, and how. */
type Group = {
  code: string
  entries: SalesMoneyEntry[]
  net: number
  paid: number
  refund: number
}

function groupOf(entries: SalesMoneyEntry[]): Group[] {
  const by = new Map<string, Group>()
  for (const e of entries) {
    const code = e.contractCode ?? e.opportunityCode ?? '—'
    const g = by.get(code) ?? { code, entries: [], net: 0, paid: 0, refund: 0 }
    g.entries.push(e)
    g.net += e.amountVnd
    if (e.amountVnd < 0) g.refund -= e.amountVnd
    else g.paid += e.amountVnd
    by.set(code, g)
  }
  return [...by.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
}

const TERMINATED =
  'bg-destructive/10 text-on-tint-destructive rounded-lg px-2 text-[11px] font-semibold leading-5'

/** The foot of a card: a solid block apart from the grey ones above it. */
const TOTAL_BLOCK =
  'bg-primary text-primary-foreground mt-1 flex items-center justify-between gap-3 rounded-xl px-4 py-3 shadow-[0_-8px_12px_-10px_color-mix(in_srgb,var(--surface-ink)_35%,transparent)]'

function Detail({ kind, group }: { kind: SalesMoneyFigureKind; group: Group }) {
  const first = group.entries[0]!
  const days = group.entries.map((e) => e.day)
  if (kind === 'penalty-in' || kind === 'penalty-out') {
    return (
      <>
        Chấm dứt
        <Day first={first.day} last={first.day} />
        {first.pending
          ? 'chưa trả'
          : first.signedOn
            ? `đã trả · ký ${monthOf(first.signedOn, first.day)}`
            : 'đã trả'}
      </>
    )
  }
  if (group.entries.length === 1 && first.amountVnd >= 0) {
    return (
      <>
        {installmentOf(first)}
        <Day first={first.day} last={first.day} />
      </>
    )
  }
  const paidRows = group.entries.filter((e) => e.amountVnd >= 0).length
  return (
    <>
      {paidRows} đợt
      <Day first={days[0]!} last={days[days.length - 1]!} />
      {group.refund > 0 && (
        <>
          thu <b className="text-on-tint-success font-semibold">{money(group.paid)}</b> hoàn{' '}
          <b className="text-destructive-foreground font-semibold">{money(group.refund)}</b>
        </>
      )}
    </>
  )
}

function GroupRow({
  kind,
  group,
  ink,
  open,
  onToggle,
}: {
  kind: SalesMoneyFigureKind
  group: Group
  ink: string
  open: boolean
  onToggle: () => void
}) {
  const first = group.entries[0]!
  const expandable = group.entries.length > 1
  const head = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className="font-mono font-semibold">{group.code}</span>
        {first.title && (
          <span className="text-muted-foreground truncate" title={first.title}>
            {first.title}
          </span>
        )}
        {first.terminated && <span className={TERMINATED}>Đã chấm dứt</span>}
      </span>
      <span
        className={cn('tnum font-num font-bold', group.net === 0 ? 'text-muted-foreground' : ink)}
      >
        {amountOf(kind, group.net)}
      </span>
      <span className="text-muted-foreground tnum font-num col-span-2 flex flex-wrap items-center">
        <Detail kind={kind} group={group} />
      </span>
    </>
  )
  return (
    <div className="flex flex-col py-2 text-[12px] leading-4">
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="focus-visible:outline-ring pointer-coarse:min-h-12 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 text-left focus-visible:outline-2"
        >
          {head}
        </button>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1">{head}</div>
      )}
      {open && (
        <div className="bg-card mt-2 flex flex-col rounded-xl px-3 py-1">
          {group.entries.map((e, i) => (
            <div
              key={i}
              className="text-muted-foreground tnum font-num flex justify-between gap-2 py-1"
            >
              <span className="flex items-center">
                {e.amountVnd < 0 ? 'Hoàn tiền' : installmentOf(e)}
                <Day first={e.day} last={e.day} />
              </span>
              <span
                className={cn(
                  'font-semibold',
                  e.amountVnd < 0 ? 'text-destructive-foreground' : ink,
                )}
              >
                {signedMoney(e.amountVnd)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
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
  const [opened, setOpened] = useState<string | null>(null)
  const ink = KIND_INK[kind]
  const total = read.data && (
    <span className={cn('tnum font-num text-[13px] font-bold', ink)}>
      {amountOf(kind, read.data.totalVnd)}
    </span>
  )
  return (
    <section className="bg-muted flex flex-col rounded-xl px-3 pb-2">
      {heading && (
        <div className="flex items-baseline justify-between pt-2">
          <h4 className="text-[13px] font-semibold leading-[18px]">{KIND_TITLE[kind]}</h4>
          {total}
        </div>
      )}
      {read.data ? (
        <>
          {read.data.entries.length === 0 && (
            <span className={cn(NOTE, 'flex h-7 items-center')}>Không có khoản nào.</span>
          )}
          <div>
            {groupOf(read.data.entries).map((g) => (
              <GroupRow
                key={g.code}
                kind={kind}
                group={g}
                ink={ink}
                open={opened === g.code}
                onToggle={() => setOpened(opened === g.code ? null : g.code)}
              />
            ))}
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

/** The column card's head: what came in, what went back, what is owed, what is coming. */
function Summary({ period, bucket }: { period: string; bucket: SalesMoneyBucket }) {
  const read = useQuery(salesMoneyEntriesQuery(period, bucket.key, 'collected'))
  const rows = read.data?.entries
  const refund = rows?.reduce((n, e) => (e.amountVnd < 0 ? n - e.amountVnd : n), 0)
  const paid = rows?.reduce((n, e) => (e.amountVnd > 0 ? n + e.amountVnd : n), 0)
  const cells: { label: string; value: string | null; dot: string; ink: string }[] = [
    {
      label: 'Đã thu',
      value: paid === undefined ? null : money(paid),
      dot: 'bg-success',
      ink: 'text-on-tint-success',
    },
    {
      label: 'Hoàn tiền',
      value: refund === undefined ? null : refund > 0 ? `−${money(refund)}` : money(0),
      dot: 'bg-destructive',
      ink: 'text-destructive-foreground',
    },
    {
      label: 'Phải thu',
      value: money(bucket.dueUnpaidVnd),
      dot: 'bg-warning',
      ink: 'text-on-tint-warning',
    },
    {
      label: 'Sắp đến hạn',
      value: money(bucket.upcomingVnd),
      dot: 'bg-primary',
      ink: 'text-accent-foreground',
    },
  ]
  return (
    <div className="grid grid-cols-4 gap-x-2">
      {cells.map((c) => (
        <div key={c.label} className="flex flex-col">
          <span className={cn(NOTE, 'flex items-center gap-1 whitespace-nowrap')}>
            <span aria-hidden className={cn('size-2 rounded-[3px]', c.dot)} />
            {c.label}
          </span>
          {c.value === null ? (
            <Skeleton width="60%" />
          ) : (
            <span className={cn('tnum font-num text-[16px] font-bold leading-6', c.ink)}>
              {c.value}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export function MoneyCardView({
  card,
  bucket,
  title,
  cardProps,
  onClose,
}: {
  card: MoneyCard
  /** The column's figures: the head and the foot of a card that holds several sections. */
  bucket: SalesMoneyBucket
  title: string
  cardProps: ReturnType<typeof useMoneyCard>['cardProps']
  onClose: () => void
}) {
  const closer = useRef<HTMLButtonElement>(null)
  const single = card.kinds.length === 1 ? card.kinds[0]! : null
  const sum = useQuery({
    ...salesMoneyEntriesQuery(card.period, card.key, card.kinds[0]!),
    enabled: single !== null,
  })
  useEffect(() => {
    if (card.focus) closer.current?.focus()
  }, [card.focus])

  return (
    <div
      {...cardProps}
      role="dialog"
      aria-label={title}
      style={{
        left: card.place.left,
        top: card.place.top,
        bottom: card.place.bottom,
        width: CARD_WIDTH,
      }}
      className="absolute z-30"
    >
      <span
        aria-hidden
        style={{ left: card.place.arrow - 6 }}
        className={cn(
          'glass-overlay-caret absolute size-3 rotate-45 rounded-[3px]',
          card.place.below ? '-top-1' : '-bottom-1',
        )}
      />
      <div
        style={{ maxHeight: card.place.maxHeight }}
        className="glass-overlay relative flex flex-col gap-3 whitespace-normal rounded-2xl p-4 text-left"
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
        {card.kinds.length > 1 && (
          <div className="bg-muted rounded-xl px-3 py-3">
            <Summary period={card.period} bucket={bucket} />
          </div>
        )}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-1">
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
        {single && (
          <div className={TOTAL_BLOCK}>
            <span className="whitespace-nowrap text-[13px] font-semibold">Cộng</span>
            {sum.data ? (
              <span className="tnum font-num text-[20px] font-bold leading-7">
                {amountOf(single, sum.data.totalVnd)}
              </span>
            ) : (
              <Skeleton width="4rem" />
            )}
          </div>
        )}
        {card.kinds.length > 1 && (
          <div className={TOTAL_BLOCK}>
            <span className="whitespace-nowrap text-[13px] font-semibold">Doanh thu thực tế</span>
            <span className="tnum font-num text-[20px] font-bold leading-7">
              {signedMoney(bucket.actualVnd)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
