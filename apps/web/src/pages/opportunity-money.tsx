import { useState } from 'react'
import type {
  OpportunityMoneyContract,
  OpportunityMoneyNegotiation,
  OpportunityProfileResponse,
  QuotationRow,
} from '@pv/contracts'
import { ContractSection } from '@/components/deal-money/contract-section'
import { InstallmentDrawer } from '@/components/deal-money/installment-drawer'
import { MoneyStrip } from '@/components/deal-money/money-strip'
import { NegotiationSection } from '@/components/deal-money/negotiation-section'
import { ScheduleDrawer } from '@/components/deal-pay'
import { CloseNegotiationDialog, QuotationPatchDialog } from './opportunity-quotation-modal'

/** Module 3 · the deal's money: the strip, one section per unsigned negotiation,
 *  then one per contract — all off `op.money`, in the server's order, with no
 *  sum and no sort made here. The record modal is the page's (the todo card and
 *  the more menu open it too); the close, completion, schedule and installment
 *  layers belong to this block. */

/** What a layer acts on. `open: false` keeps the last target so the layer can
 *  animate out; `session` keys a fresh form per opening. */
type Layer<T> = { target: T; open: boolean; session: number }

function useLayer<T>() {
  const [layer, setLayer] = useState<Layer<T> | null>(null)
  return {
    layer,
    show: (target: T) =>
      setLayer((prev) => ({ target, open: true, session: (prev?.session ?? 0) + 1 })),
    hide: () => setLayer((prev) => prev && { ...prev, open: false }),
  }
}

export function DealMoney({
  op,
  onQuote,
}: {
  op: OpportunityProfileResponse
  /** Opens the page's record modal on this negotiation. */
  onQuote: (negotiation: OpportunityMoneyNegotiation) => void
}) {
  const { money } = op
  const run = op.workstream?.code ?? null
  const closing = useLayer<OpportunityMoneyNegotiation>()
  const patching = useLayer<QuotationRow>()
  const scheduling = useLayer<OpportunityMoneyContract>()
  /* Codes, not rows: the drawer reads the live row, so a recorded payment shows. */
  const paying = useLayer<{ contractCode: string; no: number }>()
  const shown = paying.layer
  const shownContract = money.contracts.find((c) => c.code === shown?.target.contractCode)
  const shownInstallment = shownContract?.installments.find((i) => i.no === shown?.target.no)

  if (money.open.length === 0 && money.contracts.length === 0) return null
  const doors = op.acts.quotation.ok
    ? { onQuote, onClose: closing.show, onPatch: patching.show }
    : undefined

  return (
    <>
      <MoneyStrip money={money} />
      {money.open.map((n) => (
        <NegotiationSection
          key={`${n.kind}:${n.negotiationNo}`}
          negotiation={n}
          workstreamCode={run}
          doors={doors}
        />
      ))}
      {money.contracts.map((c) => (
        <ContractSection
          key={c.code}
          contract={c}
          workstreamCode={run}
          onOpen={(i) => paying.show({ contractCode: c.code, no: i.no })}
          onSchedule={() => scheduling.show(c)}
        />
      ))}

      {closing.layer && (
        <CloseNegotiationDialog
          key={closing.layer.session}
          op={op}
          negotiation={closing.layer.target}
          open={closing.layer.open}
          onClose={closing.hide}
        />
      )}
      {patching.layer && (
        <QuotationPatchDialog
          key={patching.layer.session}
          op={op}
          round={patching.layer.target}
          open={patching.layer.open}
          onClose={patching.hide}
        />
      )}
      {scheduling.layer && (
        <ScheduleDrawer
          key={scheduling.layer.session}
          contract={scheduling.layer.target}
          open={scheduling.layer.open}
          onClose={scheduling.hide}
        />
      )}
      {shown && shownContract && shownInstallment && (
        <InstallmentDrawer
          contract={shownContract}
          installment={shownInstallment}
          workstreamCode={run}
          open={shown.open}
          onClose={paying.hide}
        />
      )}
    </>
  )
}
