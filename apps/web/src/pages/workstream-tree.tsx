import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Badge, Button, Chip, GlassCard, Icon, Info, InfoTip, Minus, Plus, cn } from '@pv/ui'
import { JOURNEY_BORN_BY_LABEL, JOURNEY_DEAL_OUTCOME_LABEL } from '@pv/contracts'
import { DUE_LABEL } from '@/data/contracts'
import {
  CARD,
  EDGE_OF,
  GHOST_H,
  doorId,
  LANES,
  LANE_TOP,
  STATE_WORD,
  TREE_W,
  ZOOM,
  clampZoom,
  fitZoom,
  layoutTree,
  type Box,
  type EdgeTone,
  type Journey,
  type TreeLayout,
} from './workstream-tree-model'
import type { TreeZoom } from './workstream-tree-zoom'
import {
  ContractCard,
  DealCard,
  DoorCard,
  LeadCard,
  MoneyPill,
  RungDot,
  type Track,
} from './workstream-tree-cards'

/** The four-lane journey tree (canvas E-Main): presale, sale, postsale and
 *  continuation lanes, curved edges lead → deal → contract → door, and a zoom
 *  bar floating at the frame's bottom right whose default is "fit the frame".
 *
 *  A rung opens its step drawer, whose footer opens the object's profile; a
 *  code chip opens the profile straight away. Zoom, the open step and which
 *  finished deals and contract details are expanded die with the tree. */

const QUIET = 'hover:bg-surface-ink/9 bg-transparent shadow-none'
/** Share of the window the tree's own scroller may take before it scrolls. */
const FRAME_SHARE = 0.75
/** What an empty lane says, shown only while the journey is open and has no
 *  contract. Lane 4 fills from a parked lead or a growth journey, so it only
 *  states that nothing follows yet. */
const LANE_WAIT = {
  contract: 'Mở sau khi cơ hội thành hợp đồng.',
  next: 'Chưa có bước tiếp nối.',
} as const

/* Every line is full ink, ≥ 3:1 on the lane band in both themes (non-text
   contrast); a lost deal differs from an open one by its dash alone — at 0.7
   opacity it fell to 2.8:1 on stone. */
const EDGE: Record<EdgeTone, { stroke: string; width: number; opacity: number; dash?: string }> = {
  won: { stroke: 'var(--success)', width: 2.5, opacity: 1 },
  open: { stroke: 'var(--glass-foreground)', width: 2, opacity: 1 },
  ghost: { stroke: 'var(--glass-foreground)', width: 2, opacity: 1, dash: '4 4' },
  /* A new journey born from this one: brand ink, long-dashed so it never reads
     as the solid green of a won deal. */
  born: { stroke: 'var(--accent-foreground)', width: 2, opacity: 1, dash: '8 4' },
}

const edgeProps = (tone: EdgeTone) => ({
  stroke: EDGE[tone].stroke,
  strokeWidth: EDGE[tone].width,
  strokeOpacity: EDGE[tone].opacity,
  strokeDasharray: EDGE[tone].dash,
})

/** Heights of every `[data-node]` card, read before paint and again whenever
 *  one resizes (a web font landing re-wraps titles). */
function useNodeHeights(root: RefObject<HTMLElement | null>, shape: string) {
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map())
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const nodes = () => [...el.querySelectorAll<HTMLElement>('[data-node]')]
    const read = () => {
      const next = new Map(nodes().map((n) => [n.dataset.node ?? '', n.offsetHeight] as const))
      setHeights((prev) =>
        prev.size === next.size && [...next].every(([k, v]) => prev.get(k) === v) ? prev : next,
      )
    }
    read()
    const watch = new ResizeObserver(read)
    nodes().forEach((n) => watch.observe(n))
    return () => watch.disconnect()
  }, [root, shape])
  return heights
}

/** `lg` in Tailwind's default scale; below it the tree is a tablet tree. */
const TOUCH = '(pointer: coarse), (max-width: 63.99rem)'

/** The frame's width, and whether it is a touch-size screen. */
function useFrame(frame: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: TREE_W, touch: false })
  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth, touch: window.matchMedia(TOUCH).matches })
    read()
    const watch = new ResizeObserver(read)
    watch.observe(el)
    window.addEventListener('resize', read)
    return () => {
      watch.disconnect()
      window.removeEventListener('resize', read)
    }
  }, [frame])
  return size
}

/** The key to the tree, kept out of the canvas: a button in the floating bar
 *  that opens on hover or focus, so the card opens on the tree itself. */
