import { Check, FileText } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import type { OpportunityProfileResponse } from '@pv/contracts'
import type { EventKind } from '@/data/opportunities'
import { AcceptDealButton } from '@/components/opportunity-accept'
import { AssignSaleButton } from '@/components/opportunity-assign'
import { QUOTE_HINT, quoteLabelOf, type DealPrimaryState } from './opportunity-model'

/** Module 3 · the deal's ONE primary move, drawn in the todo card (ADR 0078
 *  §1): the move that takes it to its next column, picked by `primaryStateOf`
 *  off the server's `acts` (ADR 0076 §4). The other doors sit under the
 *  floating bar's more menu (`dealMoreChoices`). 48px: the todo card is
 *  worked on a tablet (law 13). */
export function DealPrimary({
  op,
  state,
  onSign,
  onRecord,
}: {
  op: OpportunityProfileResponse
  state: DealPrimaryState
  onSign: () => void
  onRecord: (kind: EventKind) => void
}) {
  const { move, note } = state

  return (
    <>
      {state.acceptMounted && (
        <AcceptDealButton code={op.code} show={move === 'accept'} size="lg" />
      )}
      {move === 'assign' && (
        <AssignSaleButton op={op} hasSeller={op.hasSeller} size="lg" variant="default" />
      )}
      {move === 'quote' && (
        <Button size="lg" title={QUOTE_HINT} onClick={() => onRecord('quotation')}>
          <Icon icon={FileText} size={16} />
          {quoteLabelOf(op)}
        </Button>
      )}
      {move === 'sign' && (
        <Button
          size="lg"
          disabled={Boolean(op.pendingSign) || note !== null}
          title={note ?? undefined}
          onClick={onSign}
        >
          <Icon icon={Check} size={16} />
          Chốt thắng
        </Button>
      )}
      {note && (
        <span className="text-muted-foreground basis-full text-[12px] leading-[1.5]">{note}</span>
      )}
    </>
  )
}
