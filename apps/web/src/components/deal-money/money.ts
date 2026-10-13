import { billions, millions } from '@pv/ui'
import {
  CONTRACT_KIND_LABEL,
  CURRENCIES,
  INSTALLMENT_STATUS_LABEL,
  type ContractKind,
  type CurrencyCode,
  type OpportunityMoneyInstallment,
} from '@pv/contracts'
import { dmy } from '@/lib/date'

/** Wording shared by every money block — the deal profile, the schedule editor,
 *  the sign and quotation forms. Every figure, status and day count is the
 *  server's (`OpportunityMoney`); this file only words them. */

const BILLION = 1_000_000_000
const WHOLE_PERCENT = 100

/** VND prints compact, picked by magnitude. Another currency keeps its full
 *  figure: the compact units are words for VND only. */
export function compactMoney(amount: number, currency: CurrencyCode | null): string {
  if (currency === 'VND' || currency === null) {
    return amount >= BILLION ? billions(amount) : millions(amount)
  }
  return `${amount.toLocaleString('vi-VN')} ${currency}`
}

/** The sign a currency wears inside a number box; empty for none. */
export const symbolOf = (currency: CurrencyCode | null): string =>
  CURRENCIES.find((c) => c.code === currency)?.symbol ?? ''

/** A server share in whole percent, as the 0–1 value `Progress` takes. */
export const ratioOfShare = (share: number) => share / WHOLE_PERCENT

/** A segment's width on a bar whose full length is `whole` — geometry only. */
export const barWidth = (part: number, whole: number) => `${(part / whole) * WHOLE_PERCENT}%`

/** Null on a round or a paper recorded before the kind was asked. */
export const kindLabel = (kind: ContractKind | null) =>
  kind ? CONTRACT_KIND_LABEL[kind] : 'Chưa ghi loại'

export const NO_AMOUNT = 'Chưa nhập giá trị'

/** Where one installment stands, in the contract's words plus the server's day count. */
export function installmentStatusLine(i: OpportunityMoneyInstallment): string {
  const label = INSTALLMENT_STATUS_LABEL[i.status]
  if (i.status === 'paid') return i.paidAt ? `${label} ${dmy(i.paidAt)}` : label
  if (i.days === null) return label
  if (i.status === 'overdue') return `${label} ${i.days} ngày`
  return i.days === 0 ? 'Đến hạn hôm nay' : `${label} · còn ${i.days} ngày`
}

export const INSTALLMENT_INK: Record<OpportunityMoneyInstallment['status'], string> = {
  paid: 'text-success',
  overdue: 'text-destructive-foreground',
  upcoming: 'text-muted-foreground',
}
