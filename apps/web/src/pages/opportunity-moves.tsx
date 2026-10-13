import { Check, FileText } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { AcceptDealButton } from '@/components/opportunity-accept'
import { AssignSaleButton } from '@/components/opportunity-assign'
import { QUOTE_HINT, QUOTE_LABEL, type DealPrimaryState } from './opportunity-model'

/** Module 3 · the deal's ONE primary move, drawn in the todo card (ADR 0078
 *  §1): the move that takes it to its next column, picked by `primaryStateOf`
 *  off the server's `acts` (ADR 0076 §4). The other doors sit under the
 *  floating bar's more menu (`dealMoreChoices`). 48px: the todo card is
 *  worked on a tablet (law 13). A shut sign door draws no button; the card
 *  prints the reason (`DealPrimaryState.note`) on a line of its own. */
export function DealPrimary({
  op,
  state,
  onSign,
  onQuote,
}: {
  op: OpportunityProfileResponse
  state: DealPrimaryState
  onSign: () => void
  onQuote: () => void
}) {
  const { move, note } = state

  return (
    <>
      {state.acceptMounted && (
        <AcceptDealButton code={op.code} owners={op.owners} show={move === 'accept'} size="lg" />
      )}
      {move === 'assign' && (
        <AssignSaleButton op={op} hasSeller={op.hasSeller} size="lg" variant="default" />
      )}
      {move === 'quote' && (
        <Button size="lg" title={QUOTE_HINT} onClick={onQuote}>
          <Icon icon={FileText} size={16} />
          {QUOTE_LABEL}
        </Button>
      )}
      {move === 'sign' && note === null && !op.pendingSign && (
        <Button size="lg" onClick={onSign}>
          <Icon icon={Check} size={16} />
          Chốt thắng
        </Button>
      )}
    </>
  )
}
