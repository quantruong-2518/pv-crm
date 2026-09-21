import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Avatar, Chip, GlassCard, Icon, Kanban, List, Lock, Skeleton, cn, initialsOf } from '@pv/ui'
import type {
  WorkstreamBoardColumn,
  WorkstreamBookQuery,
  WorkstreamRow,
  WorkstreamStandKind,
} from '@pv/contracts'
import { dm } from '@/lib/date'
import {
  footprintTotal,
  workstreamColumnQuery,
  type BoardStepGroup,
  type BoardView,
  type JourneyStepKey,
} from '@/data/workstreams'

/** The parts of the kanban view of the journey book — `?view=kanban`.
 *
 *  Four grounds and no fifth (law 12): page → column (`glass-b`, law 8) →
 *  card and column bar (`surface-ink/5`) → chip. A card is ONE link to one
 *  profile, so nothing inside it is clickable on its own.
 *
 *  Every figure printed here arrives from a door: the column header prints
 *  `WorkstreamBoardColumn.total`, the out-of-scope strip prints the page's
 *  `hidden`. The screen counts nothing itself. */

const DASH = '—'

/** The arrow notch, in px. One number for the cut and for the overlap, so the
 *  tip of a step lands exactly in the notch of the next one. */
const NOTCH = 12
const STEP_CLIP_FIRST = `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%)`
const STEP_CLIP = `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%, ${NOTCH}px 50%)`
const CARET_CLIP = 'polygon(50% 100%, 0 0, 100% 0)'

/** The card's one splash of colour — which object is live right now. */
const STAND_TINT: Record<WorkstreamStandKind, string> = {
  LD: 'bg-primary/24 text-on-tint-primary',
  OP: 'bg-warning/12 text-on-tint-warning',
  HĐ: 'bg-success/12 text-on-tint-success',
}

type StepPhase = 'done' | 'current' | 'upcoming'

const STEP_BAR: Record<StepPhase, string> = {
  current: 'bg-primary',
  done: 'bg-success',
  upcoming: 'bg-surface-ink/12',
}

/** Where a step stands, for the ear: the 3px bar and the badge colour say it to
 *  the eye only, and both are `aria-hidden` or colour alone. */
const PHASE_NOTE: Record<StepPhase, string> = {
  current: 'đang xem',
  done: 'đã qua',
  upcoming: 'chưa tới',
}

const STEP_BADGE: Record<StepPhase, string> = {
  current: 'bg-primary text-primary-foreground',
  done: 'bg-success/12 text-on-tint-success',
  upcoming: 'bg-surface-ink/10 text-muted-foreground',
}

// ---------------------------------------------------------------------------
// TOOLBAR
// ---------------------------------------------------------------------------

/** Switching view swaps the whole screen, so the pressed button is destroyed
 *  mid-press and the focus falls to `<body>`. A module flag and not state: the
 *  component that would hold the state is the one being unmounted. The next
 *  switch to mount is the same control, and it takes the focus back. */
let viewJustSwitched = false

/** Table or board. On the address, never in a component's head: a board opened
 *  on one rung has to be pasteable into a chat. */
export function ViewSwitch({
  view,
  onChange,
}: {
  view: BoardView
  onChange: (view: BoardView) => void
}) {
  const activeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!viewJustSwitched) return
    viewJustSwitched = false
    activeButton.current?.focus()
  }, [])

  const press = (next: BoardView) => {
    viewJustSwitched = next !== view
    onChange(next)
  }

  return (
    <div
      role="group"
      aria-label="Kiểu xem sổ hành trình"
      className="bg-surface-ink/5 flex shrink-0 items-center gap-1 rounded-md p-1"
    >
      <ViewButton
        icon={List}
        label="Xem dạng bảng"
        active={view === 'table'}
        buttonRef={view === 'table' ? activeButton : undefined}
        onClick={() => press('table')}
      />
      <ViewButton
        icon={Kanban}
        label="Xem dạng kanban"
        active={view === 'kanban'}
        buttonRef={view === 'kanban' ? activeButton : undefined}
        onClick={() => press('kanban')}
      />
    </div>
  )
}

