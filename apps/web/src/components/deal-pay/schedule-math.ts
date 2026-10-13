import type { CurrencyCode, InstallmentDraft } from '@pv/contracts'
import { compactMoney } from '@/components/deal-money/money'

/** The part of a contract the list below cannot touch (instalments already
 *  collected), counted in the sums but never listed as a row. */
export type ScheduleSettled = { share: number; amount: number }

export const FULL_SHARE = 100

/** What is still missing from a schedule: shares against 100, amounts against
 *  the contract's value. Positive = short, negative = over. */
export function scheduleGap(
  value: readonly InstallmentDraft[],
  amount: number | null,
  settled?: ScheduleSettled,
) {
  const sum = (key: 'share' | 'amount') =>
    value.reduce((total, row) => total + row[key], settled?.[key] ?? 0)
  return { share: FULL_SHARE - sum('share'), amount: amount === null ? 0 : amount - sum('amount') }
}

/** The first complaint of a failed parse, prefixed with the row it names. */
export function scheduleIssue(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[]
}): string {
  const issue = error.issues[0]
  if (!issue) return ''
  const row = issue.path.find((step): step is number => typeof step === 'number')
  return row === undefined ? issue.message : `Dòng ${row + 1}: ${issue.message}`
}

function gapText(gap: ReturnType<typeof scheduleGap>, currency: CurrencyCode | null): string {
  const dir = (n: number) => (n > 0 ? 'Còn thiếu' : 'Thừa')
  const money = Math.abs(gap.amount)
  const share = Math.abs(gap.share)
  if (gap.share !== 0 && gap.amount !== 0 && Math.sign(gap.share) === Math.sign(gap.amount)) {
    return `${dir(gap.share)} ${share}% · ${compactMoney(money, currency)}`
  }
  return [
    gap.share !== 0 && `Tỉ lệ ${dir(gap.share).toLowerCase()} ${share}%`,
    gap.amount !== 0 && `Tiền ${dir(gap.amount).toLowerCase()} ${compactMoney(money, currency)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** The line under the list: what is still missing, or that it adds up. */
export function scheduleSummary(
  value: readonly InstallmentDraft[],
  amount: number | null,
  currency: CurrencyCode | null,
  settled?: ScheduleSettled,
): { text: string; balanced: boolean } {
  const gap = scheduleGap(value, amount, settled)
  const text = gapText(gap, currency)
  return text === ''
    ? { text: 'Đủ 100% và khớp giá trị hợp đồng.', balanced: true }
    : { text, balanced: false }
}
