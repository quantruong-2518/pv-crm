import {
  StageKey,
  type LeadTier,
  type OpportunityOwner,
  type PipelinePositionView,
  type WorkstreamFootprint,
  type WorkstreamHolder,
  type WorkstreamRow,
  type WorkstreamStand,
} from '@pv/contracts'
import type { OpportunityRowDb } from '../opportunity/opportunity.schema'
import type { PhaseConfig } from '../ladder'
import type { WorkstreamRead } from './workstream.repository'

/** Table ↔ wire for one journey, plus the two pure folds only this module
 *  makes: which object of the journey is LIVE, and who holds it.
 *
 *  Nothing here reads the database and nothing here calls an engine — the
 *  position on a ladder arrives already decided, so the same walk could be
 *  replayed anywhere. Vietnamese below is a DISPLAY LABEL, never a key: the two
 *  rungs that have no `config_entry` row are labelled here for the same reason
 *  `opportunity.labels.ts` holds its own, and one copy beats three. */
const SIGNED_LABEL = 'Đã ký'
const NO_TIER_LABEL = 'Chưa xếp bậc'

/** Which object of the journey a reader should open, walked in the order the
 *  journey itself runs: a signature ends it, else the deal that got furthest,
 *  else the lead it started at.
 *
 *  Only an OPEN deal counts. A deal with no `stage` has left the five-column
 *  board (won or lost), so standing a live run on it would print a rung the
 *  deal is no longer on — and a lost deal never ends the run: the lead is still
 *  there and can raise another. */
export type WorkstreamLive =
  | { kind: 'HĐ'; code: string }
  | { kind: 'OP'; deal: OpportunityRowDb; stage: StageKey }
  | { kind: 'LD' }

export function liveOf(
  deals: readonly OpportunityRowDb[],
  contractCode: string | null,
): WorkstreamLive {
  if (contractCode !== null) return { kind: 'HĐ', code: contractCode }

  let best: { deal: OpportunityRowDb; stage: StageKey; rung: number } | null = null
  for (const deal of deals) {
    const stage = deal.stage
    if (!stage) continue
    const rung = StageKey.options.indexOf(stage)
    /* Strictly further along wins, so a tie keeps the FIRST deal of the list —
       which `dealsOf` ordered newest code first. */
    if (best === null || rung > best.rung) best = { deal, stage, rung }
  }

  return best === null ? { kind: 'LD' } : { kind: 'OP', deal: best.deal, stage: best.stage }
}

/** Where the run stands, with the rung's name already resolved.
 *
 *  Two of the three rungs have no `config_entry` row to resolve against and
 *  cannot get one here: there is no contract ladder in this database, and a
 *  lead may sit in the book without a tier. Both print a label owned by this
 *  file rather than an empty cell — `phaseLabel` is a required field, and an
 *  invented key would be worse than an honest word. */
export function standOf(
  read: WorkstreamRead,
  live: WorkstreamLive,
  stage: Map<StageKey, PhaseConfig>,
  tier: Map<LeadTier, PhaseConfig>,
): WorkstreamStand {
  if (live.kind === 'HĐ') return { code: live.code, kind: 'HĐ', phaseLabel: SIGNED_LABEL }

  if (live.kind === 'OP') {
    return {
      code: live.deal.code,
      kind: 'OP',
      phaseLabel: stage.get(live.stage)?.label ?? live.stage,
    }
  }

  const rung = read.lead.tier
  return {
    code: read.lead.code,
    kind: 'LD',
    phaseLabel: rung === null ? NO_TIER_LABEL : (tier.get(rung)?.label ?? rung),
  }
}

/** One person per role, and BOTH roles carried.
 *
 *  `opportunity_owner` is a real list keyed `(deal, actor, role)`, so the older
 *  move of collapsing it to "the first SALE name that resolves" dropped the BD
 *  entirely. Per role, the newest deal of the run answers first; a run with no
 *  deal yet — most of the book — falls back to the lead's own two owner
 *  columns, which is the same person wearing the same role one step earlier.
 *
 *  Id AND name travel together because E2's scope axis still compares display
 *  NAMES (a known, unpaid debt): nothing downstream may assume a name is
 *  unique, and the id is the only safe key. */
export function holdersOf(
  read: WorkstreamRead,
  deals: readonly OpportunityRowDb[],
  ownersOf: Map<string, OpportunityOwner[]>,
): { sale: WorkstreamHolder | null; bd: WorkstreamHolder | null } {
  const fromDeals = (role: 'SALE' | 'BD'): WorkstreamHolder | null => {
    for (const deal of deals) {
      const found = (ownersOf.get(deal.code) ?? []).find((o) => o.role === role)
      if (found) return { id: found.id, name: found.name }
    }
    return null
  }

  const fromLead = (id: string | null, name: string | null): WorkstreamHolder | null =>
    id !== null && name !== null ? { id, name } : null

  return {
    sale: fromDeals('SALE') ?? fromLead(read.lead.ownerId, read.saleName),
    bd: fromDeals('BD') ?? fromLead(read.lead.bdOwnerId, read.bdName),
  }
}

export type WorkstreamAssembled = {
  read: WorkstreamRead
  stand: WorkstreamStand
  /** `null` when the live object's ladder cannot place it — see `overdueBy`
   *  in the contract for why that is printed blank rather than as zero. */
  position: PipelinePositionView | null
  holders: { sale: WorkstreamHolder | null; bd: WorkstreamHolder | null }
  footprint: WorkstreamFootprint
}

/** One row of the book, as the screen reads it. */
export function toContract(input: WorkstreamAssembled): WorkstreamRow {
  const { row } = input.read

  return {
    code: row.code,
    customer: input.read.accountName ?? input.read.lead.company,
    accountCode: row.accountCode,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    closeReason: row.closeReason ?? null,
    stand: input.stand,
    overdueBy: input.position?.overdueBy ?? null,
    saleHolder: input.holders.sale,
    bdHolder: input.holders.bd,
    waitingOn: input.position?.waitingOn ?? null,
    footprint: input.footprint,
  }
}