function ViewButton({
  icon,
  label,
  active,
  buttonRef,
  onClick,
}: {
  icon: Parameters<typeof Icon>[0]['icon']
  label: string
  active: boolean
  buttonRef?: RefObject<HTMLButtonElement | null>
  onClick: () => void
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        'motion-std pointer-coarse:size-12 flex size-8 items-center justify-center rounded-sm',
        active
          ? 'bg-primary text-primary-foreground shadow-primary'
          : 'text-muted-foreground hover:bg-surface-ink/8 hover:text-foreground',
      )}
    >
      <Icon icon={icon} size={16} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// LEVEL ONE — six steps, read as one journey
// ---------------------------------------------------------------------------

export function StepRail({
  groups,
  active,
  onSelect,
}: {
  groups: BoardStepGroup[]
  active: JourneyStepKey
  onSelect: (step: JourneyStepKey) => void
}) {
  const activeIndex = groups.findIndex((g) => g.step.key === active)
  return (
    <div
      role="group"
      aria-label="Các bước của hành trình"
      className="-mx-1 flex items-stretch overflow-x-auto px-1 pb-4"
    >
      {groups.map((group, index) => (
        <StepCard
          key={group.step.key}
          group={group}
          index={index}
          phase={index === activeIndex ? 'current' : index < activeIndex ? 'done' : 'upcoming'}
          onSelect={() => onSelect(group.step.key)}
        />
      ))}
    </div>
  )
}

