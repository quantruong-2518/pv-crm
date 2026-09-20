import type { JourneyContract, WorkstreamDealLaneView } from '@/data/workstreams'

/** Where every node of the journey tree sits — pure arithmetic, no DOM.
 *
 *  THE TREE IS LAID OUT, NOT MEASURED. Bezier edges need both endpoints in one
 *  coordinate space, and measuring nodes after paint would draw the edges one
 *  frame late on every refetch. So node heights are fixed per kind here and the
 *  render obeys them; a node that needs an extra line declares it (the lead's
 *  nurture row) rather than growing on its own.
 *
 *  The canvas is a fixed width inside a horizontal scroller, the same trade the
 *  old matrix made: columns that line up beat columns that fit. */

export const COL = {
  lead: { x: 0, w: 280 },
  deal: { x: 336, w: 300 },
  contract: { x: 692, w: 180 },
  account: { x: 928, w: 236 },
} as const

export const TREE_WIDTH = COL.account.x + COL.account.w

/* A rung button is a real target on the site's tablet: five of them across the
   narrowest column must each clear 48px wide (law 13), which is what sets the
   lead column to 280. */

/* EVERY NODE IS THE SAME FOUR BANDS — head, body, note, foot — so one set of
   band heights sizes all four kinds, and a card can no longer end above its
   own last row. The numbers below are the rendered heights of the elements
   `workstream-journey.tsx` puts in each band; change a band there and change
   its constant here in the same edit. */
const PAD = 16 // Node's `p-4`, top and bottom
const GAP = 12 // Node's `gap-3`, between bands
const HEAD_H = 25 // a Badge: `py-1` over 11px text at the 1.5 preflight leading
const RAIL_H = 48 // one rung button's `min-h-12`, taller than the dot and date it holds
const NOTE_H = 18 // one 11.5px summary line
const FOOT_H = 25 // a Badge again, half a pixel over Avatar `sm`

/* THE PRICE OF DECLARING INSTEAD OF MEASURING. Every band above is a rounded-up
   reading of a CSS box, and text boxes land on fractions. Without this the sums
   came out exact, so one extra half-pixel put a card's foot through its floor —
   which is the bug this whole block was rewritten to kill. */
const SLACK = 4

const frame = (bands: number) => PAD * 2 + GAP * (bands - 1) + SLACK

/* Head, rail, foot — the lead's three certain bands. Everything below is a
   band it only sometimes draws, declared by the caller rather than measured. */
const LEAD_H = frame(3) + HEAD_H + RAIL_H + FOOT_H
const LEAD_NOTE_H = GAP + NOTE_H
const LEAD_TIER_H = 29 // `mt-1` over a Badge, riding under one rung inside the rail band
const LEAD_NURTURE_H = GAP + 17
/* A deal reserves its note band whether or not it draws one: deals stack, and
   a column of cards that each ended at its own height reads as a mistake. */
const DEAL_H = frame(4) + HEAD_H + RAIL_H + NOTE_H + FOOT_H
const DEAL_GAP = 14
const HIDDEN_H = 48
const CONTRACT_H = frame(3) + HEAD_H + NOTE_H + NOTE_H
/* Two bands, but the second stacks the foot over a 48px action (`gap-2`). */
const ACCOUNT_H = frame(2) + HEAD_H + (FOOT_H + 8 + 48)
const GHOST_H = 56

/* The one write door of the tree is a button, not a node — its own pair of
   constants rather than a fifth node kind. Height matches Button's `lg`
   (48px, law 13's tablet floor). */
const CREATE_DEAL_H = 48
const CREATE_DEAL_GAP = 12

export type Box = { top: number; height: number; center: number }

export type EdgeTone = 'won' | 'lost' | 'open' | 'ghost'

export type Edge = { key: string; x1: number; y1: number; x2: number; y2: number; tone: EdgeTone }

export type TreeLayout = {
  height: number
  lead: Box
  deals: Box[]
  /** The strip that reports deals the server cut by scope, when it cut any. */
  hidden: Box | null
  /** One per contract, vertically on its own deal. */
  contracts: Box[]
  account: Box
  /** Placeholders for a column with nothing in it yet. */
  dealGhost: Box | null
  contractGhost: Box | null
  /** Room reserved under the lead node for the create-deal button, when the
   *  caller asked for it. `null` draws no gap. */
  createDeal: Box | null
  edges: Edge[]
}

const box = (top: number, height: number): Box => ({ top, height, center: top + height / 2 })

const rightOf = (col: { x: number; w: number }) => col.x + col.w

function edgeTone(outcome: WorkstreamDealLaneView['outcome']): EdgeTone {
  return outcome === 'won' ? 'won' : outcome === 'lost' ? 'lost' : 'open'
}

