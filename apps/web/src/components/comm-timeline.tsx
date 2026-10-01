import { useEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { Button, ChevronLeft, ChevronRight, Icon, StatusDot, cn, type StatusDotState } from '@pv/ui'
import type { CommRecordState, DebriefStepCopy, ThreadChannel } from '@pv/contracts'
import { dm } from '@/lib/date'
import { COMM_CARD_SURFACE, COMM_FOCUS } from '@/data/comm-record-detail'
import { ChannelPill, CommLateMark, CommStateBadge, StepCopyLine } from './comm-bits'

/** The one comm timeline — a horizontal axis, oldest left, cards alternating
 *  above and below (ADR 0075, canvas boards `History` and `V2Queue`). The
 *  subject's history (`comms-card.tsx`) and the queue (`pages/comms.tsx`)
 *  both draw it, each mapping its rows to `CommCardItem`.
 *
 *  Native horizontal scroll carries touch, trackpad and keyboard; a mouse drag
 *  only moves `scrollLeft`. The selected card wears a solid `ring` edge that
 *  never depends on motion; only the lift is motion-safe. */

export type CommCardItem = {
  id: string
  channel: ThreadChannel
  state: CommRecordState
  late: boolean
  createdAt: string
  title: string
  /** The title is a placeholder sentence, not content. */
  titleMuted: boolean
  meta: string
  step: DebriefStepCopy | null
}

/** Past this many pixels a press is a drag, and the click it ends in is eaten. */
const DRAG_SLOP_PX = 4
/** The older/newer buttons move most of one view, keeping one card in sight. */
const PAGE_FRACTION = 0.8

const DOT: Record<CommRecordState, StatusDotState> = {
  empty: 'bad',
  unconfirmed: 'warning',
  done: 'ok',
}

/** `items` must be oldest first: the axis IS the order. */
export function CommTimelineTrack({
  items,
  selectedId,
  onSelect,
  caption,
}: {
  items: readonly CommCardItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  caption?: ReactNode
}) {
  const pan = useDragPan(items.length)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground min-w-0 flex-1 text-[12px] tabular-nums leading-[1.5]">
          {caption}
        </span>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Comm cũ hơn"
          className="pointer-coarse:size-12 size-10 px-0"
          onClick={() => pan.page(-1)}
        >
          <Icon icon={ChevronLeft} size={16} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Comm mới hơn"
          className="pointer-coarse:size-12 size-10 px-0"
          onClick={() => pan.page(1)}
        >
          <Icon icon={ChevronRight} size={16} />
        </Button>
      </div>

      <div
        ref={pan.ref}
        {...pan.handlers}
        className="cursor-grab select-none overflow-x-auto pb-3 active:cursor-grabbing"
      >
        <ol
          aria-label="Tiến trình liên lạc"
          className="m-0 grid w-max list-none auto-cols-[272px] grid-flow-col grid-rows-[auto_auto_auto] gap-x-8 gap-y-3 px-4 py-3"
        >
          {items.map((item, index) => (
            <Node
              key={item.id}
              item={item}
              above={index % 2 === 0}
              selected={item.id === selectedId}
              onSelect={() => onSelect(item.id)}
            />
          ))}
        </ol>
      </div>
    </div>
  )
}

/** One column of the axis grid, through subgrid so every card above shares one
 *  row height and the line stays straight across the whole track. */
function Node({
  item,
  above,
  selected,
  onSelect,
}: {
  item: CommCardItem
  above: boolean
  selected: boolean
  onSelect: () => void
}) {
  const card = <CommCard item={item} selected={selected} onSelect={onSelect} />

  return (
    <li className="row-span-3 grid grid-rows-subgrid">
      <div className="flex flex-col justify-end">{above && card}</div>
      <div className="relative flex items-center justify-center gap-2">
        <span
          aria-hidden
          className="bg-secondary absolute -inset-x-4 top-1/2 h-0.5 -translate-y-1/2"
        />
        <span className="bg-card relative px-2 text-[13px] font-semibold tabular-nums">
          {dm(item.createdAt)}
        </span>
        <StatusDot state={selected ? 'current' : DOT[item.state]} className="relative" />
      </div>
      <div className="flex flex-col justify-start">{!above && card}</div>
    </li>
  )
}

function CommCard({
  item,
  selected,
  onSelect,
}: {
  item: CommCardItem
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'motion-std flex w-full min-w-0 flex-col gap-2 rounded-lg p-4 text-left',
        COMM_CARD_SURFACE,
        COMM_FOCUS,
        'motion-safe:hover:-translate-y-1',
        selected && 'ring-ring ring-2 motion-safe:-translate-y-1',
      )}
    >
      <span className="flex flex-wrap items-center gap-2">
        <ChannelPill channel={item.channel} />
        <CommStateBadge state={item.state} />
      </span>
      <span
        className={cn(
          'truncate text-[13px] font-semibold leading-[1.5]',
          item.titleMuted ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {item.title}
      </span>
      <span className="text-muted-foreground truncate text-[11.5px] leading-[1.5]">
        {item.meta}
      </span>
      <CommLateMark late={item.late} />
      {item.step && <StepCopyLine step={item.step} />}
    </button>
  )
}

/** Mouse drag → `scrollLeft`. Touch and pen keep the browser's own swipe. The
 *  view starts at the newest record, the right end of the axis. */
function useDragPan(count: number) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; left: number; moved: boolean; active: boolean } | null>(null)

  useEffect(() => {
    const view = ref.current
    if (view) view.scrollLeft = view.scrollWidth
  }, [count])

  const stop = () => {
    if (drag.current) drag.current.active = false
  }

  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || !ref.current) return
      drag.current = { x: event.clientX, left: ref.current.scrollLeft, moved: false, active: true }
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const state = drag.current
      if (!state?.active || !ref.current) return
      const dx = event.clientX - state.x
      if (Math.abs(dx) > DRAG_SLOP_PX) state.moved = true
      ref.current.scrollLeft = state.left - dx
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    /* A drag that ends over a card must not also select it. */
    onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
      if (drag.current?.moved) event.stopPropagation()
      drag.current = null
    },
  }

  const page = (direction: -1 | 1) => {
    const view = ref.current
    if (!view) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    view.scrollBy({
      left: direction * view.clientWidth * PAGE_FRACTION,
      behavior: reduced ? 'auto' : 'smooth',
    })
  }

  return { ref, handlers, page }
}
