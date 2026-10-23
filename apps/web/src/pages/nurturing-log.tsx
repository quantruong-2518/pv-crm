import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  ChevronLeft,
  ChevronRight,
  GlassCard,
  Icon,
  MetaPill,
  SegmentedControl,
  Skeleton,
  cn,
  type BadgeProps,
} from '@pv/ui'
import {
  STOP_LOG_NOW_LABEL,
  StopLogQuery,
  vnDayOf,
  type StopLogFacetItem,
  type StopLogKind,
  type StopLogNow,
  type StopLogResponse,
  type StopLogRow,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { stopLogQuery } from '@/data/stop-log'
import { BookCount, BookPage, type BookTable } from '@/components/book-page'
import { MomentCell } from '@/components/lead-cells'
import { TableFooter } from '@/components/table-bits'
import {
  PAGE_TITLE,
  logRange,
  monthDays,
  monthOf,
  stepMonth,
  withPageKeys,
  withoutPageKeys,
  type NurtureTabProps,
} from './nurturing-model'

/** The stop log tab (ADR 0125): one row per stop decision in a month —
 *  lead parks, deal stops, contract terminations — under three bars that sum
 *  the same rows by reason, by step and by person. A kind the reader may not
 *  view is not offered; the server leaves its rows out either way. A row opens
 *  the record it names. */

const PAGE_SIZE = 20
const SCHEMA = withPageKeys(StopLogQuery)
const FILTER_KEYS = ['kind', 'from', 'to'] as const

type KindFilter = StopLogQuery['kind']

const KIND_LABEL: Record<KindFilter, string> = {
  all: 'Tất cả',
  lead: 'Lead',
  deal: 'Cơ hội',
  contract: 'Hợp đồng',
}

const PATH: Record<StopLogKind, string> = {
  lead: '/sales/leads',
  deal: '/sales/opportunities',
  contract: '/sales/contracts',
}

const NOW_TONE: Record<StopLogNow, NonNullable<BadgeProps['tone']>> = {
  waiting: 'running',
  reclaimed: 'success',
  ended: 'draft',
}

/* One hue at falling strength, as the overview's reason donuts: a reason is
   neither good nor bad. The folded rest takes the neutral ink. Neighbouring
   shades sit near 1.5:1, so a 4px gap parts the segments. */
const SHADES = ['bg-primary', 'bg-primary/70', 'bg-primary/45', 'bg-surface-ink/28']
const SHOWN = 3

/** Top three and one slice for the rest, named apart from the reason "other";
 *  a single leftover keeps its own name. */
function slicesOf(items: readonly StopLogFacetItem[]): StopLogFacetItem[] {
  if (items.length <= SHOWN + 1) return [...items]
  const rest = items.slice(SHOWN).reduce((n, i) => n + i.count, 0)
  return [...items.slice(0, SHOWN), { key: 'rest', label: 'Còn lại', count: rest }]
}

/** One stacked bar and its legend. The count is printed for every slice, so
 *  no share is read by colour alone; the bar itself is hidden from readers. */
function FacetBar({ title, items }: { title: string; items: readonly StopLogFacetItem[] }) {
  const slices = slicesOf(items)
  const total = slices.reduce((n, s) => n + s.count, 0)
  if (total === 0) return null
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={title}>
      <h3 className="m-0 text-[12.5px] font-semibold">{title}</h3>
      <span aria-hidden className="flex h-3 gap-1 overflow-hidden">
        {slices.map((s, i) => (
          <span
            key={s.key}
            className={cn('h-full rounded-sm', SHADES[i])}
            style={{ width: `${(s.count / total) * 100}%` }}
          />
        ))}
      </span>
      <ul className="m-0 flex min-w-0 list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px] sm:flex-nowrap">
        {slices.map((s, i) => (
          <li key={s.key} className="flex min-w-0 items-center gap-2">
            <span aria-hidden className={cn('size-2 shrink-0 rounded-sm', SHADES[i])} />
            <span className="text-muted-foreground truncate" title={s.label}>
              {s.label}
            </span>
            <span className="tnum font-num shrink-0 font-semibold">{s.count}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function StopFacets({ data, pending }: { data?: StopLogResponse; pending: boolean }) {
  if (pending) return <Skeleton height={168} />
  if (!data || data.total === 0) return null
  return (
    <GlassCard variant="b" className="flex flex-col gap-5 p-5" aria-label="Tổng hợp lần dừng">
      <FacetBar title="Lý do" items={data.byReason} />
      <FacetBar title="Dừng ở bước" items={data.byStage} />
      <FacetBar title="Người dừng" items={data.byActor} />
    </GlassCard>
  )
}

const STEP = 'pointer-coarse:h-12 pointer-coarse:w-12 w-8 px-0'

/** ‹ range ›: whole months from the month of `from`, back without end,
 *  forward up to the running month. */
function MonthStep({
  month,
  label,
  current,
  onMonth,
}: {
  month: string
  label: string
  current: string
  onMonth: (month: string) => void
}) {
  const earlier = stepMonth(month, -1, current)
  const later = stepMonth(month, 1, current)
  return (
    <div role="group" aria-label="Chọn tháng" className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className={STEP}
        aria-label="Tháng trước"
        disabled={earlier === null}
        onClick={() => earlier && onMonth(earlier)}
      >
        <Icon icon={ChevronLeft} size={16} />
      </Button>
      <span aria-live="polite" className="tnum min-w-32 text-center text-[12.5px] font-semibold">
        {label}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className={STEP}
        aria-label="Tháng sau"
        disabled={later === null}
        onClick={() => later && onMonth(later)}
      >
        <Icon icon={ChevronRight} size={16} />
      </Button>
    </div>
  )
}

function logTable(rows: readonly StopLogRow[], open: (row: StopLogRow) => void): BookTable {
  return {
    minWidth: 'min-w-[1040px]',
    columns: [
      { header: 'Ngày', width: 'minmax(0,0.9fr)' },
      { header: 'Hồ sơ', width: 'minmax(0,2fr)' },
      { header: 'Dừng ở bước', width: 'minmax(0,1.1fr)' },
      { header: 'Người dừng', width: 'minmax(0,1.1fr)' },
      { header: 'Lý do', width: 'minmax(0,2fr)' },
      { header: 'Tình trạng', width: '152px' },
    ],
    rows: rows.map((r) => ({
      id: `${r.kind}:${r.code}:${r.at}`,
      onOpen: () => open(r),
      cells: [
        <MomentCell key="t" iso={r.at} />,
        <span key="s" className="flex min-w-0 items-center gap-2">
          <MetaPill mono className="shrink-0">
            {r.code}
          </MetaPill>
          <span className="truncate text-[13px] font-semibold" title={r.name}>
            {r.name}
          </span>
        </span>,
        <span
          key="g"
          className={cn('truncate text-[13px]', r.stage === null && 'text-muted-foreground')}
          title={r.stage ?? undefined}
        >
          {r.stage ?? 'Chưa có'}
        </span>,
        <span
          key="a"
          className={cn('truncate text-[13px]', r.actorName === null && 'text-muted-foreground')}
          title={r.actorName ?? undefined}
        >
          {r.actorName ?? 'Chưa có'}
        </span>,
        <span key="r" className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-[13px]" title={r.reasonLabel}>
            {r.reasonLabel}
          </span>
          {r.note && (
            <span className="text-muted-foreground truncate text-[11.5px]" title={r.note}>
              {r.note}
            </span>
          )}
        </span>,
        <Badge key="n" tone={NOW_TONE[r.now]}>
          {STOP_LOG_NOW_LABEL[r.now]}
        </Badge>,
      ],
    })),
  }
}

export function StopLogBook({ nav }: NurtureTabProps) {
  const navigate = useNavigate()
  const canDeal = useCan('opportunity.view')
  const canContract = useCan('contract.view')
  const kinds: KindFilter[] = [
    'all',
    'lead',
    ...(canDeal ? (['deal'] as const) : []),
    ...(canContract ? (['contract'] as const) : []),
  ]
  const [today] = useState(() => vnDayOf(new Date()))
  const current = monthOf(today)
  const book = useBookQuery(SCHEMA, { size: PAGE_SIZE, filterKeys: FILTER_KEYS })
  const range = logRange(book.query.from, book.query.to, current)
  const kind = kinds.includes(book.query.kind) ? book.query.kind : 'all'
  const query: StopLogQuery = {
    ...withoutPageKeys(book.query),
    kind,
    from: range.from,
    to: range.to,
  }
  const { data, isPending, error, refetch } = useQuery(stopLogQuery(query))
  const { pageIndex } = useBookPageClamp(book, data?.total)
  const rows = data?.rows ?? []
  const open = (r: StopLogRow) => navigate(`${PATH[r.kind]}/${encodeURIComponent(r.code)}`)
  /* The running month is the default, so it leaves the address. */
  const pickMonth = (next: string) =>
    book.patch(next === current ? { from: undefined, to: undefined } : monthDays(next))

  const kindSwitch = kinds.length > 2 && (
    <SegmentedControl
      label="Loại"
      hideLabel
      tone="quiet"
      value={kind}
      options={kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
      onChange={(value) => book.patch({ kind: value as KindFilter })}
    />
  )

  return (
    <BookPage
      title={PAGE_TITLE}
      nav={nav}
      score={<StopFacets data={error ? undefined : data} pending={isPending} />}
      tabs={kindSwitch || undefined}
      count={data && <BookCount total={data.total} noun="lần dừng" />}
      tools={
        <MonthStep month={range.month} label={range.label} current={current} onMonth={pickMonth} />
      }
      pending={isPending}
      failure={
        error
          ? {
              message: `Không tải được nhật ký dừng. ${isApiError(error) ? userMessage(error) : 'Thử lại.'}`,
              onRetry: () => void refetch(),
            }
          : undefined
      }
      empty={
        rows.length === 0
          ? {
              message: `Không có lần dừng nào trong ${range.label.toLowerCase()}.`,
              action: {
                label: 'Tháng trước',
                onClick: () => pickMonth(stepMonth(range.month, -1, current) ?? range.month),
              },
            }
          : undefined
      }
      table={logTable(rows, open)}
      footer={
        <TableFooter
          page={pageIndex}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          onPage={book.goPage}
        />
      }
    />
  )
}
