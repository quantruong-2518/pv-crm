import type { ReactNode } from 'react'
import type { TableColumn } from '@pv/ui'
import type { ContractParticipant } from '@pv/contracts'
import { type ContractBookRow } from '@/data/contracts'
import { translate, type Lang } from '@/app/i18n'
import { CONTRACT_COPY as COPY } from '@/data/contract-copy'
import { kindLabel } from '@/components/deal-money/money'
import { COL } from '@/components/book-columns'
import { DateCell, PicCell } from '@/components/book-cells'
import { CollectedCell, NextDueCell } from '@/components/contract-bits'
import { MoneyCell } from '@/components/money-cell'

/** The contract book's cells and column list. One row reads: who signed what
 *  (customer, kind), who holds it, what it is worth and how far it is
 *  collected. Money is in the contract's own currency, so each money cell gets it. */

/** The next-due caption (days, installment no., full date) needs about 200px;
 *  the standard money track would cut it, so this column is wider. */
const NEXT_DUE_WIDTH = 'minmax(260px,1.6fr)'

/** Customer takes the slack; people and money get what their content needs, no more. */
const WIDTH = {
  customer: 'minmax(200px,1.6fr)',
  person: 'minmax(136px,0.9fr)',
  value: '176px',
  collected: '168px',
} as const

const laneOf = (p: ContractParticipant) => ({
  id: p.id,
  name: p.name,
  role: p.role === 'SALE' ? 'Sale' : 'BD',
  primary: p.primary,
})

export function contractCells(
  row: ContractBookRow,
  resolveKind: (code: string) => string,
  lang: Lang,
): ReactNode[] {
  const { contract } = row
  /* At risk = the next installment when it wants attention today; a book row has no checklist. */
  const atRisk = row.urgent ? (row.next?.installment.amount ?? 0) : 0
  /* Terminated: nothing is owed, so the money reads muted and the bar shows no gap to collect. */
  const ended = contract.termination !== null

  return [
    <span key="customer" className="flex min-w-0 flex-col">
      <span className="truncate text-[12.5px] font-semibold">{contract.customer}</span>
      <span className="text-muted-foreground truncate text-[11.5px]">
        {kindLabel(contract.kind, resolveKind)}
      </span>
    </span>,
    <DateCell key="signed" day={contract.signedAt} empty={translate(COPY.noSignedDay, lang)} />,
    <PicCell
      key="owner"
      people={
        contract.ownerName
          ? [{ id: contract.ownerId, name: contract.ownerName, role: translate(COPY.closer, lang) }]
          : []
      }
      empty={translate(COPY.noCloser, lang)}
    />,
    <PicCell
      key="lanes"
      people={contract.participants.map(laneOf)}
      empty={translate(COPY.noSale, lang)}
    />,
    <MoneyCell
      key="value"
      amount={contract.amount}
      currency={contract.currency}
      muted={ended}
      missing={translate(COPY.noAmount, lang)}
      title={
        contract.currency && contract.currency !== 'VND'
          ? translate(COPY.convertedWhy, lang)
          : undefined
      }
    />,
    <CollectedCell key="collected" row={row} atRisk={atRisk} ended={ended} />,
    <NextDueCell
      key="next"
      next={row.next}
      ended={ended}
      currency={contract.currency}
      penalty={contract.termination?.penalty}
    />,
  ]
}

/** The header filters, by column — built by `useContractFilters`. */
export type ContractColumnFilters = {
  owner: ReactNode
  kind: ReactNode
  signed: ReactNode
  amount: ReactNode
  /** Absent on the terminated tab. */
  due: ReactNode | undefined
}

export function contractColumns(f: ContractColumnFilters, lang: Lang): TableColumn[] {
  return [
    { header: translate(COPY.customerAndKind, lang), width: WIDTH.customer, filter: f.kind },
    {
      header: translate(COPY.signedDay, lang),
      width: COL.date,
      sortKey: 'signedAt',
      filter: f.signed,
    },
    { header: translate(COPY.closer, lang), width: WIDTH.person, filter: f.owner },
    { header: translate(COPY.saleAndBd, lang), width: WIDTH.person },
    {
      header: translate(COPY.estimatedValue, lang),
      width: WIDTH.value,
      align: 'right',
      sortKey: 'amount',
      filter: f.amount,
    },
    { header: translate(COPY.collectedProgress, lang), width: WIDTH.collected, align: 'right' },
    {
      header: translate(COPY.nextPayment, lang),
      width: NEXT_DUE_WIDTH,
      align: 'right',
      sortKey: 'nextDue',
      filter: f.due,
    },
  ]
}
