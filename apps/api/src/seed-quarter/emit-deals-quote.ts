import type { quotation } from '@api/branches/sales/quotation/quotation.schema'
import type { touch } from '@api/branches/sales/touch/touch.schema'
import { NOTE } from '@api/branches/sales/opportunity/opportunity.mapper'
import { addDays, dayOf } from './clock'
import { beatsOf, type BeatOf, type DealView } from './emit-deals-view'
import type { ConfigRow } from './types'

/** Quotation ledger rows plus the `quotation-sent` touch each one points at
 *  (the real door links them through `touch_id`). One negotiation, one kind:
 *  the won round carries the contract code the deals emitter minted. */

export type QuoteRow = typeof quotation.$inferInsert
type TouchRow = typeof touch.$inferInsert

const KIND_WEIGHTS: [string, number][] = [
  ['CK-02', 50],
  ['CK-01', 15],
  ['CK-05', 15],
  ['CK-04', 10],
  ['CK-06', 10],
]

/** The contract kind of this deal's negotiation, read off the live catalogue. */
export function kindOf(v: DealView): ConfigRow {
  const rows = v.ctx.world.config.get('CONTRACT_KIND') ?? []
  const live = KIND_WEIGHTS.filter(([id]) => rows.some((r) => r.id === id))
  const id = live.length > 0 ? v.ctx.rng.weighted(live) : rows[0]?.id
  const row = rows.find((r) => r.id === id)
  if (!row) throw new Error('deals: the CONTRACT_KIND catalogue is empty')
  return row
}

function known(v: DealView): (id: string) => string {
  const ids = new Set([...v.ctx.world.config.values()].flat().map((r) => r.id))
  return (id) => {
    if (id !== 'other' && !ids.has(id))
      throw new Error(`deals: reason ${id} is not in the catalogue`)
    return id
  }
}

function reasonsOf(
  v: DealView,
  q: BeatOf<'quote'>,
  isLast: boolean,
  check: (id: string) => string,
): Pick<QuoteRow, 'reasonId' | 'stopReasonKey' | 'reasonNote'> {
  if (q.outcome !== 'not-closed' || !q.reasonKey) return {}
  const key = check(q.reasonKey)
  const lostHere = isLast && v.lost !== null
  const note = key === 'other' ? { reasonNote: v.stopNote ?? 'Khách không nêu rõ lý do' } : {}
  return lostHere ? { stopReasonKey: key, ...note } : { reasonId: key, ...note }
}

export function dealQuotes(v: DealView): {
  rows: QuoteRow[]
  touches: TouchRow[]
  kind: ConfigRow
} {
  const quotes = beatsOf(v.story, 'quote')
  const kind = kindOf(v)
  const check = known(v)
  const last = Math.max(0, ...quotes.map((q) => q.round))
  const rows: QuoteRow[] = []
  const touches: TouchRow[] = []
  for (const q of quotes) {
    const by = v.hand(q.by)
    const id = v.ctx.rng.uuid()
    const won = q.outcome === 'won'
    const contractCode = won ? v.ctx.ids.contract.get(v.story.key) : undefined
    if (won && !contractCode) throw new Error(`deals: no HĐ minted for ${v.story.key}`)
    touches.push({
      id,
      at: q.at,
      subjectCode: v.op,
      subjectKind: 'opportunity',
      kind: 'quotation-sent',
      actorId: by.id,
      by: by.name,
      note: NOTE.milestone('quotation', q.round > 1 ? `Vòng ${q.round}` : undefined),
    })
    rows.push({
      id,
      opportunityCode: v.op,
      kind: kind.id,
      negotiationNo: q.negotiation,
      roundNo: q.round,
      amount: q.amount,
      currency: v.d.currency,
      sentAt: q.at,
      validUntil: addDays(dayOf(q.at), v.ctx.rng.pick([14, 30, 45])),
      source: 'manual',
      outcome: q.outcome,
      closedAt: q.closedAt,
      touchId: id,
      createdBy: by.id,
      ...(contractCode ? { contractCode } : {}),
      ...reasonsOf(v, q, q.round === last, check),
    })
  }
  return { rows, touches, kind }
}