export function TreeLegend() {
  const dots = [
    { word: STATE_WORD.done, rung: { state: 'done', late: null } },
    { word: STATE_WORD.current, rung: { state: 'current', late: null } },
    { word: DUE_LABEL.overdue, rung: { state: 'current', late: 'overdue' } },
    { word: STATE_WORD.stopped, rung: { state: 'stopped', late: null } },
    { word: STATE_WORD.upcoming, rung: { state: 'upcoming', late: null } },
    { word: STATE_WORD.skipped, rung: { state: 'skipped', late: null } },
  ] as const
  const edges = [
    ...(['won', 'open', 'lost'] as const).map((outcome) => ({
      word: JOURNEY_DEAL_OUTCOME_LABEL[outcome],
      tone: EDGE_OF[outcome],
    })),
    { word: JOURNEY_BORN_BY_LABEL.growth, tone: 'born' as const },
  ]
  const title = 'text-muted-foreground m-0 text-[11px] font-semibold uppercase tracking-wide'
  return (
    <InfoTip
      width={320}
      content={
        <div className="flex flex-col gap-3 py-1 text-[12px]">
          <p className={title}>Bước</p>
          <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-2 p-0">
            {dots.map((d) => (
              <li key={d.word} className="flex items-center gap-2">
                <RungDot rung={d.rung} />
                {d.word}
              </li>
            ))}
          </ul>
          <p className={title}>Nét nối</p>
          <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-2 p-0">
            {edges.map((e) => (
              <li key={e.word} className="flex items-center gap-2">
                <svg aria-hidden width={24} height={4} className="shrink-0">
                  <line x1={0} y1={2} x2={24} y2={2} {...edgeProps(e.tone)} />
                </svg>
                {e.word}
              </li>
            ))}
          </ul>
          <p className={title}>Chip trên thẻ</p>
          <span className="flex flex-wrap items-center gap-2">
            <Chip>Mã</Chip>
            <MoneyPill>Giá trị</MoneyPill>
            <Badge tone="warning">Trạng thái</Badge>
          </span>
        </div>
      }
    >
      <Button size="lg" variant="ghost">
        <Icon icon={Info} size={16} />
        Chú thích
      </Button>
    </InfoTip>
  )
}

/** The zoom controls, drawn in the floating bar beside the tree's key. */
export function TreeZoomBar({ ctl }: { ctl: TreeZoom }) {
  const { zoom, floor } = ctl.view
  const fitted = ctl.asked === null
  const onZoom = ctl.ask
  return (
    <div
      role="group"
      aria-label="Phóng to thu nhỏ"
      className="bg-muted flex items-center gap-1 rounded-md p-1"
    >
      <span className="text-muted-foreground pl-3 pr-1 text-[12px]">Thu phóng</span>
      <Button
        variant="ghost"
        size="lg"
        className={cn(QUIET, 'w-12 px-0')}
        aria-label="Thu nhỏ"
        disabled={zoom <= floor}
        onClick={() => onZoom(clampZoom(zoom - ZOOM.step))}
      >
        <Icon icon={Minus} size={16} />
      </Button>
      <span
        className="text-muted-foreground tnum min-w-12 text-center text-[12px]"
        aria-live="polite"
      >
        {Math.round(zoom * 100)}%
      </span>
      <Button
        variant="ghost"
        size="lg"
        className={cn(QUIET, 'w-12 px-0')}
        aria-label="Phóng to"
        disabled={zoom >= ZOOM.max}
        onClick={() => onZoom(clampZoom(zoom + ZOOM.step))}
      >
        <Icon icon={Plus} size={16} />
      </Button>
      {/* Pressed keeps the ghost variant's control ring, which hover never
        shows; QUIET would strip it. */}
      <Button
        variant="ghost"
        size="lg"
        className={cn(fitted ? 'bg-surface-ink/12' : QUIET, 'px-4')}
        aria-pressed={fitted}
        onClick={() => onZoom(null)}
      >
        Vừa khung
      </Button>
    </div>
  )
}

function LaneBands({ journey, layout }: { journey: Journey; layout: TreeLayout }) {
  const count: Partial<Record<(typeof LANES)[number]['key'], number>> = {
    deal: journey.deals.length,
    contract: journey.contracts.length,
  }
  /* Contracts counted from the data, so one under an out-of-scope deal still
     silences both lines; doors from what is DRAWN, so a line never sits under one. */
  const waiting = journey.contracts.length === 0 && journey.status !== 'closed'
  const wait = (key: (typeof LANES)[number]['key']) =>
    !waiting
      ? null
      : key === 'contract'
        ? LANE_WAIT.contract
        : key === 'next' && layout.doors.length === 0
          ? LANE_WAIT.next
          : null
  return LANES.map((lane) => (
    <div
      key={lane.key}
      className="bg-surface-ink/5 absolute bottom-0 top-0 rounded-lg"
      style={{ left: lane.x, width: lane.w }}
    >
      <div className="absolute left-3 top-3 flex flex-col">
        <span className="text-[14px] font-semibold">{lane.phase}</span>
        <span className="text-glass-foreground text-[12px]">
          {count[lane.key] === undefined ? lane.object : `${lane.object} · ${count[lane.key]}`}
        </span>
      </div>
      {wait(lane.key) && (
        <p
          className="text-glass-foreground absolute inset-x-3 m-0 text-[12px]"
          style={{ top: LANE_TOP }}
        >
          {wait(lane.key)}
        </p>
      )}
    </div>
  ))
}

/** The empty deal lane: the line, and the lead profile's own open-deal door
 *  when the screen may offer it. With deals hidden by scope the lane is only
 *  empty for this reader, and says so. */
