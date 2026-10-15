import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Icon, cn } from '@pv/ui'
import type {
  InstallmentConditionRow,
  InstallmentRow,
  OpportunityMoneyContract,
  OpportunityMoneyInstallment,
} from '@pv/contracts'
import { contractDetailQuery, viewInstallment } from '@/data/contracts'
import { BADGE_INK } from '@/data/opportunities'
import { dm } from '@/lib/date'
import { INSTALLMENT_TONE, compactMoney, installmentStatusLine } from './money'
import { TintBadge } from './tint-badge'

/** The installments of one signed paper as tiles, three to a row, more
 *  scrolling sideways. The profile's installment row carries no conditions, so
 *  the acceptance line comes from the contract's detail — a door scoped to its
 *  owner. A reader it refuses gets tiles without that line, not an error.
 *  The line names the condition that holds the installment up, else the first
 *  open one, else the first. Hover tints are held in the light theme: a darker
 *  tile there would pull the ink under 4.5:1. */

function acceptanceOf(row: InstallmentRow | undefined): InstallmentConditionRow | undefined {
  if (!row) return undefined
  return viewInstallment(row).blocking ?? row.conditions.find((c) => !c.doneAt) ?? row.conditions[0]
}

export function InstallmentTiles({
  contract,
  onOpen,
}: {
  contract: OpportunityMoneyContract
  onOpen: (installment: OpportunityMoneyInstallment) => void
}) {
  const detail = useQuery(contractDetailQuery(contract.code))

  return (
    <div
      role="group"
      aria-label="Các đợt thanh toán"
      className="-m-1 grid snap-x auto-cols-[max(176px,calc((100%-24px)/3))] grid-flow-col gap-3 overflow-x-auto p-1"
    >
      {contract.installments.map((i) => {
        const line = acceptanceOf(detail.data?.installments.find((row) => row.no === i.no))
        return (
          <button
            key={i.no}
            type="button"
            onClick={() => onOpen(i)}
            className={cn(
              'motion-std focus-visible:outline-ring shadow-control flex min-h-[148px] snap-start flex-col items-start gap-2 rounded-lg p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2',
              i.status === 'overdue'
                ? 'bg-destructive/14 hover:bg-destructive/22 stone:hover:bg-destructive/14'
                : 'bg-surface-ink/9 hover:bg-surface-ink/14 stone:hover:bg-surface-ink/9',
            )}
          >
            <span className="flex w-full items-baseline gap-2">
              <span className="text-[13px] font-semibold">{i.label}</span>
              <span className="text-muted-foreground tnum ml-auto text-[12px]">{i.share}%</span>
            </span>
            <span className="tnum font-num text-[20px] font-semibold leading-[1.3]">
              {compactMoney(i.amount, contract.currency)}
            </span>
            <span className="text-muted-foreground tnum text-[12px]">hạn {dm(i.due)}</span>
            <TintBadge
              tone={INSTALLMENT_TONE[i.status]}
              className={cn(i.status === 'upcoming' && BADGE_INK)}
            >
              {installmentStatusLine(i)}
            </TintBadge>
            {line && (
              <span
                className={cn(
                  'mt-auto flex items-center gap-2 text-[12px] leading-[1.5]',
                  line.doneAt ? 'text-on-tint-success' : 'text-on-tint-warning',
                )}
              >
                <Icon icon={ClipboardList} size={14} className="shrink-0" />
                {line.what}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
