import type { CurrencyCode, InstallmentDraft } from '@pv/contracts'
import { message, translate } from '@/app/i18n'
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
  return row === undefined
    ? issue.message
    : `${translate(message(`Dòng ${row + 1}`, `Row ${row + 1}`, `${row + 1}행`))}: ${issue.message}`
}

function gapText(gap: ReturnType<typeof scheduleGap>, currency: CurrencyCode | null): string {
  const short = (n: number) => n > 0
  const money = compactMoney(Math.abs(gap.amount), currency)
  const share = Math.abs(gap.share)
  const both = gap.share !== 0 && gap.amount !== 0
  if (both && Math.sign(gap.share) === Math.sign(gap.amount)) {
    return translate(
      short(gap.share)
        ? message(
            `Còn thiếu ${share}% · ${money}`,
            `Short ${share}% · ${money}`,
            `부족 ${share}% · ${money}`,
          )
        : message(
            `Thừa ${share}% · ${money}`,
            `Over ${share}% · ${money}`,
            `초과 ${share}% · ${money}`,
          ),
    )
  }
  return [
    gap.share !== 0 &&
      translate(
        short(gap.share)
          ? message(`Tỉ lệ còn thiếu ${share}%`, `Share short by ${share}%`, `비율 ${share}% 부족`)
          : message(`Tỉ lệ thừa ${share}%`, `Share over by ${share}%`, `비율 ${share}% 초과`),
      ),
    gap.amount !== 0 &&
      translate(
        short(gap.amount)
          ? message(`Tiền còn thiếu ${money}`, `Amount short by ${money}`, `금액 ${money} 부족`)
          : message(`Tiền thừa ${money}`, `Amount over by ${money}`, `금액 ${money} 초과`),
      ),
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
    ? {
        text: translate(
          message(
            'Đủ 100% và khớp giá trị hợp đồng.',
            'Adds up to 100% and matches the contract value.',
            '100%이며 계약 금액과 일치합니다.',
          ),
        ),
        balanced: true,
      }
    : { text, balanced: false }
}