export function treeLayout(input: {
  deals: WorkstreamDealLaneView[]
  hiddenDeals: number
  contracts: JourneyContract[]
  hasNurture: boolean
  /** The lead was graded, so a tier badge rides under one of its rungs. */
  hasTier: boolean
  /** The lead lane has a summary line to draw under its rail. */
  hasLeadNote: boolean
  hasAccount: boolean
  /** Caller already folded `canEdit && lead.outcome !== 'exited'` into this —
   *  layout math should not know a permission from a business outcome. */
  showCreateDeal: boolean
}): TreeLayout {
  const { deals, hiddenDeals, contracts, hasAccount, showCreateDeal } = input
  const { hasNurture, hasTier, hasLeadNote } = input

  const dealBoxes = deals.map((_, i) => box(i * (DEAL_H + DEAL_GAP), DEAL_H))
  const afterDeals = dealBoxes.length === 0 ? 0 : dealBoxes.length * (DEAL_H + DEAL_GAP)
  const dealGhost = dealBoxes.length === 0 ? box(0, GHOST_H) : null
  const hidden = hiddenDeals > 0 ? box(afterDeals, HIDDEN_H) : null

  const stackBottom = hidden
    ? hidden.top + hidden.height
    : (dealGhost?.height ?? afterDeals - DEAL_GAP)
  const stackCenter = stackBottom / 2

  const leadHeight =
    LEAD_H +
    (hasLeadNote ? LEAD_NOTE_H : 0) +
    (hasTier ? LEAD_TIER_H : 0) +
    (hasNurture ? LEAD_NURTURE_H : 0)
  const lead = box(stackCenter - leadHeight / 2, leadHeight)

  /* A contract hangs on the deal that produced it — that pairing IS the reason
     the screen became a tree, so it is never averaged or stacked separately. */
  const contractBoxes = contracts.map((c) => {
    const parent = deals.findIndex((d) => d.code === c.dealCode)
    const anchor = dealBoxes[parent]?.center ?? stackCenter
    return box(anchor - CONTRACT_H / 2, CONTRACT_H)
  })
  const contractGhost = contractBoxes.length === 0 ? box(stackCenter - GHOST_H / 2, GHOST_H) : null

  const accountAnchor =
    contractBoxes.length === 0
      ? stackCenter
      : contractBoxes.reduce((sum, b) => sum + b.center, 0) / contractBoxes.length
  /* An empty column is a GHOST, and a ghost is ghost-sized: billing the
     account's full height for its placeholder drew one three times taller
     than the two beside it. */
  const accountHeight = hasAccount ? ACCOUNT_H : GHOST_H
  const account = box(accountAnchor - accountHeight / 2, accountHeight)

  const all = [lead, ...dealBoxes, ...contractBoxes, account, hidden, dealGhost, contractGhost]
  const boxes = all.filter((b): b is Box => b !== null)
  const shift = Math.min(0, ...boxes.map((b) => b.top))
  if (shift < 0) {
    for (const b of boxes) {
      b.top -= shift
      b.center -= shift
    }
  }

  /* Anchored to the lead's FINAL top — must run after the shift above, or a
     run whose stack shifted upward would leave this box floating at the old,
     unshifted position. */
  const createDeal = showCreateDeal
    ? box(lead.top + lead.height + CREATE_DEAL_GAP, CREATE_DEAL_H)
    : null

  const edges: Edge[] = []
  const leadRight = rightOf(COL.lead)
  dealBoxes.forEach((b, i) => {
    const deal = deals[i]
    if (!deal) return
    edges.push({
      key: `deal:${deal.code}`,
      x1: leadRight,
      y1: lead.center,
      x2: COL.deal.x,
      y2: b.center,
      tone: edgeTone(deal.outcome),
    })
  })
  if (dealGhost) {
    edges.push({
      key: 'deal:ghost',
      x1: leadRight,
      y1: lead.center,
      x2: COL.deal.x,
      y2: dealGhost.center,
      tone: 'ghost',
    })
  }
  if (hidden) {
    edges.push({
      key: 'deal:hidden',
      x1: leadRight,
      y1: lead.center,
      x2: COL.deal.x,
      y2: hidden.center,
      tone: 'ghost',
    })
  }

  const dealRight = rightOf(COL.deal)
  contractBoxes.forEach((b, i) => {
    const contract = contracts[i]
    if (!contract) return
    edges.push({
      key: `contract:${contract.code}`,
      x1: dealRight,
      y1: b.center,
      x2: COL.contract.x,
      y2: b.center,
      tone: 'won',
    })
  })
  if (contractGhost) {
    edges.push({
      key: 'contract:ghost',
      x1: dealRight,
      y1: contractGhost.center,
      x2: COL.contract.x,
      y2: contractGhost.center,
      tone: 'ghost',
    })
  }

  const contractRight = rightOf(COL.contract)
  const toAccount: EdgeTone = contractBoxes.length > 0 && hasAccount ? 'won' : 'ghost'
  const sources = contractBoxes.length > 0 ? contractBoxes : [contractGhost as Box]
  sources.forEach((b, i) => {
    edges.push({
      key: `account:${i}`,
      x1: contractRight,
      y1: b.center,
      x2: COL.account.x,
      y2: account.center,
      tone: toAccount,
    })
  })

  const height = Math.max(
    ...boxes.map((b) => b.top + b.height),
    createDeal ? createDeal.top + createDeal.height : 0,
  )

  return {
    height,
    lead,
    deals: dealBoxes,
    hidden,
    contracts: contractBoxes,
    account,
    dealGhost,
    contractGhost,
    createDeal,
    edges,
  }
}

/** A horizontal S-curve: both ends leave their node level, so an edge reads as
 *  "this came out of that" rather than as a diagonal crossing the gap. */
export function edgePath(e: Edge): string {
  const mid = (e.x1 + e.x2) / 2
  return `M${e.x1} ${e.y1} C${mid} ${e.y1}, ${mid} ${e.y2}, ${e.x2} ${e.y2}`
}
