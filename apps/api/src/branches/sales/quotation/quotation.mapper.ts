import {
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  type ContractKind,
  type QuotationRow,
} from '@pv/contracts'
import { conflict } from '@api/platform/http/problem'
import type { QuotationRowDb } from './quotation.schema'

/** Row → wire, and the rules about where a round goes. Reads no table. */

/** What a row cannot say about itself: the server's VN day, the reason
 *  catalogue's labels by id, and the tagged-file count per round id. */
export type RowContext = {
  today: string
  reasons: ReadonlyMap<string, string>
  files: ReadonlyMap<string, number>
}

export function toQuotationRow(row: QuotationRowDb, ctx: RowContext): QuotationRow {
  const reason = row.reasonId ?? row.stopReasonKey
  return {
    id: row.id,
    opportunityCode: row.opportunityCode,
    kind: row.kind,
    negotiationNo: row.negotiationNo,
    roundNo: row.roundNo,
    amount: row.amount,
    currency: row.currency,
    sentAt: row.sentAt.toISOString(),
    validUntil: row.validUntil,
    source: row.source,
    outcome: row.outcome,
    closedAt: row.closedAt?.toISOString() ?? null,
    reasonLabel:
      reason === null
        ? null
        : reason === OPPORTUNITY_STOP_REASON_OTHER
          ? OPPORTUNITY_STOP_REASON_OTHER_LABEL
          : (ctx.reasons.get(reason) ?? reason),
    note: row.reasonNote,
    contractCode: row.contractCode,
    files: ctx.files.get(row.id) ?? 0,
    expired: row.outcome === 'pending' && row.validUntil !== null && row.validUntil < ctx.today,
  }
}

/** The config ids a batch of rows needs labels for (`other` is virtual). */
export const reasonIdsOf = (rows: readonly QuotationRowDb[]): string[] => [
  ...new Set(
    rows
      .map((r) => r.reasonId ?? r.stopReasonKey)
      .filter((k): k is string => k !== null && k !== OPPORTUNITY_STOP_REASON_OTHER),
  ),
]

/** Where the latest negotiation of `kind` stands (kind-less rows are one group
 *  of their own). `pending` set = it is still open and a new round joins it as
 *  `nextRound`; otherwise it is closed — signed or not — and the next send
 *  opens negotiation `negotiationNo + 1`. No rows yet reads as negotiation 0. */
export function slotOf(rows: readonly QuotationRowDb[], kind: ContractKind | null) {
  const group = rows.filter((r) => r.kind === kind)
  const negotiationNo = Math.max(0, ...group.map((r) => r.negotiationNo))
  const current = group.filter((r) => r.negotiationNo === negotiationNo)
  return {
    negotiationNo,
    pending: current.find((r) => r.outcome === 'pending') ?? null,
    nextRound: Math.max(0, ...current.map((r) => r.roundNo)) + 1,
  }
}

/** Where a kind-less round lands once its kind is named — by PATCH, or by the
 *  signature that wins it: the kind's NEXT negotiation, so no number can
 *  collide. Refused while that kind has a round waiting (one pending a kind).
 *  `label` is the catalogue name, passed in so this stays a pure function. */
export function adoptedPlace(rows: readonly QuotationRowDb[], kind: ContractKind, label: string) {
  const slot = slotOf(rows, kind)
  if (slot.pending) {
    throw conflict(
      `Loại ${label} đang có lần báo giá ${slot.pending.roundNo} chờ khách. Đóng lần đó trước.`,
    )
  }
  return { kind, negotiationNo: slot.negotiationNo + 1 }
}
