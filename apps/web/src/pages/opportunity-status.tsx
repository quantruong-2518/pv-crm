import type { OpportunityProfileResponse } from '@pv/contracts'
import { dealStepSubject } from '@/data/deal-next-step'
import { NextStepCard } from '@/components/run/next-step'
import { TodoCard } from '@/components/record/todo-card'
import { statusStepsOf } from './opportunity-model'

/** Module 3 · the deal's stepper and next step (ADR 0078 §1): the four columns
 *  and the contract step off the server's `stages`, then the deal's one next
 *  step. The moves are not here — they sit in the header (`DealHeader`). A won
 *  deal has no step to show (signing drops it, the server refuses a new one,
 *  ADR 0069 §10) and a stopped one has none either: its fail log follows. */

export function DealTodo({ op }: { op: OpportunityProfileResponse }) {
  return (
    <TodoCard
      rungs={statusStepsOf(op)}
      rungsLabel="Giai đoạn cơ hội"
      next={
        op.state === 'open' ? (
          <NextStepCard
            embedded
            subject={dealStepSubject(op.code, op.holder)}
            canEdit={op.acts.editDetails.ok}
          />
        ) : undefined
      }
    />
  )
}
