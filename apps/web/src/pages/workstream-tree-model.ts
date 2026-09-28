import {
  CONTRACT_RUNG_LABEL,
  JOURNEY_DEAL_OUTCOME_LABEL,
  JOURNEY_STATUS_LABEL,
  LEAD_STATE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  WORKSTREAM_JOURNEY_STEPS,
  type DueLevel,
  type JourneyContract,
  type JourneyDeal,
  type JourneyDoor,
  type JourneyRungKey,
  type JourneyRungState,
  type JourneySubStep,
  type WorkstreamJourneyResponse,
} from '@pv/contracts'
import { billions, millions } from '@pv/ui'
import { DUE_LABEL } from '@/data/contracts'

/** The journey tree's arithmetic — ordering, rung and status reading, layout.
 *  No React, so every rule the cards obey can be read in one place.
 *
 *  LAID OUT FROM MEASURED HEIGHTS. Edges need both ends in one coordinate
 *  space, so positions are computed here; heights come from the rendered cards
 *  (read before paint) because no text may be cut with "…" and a wrapped title
 *  changes a card's height. `DEFAULT_H` only seeds the very first layout pass.
 *
 *  Columns follow the canvas E-Main: four lane bands, cards inset 8px. */

export type Journey = WorkstreamJourneyResponse
export type PickKind = 'lead' | 'deal' | 'contract'

/** The selection the detail drawer reads: one rung of one object, or one
 *  continuation door (keyed by the lead it parked or opened). */
export type TreePick =
  { kind: PickKind; code: string; rung: JourneyRungKey } | { kind: 'door'; code: string }

export const isPicked = (p: TreePick | null, kind: TreePick['kind'], code: string) =>
  p?.kind === kind && p.code === code

export const doorId = (d: JourneyDoor) => `door:${d.leadCode}`

export type Tone = 'draft' | 'warning' | 'success' | 'danger'
export type Status = { label: string; tone: Tone }

// ---------------------------------------------------------------------------
// GEOMETRY
// ---------------------------------------------------------------------------

export const TREE_W = 1176
/** Room above the cards for each lane's own header. */
export const LANE_TOP = 56
const FOOT = 16
const ROW_GAP = 12
const FAN_GAP = 8
export const GHOST_H = 48

const stepLabel = (key: (typeof WORKSTREAM_JOURNEY_STEPS)[number]['key']) =>
  WORKSTREAM_JOURNEY_STEPS.find((s) => s.key === key)?.label ?? ''

/** Phase names are the handoff's grouping labels (not states); the object
 *  word under each comes from the product's own tables. */
export const LANES = [
  { key: 'lead', x: 0, w: 280, phase: 'Presale', object: stepLabel('lead') },
  { key: 'deal', x: 288, w: 304, phase: 'Sale', object: stepLabel('opportunity') },
  { key: 'contract', x: 600, w: 320, phase: 'Postsale', object: stepLabel('contract') },
  {
    key: 'next',
    x: 928,
    w: 248,
    phase: 'Tiếp nối',
    object: `${JOURNEY_STATUS_LABEL.growth} · ${JOURNEY_DEAL_OUTCOME_LABEL.waiting}`,
  },
] as const

/* Widths fix the rung buttons: the lead card's 240px of rail, after its 12px
   padding, is exactly five 48px targets (law 13). */
export const CARD = {
  lead: { x: 8, w: 264 },
  deal: { x: 296, w: 288 },
  contract: { x: 608, w: 304 },
  door: { x: 936, w: 232 },
} as const

const DEFAULT_H = { lead: 160, dealFull: 200, dealCompact: 72, contract: 132, door: 160 }

export const ZOOM = { min: 0.4, max: 2, step: 0.1 }

export const clampZoom = (z: number) =>
  Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round(z * 100) / 100))

/** Fit by WIDTH only — a tall tree scrolls, it never shrinks to fit. Never
 *  past 100%, and never under it on a touch screen or below `lg`: scaling
 *  would shrink the 48px targets under law 13, so the frame scrolls instead. */
export const fitZoom = (frame: { w: number; touch: boolean }) =>
  frame.touch ? 1 : clampZoom(Math.min(1, frame.w / TREE_W))

// ---------------------------------------------------------------------------
// RUNGS
// ---------------------------------------------------------------------------

type AnyRung = { key: JourneyRungKey; state: JourneyRungState; at: string | null }

/** Who holds a lead nobody picked up yet — the product word for the pool. */
export const POOL = 'Kho chung'

/** One word per rung state, read by the rail's aria-labels AND the legend. A
 *  late rung says its due level instead (`DUE_LABEL`). */
