import {
  ContractSignProposal,
  StageKey,
  type OpportunityProfileContract,
  type OpportunitySignedTotal,
  type OpportunityStageSpan,
  type PendingSign,
} from '@pv/contracts'
import type { ApprovalRowDb } from '@api/platform/approval/approval.schema'
import type { ContractRead } from '../contract/contract.repository'
import { stageConfigOf } from '../ladder'
import { daysInStageOf } from './opportunity.mapper'
import type { OpportunityRowDb, OpportunityStageEventRowDb } from './opportunity.schema'

/** The profile's derived blocks (ADR 0077 §1–2): stage spans, the signed papers,
 *  their total in the deal's currency, and the waiting sign request. Pure — the
 *  service reads the rows, this only shapes them. */

const DAY_MS = 86_400_000

/** One span per ladder key, walked over the events oldest first. An exit sets
 *  `leftAt` and `days` (the event's own `daysInFrom`); a re-entry (legacy
 *  back-moves) clears `leftAt`. The deal's own column is
 *  counted to now off `stage_since`, the clock the book's `daysInStage` reads. */
export function stageSpansOf(
  row: OpportunityRowDb,
  events: readonly OpportunityStageEventRowDb[],
  stageRows: { name: string; limitDays: number | null }[],
  now: Date,
): OpportunityStageSpan[] {
  const config = stageConfigOf(stageRows)
  const spans = new Map(
    StageKey.options.map((key) => [
      key,
      {
        key,
        enteredAt: null as Date | null,
        leftAt: null as Date | null,
        days: null as number | null,
      },
    ]),
  )
  const ordered = [...events].sort((a, b) => a.at.getTime() - b.at.getTime())
  for (const e of ordered) {
    const left = e.fromStage ? spans.get(e.fromStage) : undefined
    if (left) {
      /* Deals seeded or imported without an entry row still left at a known
         moment; `enteredAt` then stays null rather than being guessed. */
      const since = left.enteredAt
      left.leftAt = e.at
      left.days =
        e.daysInFrom ??
        (since ? Math.max(0, Math.floor((e.at.getTime() - since.getTime()) / DAY_MS)) : null)
    }
    const entered = e.toStage ? spans.get(e.toStage) : undefined
    if (entered) {
      entered.enteredAt ??= e.at
      entered.leftAt = null
    }
  }
  const current = row.stage ? spans.get(row.stage) : undefined
  if (current) {
    current.enteredAt ??= row.stageSince
    current.leftAt = null
    current.days = daysInStageOf(row, now)
  }
  return [...spans.values()].map((s) => ({
    key: s.key,
    enteredAt: s.enteredAt?.toISOString() ?? null,
    leftAt: s.leftAt?.toISOString() ?? null,
    days: s.days,
    limitDays: config.get(s.key)?.limitDays ?? null,
  }))
}

/** Signed papers, oldest first as `byOpportunity` already orders them. */
export function profileContractsOf(rows: readonly ContractRead[]): OpportunityProfileContract[] {
  return rows.map(({ row, ownerName }) => ({
    code: row.code,
    kind: row.kind,
    amount: row.amount,
    currency: row.currency,
    signedAt: row.signedAt.toISOString(),
    owner: row.ownerId && ownerName ? { id: row.ownerId, name: ownerName } : null,
  }))
}

/** The signed deal value: contracts in the deal's own currency, summed on read and never
 *  written back — the deal's `amount` stays the estimate (ADR 0077 §1). */
export function signedTotalOf(
  deal: OpportunityRowDb,
  contracts: readonly OpportunityProfileContract[],
): OpportunitySignedTotal | null {
  const same = contracts.filter(
    (c) => c.currency !== null && c.currency === deal.currency && c.amount !== null,
  )
  if (same.length === 0 || deal.currency === null) return null
  const amount = same.reduce((sum, c) => sum + (c.amount ?? 0), 0)
  return { amount, currency: deal.currency, count: same.length }
}

/** The waiting request, its terms read through the schema the apply step uses,
 *  so the profile shows exactly what an approval would sign. */
export function pendingSignOf(sign: ApprovalRowDb | undefined): PendingSign | null {
  if (!sign) return null
  const { kind, amount, currency } = ContractSignProposal.parse(sign.payload).sign
  return {
    approvalId: sign.id,
    raisedBy: sign.raisedBy,
    raisedAt: sign.raisedAt.toISOString(),
    kind,
    amount,
    currency,
  }
}
