import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Badge, Button, Chip, GlassCard, Icon, Minus, Plus, cn } from '@pv/ui'
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
  type EdgeTone,
  type Journey,
} from './workstream-tree-model'
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
 *  bar whose default is "fit the frame".
 *
 *  Selection lives with the page (the drawer reads it); zoom and which
 *  finished deals are expanded die with the tree. */

type Go = (path: string) => void

const QUIET = 'hover:bg-surface-ink/9 bg-transparent shadow-none'
/** Share of the window the tree's own scroller may take before it scrolls. */
const FRAME_SHARE = 0.75

/* Opacities keep the lines at ≥ 3:1 on the lane band (non-text contrast). */
const EDGE: Record<EdgeTone, { stroke: string; width: number; opacity: number; dash?: string }> = {
  won: { stroke: 'var(--success)', width: 2.5, opacity: 1 },
  open: { stroke: 'var(--glass-foreground)', width: 2, opacity: 1 },
  ghost: { stroke: 'var(--glass-foreground)', width: 2, opacity: 0.7, dash: '4 4' },
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

function Legend() {
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
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
      <ul className="m-0 flex list-none flex-wrap items-center gap-4 p-0">
        {dots.map((d) => (
          <li key={d.word} className="flex items-center gap-2">
            <RungDot rung={d.rung} />
            {d.word}
          </li>
        ))}
      </ul>
      <ul className="m-0 flex list-none flex-wrap items-center gap-4 p-0">
        {edges.map((e) => (
          <li key={e.word} className="flex items-center gap-2">
            <svg aria-hidden width={24} height={4} className="shrink-0">
              <line x1={0} y1={2} x2={24} y2={2} {...edgeProps(e.tone)} />
            </svg>
            {e.word}
          </li>
        ))}
      </ul>
      <span className="flex flex-wrap items-center gap-2">
        <Chip>Mã</Chip>
        <MoneyPill>Giá trị</MoneyPill>
        <Badge tone="warning">Trạng thái</Badge>
      </span>
    </div>
  )
}

function ZoomBar({
  zoom,
  fitted,
  onZoom,
}: {
  zoom: number
  fitted: boolean
  onZoom: (z: number | null) => void
}) {
  return (
    <div
      role="group"
      aria-label="Phóng to thu nhỏ"
      className="bg-muted flex items-center gap-1 rounded-md p-1"
    >
      <Button
        variant="ghost"
        size="lg"
        className={cn(QUIET, 'w-12 px-0')}
        aria-label="Thu nhỏ"
        disabled={zoom <= ZOOM.min}
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
      <Button
        variant="ghost"
        size="lg"
        className={cn(QUIET, 'px-4', fitted && 'bg-surface-ink/9')}
        aria-pressed={fitted}
        onClick={() => onZoom(null)}
      >
        Vừa khung
      </Button>
    </div>
  )
}

function LaneBands({ journey }: { journey: Journey }) {
  const count: Partial<Record<(typeof LANES)[number]['key'], number>> = {
    deal: journey.deals.length,
    contract: journey.contracts.length,
  }
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
    </div>
  ))
}

export function WorkstreamTree({ journey, go, ...track }: Track & { journey: Journey; go: Go }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [zoomAsked, setZoom] = useState<number | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const shape = journey.deals.map((d) => `${d.code}:${expanded.has(d.code)}`).join('|')
  const heights = useNodeHeights(rootRef, shape)
  const frame = useFrame(frameRef)
  const layout = layoutTree(journey, (d) => d.outcome === 'open' || expanded.has(d.code), heights)
  const fit = fitZoom(frame)
  const zoom = zoomAsked ?? fit
  const scaledH = Math.round(layout.contentH * zoom)

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(code)) next.add(code)
      return next
    })

  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Legend />
        <ZoomBar zoom={zoom} fitted={zoomAsked === null} onZoom={setZoom} />
      </div>

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
            its overflow behind `scrollLeft: 0`. */}
        <div
          className="relative mx-auto"
          style={{ width: Math.round(TREE_W * zoom), height: scaledH }}
        >
          <div
            ref={rootRef}
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: TREE_W, height: layout.contentH, transform: `scale(${zoom})` }}
          >
            <LaneBands journey={journey} />
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
                {layout.ghost && (
                  <rect
                    x={CARD.deal.x + 1}
                    y={layout.ghost.top + 1}
                    width={CARD.deal.w - 2}
                    height={GHOST_H - 2}
                    rx={6}
                    {...edgeProps('ghost')}
                    strokeWidth={1}
                  />
                )}
              </svg>

              <LeadCard lead={journey.lead} box={layout.lead} go={go} {...track} />
              {layout.ghost && (
                <div
                  className="text-glass-foreground absolute flex items-center px-4 text-[12px]"
                  style={{
                    left: CARD.deal.x,
                    top: layout.ghost.top,
                    width: CARD.deal.w,
                    height: GHOST_H,
                  }}
                >
                  Chưa có cơ hội nào từ lead này
                </div>
              )}
              {layout.deals.map(({ deal, full, box }) => (
                <DealCard
                  key={deal.code}
                  deal={deal}
                  box={box}
                  full={full}
                  onToggle={() => toggle(deal.code)}
                  go={go}
                  {...track}
                />
              ))}
              {layout.contracts.map(({ contract, box }) => (
                <ContractCard
                  key={contract.code}
                  contract={contract}
                  box={box}
                  go={go}
                  {...track}
                />
              ))}
              {layout.doors.map(({ door, box, from }) => (
                <DoorCard key={doorId(door)} door={door} from={from} box={box} go={go} {...track} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
