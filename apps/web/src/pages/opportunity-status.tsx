import type { OpportunityProfileResponse } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
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
  const { t } = useI18n()
  return (
    <TodoCard
      rungs={statusStepsOf(op)}
      rungsLabel={t(message('Giai đoạn cơ hội', 'Opportunity stages', '기회 단계'))}
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
