import { useQuery } from '@tanstack/react-query'
import { ChevronRight, GlassCard, Icon, millions } from '@pv/ui'
import {
  CONTRACT_PENALTY_DIRECTION_LABEL,
  OPPORTUNITY_STATE_LABEL,
  type ContractPenaltyDirection,
} from '@pv/contracts'
import { contractSummaryQuery } from '@/data/contracts'
import { PENALTY_STATE_WORD } from '@/data/contract-penalty'

/** Ended contracts and their penalties, under the four score cards (ADR 0124).
 *
 *  Company numbers like the cards above (unscoped), and never a KPI. One button
 *  to the terminated tab; its four columns line up with the cards. Pending is
 *  total minus settled, derived here. Nothing renders once the summary arrives
 *  without `terminatedCount`: the API is one deploy behind. */

const LABEL = 'text-muted-foreground font-mono text-[10px] font-semibold uppercase tracking-[.1em]'
const VALUE = 'tnum font-num mt-2 text-[30px] font-semibold leading-none tracking-[-1px]'
const GRID = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4'

const SIDES: ContractPenaltyDirection[] = ['customer-pays', 'company-pays']

export function ContractsPenaltyBand({ onOpen }: { onOpen: () => void }) {
  const { data, isPending } = useQuery(contractSummaryQuery)

  /* Holds the band's height while the summary loads, so the book does not jump. */
  if (isPending) return <GlassCard className="min-h-28" aria-hidden="true" />
  if (data?.terminatedCount === undefined) return null

  const totals: Record<ContractPenaltyDirection, [number, number]> = {
    'customer-pays': [data.penaltyCustomerPaysVnd ?? 0, data.penaltyCustomerPaysSettledVnd ?? 0],
    'company-pays': [data.penaltyCompanyPaysVnd ?? 0, data.penaltyCompanyPaysSettledVnd ?? 0],
  }

  return (
    <GlassCard>
      <button
        type="button"
        onClick={onOpen}
        className={`${GRID} motion-std hover:bg-surface-ink/6 focus-visible:outline-ring pointer-coarse:min-h-12 w-full cursor-pointer rounded-lg px-4 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2`}
      >
        <span className="text-foreground flex items-start justify-between gap-2 text-[13px] font-semibold leading-[1.4]">
          Hợp đồng {OPPORTUNITY_STATE_LABEL.terminated.toLowerCase()} và tiền phạt
          <Icon icon={ChevronRight} size={16} className="text-muted-foreground shrink-0" />
        </span>
        <span className="flex flex-col">
          <span className={LABEL}>Số hợp đồng</span>
          <span className={VALUE}>{data.terminatedCount}</span>
        </span>
        {SIDES.map((side) => {
          const [total, settled] = totals[side]
          const word = PENALTY_STATE_WORD[side]
          return (
            <span key={side} className="flex flex-col">
              <span className={LABEL}>{CONTRACT_PENALTY_DIRECTION_LABEL[side]}</span>
              <span className={VALUE}>{millions(total, 0)}</span>
              <span className="text-glass-foreground tnum mt-2 text-[11px] leading-[1.5]">
                {word.done} {millions(settled, 0)} · {word.wait}{' '}
                {millions(Math.max(total - settled, 0), 0)}
              </span>
            </span>
          )
        })}
      </button>
    </GlassCard>
  )
}
