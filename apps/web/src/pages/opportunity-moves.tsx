import { Check, FileText } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { AcceptDealButton } from '@/components/opportunity-accept'
import { AssignSaleButton } from '@/components/opportunity-assign'
import { QUOTE_LABEL, SIGN_LABEL, type DealPrimaryState } from './opportunity-model'

/** Module 3 · the deal's moves, drawn in the header's action slot (ADR 0078
 *  §1, moved from the todo card 14/10): the stage move picked by
 *  `primaryStateOf` off the server's `acts` (ADR 0076 §4), with the quote and
 *  sign doors beside it so neither hides in a menu. Only the stage move wears
 *  the primary fill. 48px: the header is worked on a tablet (law 13). A shut
 *  sign door draws no button; the header prints the reason
 *  (`DealPrimaryState.note`) on a line of its own. */

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
  const { move, quote, sign } = state

  return (
    <>
      {state.acceptMounted && (
        <AcceptDealButton code={op.code} owners={op.owners} show={move === 'accept'} size="lg" />
      )}
      {move === 'assign' && (
        <AssignSaleButton op={op} hasSeller={op.hasSeller} size="lg" variant="default" />
      )}
      {quote && (
        <Button size="lg" variant={move === 'quote' ? 'default' : 'secondary'} onClick={onQuote}>
          <Icon icon={FileText} size={16} />
          {QUOTE_LABEL}
        </Button>
      )}
      {sign && (
        <Button size="lg" variant={sign === 'win' ? 'default' : 'secondary'} onClick={onSign}>
          <Icon icon={Check} size={16} />
          {SIGN_LABEL[sign]}
        </Button>
      )}
    </>
  )
}
