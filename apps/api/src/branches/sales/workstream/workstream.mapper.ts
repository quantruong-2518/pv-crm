import {
  CLOSE_REASON_LABEL,
  LEAD_LANE_BACKBONE,
  LEAD_STATE_LABEL,
  StageKey,
  type LeadState,
  type OpportunityOwner,
  type PipelinePositionView,
  type WorkstreamBoardColumn,
  type WorkstreamCloseReason,
  type WorkstreamFootprint,
  type WorkstreamHolder,
  type WorkstreamRow,
  type WorkstreamStand,
  type WorkstreamStandKind,
  type WorkstreamStatus,
} from '@pv/contracts'
import type { OpportunityRowDb } from '../opportunity/opportunity.schema'
import type { PhaseConfig } from '../ladder'
import type { StandTotal, WorkstreamBoardTotals, WorkstreamRead } from './workstream.repository'

/** Table ↔ wire for one journey, plus the two pure folds only this module
 *  makes: which object of the journey is LIVE, and who holds it.
 *
 *  Nothing here reads the database and nothing here calls an engine — the
 *  position on a ladder arrives already decided, so the same walk could be
 *  replayed anywhere. Vietnamese below is a DISPLAY LABEL, never a key: the
 *  rungs that have no `config_entry` row are labelled here for the same reason
 *  `opportunity.labels.ts` holds its own, and one copy beats three. */
const SIGNED_LABEL = 'Đã ký'

/** The two ways a run FALLS OUT. `WON` is not among them, and not because a
 *  won run is uncounted: it HAS its own column at the contract step, asked
 *  under the same `status: 'closed'` and printed under the signed label —
 *  signing is what closes a run as `WON` at all. A `WON` column here is that
 *  same set of runs, counted twice under two names. Which words these two
 *  print is `CLOSE_REASON_LABEL`'s business, not this file's. */
const DROPPED_REASONS = ['LOST', 'CHURNED'] as const satisfies readonly WorkstreamCloseReason[]

/** Which object of the journey a reader should open: the open deal that got
 *  furthest, else the signature, else the lead it started at.
 *
 *  An open deal outranks a contract because a run with work still moving
 *  stands on that work — one deal signed does not finish a second one. A deal
 *  with no `stage` has left the five-column board (won or lost), so it never
 *  counts; a lost deal never ends the run either, the lead can raise another.
 *  The caller passes only deals and a contract the reader may open. */
export type WorkstreamLive =
  | { kind: 'HĐ'; code: string }
  | { kind: 'OP'; deal: OpportunityRowDb; stage: StageKey }
  | { kind: 'LD' }

export function liveOf(
  deals: readonly OpportunityRowDb[],
  contractCode: string | null,
): WorkstreamLive {
  let best: { deal: OpportunityRowDb; stage: StageKey; rung: number } | null = null
  for (const deal of deals) {
    const stage = deal.stage
    if (!stage) continue
    const rung = StageKey.options.indexOf(stage)
    /* Strictly further along wins, so a tie keeps the FIRST deal of the list —
       which `dealsOf` ordered newest code first. */
    if (best === null || rung > best.rung) best = { deal, stage, rung }
  }

  if (best !== null) return { kind: 'OP', deal: best.deal, stage: best.stage }
  return contractCode === null ? { kind: 'LD' } : { kind: 'HĐ', code: contractCode }
}

/** Where the run stands, READ OFF THE ROW — kind, key AND code.
 *
 *  All three come off the columns migration 0056 materialized, so the cell on
 *  the table view and the column on the board are one answer. `phaseLabel`
 *  stays on this side because a label belongs to `config_entry`.
 *
 *  `kept` is the reader's half, and it decides the three TOGETHER: a reader who
 *  may not open the object `stand_code` names gets the LEAD — its rung AND its
 *  code. Deciding them apart is what printed `{kind:'LD', code:'OP-0123'}` and
 *  sent `chainPath` to `/sales/leads/OP-0123`. */
export function standOf(
  read: WorkstreamRead,
  kept: boolean,
  stage: Map<StageKey, PhaseConfig>,
): WorkstreamStand {
  const { standKind, standKey, standCode, standLeadKey } = read.row
  const kind = kept ? standKind : 'LD'
  const key = kept ? standKey : standLeadKey
  /* `standCode` is null only between the intake insert and the lead one
     statement later, which no reader ever sees — see its column. */
  const code = (kept ? standCode : read.lead.code) ?? read.lead.code

  return { code, kind, key, phaseLabel: labelOf(kind, key, stage) }
}

/** May this reader open the object the run stands on — the SAME question
 *  `WorkstreamRepository.opensStand` puts to the database, asked over rows
 *  already in hand.
 *
 *  Not "is the object E2 kept the one `stand_code` names": E2 lets a deal with
 *  NO owner row through (its scope axis has nobody to compare), while the SQL
 *  `EXISTS` finds nobody and pushes the card to the lead column — so that card
 *  landed in the lead column printing a deal. Both ends now read
 *  `opportunity_owner`, and a signature is judged by its own deal's owners,
 *  the axis `rowsOf` already cuts contracts on.
 *
 *  `readerId` is null for a reader who sees the whole book: no fence, the same
 *  branch `standPair` takes. */
