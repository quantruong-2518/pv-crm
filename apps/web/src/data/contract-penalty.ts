import type { ContractPenalty, ContractPenaltyDirection, ContractPenaltyInput } from '@pv/contracts'
import { vnToday } from '@/data/opportunities'

/** The penalty form's state and checks (ADR 0124), kept off the component file
 *  so both drawers that show the form read the same refusals. */

export type PenaltyDraft = {
  /** `null` = no penalty. */
  direction: ContractPenaltyDirection | null
  amount: number | null
  /** `YYYY-MM-DD`, or '' while the money has not moved. */
  settledOn: string
}

export const penaltyDraftOf = (penalty: ContractPenalty | null | undefined): PenaltyDraft => ({
  direction: penalty?.direction ?? null,
  amount: penalty?.amount ?? null,
  settledOn: penalty?.settledOn ?? '',
})

/** The settled day lies after today; `YYYY-MM-DD` strings compare as days. */
export const penaltyDayWrong = (draft: PenaltyDraft): boolean =>
  draft.direction !== null && draft.settledOn > vnToday()

/** What the form says is wrong, or null when it may be sent. A missing amount
 *  is a prompt; a future day is the refusal (`penaltyDayWrong`). */
export function penaltyProblem(draft: PenaltyDraft): string | null {
  if (draft.direction === null) return null
  if (!draft.amount) return 'Nhập số tiền phạt.'
  if (penaltyDayWrong(draft)) return 'Ngày không được sau hôm nay.'
  return null
}

/** Where the money stands, by direction: the one place these four words live. */
export const PENALTY_STATE_WORD: Record<ContractPenaltyDirection, { done: string; wait: string }> =
  {
    'customer-pays': { done: 'Đã thu', wait: 'Chưa thu' },
    'company-pays': { done: 'Đã trả', wait: 'Chưa trả' },
  }

/** The body's penalty; `undefined` when none is chosen or the form is wrong. */
export function penaltyInputOf(draft: PenaltyDraft): ContractPenaltyInput | undefined {
  if (draft.direction === null || !draft.amount || penaltyProblem(draft)) return undefined
  return {
    direction: draft.direction,
    amount: draft.amount,
    settledOn: draft.settledOn === '' ? null : draft.settledOn,
  }
}