export const STATE_WORD: Record<JourneyRungState, string> = {
  done: 'Xong',
  current: 'Đang ở',
  stopped: JOURNEY_DEAL_OUTCOME_LABEL.waiting,
  skipped: 'Bỏ qua',
  upcoming: 'Chưa tới',
}

const OVERDUE = new Set<DueLevel>(['overdue', 'long-overdue'])
const overdue = (level: DueLevel | null | undefined): level is DueLevel =>
  level !== null && level !== undefined && OVERDUE.has(level)

/** The level itself when it is overdue, else null — the one reading of "late". */
export const lateLevel = (level: DueLevel | null | undefined) => (overdue(level) ? level : null)

/** The badge word for one rung: its due level when late, else its state word. */
export function rungStatus(state: JourneyRungState, late: DueLevel | null): Status {
  if (late) return { label: DUE_LABEL[late], tone: 'danger' }
  const tone = state === 'current' ? 'warning' : state === 'done' ? 'success' : 'draft'
  return { label: STATE_WORD[state], tone }
}

/** The rung `step` places before or after `key` on the same ladder, if any. */
export function stepAlong<K>(keys: readonly K[], key: K, step: -1 | 1): K | undefined {
  const i = keys.indexOf(key)
  return i < 0 ? undefined : keys[i + step]
}

export type RailRung = AnyRung & {
  label: string
  /** The due level of the CURRENT rung when it is overdue, else null. */
  late: DueLevel | null
  /** The line INTO this rung and OUT of it — lit up to the furthest reached rung. */
  litIn: boolean
  litOut: boolean
}

/** `findLastIndex` is ES2023; this tree compiles against ES2022. */
function lastIndex<T>(list: readonly T[], test: (item: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i] as T)) return i
  return -1
}

/* Keyed by string so a key from another ladder reads as undefined, never as
   that ladder's word: `new` and `assigned` exist on both lead and deal. */
const LADDER: Record<PickKind, Readonly<Record<string, string>>> = {
  lead: LEAD_STATE_LABEL,
  deal: OPPORTUNITY_STAGE_LABEL,
  contract: CONTRACT_RUNG_LABEL,
}

export const rungLabel = (kind: PickKind, key: string): string | undefined => LADDER[kind][key]

/** A skipped rung between two reached ones stays lit: the line shows how far
 *  the object got, not which rungs it happened to use. */
export function railOf(
  kind: PickKind,
  rungs: readonly AnyRung[],
  late: DueLevel | null,
): RailRung[] {
  const reach = lastIndex(rungs, (r) => r.state !== 'upcoming' && r.state !== 'skipped')
  return rungs.map((r, i) => ({
    key: r.key,
    state: r.state,
    at: r.at,
    label: rungLabel(kind, r.key) ?? '',
    late: r.state === 'current' ? late : null,
    litIn: i > 0 && i <= reach,
    litOut: i + 1 < rungs.length && i + 1 <= reach,
  }))
}

/** The rung an object stands on: where it is, where it stopped, or the last
 *  one it finished. */
export function standOf<R extends AnyRung>(rungs: readonly R[]): R | undefined {
  return (
    rungs.find((r) => r.state === 'current' || r.state === 'stopped') ??
    rungs[lastIndex(rungs, (r) => r.state === 'done')]
  )
}

// ---------------------------------------------------------------------------
// STATUS
// ---------------------------------------------------------------------------

export function leadStatus(lead: Journey['lead']): Status | null {
  const at = standOf(lead.rungs)
  if (!at) return null
  const label = LEAD_STATE_LABEL[at.key]
  if (at.state === 'current') return { label, tone: 'warning' }
  if (at.state === 'stopped') return { label: LEAD_STATE_LABEL.nurturing, tone: 'draft' }
  return { label, tone: 'success' }
}

const currentRung = (deal: JourneyDeal) => deal.rungs.find((r) => r.state === 'current')

/** The sender grades time-in-rung against the stage limit (flow G3); this side
 *  only reads the level. Null while on time or when nothing is running. */
export function dealLate(deal: JourneyDeal): DueLevel | null {
  return deal.outcome === 'open' ? lateLevel(currentRung(deal)?.dueLevel) : null
}

/** The running sub-step names the work better than the rung (waiting for the
 *  customer's reply says more than "Quotation"); the rung label stands in
 *  when no sub-step runs. */
