import { z } from 'zod'
import { Day, Moment, textInput } from './primitives'
import { NEXT_STEP_TEXT_MAX, StepTemplateId } from './sales/next-step'
import { SearchKind } from './sales/search'

/** Cards the assistant proposes and a person presses (ADR 0162): the tool input, and the
 *  card as the answer and the event stream carry it. The model never calls a write door;
 *  the press does, as the presser, through the door the screen uses.
 *
 *  Kept apart from `./assistant` because that file imports this one: the kinds come from
 *  `./sales/search` here, so no cycle. `RecordCode` repeats the one there; change both. */

const RecordCode = z.string().trim().min(1).max(64)

/** Lead or deal: the two records whose step door exists. Same set as `AssistantHistoryKind`. */
const ProposalKind = SearchKind.extract(['lead', 'opportunity'])

/** `.strict()` so a model-supplied person id fails parsing: the doer is the record's holder. */
export const ProposeNextStepInput = z
  .object({
    kind: ProposalKind,
    code: RecordCode,
    action: z.enum(['set', 'done']),
    text: textInput(NEXT_STEP_TEXT_MAX).optional(),
    due: Day.optional(),
    templateId: StepTemplateId.optional(),
    reason: z.string().trim().min(1).max(200),
  })
  .strict()
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })
    if (v.action === 'set') {
      // The door's body needs text even with a template: `settle` checks the pair.
      if (v.due === undefined) issue('due', 'Đặt bước tiếp theo cần có ngày.')
      if (v.text === undefined) issue('text', 'Cần nội dung bước.')
      return
    }
    // `done` closes the standing step; text and due together become the following one.
    if ((v.text === undefined) !== (v.due === undefined)) {
      issue('due', 'Bước kế tiếp cần cả nội dung lẫn ngày.')
    }
    if (v.templateId !== undefined && v.text === undefined) {
      issue('templateId', 'Mẫu bước chỉ đi kèm bước kế tiếp.')
    }
  })
export type ProposeNextStepInput = z.infer<typeof ProposeNextStepInput>

/** Values mirror the CHECK on `assistant_proposal.action`; a new write door adds one and a migration. */
export const AssistantProposalAction = z.enum(['next-step-set', 'next-step-done'])
export type AssistantProposalAction = z.infer<typeof AssistantProposalAction>

/** `expired` is derived at read (`pending` past `expiresAt`); the table never stores it. */
export const AssistantProposalState = z.enum([
  'pending',
  'applied',
  'dismissed',
  'stale',
  'expired',
])
export type AssistantProposalState = z.infer<typeof AssistantProposalState>

/** The step as the card shows it, before and after. */
export const AssistantProposalStep = z.object({ text: z.string(), due: Day })
export type AssistantProposalStep = z.infer<typeof AssistantProposalStep>

/** `label` is the record chip text and never enters a model request. `before` is `null` when
 *  no step stood, `after` when the press writes none. `canPress` is false for a reader of
 *  another person's chat and for a card no longer pending. */
export const AssistantProposal = z.object({
  id: z.string().uuid(),
  kind: ProposalKind,
  code: RecordCode,
  label: z.string().min(1),
  action: AssistantProposalAction,
  before: AssistantProposalStep.nullable(),
  after: AssistantProposalStep.nullable(),
  reason: z.string(),
  state: AssistantProposalState,
  expiresAt: Moment,
  canPress: z.boolean(),
})
export type AssistantProposal = z.infer<typeof AssistantProposal>
