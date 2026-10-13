import type { OpportunityProfileResponse } from '@pv/contracts'
import { dealStepSubject } from '@/data/deal-next-step'
import { NextStepCard } from '@/components/run/next-step'
import { TodoCard } from '@/components/record/todo-card'
import { DealPrimary } from './opportunity-moves'
import { statusStepsOf, type DealPrimaryState } from './opportunity-model'

/** Module 3 · the deal's todo card (ADR 0078 §1): the four columns and
 *  the contract step off the server's `stages`, the deal's one next step, and
 *  its moves beside it — the stage move, quoting and signing. A stopped deal has no step and no move: its
 *  fail log follows the card. */

export function DealTodo({
  op,
  primary,
  onSign,
  onQuote,
}: {
  op: OpportunityProfileResponse
  /** `primaryStateOf` — read once by the page, which also feeds the more menu. */
  primary: DealPrimaryState
  onSign: () => void
  onQuote: () => void
}) {
  const { move } = primary
  const drawsPrimary =
    move === 'accept' || move === 'assign' || primary.quote || primary.sign || primary.acceptMounted

  return (
    <TodoCard
      rungs={statusStepsOf(op)}
      rungsLabel="Giai đoạn cơ hội"
      next={op.state === 'lost' ? undefined : <NextStepRow op={op} />}
      primary={
        drawsPrimary ? (
          <DealPrimary op={op} state={primary} onSign={onSign} onQuote={onQuote} />
        ) : undefined
      }
      note={primary.note}
    />
  )
}

/** Signing drops the deal's step and the server refuses a new one (ADR 0069
 *  §10), so a won deal states that fact instead of offering a button. */
function NextStepRow({ op }: { op: OpportunityProfileResponse }) {
  if (op.state === 'won') {
    return (
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        Đã thành hợp đồng, không còn việc tiếp theo.
      </p>
    )
  }
  return (
    <NextStepCard
      embedded
      subject={dealStepSubject(op.code, op.holder)}
      canEdit={op.acts.editDetails.ok}
    />
  )
}
