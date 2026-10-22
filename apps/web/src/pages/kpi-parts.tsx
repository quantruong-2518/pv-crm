import type { ReactNode } from 'react'
import {
  Badge,
  Button,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  EmptyState,
  GlassCard,
  Icon,
  Skeleton,
  TriangleAlert,
  cn,
  type BadgeProps,
} from '@pv/ui'
import {
  KPI_LAYER_LABEL,
  KPI_METRIC_LABEL,
  KPI_VERDICT_LABEL,
  type KpiReading,
  type KpiUnit,
  type KpiVerdict,
  type RoleId,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import type { BlockQuery, KpiCatalog } from '@/data/kpi-catalog'
import { keyOf, periodLabel, type PeriodPick } from './home-model'
import { ACK_LABEL } from './kpi-allocate-model'
import { GROW_WIDTH } from '@/components/period-picker-style'
import { NOTE, TILE } from './home-tiles'
import {
  ADJUSTMENT_ICON,
  adjustmentLine,
  boardOf,
  BAR_FILL,
  itemsOf,
  paceOf,
  printTile,
  printValue,
  shortfallOf,
  stepMonth,
  type AdjustmentForm,
  type KpiItem,
} from './kpi-model'

/** Blocks both KPI screens share: the month picker, one reading as a tile, a
 *  role's readings as a board (personal) or an even strip (company), and the
 *  loading / failed state of a read.
 *
 *  A verdict is never told by colour alone: its label is always printed, and
 *  the bar is hidden from assistive tech because the value, the target and
 *  the verdict beside it already say everything the bar draws. */

const STEP = 'pointer-coarse:h-12 pointer-coarse:w-12 w-8 px-0'

/** The overview's picker without its grain switch: KPI takes months only. */
export function MonthPicker({
  pick,
  onPick,
}: {
  pick: PeriodPick
  onPick: (p: PeriodPick) => void
}) {
  const earlier = stepMonth(pick, -1)
  const later = stepMonth(pick, 1)
  return (
    <div role="group" aria-label="Chọn tháng" className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className={STEP}
        aria-label="Tháng trước"
        disabled={earlier === null}
        onClick={() => earlier && onPick(earlier)}
      >
        <Icon icon={ChevronLeft} size={16} />
      </Button>
      <span aria-live="polite" className="tnum min-w-32 text-center text-[12.5px] font-semibold">
        {periodLabel(keyOf(pick))}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className={STEP}
        aria-label="Tháng sau"
        disabled={later === null}
        onClick={() => later && onPick(later)}
      >
        <Icon icon={ChevronRight} size={16} />
      </Button>
    </div>
  )
}

const VERDICT_TONE: Record<KpiVerdict, NonNullable<BadgeProps['tone']>> = {
  'no-data': 'draft',
  unset: 'draft',
  met: 'success',
  'on-track': 'running',
  behind: 'warning',
  missed: 'danger',
}

export function VerdictBadge({ verdict }: { verdict: KpiVerdict }) {
  return <Badge tone={VERDICT_TONE[verdict]}>{KPI_VERDICT_LABEL[verdict]}</Badge>
}

/** The figure as a share of its target, with a tick where pace asks it to be.
 *  The tick stays inside the track at 100% and carries a card-coloured edge,
 *  so it still reads when the fill has passed under it. */
function PaceBar({ item }: { item: KpiItem }) {
  const pace = paceOf(item)
  if (pace === null) return null
  return (
    <span aria-hidden className="bg-surface-ink/10 relative block h-2 rounded-sm">
      <span
        className={cn('block h-full rounded-sm', BAR_FILL[item.reading.verdict], GROW_WIDTH)}
        style={{ width: `${pace.fill * 100}%` }}
      />
      {pace.mark !== null && (
        <span
          className="bg-foreground absolute -top-1 h-4 w-0.5 rounded-sm shadow-[0_0_0_1px_var(--card)]"
          style={{ left: `min(${pace.mark * 100}%, calc(100% - 2px))` }}
        />
      )}
    </span>
  )
}

/** Target and, while pace applies, what it asks for by today. A
 *  lower-is-better target is a ceiling, so it is not called a target. */
function targetLine({ def, reading }: KpiItem): string | null {
  if (reading.target === null) return null
  const target = `${def.higherIsBetter ? 'Chỉ tiêu' : 'Tối đa'} ${printValue(def.unit, reading.target, true)}`
  const paced = def.paced && reading.expected !== null && reading.expected < reading.target
  return paced ? `${target} · cần đạt đến hôm nay ${printTile(def.unit, reading.expected)}` : target
}

/** Beside a target nobody confirmed: the holder let the deadline pass, so the
 *  level applies as given (ADR 0114). Icon plus words, since a touch screen has
 *  no hover to name a bare icon; every other answer state shows nothing. */
export function ByDefaultMark({
  reading,
  className,
}: {
  reading: Pick<KpiReading, 'targetAck'>
  className?: string
}) {
  if (reading.targetAck !== 'lapsed') return null
  return (
    <span className={cn(NOTE, 'inline-flex items-center gap-1 whitespace-nowrap', className)}>
      <Icon icon={CircleDashed} size={14} />
      {ACK_LABEL.lapsed.text}
    </span>
  )
}

/** Under a figure that adjustments touched (ADR 0115): one short line, icon
 *  plus words; the icon stays on the first line when the words wrap. */
export function AdjustmentNote({
  unit,
  reading,
  form = 'tile',
}: {
  unit: KpiUnit
  reading: Pick<KpiReading, 'adjustedBy' | 'afterAdjustments'>
  form?: AdjustmentForm
}) {
  const line = adjustmentLine(unit, reading, form)
  if (line === null) return null
  return (
    <span className={cn(NOTE, 'tnum font-num inline-flex items-start gap-1')}>
      <Icon icon={ADJUSTMENT_ICON} size={14} className="shrink-0" />
      {line}
    </span>
  )
}

const FIGURE = 'tnum font-num font-semibold leading-none'

export function ReadingTile({
  item,
  hero = false,
  className,
}: {
  item: KpiItem
  hero?: boolean
  className?: string
}) {
  const { def, reading } = item
  const target = targetLine(item)
  const shortfall = shortfallOf(item, true)

  return (
    <GlassCard className={cn(TILE, className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-col gap-1">
          <span className={NOTE}>{KPI_LAYER_LABEL[def.layer]}</span>
          <h3 className="text-[13px] font-semibold leading-5">{KPI_METRIC_LABEL[def.key]}</h3>
        </div>
        <VerdictBadge verdict={reading.verdict} />
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <span
          className={cn(
            FIGURE,
            hero ? 'text-[34px] tracking-[-1.2px]' : 'text-[24px] tracking-[-.6px]',
            reading.value === null && 'text-muted-foreground text-[16px] tracking-normal',
          )}
          title={
            def.unit === 'money' && reading.value !== null
              ? printValue(def.unit, reading.value)
              : undefined
          }
        >
          {printTile(def.unit, reading.value)}
        </span>
        <AdjustmentNote unit={def.unit} reading={reading} />
        <PaceBar item={item} />
        {(target || def.snapshot) && (
          <span className={cn(NOTE, 'tnum font-num')}>
            {[target, def.snapshot && 'Số tại thời điểm hiện tại'].filter(Boolean).join(' · ')}
            {target && <ByDefaultMark reading={reading} className="ml-2 align-middle" />}
          </span>
        )}
        {shortfall && (
          <p className="flex items-center gap-2 text-[12.5px] font-semibold leading-5">
            <Icon icon={TriangleAlert} size={16} className="text-warning shrink-0" />
            {shortfall}
          </p>
        )}
      </div>
    </GlassCard>
  )
}

/** One role's readings: the primary metric large, the rest in ONE grid in
 *  layer order. A grid per layer left empty cells beside single-metric layers. */
export function Scoreboard({
  catalog,
  role,
  readings,
}: {
  catalog: KpiCatalog
  role: RoleId
  readings: readonly KpiReading[]
}) {
  const { hero, rest } = boardOf(catalog, role, readings)
  return (
    <div className="flex flex-col gap-4">
      {hero && <ReadingTile item={hero} hero />}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rest.map((item) => (
            <ReadingTile key={item.def.key} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

/** What the strip prints under the bar: the tick's meaning, a ceiling, and
 *  whether the figure is a snapshot. The target itself sits beside the value. */
function stripNote({ def, reading }: KpiItem): string | null {
  const { target, expected } = reading
  const paced = def.paced && target !== null && expected !== null && expected < target
  return (
    [
      paced && `Cần đạt đến hôm nay ${printTile(def.unit, expected)}`,
      !def.higherIsBetter && target !== null && `Tối đa ${printValue(def.unit, target, true)}`,
      def.snapshot && 'Số tại thời điểm hiện tại',
    ]
      .filter(Boolean)
      .join(' · ') || null
  )
}

/** One reading in the company strip: every tile the same size, no hero, so
 *  the room's figures are compared across rather than ranked. */
function StripTile({ item }: { item: KpiItem }) {
  const { def, reading } = item
  const note = stripNote(item)
  const empty = reading.value === null
  return (
    <GlassCard className={TILE}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 text-[13px] font-semibold leading-5">{KPI_METRIC_LABEL[def.key]}</h3>
        <VerdictBadge verdict={reading.verdict} />
      </div>
      <p className="mt-auto flex flex-wrap items-baseline gap-x-2">
        <span
          className={cn(
            FIGURE,
            empty ? 'text-muted-foreground text-[16px]' : 'text-[24px] tracking-[-.6px]',
          )}
        >
          {printTile(def.unit, reading.value)}
        </span>
        {def.higherIsBetter && reading.target !== null && (
          <span className="text-muted-foreground tnum font-num text-[13px]">
            / {printValue(def.unit, reading.target, true)}
          </span>
        )}
      </p>
      <AdjustmentNote unit={def.unit} reading={reading} />
      <PaceBar item={item} />
      {note && <span className={cn(NOTE, 'tnum font-num')}>{note}</span>}
    </GlassCard>
  )
}

/** The room's scorecard as one even row, in catalog order. */
export function CompanyStrip({
  catalog,
  role,
  readings,
}: {
  catalog: KpiCatalog
  role: RoleId
  readings: readonly KpiReading[]
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {itemsOf(catalog, role, readings).map((item) => (
        <StripTile key={item.def.key} item={item} />
      ))}
    </div>
  )
}

/** A read's states in one place: skeleton, failure with a retry, data — and
 *  data kept from an earlier load after a failed refetch, which is named.
 *  `variant` follows what the data will sit on (law 8: tables on `.glass-b`). */
export function QueryBlock<T>({
  query,
  what,
  variant = 'a',
  quiet = false,
  children,
}: {
  query: BlockQuery<T>
  /** Names the block in the failure sentence, lower case. */
  what: string
  variant?: 'a' | 'b'
  /** A second block on the same read: the first one carries the failure card. */
  quiet?: boolean
  children: (data: T) => ReactNode
}) {
  const retry = () => void query.refetch()

  if (query.data !== undefined) {
    return (
      <>
        {query.isRefetchError && !quiet && (
          <p className={cn(NOTE, 'text-destructive-foreground flex flex-wrap items-center gap-2')}>
            <Icon icon={TriangleAlert} size={16} className="text-destructive-foreground shrink-0" />
            Không tải lại được, đang hiện số lần trước.
            <Button variant="ghost" size="sm" className="pointer-coarse:h-12" onClick={retry}>
              Thử lại
            </Button>
          </p>
        )}
        {children(query.data)}
      </>
    )
  }

  if (query.error && quiet) {
    return (
      <p className={cn(NOTE, 'text-destructive-foreground')}>
        Không tải được {what}. Bấm Thử lại ở mục phía trên.
      </p>
    )
  }

  if (query.error) {
    const detail = isApiError(query.error) ? userMessage(query.error) : 'Thử lại.'
    return (
      <GlassCard variant={variant} className={TILE}>
        <EmptyState
          tone="danger"
          icon={TriangleAlert}
          message={`Không tải được ${what}. ${detail}`}
          action={{ label: 'Thử lại', onClick: retry }}
          className="py-8"
        />
      </GlassCard>
    )
  }

  return (
    <GlassCard variant={variant} className={TILE} aria-busy>
      <Skeleton width="40%" />
      <Skeleton height={32} width="60%" />
      <Skeleton />
    </GlassCard>
  )
}
