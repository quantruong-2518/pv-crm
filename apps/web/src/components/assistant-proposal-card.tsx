import { AiAction } from '@pv/ui'
import type { AssistantProposal } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useI18n } from '@/app/i18n'
import { toastFail } from '@/app/toast'
import { ASSISTANT_COPY as ASSISTANT } from '@/data/assistant-copy'
import { useApplyProposal, useDismissProposal } from '@/data/assistant-proposal'
import {
  PROPOSAL_COPY as C,
  proposalEmpty,
  proposalEnd,
  proposalSentence,
  stepLine,
} from '@/data/assistant-proposal-copy'

/** A step the assistant proposes (ADR 0162): law 9, so nothing is written until
 *  the person presses the confirm button. The card ends in a line, not a button, once it is
 *  applied, dropped, out of date, expired, or the person cannot edit the record. */

export function ProposalCard({
  proposal,
  compact,
}: {
  proposal: AssistantProposal
  compact: boolean
}) {
  const { t, lang } = useI18n()
  const apply = useApplyProposal()
  const dismiss = useDismissProposal()
  const end = proposalEnd(proposal)
  const refused = (error: Parameters<typeof userMessage>[0]) =>
    /* The server's refusal is Vietnamese; another language reads the generic line. */
    toastFail(lang === 'vi' && error.serverTitle ? error.serverTitle : userMessage(error))

  return (
    <AiAction
      variant={compact ? 'panel' : 'strip'}
      suggestion={
        <>
          {proposalSentence(proposal, lang)}
          <span className="tnum mt-1 block text-[12.5px]">
            {t(C.before)}: {proposal.before ? stepLine(proposal.before, lang) : t(C.noStep)}
          </span>
          <span className="tnum block text-[12.5px]">
            {t(C.after)}: {proposal.after ? stepLine(proposal.after, lang) : t(C.noNewStep)}
          </span>
        </>
      }
      basis={proposal.reason}
      basisLabel={t(ASSISTANT.basisLabel)}
      empty={t(proposalEmpty(proposal))}
      confirmLabel={t(C.confirm)}
      dismissLabel={t(C.dismiss)}
      pending={apply.isPending || dismiss.isPending}
      onConfirm={() => apply.mutate(proposal, { onError: refused })}
      onDismiss={() => dismiss.mutate(proposal, { onError: refused })}
      done={end !== null}
      doneLabel={t(end ? end.copy : C.applied)}
      doneTone={end?.tone}
    />
  )
}