function StepCard({
  group,
  index,
  phase,
  onSelect,
}: {
  group: BoardStepGroup
  index: number
  phase: StepPhase
  onSelect: () => void
}) {
  const current = phase === 'current'
  /* The SURFACE dims, never the ink: a step the catalogue sent no column for
     has to read as unavailable and still pass 4.5:1 in both themes (law 13).
     Its hover dims too, or pointing at it would undo that one signal. */
  const bookless = group.locked
  const counting = !bookless && group.total === null
  const box = useRef<HTMLDivElement>(null)

  /* A pasted `?step=dropped` opens with the rail scrolled to its left end and
     the live step off-screen on a tablet. */
  useEffect(() => {
    if (current) box.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [current])

  const counted = group.total === null ? '' : ` · ${group.total} hành trình`
  return (
    <div
      ref={box}
      className={cn('relative flex min-w-[168px] flex-1', index > 0 && '-ml-3')}
      style={{ zIndex: index + 1 }}
    >
      <button
        type="button"
        aria-pressed={current}
        aria-label={`Bước ${index + 1} · ${group.step.label} · ${
          bookless ? 'chưa dựng sổ' : PHASE_NOTE[phase]
        }${group.closedOnly ? ' · chỉ đếm hành trình đã đóng' : ''}${counted}`}
        onClick={onSelect}
        style={{ clipPath: index > 0 ? STEP_CLIP : STEP_CLIP_FIRST }}
        className={cn(
          'motion-std pointer-coarse:min-h-12 relative flex w-full items-center gap-2 py-3 pr-4',
          index > 0 ? 'pl-6' : 'pl-4',
          current
            ? 'bg-accent'
            : bookless
              ? 'bg-card/70 hover:bg-card/85'
              : 'bg-card hover:bg-secondary',
        )}
      >
        <span aria-hidden className={cn('absolute inset-x-0 top-0 h-[3px]', STEP_BAR[phase])} />
        <span
          className={cn(
            'tnum font-num flex size-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold',
            STEP_BADGE[phase],
          )}
        >
          {index + 1}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-left text-[12px] font-semibold',
            current ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {group.step.label}
          {/* This step counts closed runs whatever status the view is on, so
              the six totals on the rail do not add up to one book. Said here,
              not only in the report. */}
          {group.closedOnly && (
            <span className="text-muted-foreground font-normal"> · đã đóng</span>
          )}
        </span>
        <span
          className={cn(
            'tnum font-num shrink-0 text-[16px] font-semibold',
            current ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {counting ? <Skeleton width="28px" height={12} /> : (group.total ?? DASH)}
        </span>
      </button>
      {/* Outside the clipped button on purpose: `clip-path` cuts descendants. */}
      {current && (
        <span
          aria-hidden
          style={{ clipPath: CARET_CLIP }}
          className="bg-primary absolute -bottom-1 left-1/2 size-3 -translate-x-1/2"
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LEVEL TWO — the columns of the step being read
// ---------------------------------------------------------------------------

/** Every column is the same height whatever it holds, so six bodies scroll on
 *  one line instead of six. Fixed width on a tablet, sharing the row from `xl`. */
const COLUMN_SHELL =
  'flex h-[62vh] min-h-[320px] w-[268px] shrink-0 flex-col overflow-hidden xl:w-auto xl:min-w-[280px] xl:max-w-[420px] xl:flex-1'
const COLUMN_BODY = 'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3'
const CARD_SKELETON_PX = 72

function ColumnShell({
  label,
  count,
  dim,
  footer,
  children,
}: {
  label: ReactNode
  count: ReactNode
  dim?: boolean
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <GlassCard variant="b" className={cn(COLUMN_SHELL, dim && 'bg-card/60')}>
      <header className="bg-surface-ink/5 shadow-control-soft flex h-11 shrink-0 items-center justify-between gap-2 px-3">
        <span className="text-foreground min-w-0 truncate text-[12px] font-semibold">{label}</span>
        <span className="tnum font-num text-muted-foreground shrink-0 text-[12.5px] font-semibold">
          {count}
        </span>
      </header>
      {children}
      {footer}
    </GlassCard>
  )
}

/** A sentence in the middle of a column body. Kept at full ink even on a dimmed
 *  column — the dimming belongs to the surface, the words still have to read
 *  (law 13). */
function ColumnNote({
  icon,
  children,
}: {
  icon?: Parameters<typeof Icon>[0]['icon']
  children: ReactNode
}) {
  return (
    <span className="text-foreground m-auto flex flex-col items-center gap-3 px-4 text-center text-[11.5px]">
      {icon && <Icon icon={icon} size={20} className="text-muted-foreground" />}
      {children}
    </span>
  )
}

/** State 3 · a step with no book behind it. The screen draws this from
 *  `WORKSTREAM_JOURNEY_STEPS`; the server sends no column to draw it from. */
export function LockedColumn({ label, blockNumber }: { label: string; blockNumber: number }) {
  return (
    <ColumnShell label={label} count={DASH} dim>
      <div className={COLUMN_BODY}>
        <ColumnNote icon={Lock}>
          {`Khối ${blockNumber} chưa dựng sổ — chưa thẻ nào tới được đây`}
        </ColumnNote>
      </div>
    </ColumnShell>
  )
}

/** State 4 · the catalogue has not answered yet, so neither the name nor the
 *  count of a column is known — both wait as a grey box, never as a zero. */
export function ColumnSkeleton({ delay }: { delay: number }) {
  return (
    <ColumnShell
      label={<Skeleton width="96px" height={12} delay={delay} />}
      count={<Skeleton width="32px" height={12} delay={delay} />}
    >
      <div className={COLUMN_BODY}>
        <CardSkeletons delay={delay} />
      </div>
    </ColumnShell>
  )
}

function CardSkeletons({ delay }: { delay: number }) {
  return (
    <>
      <Skeleton height={CARD_SKELETON_PX} delay={delay} />
      <Skeleton height={CARD_SKELETON_PX} delay={delay + 200} />
    </>
  )
}

export function BoardColumn({
  base,
  column,
}: {
  base: WorkstreamBookQuery
  column: WorkstreamBoardColumn
}) {
  const { data, isPending, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery(workstreamColumnQuery(base, column))
  const sentinel = useRef<HTMLSpanElement>(null)
  const body = useRef<HTMLDivElement>(null)

  /* Watched against the column's OWN scroller, not the viewport: six columns
     scroll independently, and the page they sit on may not move at all. */
  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasNextPage || isFetchingNextPage) return
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void fetchNextPage()
      },
      { root: body.current },
    )
    watcher.observe(node)
    return () => watcher.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const rows = data?.rows ?? []

  return (
    <ColumnShell
      label={column.label}
      count={column.total}
      footer={
        /* No count: the door's `hidden` cannot be added up on this side — see
           `WorkstreamColumnCards`. The cut is still declared, in words. */
        data?.anyHidden && (
          <footer className="bg-surface-ink/5 text-muted-foreground shrink-0 px-3 py-2 text-[11px]">
            Một số hành trình ở cột này nằm ngoài phạm vi của bạn
          </footer>
        )
      }
    >
      <div className="relative min-h-0 flex-1">
        <div ref={body} className={COLUMN_BODY}>
          {isPending ? (
            <CardSkeletons delay={0} />
          ) : error ? (
            <ColumnNote>Không lấy được cột này. Thử lại sau.</ColumnNote>
          ) : rows.length === 0 ? (
            <ColumnNote>Không có gì ở cột này</ColumnNote>
          ) : (
            <>
              {rows.map((row) => (
                <JourneyCard key={row.code} row={row} />
              ))}
              {isFetchingNextPage && <Skeleton height={CARD_SKELETON_PX} />}
              <span ref={sentinel} aria-hidden className="h-px shrink-0" />
            </>
          )}
        </div>
        {/* State 1 · there is more under the fold, said with a shade and not a
            gradient: law 15 lists the three gradients this system allows and a
            scroll hint is not one of them. */}
        {hasNextPage && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 shadow-[inset_0_-20px_16px_-16px_var(--scrim)]"
          />
        )}
      </div>
    </ColumnShell>
  )
}

// ---------------------------------------------------------------------------
// THE CARD — one run, one link
// ---------------------------------------------------------------------------

/** The customer's own person, on a neutral ground. The brand ground is for our
 *  side of the table, and the two must never look alike. */
function GuestAvatar({ name }: { name: string }) {
  return (
    <span
      role="img"
      aria-label={name}
      className="bg-surface-ink/14 text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold"
    >
      {initialsOf(name)}
    </span>
  )
}

function JourneyCard({ row }: { row: WorkstreamRow }) {
  const sale = row.saleHolder
  /* BD lost its line in this design; it rides on the PIC avatar's own label,
     which a screen reader announces and a `title` on a touch screen does not. */
  const picLabel =
    sale === null
      ? ''
      : row.bdHolder === null
        ? sale.name
        : `${sale.name} · BD: ${row.bdHolder.name}`
  const last = row.footprint.lastContactedAt
  return (
    /* Hover lifts by SHADOW, never by tinting the face: a tint lightens the
       ground under the three faintest inks on the card and drops them under
       4.5:1 exactly while the pointer rests there (law 13). */
    <Link
      to={`/sales/workstreams/${encodeURIComponent(row.code)}`}
      className="motion-std bg-surface-ink/5 hover:shadow-control flex min-h-12 shrink-0 flex-col gap-2 rounded-md p-3"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className="text-foreground min-w-0 flex-1 truncate text-[12.5px] font-semibold"
          title={row.customer}
        >
          {row.customer}
        </span>
        {/* No `title` with the rung name: the column header above already says
            it, and a tooltip is nothing at all on a touch screen. */}
        <Chip className={cn('shrink-0', STAND_TINT[row.stand.kind])}>{row.stand.code}</Chip>
      </span>

      <span className="flex min-w-0 items-center gap-2">
        <GuestAvatar name={row.contact} />
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11.5px]">
          <span className="text-glass-foreground">Khách: </span>
          {row.contact}
        </span>
        <span className="text-glass-foreground shrink-0 font-mono text-[10.5px]">{row.code}</span>
      </span>

      <span className="flex min-w-0 items-center gap-2">
        {sale === null ? (
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11.5px]">
            Chưa có Sale giữ hành trình này
          </span>
        ) : (
          <>
            <Avatar size="sm" name={picLabel} initials={initialsOf(sale.name)} />
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11.5px]">
              <span className="text-glass-foreground">PIC: </span>
              {sale.name}
            </span>
          </>
        )}
        <span
          className="tnum font-num text-muted-foreground shrink-0 text-[10.5px]"
          title="Tổng dấu chân liên lạc · lần gần nhất"
        >
          {footprintTotal(row.footprint)} · {last === null ? 'chưa liên lạc' : dm(last)}
        </span>
      </span>
    </Link>
  )
}
