import type { ReactNode } from 'react'
import type { TableColumn } from '@pv/ui'
import type { ContractParticipant } from '@pv/contracts'
import { CUSTOMER_HEADER, NO_CLOSER, type ContractBookRow } from '@/data/contracts'
import { NO_SALE } from '@/data/opportunities'
import { kindLabel } from '@/components/deal-money/money'
import { COL } from '@/components/book-columns'
import { CodeCell, DateCell, PicCell } from '@/components/book-cells'
import { MoneySplit, NextDueCell } from '@/components/contract-bits'
import { MoneyCell } from '@/components/money-cell'

/** The contract book's cells and column list. One row reads: who signed what
 *  (code, customer, kind), who holds it, what it is worth and how far it is
 *  collected. Money is in the contract's own currency, so each money cell gets it. */

/** Why a foreign-currency figure sorts and filters where it does: the book compares dong. */
const CONVERTED_WHY = 'Bộ lọc và thứ tự sắp xếp so số tiền đã quy ra đồng'

/** The next-due caption (days, installment no., full date) needs about 200px;
 *  the standard money track would cut it, so this column is wider. */
const NEXT_DUE_WIDTH = 'minmax(200px,1.2fr)'

const laneOf = (p: ContractParticipant) => ({
  id: p.id,
  name: p.name,
  role: p.role === 'SALE' ? 'Sale' : 'BD',
  primary: p.primary,
})

export function contractCells(
  row: ContractBookRow,
  resolveKind: (code: string) => string,
): ReactNode[] {
  const { contract } = row
  const amount = contract.amount ?? 0
  /* At risk = the next installment when it wants attention today; a book row has no checklist. */
  const atRisk = row.urgent ? (row.next?.installment.amount ?? 0) : 0
  /* Terminated: nothing is owed, so the money reads muted and the bar shows no gap to collect. */
  const ended = contract.termination !== null

  return [
    <CodeCell key="code" code={contract.code} />,
    <span key="customer" className="flex min-w-0 flex-col">
      <span className="truncate text-[12.5px]">{contract.customer}</span>
      <span className="text-muted-foreground truncate text-[11.5px]">
        {kindLabel(contract.kind, resolveKind)}
      </span>
    </span>,
    <DateCell key="signed" day={contract.signedAt} empty="Chưa ghi ngày ký" />,
    <PicCell
      key="owner"
      people={
        contract.ownerName
          ? [{ id: contract.ownerId, name: contract.ownerName, role: 'Người chốt' }]
          : []
      }
      empty={NO_CLOSER}
    />,
    <PicCell key="lanes" people={contract.participants.map(laneOf)} empty={NO_SALE} />,
    <MoneyCell
      key="value"
      amount={contract.amount}
      currency={contract.currency}
      muted={ended}
      missing="Hợp đồng chưa nhập giá trị"
      title={contract.currency && contract.currency !== 'VND' ? CONVERTED_WHY : undefined}
    />,
    <span key="collected" className="flex min-w-0 flex-col gap-1">
      {!ended && (
        <MoneySplit
          collected={row.collected}
          atRisk={atRisk}
          ahead={row.remaining - atRisk}
          className="h-1.5"
        />
      )}
      <span className="flex min-w-0 items-baseline justify-end gap-2">
        {!ended && (
          <span className="text-muted-foreground tnum font-num shrink-0 text-[11.5px]">
            {amount === 0 ? '—' : `${Math.round((row.collected / amount) * 100)}%`}
          </span>
        )}
        <MoneyCell
          amount={row.collected}
          currency={contract.currency}
          muted={ended || row.collected === 0}
        />
      </span>
    </span>,
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

export function contractColumns(f: ContractColumnFilters): TableColumn[] {
  return [
    { header: 'Mã', width: COL.code, sortKey: 'code' },
    { header: CUSTOMER_HEADER, width: COL.name, filter: f.kind },
    { header: 'Ngày ký', width: COL.date, sortKey: 'signedAt', filter: f.signed },
    { header: 'Người chốt', width: COL.person, filter: f.owner },
    { header: 'Sale / BD', width: COL.person },
    {
      header: 'Giá trị (₫)',
      width: COL.money,
      align: 'right',
      sortKey: 'amount',
      filter: f.amount,
    },
    { header: 'Tiến độ thu (₫)', width: COL.money, align: 'right' },
    {
      header: 'Đợt thu tiếp theo',
      width: NEXT_DUE_WIDTH,
      align: 'right',
      sortKey: 'nextDue',
      filter: f.due,
    },
  ]
}
