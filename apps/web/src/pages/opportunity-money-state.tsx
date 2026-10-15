import { useMemo, useState, type ReactNode } from 'react'
import type {
  OpportunityMoneyContract,
  OpportunityMoneyInstallment,
  OpportunityMoneyNegotiation,
  OpportunityProfileResponse,
  QuotationRow,
} from '@pv/contracts'
import { InstallmentModal } from '@/components/deal-money/installment-modal'
import { papersOf, pickedPaper, type Paper } from '@/components/deal-money/papers'
import type { QuotationDoors } from '@/components/deal-money/quotation-rail'
import { ScheduleDrawer } from '@/components/deal-pay'
import { CloseNegotiationDialog, QuotationPatchDialog } from './opportunity-quotation-modal'

/** Module 3 · the money block's shared state. The money block (main column)
 *  and the quotation list (rail) read ONE picked paper and share the same
 *  close and patch layers, so both live here, once, and the page spreads them.
 *  The record modal is the page's (the header opens it too). */

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

export type DealMoneyState = {
  papers: Paper[]
  picked: Paper | undefined
  pick: (key: string) => void
  /** Absent = `acts.quotation` refuses this reader. */
  doors: QuotationDoors | undefined
  openSchedule: (contract: OpportunityMoneyContract) => void
  openInstallment: (
    contract: OpportunityMoneyContract,
    installment: OpportunityMoneyInstallment,
  ) => void
  /** The layers to mount once, anywhere under the page. */
  layers: ReactNode
}

export function useDealMoney(
  op: OpportunityProfileResponse,
  onQuote: (negotiation: OpportunityMoneyNegotiation | null) => void,
): DealMoneyState {
  const { money } = op
  const closing = useLayer<OpportunityMoneyNegotiation>()
  const patching = useLayer<QuotationRow>()
  const scheduling = useLayer<OpportunityMoneyContract>()
  /* Codes, not rows: the modal reads the live row, so a recorded payment shows. */
  const paying = useLayer<{ contractCode: string; no: number }>()
  const [key, pick] = useState<string | null>(null)
  const papers = useMemo(() => papersOf(money), [money])

  const shown = paying.layer
  const shownContract = money.contracts.find((c) => c.code === shown?.target.contractCode)
  const shownInstallment = shownContract?.installments.find((i) => i.no === shown?.target.no)

  return {
    papers,
    picked: pickedPaper(papers, key),
    pick,
    doors: op.acts.quotation.ok
      ? { onQuote, onClose: closing.show, onPatch: patching.show }
      : undefined,
    openSchedule: scheduling.show,
    openInstallment: (contractRow, i) => paying.show({ contractCode: contractRow.code, no: i.no }),
    layers: (
      <>
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
          <InstallmentModal
            key={shown.session}
            contract={shownContract}
            installment={shownInstallment}
            workstreamCode={op.workstream?.code ?? null}
            open={shown.open}
            onClose={paying.hide}
          />
        )}
      </>
    ),
  }
}
