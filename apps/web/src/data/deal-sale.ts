import { useQuery } from '@tanstack/react-query'
import {
  isSellerRole,
  OWNER_NONE,
  type OpportunityBookQuery,
  type OpportunityRow,
  type WorkstreamHolder,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { dm } from '@/lib/date'
import { directoryQuery } from '@/data/directory'

/** Module 3 · who carries a deal after accept (ADR 0071) — the seller question,
 *  the acceptor's words and the two head queues of the book, each declared once
 *  for the profile, the book and the journey drawer. */

/** Does a seller (`isSellerRole`) stand on the SALE lane? `null` while the
 *  directory that knows the roles is still loading — no warning, no label and
 *  no sign reason may be drawn off a guess. The create door (`op === null`) passes. */
export function useHasSeller(op: Pick<OpportunityRow, 'owners'> | null): boolean | null {
  const { data: staff } = useQuery(directoryQuery)
  if (op === null) return true
  const lane = op.owners.filter((o) => o.role === 'SALE')
  if (lane.length === 0) return false
  if (!staff) return null
  return lane.some((o) => isSellerRole(staff.find((a) => a.id === o.id)?.roleId))
}

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

/** The head's accept queue: open deals still at `new`. */
export const ACCEPT_QUEUE = {
  state: 'open',
  stage: 'new',
} as const satisfies Partial<OpportunityBookQuery>

/** Accepted deals with no seller on SALE — what a head still owes. */
export const UNASSIGNED_QUEUE = {
  state: 'open',
  accepted: true,
  sale: OWNER_NONE,
} as const satisfies Partial<OpportunityBookQuery>

/** Is the book showing exactly this queue's filter? */
export const inQueue = (query: OpportunityBookQuery, queue: Partial<OpportunityBookQuery>) =>
  Object.entries(queue).every(([key, value]) => query[key as keyof OpportunityBookQuery] === value)