export function dealStatus(deal: JourneyDeal): Status {
  if (deal.outcome !== 'open') {
    const tone = deal.outcome === 'won' ? 'success' : 'draft'
    return { label: JOURNEY_DEAL_OUTCOME_LABEL[deal.outcome], tone }
  }
  const r = currentRung(deal)
  if (!r) return { label: JOURNEY_DEAL_OUTCOME_LABEL.open, tone: 'warning' }
  const name =
    r.subSteps.find((s) => s.state === 'current')?.label ?? OPPORTUNITY_STAGE_LABEL[r.key]
  const late = dealLate(deal)
  if (late) return { label: `${name} · ${DUE_LABEL[late]}`, tone: 'danger' }
  if (r.days === null) return { label: name, tone: 'warning' }
  const limit = r.limitDays === null ? '' : `/${r.limitDays}`
  return { label: `${name} · ngày ${r.days}${limit}`, tone: 'warning' }
}

/** A contract rung is late only by the sub-items that belong to it: deploy
 *  by its milestones, collect by its installments. Acceptance carries no due
 *  level, so it is never graded here. */
export function contractRungLate(c: JourneyContract, key: JourneyRungKey): DueLevel | null {
  const levels: (DueLevel | null)[] =
    key === 'deploy'
      ? c.milestones.map((m: JourneySubStep) => m.dueLevel)
      : key === 'collect'
        ? c.installments.map((i) => i.dueLevel)
        : []
  if (levels.includes('long-overdue')) return 'long-overdue'
  return levels.some(overdue) ? 'overdue' : null
}

/** The late level of the rung the contract is on, or null. */
export function contractLate(c: JourneyContract): DueLevel | null {
  const r = c.rungs.find((x) => x.state === 'current')
  return r ? contractRungLate(c, r.key) : null
}

export function contractStatus(c: JourneyContract): Status {
  const at = standOf(c.rungs)
  const label = at ? CONTRACT_RUNG_LABEL[at.key] : CONTRACT_RUNG_LABEL.signed
  const late = contractLate(c)
  if (late) return { label: `${label} · ${DUE_LABEL[late]}`, tone: 'danger' }
  return { label, tone: at?.state === 'current' ? 'warning' : 'success' }
}

/** Millions under a billion, billions from there — a pill has no room for a
 *  four-digit count of millions. */
export const moneyShort = (v: number) => (v >= 1e9 ? billions(v) : millions(v, 0))

// ---------------------------------------------------------------------------
// ORDER AND LAYOUT
// ---------------------------------------------------------------------------

const rank = (d: JourneyDeal) =>
  d.outcome === 'open' ? (dealLate(d) ? 0 : 1) : d.outcome === 'won' ? 2 : 3

/** Late first, then open, then won newest first, waiting last. */
export function orderDeals(deals: readonly JourneyDeal[]): JourneyDeal[] {
  return [...deals].sort(
    (a, b) => rank(a) - rank(b) || (b.outcomeAt ?? '').localeCompare(a.outcomeAt ?? ''),
  )
}

export type Box = { top: number; center: number }
export type EdgeTone = 'won' | 'open' | 'ghost' | 'born'
export type Edge = { key: string; d: string; tone: EdgeTone }

export type TreeLayout = {
  deals: { deal: JourneyDeal; full: boolean; box: Box }[]
  contracts: { contract: JourneyContract; box: Box }[]
  lead: Box
  /** The empty deal lane's placeholder; null once any deal exists. */
  ghost: Box | null
  /** `from` names the ladder the door's `from.rung` belongs to. */
  doors: { door: JourneyDoor; box: Box; from: PickKind }[]
  edges: Edge[]
  contentH: number
}

/** A horizontal S: both ends leave their card level. */
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const m = (x1 + x2) / 2
  return `M${x1} ${y1} C${m} ${y1}, ${m} ${y2}, ${x2} ${y2}`
}

const box = (top: number, h: number): Box => ({ top, center: top + h / 2 })

export const EDGE_OF: Record<JourneyDeal['outcome'], EdgeTone> = {
  won: 'won',
  open: 'open',
  waiting: 'ghost',
}