export function opensStand(
  read: WorkstreamRead,
  contracts: readonly { code: string; deal: string }[],
  ownersOf: Map<string, OpportunityOwner[]>,
  readerId: string | null,
): boolean {
  const { standKind, standCode } = read.row
  if (readerId === null || standKind === 'LD') return true

  const deal =
    standKind === 'OP' ? standCode : (contracts.find((c) => c.code === standCode)?.deal ?? null)
  return deal !== null && (ownersOf.get(deal) ?? []).some((o) => o.id === readerId)
}

/** Which object of the run this reader OPENS — what E3's inbox is asked
 *  about. The one thing `live` still decides: `stand` is off the row now. */
export const liveCodeOf = (read: WorkstreamRead, live: WorkstreamLive): string =>
  live.kind === 'HĐ' ? live.code : live.kind === 'OP' ? live.deal.code : read.lead.code

/** The rung's word. Only the deal ladder is catalogued; the lead's rungs read
 *  the label the contract declares beside the state, and a signature has no
 *  ladder at all. A key with no word prints ITSELF rather than an empty cell —
 *  ugly and true, the fence `ladderConfigOf` already argues. */
function labelOf(
  kind: WorkstreamStandKind,
  key: string,
  stage: Map<StageKey, PhaseConfig>,
): string {
  if (kind === 'HĐ') return SIGNED_LABEL
  if (kind === 'OP') return stage.get(key as StageKey)?.label ?? key
  return LEAD_STATE_LABEL[key as LeadState] ?? key
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
  /** Days past the deadline `stand_due_at` holds, measured with the engine's
   *  own day rule — the SAME number the book's `ORDER BY` sorts on, which is
   *  why it is not read off `position` any more. Null where no deadline is
   *  configured; see `overdueBy` in the contract for why that is blank rather
   *  than zero. */
  overdueBy: number | null
  /** E3's half of the position: who is being kept waiting. `overdueBy` above
   *  no longer comes from here — one number, one source. */
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
    contact: input.read.lead.contactName,
    accountCode: row.accountCode,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    closeReason: row.closeReason ?? null,
    stand: input.stand,
    overdueBy: input.overdueBy,
    saleHolder: input.holders.sale,
    bdHolder: input.holders.bd,
    waitingOn: input.position?.waitingOn ?? null,
    footprint: input.footprint,
  }
}

/** The board's column catalogue, in ladder order: the lead's backbone, then
 *  the deal ladder, then the signature, then the two ways a run fell out.
 *
 *  EVERY rung gets a column even at zero, because a column the book can still
 *  fill tomorrow is a different fact from a step with no book at all — the
 *  steps with no book get nothing here, and the screen draws those itself.
 *  The catalogue holds exactly the five backbone rungs `workstream_stand()`
 *  writes, not the eight `LeadState` the CHECK admits: the day the function
 *  learns to write a sixth, a counted run lands outside the catalogue and
 *  vanishes from the board, and that day needs a column here. */
export function boardColumns(
  totals: WorkstreamBoardTotals,
  status: WorkstreamStatus,
  stage: Map<StageKey, PhaseConfig>,
): WorkstreamBoardColumn[] {
  const totalOf = (rows: readonly StandTotal[], kind: WorkstreamStandKind, key: string): number =>
    rows.find((t) => t.kind === kind && t.key === key)?.n ?? 0

  /* Each column says which `status` its number was counted under, and the two
     always match: a column that declares one filter and counts another is the
     header lying about the cards below it. */
  const stand = (kind: WorkstreamStandKind, key: string, label: string): WorkstreamBoardColumn => ({
    by: 'stand',
    kind,
    key,
    status,
    label,
    total: totalOf(totals.stand, kind, key),
  })

  return [
    ...LEAD_LANE_BACKBONE.map((key) => stand('LD', key, LEAD_STATE_LABEL[key])),
    ...StageKey.options.map((key) => stand('OP', key, stage.get(key)?.label ?? key)),
    /* Counted under `status: 'closed'`, never the view's own — signing a run
       closes it, so this column reads zero for ever under `open`. */
    {
      ...stand('HĐ', 'signed', SIGNED_LABEL),
      status: 'closed',
      total: totalOf(totals.signed, 'HĐ', 'signed'),
    },
    ...DROPPED_REASONS.map((closeReason) => ({
      by: 'closeReason' as const,
      closeReason,
      status: 'closed' as const,
      label: CLOSE_REASON_LABEL[closeReason],
      total: totals.closeReason.find((t) => t.closeReason === closeReason)?.n ?? 0,
    })),
  ]
}
