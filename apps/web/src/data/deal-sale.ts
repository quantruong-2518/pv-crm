import type { WorkstreamHolder } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { message, translate } from '@/app/i18n'
import { dm } from '@/lib/date'

/** Module 3 · who carries a deal after accept (ADR 0071) — the acceptor's words,
 *  declared once for the profile, the book and the journey drawer. Whether a
 *  seller stands on the deal is the row's server-judged `hasSeller`. */

/** The one sentence for a deal with no seller, worded with the button it blocks. */
export function noSellerSentence(won: boolean, canAssign: boolean): string {
  const action = won
    ? message('Ký thêm hợp đồng', 'Sign another contract', '계약 추가 체결')
    : message('Chốt thắng', 'Close as won', '성사 처리')
  const base = message(
    `Chưa có Sale đứng đơn. Cần một người vai Sale hoặc AE trước khi ${action.vi}`,
    `No Sale owns this deal. A Sale or AE is needed before you can ${action.en.toLowerCase()}`,
    `담당 영업이 없습니다. ${action.ko}하려면 먼저 영업 또는 AE 담당자가 필요합니다`,
  )
  const ask = message(
    '. Nhờ trưởng phòng Kinh doanh giao.',
    '. Ask the head of sales to assign one.',
    '. 영업 팀장에게 배정을 요청하세요.',
  )
  const text = translate(base)
  return canAssign ? `${text}.` : `${text}${translate(ask)}`
}

/** A reader who holds `lead.edit` yet may not write THIS lead: they reach it
 *  only by standing on one of its live deals (ADR 0071). Without `lead.edit`
 *  the ordinary permission wording stays. */
export function useLeadDealReach(lead: { canEdit: boolean }): boolean {
  return useCan('lead.edit') && !lead.canEdit
}

export const ACCEPTOR_LABEL = message('Người nhận PIC', 'Owner', '담당자')

/** "Name · dd/mm", or null before anyone accepted. */
export function acceptorText(deal: {
  acceptedBy: WorkstreamHolder | null
  acceptedAt: string | null
}): string | null {
  return deal.acceptedBy && deal.acceptedAt
    ? `${deal.acceptedBy.name} · ${dm(deal.acceptedAt)}`
    : null
}
