import { z } from 'zod'

/** A contract's signed value split between up to three people (ADR 0155).
 *
 *  Shares are whole basis points (10 000 = 100 %). Whether the closer is in the
 *  list is the server's check, since the server decides who the closer is.
 *  No list means 100 % to the closer, exactly as before the split existed. */

export const CONTRACT_CREDITS_MAX = 3
export const CREDIT_TOTAL_BP = 10_000

export const ContractCredit = z.object({
  actorId: z.string().min(1).max(64),
  shareBp: z.number().int().min(1).max(CREDIT_TOTAL_BP),
})

/** The list on the sign request. */
export const ContractCredits = z.array(ContractCredit).min(2).max(CONTRACT_CREDITS_MAX)

/** The list on a contract row; `name` is display only, empty array = no split. */
export const ContractCreditRow = ContractCredit.extend({ name: z.string() })

export type CreditIssue = 'sum' | 'duplicate'

/** The API's wording of each issue; the web words them itself per language. */
export const CREDIT_ISSUE_TEXT: Record<CreditIssue, string> = {
  sum: 'Phần chia phải cộng đủ 100%.',
  duplicate: 'Mỗi người chỉ xuất hiện một lần.',
}

/** Rule keys for a split; empty = the split is valid. */
export function creditIssues(credits: readonly z.infer<typeof ContractCredit>[]): CreditIssue[] {
  const issues: CreditIssue[] = []
  if (credits.reduce((sum, c) => sum + c.shareBp, 0) !== CREDIT_TOTAL_BP) issues.push('sum')
  if (new Set(credits.map((c) => c.actorId)).size !== credits.length) issues.push('duplicate')
  return issues
}

/** Non-closers floor and the closer takes the remainder, so the parts always
 *  sum to `amountVnd` exactly. Amount ≥ 0 on every caller; the floor still keeps parts summing exactly. */
export function splitByCredits(
  amountVnd: number,
  credits: readonly z.infer<typeof ContractCredit>[],
  closerId: string,
): { actorId: string; amountVnd: number }[] {
  if (credits.length === 0) return [{ actorId: closerId, amountVnd }]
  const q = Math.floor(amountVnd / CREDIT_TOTAL_BP)
  /* `r` stays in [0, 10 000) for negative amounts too, where `%` would keep the sign. */
  const r = amountVnd - q * CREDIT_TOTAL_BP
  const others = credits
    .filter((c) => c.actorId !== closerId)
    .map((c) => ({
      actorId: c.actorId,
      amountVnd: q * c.shareBp + Math.floor((r * c.shareBp) / CREDIT_TOTAL_BP),
    }))
  const rest = amountVnd - others.reduce((sum, o) => sum + o.amountVnd, 0)
  return [{ actorId: closerId, amountVnd: rest }, ...others]
}

export type ContractCredit = z.infer<typeof ContractCredit>
export type ContractCreditRow = z.infer<typeof ContractCreditRow>
