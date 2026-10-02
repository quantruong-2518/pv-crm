import type { WorkstreamHolder } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { dm } from '@/lib/date'

/** Module 3 · who carries a deal after accept (ADR 0071) — the acceptor's words,
 *  declared once for the profile, the book and the journey drawer. Whether a
 *  seller stands on the deal is the row's server-judged `hasSeller`. */

/** The one sentence for a deal with no seller, worded with the button it blocks. */
export function noSellerSentence(won: boolean, canAssign: boolean): string {
  const base = `Chưa có Sale đứng đơn — cần một người vai Sale hoặc AE trước khi ${
    won ? 'Ký thêm hợp đồng' : 'Chốt thắng'
  }`
  return canAssign ? `${base}.` : `${base} — nhờ trưởng phòng Kinh doanh giao.`
}

/** A reader who holds `lead.edit` yet may not write THIS lead: they reach it
 *  only by standing on one of its live deals (ADR 0071). Without `lead.edit`
 *  the ordinary permission wording stays. */
export function useLeadDealReach(lead: { canEdit: boolean }): boolean {
  return useCan('lead.edit') && !lead.canEdit
}

export const ACCEPTOR_LABEL = 'Người nhận PIC'

/** "Name · dd/mm", or null before anyone accepted. */
export function acceptorText(deal: {
  acceptedBy: WorkstreamHolder | null
  acceptedAt: string | null
}): string | null {
  return deal.acceptedBy && deal.acceptedAt
    ? `${deal.acceptedBy.name} · ${dm(deal.acceptedAt)}`
    : null
}
