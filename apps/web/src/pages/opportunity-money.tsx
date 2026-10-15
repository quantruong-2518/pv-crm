import { GlassCard, MetaPill } from '@pv/ui'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { MoneyStrip } from '@/components/deal-money/money-strip'
import { PaperCarousel } from '@/components/deal-money/paper-carousel'
import { paperItems } from '@/components/deal-money/paper-items'
import { PaperDetail, type QuoteSign } from '@/components/deal-money/paper-detail'
import type { DealMoneyState } from './opportunity-money-state'

/** Module 3 · the deal's money: ONE strip of figures, then the contract block —
 *  a carousel of every signed paper and every quote waiting on the customer,
 *  with the picked one spread out below. All off `op.money`, in the server's
 *  order, with no sum and no sort made here; the only arithmetic is the strip's
 *  display ratio. The quote list is in the rail and reads the same pick. */

export function DealMoney({
  op,
  state,
  sign,
  onEdit,
}: {
  op: OpportunityProfileResponse
  state: DealMoneyState
  /** The header's sign verdict; null when that door is shut. */
  sign: QuoteSign | null
  onEdit: () => void
}) {
  const { papers, picked } = state
  const contracts = op.money.contracts.length

  return (
    <>
      <MoneyStrip op={op} onEdit={onEdit} />
      <GlassCard
        variant="b"
        className="flex min-w-0 flex-col gap-6 p-5 sm:p-6"
        aria-label="Hợp đồng"
      >
        <PaperCarousel
          heading={
            <>
              <h2 className="font-display m-0 text-[16px] font-semibold">Hợp đồng</h2>
              {contracts > 0 ? (
                <MetaPill className="tnum">{contracts}</MetaPill>
              ) : (
                <span className="text-muted-foreground text-[13px]">Chưa có hợp đồng</span>
              )}
            </>
          }
          label={contracts > 0 ? 'Các hợp đồng' : 'Báo giá chờ ký'}
          items={paperItems(papers)}
          selectedKey={picked?.key}
          onSelect={state.pick}
        />
        {picked && (
          <PaperDetail
            paper={picked}
            workstreamCode={op.workstream?.code ?? null}
            sign={sign}
            onOpen={state.openInstallment}
            onSchedule={state.openSchedule}
          />
        )}
      </GlassCard>
    </>
  )
}
