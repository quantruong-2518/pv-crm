import type {
  OpportunityMoney,
  OpportunityMoneyContract,
  OpportunityMoneyNegotiation,
  QuotationRow,
} from '@pv/contracts'

/** The cards of the contract block: every signed paper, then every quote still
 *  waiting on the customer. Order is the server's. A negotiation that closed
 *  unsigned has no card — nothing waits on it. */
export type Paper =
  | { key: string; kind: 'contract'; contract: OpportunityMoneyContract }
  | {
      key: string
      kind: 'quote'
      negotiation: OpportunityMoneyNegotiation
      /** The pending round, when the list still carries it. */
      round: QuotationRow | undefined
    }

export function papersOf(money: OpportunityMoney): Paper[] {
  const signed = money.contracts.map((contract): Paper => ({
    key: `contract:${contract.code}`,
    kind: 'contract',
    contract,
  }))
  const waiting = money.open.flatMap((negotiation): Paper[] =>
    negotiation.pendingId === null
      ? []
      : [
          {
            key: `quote:${negotiation.kind ?? 'none'}:${negotiation.negotiationNo}`,
            kind: 'quote',
            negotiation,
            round: negotiation.rounds.find((r) => r.id === negotiation.pendingId),
          },
        ],
  )
  return [...signed, ...waiting]
}

/** The picked card, or the first one when the pick is gone (a quote that
 *  became a contract changes its key). */
export const pickedPaper = (papers: Paper[], key: string | null): Paper | undefined =>
  papers.find((p) => p.key === key) ?? papers[0]

/** What the rail's quotation list shows for the picked paper. */
export const roundsOf = (paper: Paper | undefined): QuotationRow[] =>
  !paper ? [] : paper.kind === 'contract' ? paper.contract.rounds : paper.negotiation.rounds
