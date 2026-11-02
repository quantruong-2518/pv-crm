import { billions, millions } from '@pv/ui'
import {
  CURRENCIES,
  type ContractKind,
  type CurrencyCode,
  type OpportunityMoneyContract,
  type OpportunityMoneyInstallment,
} from '@pv/contracts'
import { standingOf as scheduleStanding, type Standing } from '@/data/contracts'
import { dmy } from '@/lib/date'
import { formatCurrency, getLang, LOCALE_TAG, message, translate, type Lang } from '@/app/i18n'
import { installmentStatusText } from '@/data/installment-copy'

/** Wording shared by every money block — the deal profile, the schedule editor,
 *  the sign and quotation forms. Amounts, installment statuses and their day
 *  counts are the server's (`OpportunityMoney`). Worded on the screen, not
 *  sent: a paper's standing (from its installment statuses), the estimate
 *  ratio and a quote's days left. Server fields for those are a later wave. */

const BILLION = 1_000_000_000
const WHOLE_PERCENT = 100

/** VND prints compact, picked by magnitude. Another currency keeps its full
 *  figure: the compact units are words for VND only. */
export function compactMoney(amount: number, currency: CurrencyCode | null): string {
  if (currency === 'VND' || currency === null) {
    return amount >= BILLION ? billions(amount) : millions(amount)
  }
  return new Intl.NumberFormat(LOCALE_TAG[getLang()], {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** A full figure: this is the record of money that moved, not a glance. */
export const moneyIn = (currency: CurrencyCode | null) => (n: number) =>
  currency === 'VND' || currency === null ? formatCurrency(n, 'VND') : compactMoney(n, currency)

/** The sign a currency wears inside a number box; empty for none. */
export const symbolOf = (currency: CurrencyCode | null): string =>
  CURRENCIES.find((c) => c.code === currency)?.symbol ?? ''

/** A server share in whole percent, as the 0–1 value `Progress` takes. */
export const ratioOfShare = (share: number) => share / WHOLE_PERCENT

/** A segment's width on a bar whose full length is `whole` — geometry only. */
export const barWidth = (part: number, whole: number) => `${(part / whole) * WHOLE_PERCENT}%`

/** Null on a round or a paper recorded before the kind was asked. */
export const kindLabel = (
  kind: ContractKind | null,
  resolve: (code: string) => string,
  lang: Lang = getLang(),
) =>
  kind ? resolve(kind) : translate(message('Chưa ghi loại', 'Type not set', '유형 미기록'), lang)

export const NO_AMOUNT_COPY = message('Chưa nhập giá trị', 'No value entered', '금액 미입력')

/** The quote door's one label, wherever it stands. */
export const QUOTE_LABEL_COPY = message('Ghi báo giá', 'Record quotation', '견적서 기록')

/** Where one installment stands, in the contract's words plus the server's day count. */
export function installmentStatusLine(
  i: Pick<OpportunityMoneyInstallment, 'status' | 'paidAt' | 'days'>,
  lang: Lang = getLang(),
): string {
  const label = installmentStatusText(i.status, lang)
  const msg = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  if (i.status === 'paid') return i.paidAt ? `${label} ${dmy(i.paidAt)}` : label
  if (i.days === null) return label
  if (i.status === 'overdue') {
    return msg(`${label} ${i.days} ngày`, `${i.days} days overdue`, `${i.days}일 기한 초과`)
  }
  return i.days === 0
    ? msg('Đến hạn hôm nay', 'Due today', '오늘 기한')
    : msg(
        `${label} · còn ${i.days} ngày`,
        `${label} · ${i.days} days left`,
        `${label} · ${i.days}일 남음`,
      )
}

/** A signed paper's standing: the shared rule over its installment statuses.
 *  Null when this reader may not see its payments — an empty list would read
 *  as "still collecting" for a paper nobody shows. */
export function standingOf(c: OpportunityMoneyContract): Standing | null {
  if (!c.paymentsVisible) return null
  return scheduleStanding(
    c.installments.map((i) => ({ overdue: i.status === 'overdue', paid: i.status === 'paid' })),
  )
}

export type { Standing }

export const INSTALLMENT_TONE: Record<
  OpportunityMoneyInstallment['status'],
  'success' | 'danger' | 'draft'
> = { paid: 'success', overdue: 'danger', upcoming: 'draft' }