function GhostDeal({
  box,
  hidden,
  onOpenDeal,
}: {
  box: Box
  hidden: boolean
  onOpenDeal: (() => void) | undefined
}) {
  return (
    <div
      className="absolute flex items-center gap-3 px-3"
      style={{ left: CARD.deal.x, top: box.top, width: CARD.deal.w, height: GHOST_H }}
    >
      <span className="text-glass-foreground min-w-0 grow break-words text-[12px]">
        {hidden ? 'Không có cơ hội nào trong phạm vi của bạn' : 'Chưa có cơ hội nào từ lead này'}
      </span>
      {onOpenDeal && (
        <Button variant="secondary" size="lg" className="shrink-0" onClick={onOpenDeal}>
          <Icon icon={Plus} size={16} />
          Tạo cơ hội
        </Button>
      )}
    </div>
  )
}

export function WorkstreamTree({
  journey,
  onOpenDeal,
  zoomCtl,
  ...track
}: Track & { journey: Journey; onOpenDeal?: () => void; zoomCtl: TreeZoom }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const { asked: zoomAsked, zoomed, setView } = zoomCtl
  const frameRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const shape = journey.deals.map((d) => `${d.code}:${expanded.has(d.code)}`).join('|')
  const heights = useNodeHeights(rootRef, shape)
  const frame = useFrame(frameRef)
  const layout = layoutTree(journey, (d) => d.outcome === 'open' || expanded.has(d.code), heights)
  const fit = fitZoom(frame)
  /* Scaling under 100% would shrink the 48px targets (law 13). Clamped on
     read too: a desktop zoom-out must not survive a resize into touch. */
  const floor = frame.touch ? 1 : ZOOM.min
  const zoom = zoomAsked === null ? fit : Math.max(floor, zoomAsked)
  useEffect(() => {
    setView((v) => (v.zoom === zoom && v.floor === floor ? v : { zoom, floor }))
  }, [zoom, floor, setView])
  const scaledH = Math.ceil(layout.contentH * zoom)

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(code)) next.add(code)
      return next
    })

  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 p-4 lg:p-6">
      {journey.hiddenDeals > 0 && (
        <p className="text-glass-foreground m-0 text-[12px]">
          {journey.hiddenDeals} cơ hội ngoài phạm vi của bạn
        </p>
      )}

      <div
        ref={frameRef}
        className="overflow-auto rounded-lg"
        style={{ height: `min(${scaledH}px, ${FRAME_SHARE * 100}vh)` }}
      >
        {/* `mx-auto`, not flex centring: a centred overflowing box hides half
            its overflow behind `scrollLeft: 0`. Clipped so a zoom-out in flight
            never raises a scrollbar. */}
        <div
          className="relative mx-auto overflow-hidden"
          style={{ width: Math.ceil(TREE_W * zoom), height: scaledH }}
        >
          <div
            ref={rootRef}
            className={cn('absolute left-0 top-0 origin-top-left', zoomed && 'motion-std')}
            style={{ width: TREE_W, height: layout.contentH, transform: `scale(${zoom})` }}
          >
            <LaneBands journey={journey} layout={layout} />
            <div className="absolute inset-x-0 bottom-0" style={{ top: LANE_TOP }}>
              <svg
                aria-hidden
                width={TREE_W}
                height={layout.contentH - LANE_TOP}
                fill="none"
                className="pointer-events-none absolute left-0 top-0"
              >
                {layout.edges.map((e) => (
                  <path key={e.key} d={e.d} {...edgeProps(e.tone)} />
                ))}
                {/* Drawn here, not as a box edge: dashed like its edge, and law 4
                    keeps borders off boxes. */}
                {/* The top is rounded and the 1px line set on the half pixel,
                    so at 100% it lands on one pixel row instead of two faint ones. */}
                {layout.ghost && (
                  <rect
                    x={CARD.deal.x + 0.5}
                    y={Math.round(layout.ghost.top) + 0.5}
                    width={CARD.deal.w - 1}
                    height={GHOST_H - 1}
                    rx={6}
                    {...edgeProps('ghost')}
                    strokeWidth={1}
                  />
                )}
              </svg>

              <LeadCard lead={journey.lead} box={layout.lead} {...track} />
              {layout.ghost && (
                <GhostDeal
                  box={layout.ghost}
                  hidden={journey.hiddenDeals > 0}
                  onOpenDeal={onOpenDeal}
                />
              )}
              {layout.deals.map(({ deal, full, box }) => (
                <DealCard
                  key={deal.code}
                  deal={deal}
                  box={box}
                  full={full}
                  onToggle={() => toggle(deal.code)}
                  {...track}
                />
              ))}
              {layout.contracts.map(({ contract, box }) => (
                <ContractCard
                  key={contract.code}
                  contract={contract}
                  box={box}
                  open={expanded.has(contract.code)}
                  onToggle={() => toggle(contract.code)}
                  {...track}
                />
              ))}
              {layout.doors.map(({ door, box, from }) => (
                <DoorCard key={doorId(door)} door={door} from={from} box={box} {...track} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
