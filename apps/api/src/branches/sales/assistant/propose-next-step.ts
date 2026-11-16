import {
  LEAD_ACTIVE_STATES,
  NextStepDoneBody,
  NextStepSetBody,
  ObjectCode,
  ProposeNextStepInput,
  type AssistantProposalStep,
  type StepOptionsResponse,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import {
  defineTool,
  door,
  type AssistantTool,
  type ToolRead,
} from '@api/platform/assistant/assistant-tools'
import { zod } from '@api/platform/http/zod.pipe'
import type { LeadService } from '../lead/lead.service'
import { OpportunityStepController } from '../next-step/next-step-opportunity.controller'
import type { OpportunityStepService } from '../next-step/next-step-opportunity.service'
import { NextStepController } from '../next-step/next-step.controller'
import type { NextStepService } from '../next-step/next-step.service'

/** `propose_next_step` (ADR 0162): a card for the asker to press, never a write. The
 *  doors are the step doors' `set`, so a seat that could not press gets no card; the
 *  run reads the standing step and the picker list through the doors' own services,
 *  as the asker, and builds the exact body the press will replay.
 *
 *  The model gets back kind, code and action only. A refusal says why in one enum
 *  word, so the model can say it plainly; nothing about the step text is echoed. */

type Deps = {
  leads: Pick<LeadService, 'guard'>
  leadSteps: Pick<NextStepService, 'get' | 'options'>
  dealSteps: Pick<OpportunityStepService, 'get' | 'options' | 'isOpen'>
}

/* A link, a bare `www.`, or a dot before a known ending (`abc.vn`, letters with marks too): a card
   is copied into the record as typed, and a link there is the injection's way out. An
   explicit ending list, so `TP.HCM`, `P.KD` or `BaoGia.pdf` stay plain text. */
const ENDINGS = new Set(
  (
    'com net org vn io co info biz me app dev xyz online site link ly gl cc gg edu gov ' +
    'uk us jp kr cn de fr ru tk'
  ).split(' '),
)
const ENDING = /(?<=[\p{L}\p{M}\p{N}-])\.(\p{L}{2,})(?![\p{L}\p{M}\p{N}])/gu
function hasLink(raw: string): boolean {
  const text = raw.normalize('NFKC').replace(/\[\.\]|\(\.\)/g, '.')
  if (/https?:\/\/|www\./i.test(text)) return true
  return [...text.matchAll(ENDING)].some((m) => ENDINGS.has((m[1] ?? '').toLowerCase()))
}

type Refusal =
  | 'link'
  | 'not-open'
  | 'no-step'
  | 'template-not-offered'
  | 'pick-template'
  | 'bad-body'
  | 'next-same-as-closing'

const sameStep = (a: AssistantProposalStep, b: AssistantProposalStep): boolean =>
  a.text === b.text && a.due === b.due

/** The list the model must pick from: ids are trusted, names are record text. */
const listOf = (options: StepOptionsResponse) => ({
  templates: options.templates.map((t) => ({ trusted: { id: t.id }, untrusted: { name: t.name } })),
})

async function run(d: Deps, who: Actor, input: ProposeNextStepInput): Promise<ToolRead> {
  const code = zod(ObjectCode).transform(input.code)
  const head = { kind: input.kind, code, action: input.action }
  const refuse = (why: Refusal, read: boolean, extra: object = {}): ToolRead => ({
    data: { trusted: { ...head, card: 'refused', why }, ...extra },
    codes: read ? [code] : [],
    rowCount: read ? 1 : 0,
    hidden: null,
  })
  if ([input.text, input.reason].some((t) => t !== undefined && hasLink(t))) {
    return refuse('link', false)
  }
  const steps = input.kind === 'lead' ? d.leadSteps : d.dealSteps
  /* The lead's write fence is the holder's, narrower than its read fence. */
  if (input.kind === 'lead') await d.leads.guard(who, code, true)
  const [{ step }, options] = await Promise.all([steps.get(who, code), steps.options(who, code)])
  /* A lead not being worked (nurturing, out of the funnel, bought) or a stopped or
     signed deal: the step door refuses any card. A deal's frame alone cannot say. */
  const shut =
    input.kind === 'lead'
      ? options.address?.kind !== 'lead' ||
        !(LEAD_ACTIVE_STATES as readonly string[]).includes(options.address.state)
      : !(await d.dealSteps.isOpen(who, code))
  if (shut) return refuse('not-open', true)
  const before = step ? { text: step.text, due: step.due } : null
  if (input.action === 'done' && !before) return refuse('no-step', true)
  const picked = options.templates.find((t) => t.id === input.templateId)
  if (input.templateId !== undefined && !picked) {
    return refuse('template-not-offered', true, listOf(options))
  }
  const typed = input.text !== undefined && input.due !== undefined
  if (typed && !options.freeEntry && !picked) return refuse('pick-template', true, listOf(options))
  /* The door stores a list step only under the template's own name, and the card shows that. */
  const after =
    input.text !== undefined && input.due !== undefined
      ? { text: picked && !options.freeEntry ? picked.name : input.text, due: input.due }
      : null
  const next = after && { ...after, ...(picked && { templateId: picked.id }) }
  const body =
    input.action === 'set'
      ? NextStepSetBody.safeParse(next)
      : NextStepDoneBody.safeParse({ closing: before, ...(next && { next }) })
  if (!body.success) return refuse('bad-body', true)
  if (input.action === 'done' && after && before && sameStep(after, before)) {
    return refuse('next-same-as-closing', true)
  }
  return {
    data: { trusted: { ...head, card: 'shown' } },
    codes: [code],
    rowCount: 1,
    hidden: null,
    proposal: {
      kind: input.kind,
      code,
      action: input.action === 'set' ? 'next-step-set' : 'next-step-done',
      before,
      after,
      body: body.data,
      reason: input.reason,
    },
  }
}

export const proposeNextStep = (d: Deps): AssistantTool =>
  defineTool({
    name: 'propose_next_step',
    description:
      "Propose a change to the next step of one lead or opportunity, shown to the asker as a card they may press. This call writes nothing. action 'set' replaces the standing step with text and due; 'done' marks the standing step done, with text and due for the following step or neither. Give reason: one short line on why. If the result asks to pick from templates, call again with one templateId from that list.",
    input: ProposeNextStepInput,
    doors: {
      lead: door(NextStepController, 'set'),
      opportunity: door(OpportunityStepController, 'set'),
    },
    doorFor: (input) => input.kind,
    /* A card is no record read: the footer and the suggestions leave it out. */
    refsCounted: () => 'none',
    run: (who, input) => run(d, who, input),
  })
