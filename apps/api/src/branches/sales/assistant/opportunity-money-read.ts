import {
  OpportunityMoneyContract,
  OpportunityMoneyInstallment,
  OpportunityMoneyNegotiation,
  OpportunityMoneyTotals,
  QuotationRow,
  type AssistantRef,
  type OpportunityMoney,
} from '@pv/contracts'
import { maskContact } from '@api/platform/assistant/assistant-contact'
import type { ToolRead } from '@api/platform/assistant/assistant-tools'

/** A deal's quotation rounds and money, riding on `get_record` for an opportunity.
 *
 *  The profile door returns all of it on `opportunity.view`, but the payment half
 *  (collected, installments, the totals over them) is the contract door's data. So
 *  only a contract whose `paymentsVisible` is true carries it, and the totals come
 *  only when the money's own flag is true: those keys are left out, not nulled,
 *  because a null tells the model the deal has none. `quoting` sums pending rounds,
 *  which ride on `opportunity.view`, so it is always there.
 *
 *  A round's `note` and `reasonLabel` are typed text: `untrusted`, masked for a
 *  reader without `data.export`. Every visible contract joins `codes`, cut or not:
 *  the totals sum them all, and a stored answer is re-checked against the book.
 *  A contract row carries `currency` beside `trusted`: the bind prices a value in the
 *  nearest `currency` above it, and an installment sits outside `trusted`. */

/** Rows per list; past it the list says `more` and the model asks narrower. */
const LIST = 20

const RoundTrusted = QuotationRow.pick({
  id: true,
  opportunityCode: true,
  kind: true,
  negotiationNo: true,
  roundNo: true,
  amount: true,
  currency: true,
  sentAt: true,
  validUntil: true,
  source: true,
  outcome: true,
  closedAt: true,
  contractCode: true,
  files: true,
  expired: true,
})

const NegotiationTrusted = OpportunityMoneyNegotiation.pick({
  kind: true,
  negotiationNo: true,
  amount: true,
  currency: true,
})

const PaperTrusted = OpportunityMoneyContract.pick({
  code: true,
  kind: true,
  amount: true,
  currency: true,
  signedAt: true,
  paymentsVisible: true,
})

const PaidTrusted = OpportunityMoneyContract.pick({ collected: true, collectedShare: true })

const InstallmentTrusted = OpportunityMoneyInstallment.pick({
  no: true,
  share: true,
  amount: true,
  due: true,
  paidAt: true,
  status: true,
  days: true,
})

const QuotingTrusted = OpportunityMoneyTotals.pick({ currency: true, quoting: true })

const TotalsTrusted = OpportunityMoneyTotals.pick({
  signed: true,
  collected: true,
  collectedShare: true,
  installments: true,
  outstanding: true,
  overdue: true,
  notYetDue: true,
})

/** The server's order is kept; `count` is the whole list, so `more` is never a guess. */
function list<R, T>(rows: readonly R[], shape: (row: R) => T) {
  const kept = rows.slice(0, LIST)
  return { trusted: { count: rows.length, more: rows.length > kept.length }, rows: kept.map(shape) }
}

/** `ref` makes the chip of a contract code, labelled with the deal: the profile
 *  door gives no customer name for a contract header. */
export function withMoney(
  read: ToolRead,
  money: OpportunityMoney,
  mayReach: boolean,
  ref: (code: string) => AssistantRef,
): ToolRead {
  /* `as boolean`: the closure writes it, which flow analysis does not see. */
  let withheld = false as boolean
  const round = (r: QuotationRow) => {
    const raw = { note: r.note, reasonLabel: r.reasonLabel }
    const untrusted = mayReach ? raw : maskContact(raw)
    withheld ||= JSON.stringify(untrusted) !== JSON.stringify(raw)
    return { trusted: RoundTrusted.parse(r), untrusted }
  }
  const open = list(money.open, (n) => ({
    trusted: NegotiationTrusted.parse(n),
    rounds: list(n.rounds, round),
  }))
  const contracts = list(money.contracts, (c) => ({
    currency: c.currency,
    trusted: { ...PaperTrusted.parse(c), ...(c.paymentsVisible && PaidTrusted.parse(c)) },
    ...(c.paymentsVisible && {
      installments: list(c.installments, (i) => ({ trusted: InstallmentTrusted.parse(i) })),
    }),
    rounds: list(c.rounds, round),
  }))
  const visible = money.contracts.filter((c) => c.paymentsVisible)
  const totals = money.paymentsVisible ? TotalsTrusted.parse(money.totals) : {}
  return {
    ...read,
    data: {
      ...read.data,
      money: {
        trusted: {
          paymentsVisible: money.paymentsVisible,
          ...QuotingTrusted.parse(money.totals),
          ...totals,
        },
        open,
        contracts,
      },
      ...(withheld && { contactInfoWithheld: true }),
    },
    codes: [...read.codes, ...visible.map((c) => c.code)],
    refs: [...(read.refs ?? []), ...visible.map((c) => ref(c.code))],
  }
}