export function layoutTree(
  j: Journey,
  isFull: (deal: JourneyDeal) => boolean,
  heights: ReadonlyMap<string, number>,
): TreeLayout {
  const h = (id: string, fallback: number) => heights.get(id) ?? fallback
  const deals: TreeLayout['deals'] = []
  const contracts: TreeLayout['contracts'] = []
  let y = 0
  for (const deal of orderDeals(j.deals)) {
    const full = isFull(deal)
    const dh = h(deal.code, full ? DEFAULT_H.dealFull : DEFAULT_H.dealCompact)
    const own = deal.contractCodes.flatMap((code) => j.contracts.filter((c) => c.code === code))
    const ch = own.map((c) => h(c.code, DEFAULT_H.contract))
    const fan = ch.reduce((s, x) => s + x, 0) + Math.max(0, own.length - 1) * FAN_GAP
    const rowH = Math.max(dh, fan)
    deals.push({ deal, full, box: box(y + (rowH - dh) / 2, dh) })
    let cy = y + (rowH - fan) / 2
    own.forEach((contract, i) => {
      contracts.push({ contract, box: box(cy, ch[i] ?? 0) })
      cy += (ch[i] ?? 0) + FAN_GAP
    })
    y += rowH + ROW_GAP
  }
  const stackH = deals.length > 0 ? y - ROW_GAP : GHOST_H
  const lh = h(j.lead.code, DEFAULT_H.lead)
  const lead = box(Math.max(0, stackH / 2 - lh / 2), lh)
  const ghost = deals.length === 0 ? box(Math.max(0, lead.center - GHOST_H / 2), GHOST_H) : null

  const leadRight = CARD.lead.x + CARD.lead.w
  const dealRight = CARD.deal.x + CARD.deal.w
  const edges: Edge[] = deals.map(({ deal, box: b }) => ({
    key: `deal:${deal.code}`,
    d: curve(leadRight, lead.center, CARD.deal.x, b.center),
    tone: EDGE_OF[deal.outcome],
  }))
  if (ghost) {
    edges.push({
      key: 'ghost',
      d: curve(leadRight, lead.center, CARD.deal.x, ghost.center),
      tone: 'ghost',
    })
  }
  for (const { contract, box: b } of contracts) {
    const parent = deals.find((d) => d.deal.code === contract.dealCode)
    if (!parent) continue
    edges.push({
      key: `contract:${contract.code}`,
      d: curve(dealRight, parent.box.center, CARD.contract.x, b.center),
      tone: 'won',
    })
  }
  const doors = placeDoors(j, { lead, deals, contracts }, h, edges)
  const bottom = Math.max(
    stackH,
    lead.top + lh,
    ghost ? ghost.top + GHOST_H : 0,
    ...doors.map((d) => d.box.top + h(doorId(d.door), DEFAULT_H.door)),
  )
  return { deals, contracts, lead, ghost, doors, edges, contentH: LANE_TOP + bottom + FOOT }
}

type Anchor = { kind: PickKind; center: number; x: number }

/** The ladder an anchor code belongs to, read off the journey DATA — never off
 *  which cards are drawn, and never guessed. */
export function anchorKind(j: Journey, code: string): PickKind | null {
  if (j.lead.code === code) return 'lead'
  if (j.deals.some((d) => d.code === code)) return 'deal'
  return j.contracts.some((c) => c.code === code) ? 'contract' : null
}

/** Each door sits level with the object that produced it (handoff screen E);
 *  doors that would collide are pushed down, in anchor order. A door whose
 *  anchor is absent from the data, or not drawn, is skipped rather than
 *  placed on a guess. A lead-anchored door gets only a stub from its lane's
 *  edge: a long edge from the lead would cross the deal lane and read as if a
 *  deal produced it. */
function placeDoors(
  j: Journey,
  at: Pick<TreeLayout, 'lead' | 'deals' | 'contracts'>,
  h: (id: string, fallback: number) => number,
  edges: Edge[],
): TreeLayout['doors'] {
  const right = (c: { x: number; w: number }) => c.x + c.w
  const stubX = LANES[2].x + LANES[2].w
  const drawn = new Map<string, Omit<Anchor, 'kind'>>([
    [j.lead.code, { center: at.lead.center, x: stubX }],
    ...at.deals.map((d) => [d.deal.code, { center: d.box.center, x: right(CARD.deal) }] as const),
    ...at.contracts.map(
      (c) => [c.contract.code, { center: c.box.center, x: right(CARD.contract) }] as const,
    ),
  ])
  const queue = j.doors
    .flatMap((door) => {
      const kind = anchorKind(j, door.from.code)
      const a = drawn.get(door.from.code)
      return kind && a ? [{ door, a: { ...a, kind } }] : []
    })
    .sort((x, y) => x.a.center - y.a.center)
  let floor = 0
  return queue.map(({ door, a }) => {
    const dh = h(doorId(door), DEFAULT_H.door)
    const b = box(Math.max(floor, a.center - dh / 2), dh)
    floor = b.top + dh + ROW_GAP
    edges.push({
      key: doorId(door),
      d:
        a.kind === 'lead'
          ? `M${a.x} ${b.center} H${CARD.door.x}`
          : curve(a.x, a.center, CARD.door.x, b.center),
      tone: door.kind === 'growth' ? 'born' : 'ghost',
    })
    return { door, box: b, from: a.kind }
  })
}
