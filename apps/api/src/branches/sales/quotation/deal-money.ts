import { daysUntil } from '@pv/engines'
import type {
  CurrencyCode,
  InstallmentStatus,
  OpportunityMoney,
  OpportunityMoneyContract,
  OpportunityMoneyInstallment,
  OpportunityMoneyNegotiation,
  QuotationRow,
} from '@pv/contracts'
import type { ContractInstallmentRowDb, ContractRowDb } from '../contract/contract.schema'
import { vnDay } from '../opportunity/opportunity-lifecycle'
import type { StepFileCount } from './quotation.repository'

/** The profile's `money` block (ADR 0090): quotations, contracts and collection
 *  counted and ordered here so no screen adds a figure up. Pure — the service
 *  reads the rows and says which contracts the reader may open (`visible`). */

export type DealMoneyInput = {
  /** Contracts the contract door would open for this reader. */
  visible: ReadonlySet<string>
  /** Role-level grants; they count only on a visible contract. */
  can: OpportunityMoneyContract['can']
  dealCurrency: CurrencyCode | null
  /** Oldest signature first, as `ContractRepository.byOpportunity` answers. */
  contracts: readonly ContractRowDb[]
  installments: ReadonlyMap<string, readonly ContractInstallmentRowDb[]>
  /** Every round of the deal, newest first. */
  rounds: readonly QuotationRow[]
  files: readonly StepFileCount[]
  /** The server's VN calendar day. */
  today: string
}

const STATUS_ORDER: Record<InstallmentStatus, number> = { overdue: 0, upcoming: 1, paid: 2 }

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

/** Whole percent collected of a signed amount; null when nothing is signed. */
const shareOf = (collected: number, signed: number | null): number | null =>
  signed ? Math.min(100, Math.round((collected / signed) * 100)) : null

/** Due today is still `upcoming`; a collected installment is never late. */
function installmentOf(row: ContractInstallmentRowDb, today: string): OpportunityMoneyInstallment {
  const left = daysUntil(vnDay(row.due), today)
  const status: InstallmentStatus = row.paidAt ? 'paid' : left < 0 ? 'overdue' : 'upcoming'
  return {
    no: row.no,
    label: row.label,
    share: row.share,
    amount: row.amount,
    due: row.due.toISOString(),
    ...(row.paidAt ? { paidAt: row.paidAt.toISOString() } : {}),
    status,
    days: status === 'paid' ? null : Math.abs(left),
  }
}

function contractOf(row: ContractRowDb, input: DealMoneyInput): OpportunityMoneyContract {
  const paymentsVisible = input.visible.has(row.code)
  const installments = (paymentsVisible ? (input.installments.get(row.code) ?? []) : [])
    .map((i) => installmentOf(i, input.today))
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.due.localeCompare(b.due) ||
        a.no - b.no,
    )
  const collected = sum(installments.filter((i) => i.status === 'paid').map((i) => i.amount))
  const rounds = input.rounds.filter((r) => r.contractCode === row.code)
  const tagged = (step: StepFileCount['step']) =>
    sum(input.files.filter((f) => f.step === step && f.contractCode === row.code).map((f) => f.n))
  return {
    code: row.code,
    kind: row.kind,
    amount: row.amount,
    currency: row.currency,
    signedAt: row.signedAt.toISOString(),
    collected,
    collectedShare: paymentsVisible ? shareOf(collected, row.amount) : null,
    paymentsVisible,
    can: {
      editSchedule: paymentsVisible && input.can.editSchedule,
      recordPayment: paymentsVisible && input.can.recordPayment,
    },
    installments,
    rounds,
    files: {
      quotation: sum(rounds.map((r) => r.files)),
      contract: tagged('contract'),
      installment: tagged('installment'),
    },
  }
}

/** Negotiations no contract closed: one still waiting first, then the ones
 *  closed unsigned; each keeps the newest-first order of `rounds`. */
function openOf(rounds: readonly QuotationRow[]): OpportunityMoneyNegotiation[] {
  const groups = new Map<string, QuotationRow[]>()
  for (const r of rounds) {
    if (r.contractCode !== null) continue
    const key = `${r.kind ?? ''}:${r.negotiationNo}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return [...groups.values()]
    .map((group) => {
      const pending = group.find((r) => r.outcome === 'pending')
      return {
        kind: group[0]?.kind ?? null,
        negotiationNo: group[0]?.negotiationNo ?? 1,
        pendingId: pending?.id ?? null,
        amount: pending?.amount ?? null,
        currency: pending?.currency ?? null,
        rounds: group,
      }
    })
    .sort((a, b) => Number(b.pendingId !== null) - Number(a.pendingId !== null))
}

export function dealMoneyOf(input: DealMoneyInput): OpportunityMoney {
  const papers = input.contracts.map((row) => contractOf(row, input))
  /* The deal's currency, else the first signed paper's, else dong; money in
     any other currency is listed and never summed. Collection figures count
     the visible papers only — a hidden one has no instalments here. */
  const currency = input.dealCurrency ?? input.contracts[0]?.currency ?? 'VND'
  const counted = papers.filter((p) => p.currency === currency)
  const having = (status: InstallmentStatus) =>
    counted.flatMap((p) => p.installments.filter((i) => i.status === status))
  const overdue = having('overdue')
  const upcoming = having('upcoming')
  const days = (rows: readonly OpportunityMoneyInstallment[]) => rows.map((i) => i.days ?? 0)
  const amountOf = (ps: readonly OpportunityMoneyContract[]) => sum(ps.map((p) => p.amount ?? 0))
  const seen = amountOf(counted.filter((p) => p.paymentsVisible))
  const collected = sum(counted.map((p) => p.collected))

  const late = (p: OpportunityMoneyContract) => p.installments.some((i) => i.status === 'overdue')
  return {
    paymentsVisible: papers.some((p) => p.paymentsVisible),
    totals: {
      currency,
      signed: amountOf(counted),
      contracts: counted.length,
      collected,
      collectedShare: shareOf(collected, seen),
      installments: {
        paid: having('paid').length,
        total: sum(counted.map((p) => p.installments.length)),
      },
      outstanding: Math.max(0, seen - collected),
      overdue: {
        amount: sum(overdue.map((i) => i.amount)),
        count: overdue.length,
        maxDaysLate: overdue.length > 0 ? Math.max(...days(overdue)) : null,
      },
      notYetDue: {
        amount: sum(upcoming.map((i) => i.amount)),
        count: upcoming.length,
        nearestDays: upcoming.length > 0 ? Math.min(...days(upcoming)) : null,
      },
      quoting: sum(
        input.rounds
          .filter((r) => r.outcome === 'pending' && r.currency === currency)
          .map((r) => r.amount ?? 0),
      ),
    },
    open: openOf(input.rounds),
    contracts: papers.sort(
      (a, b) => Number(late(b)) - Number(late(a)) || b.signedAt.localeCompare(a.signedAt),
    ),
  }
}
