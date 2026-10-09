import { z } from 'zod'
import { Day, ObjectCode, textInput } from '../primitives'
import { ConfigCode } from './config'
import { DueLevel } from './enums'
import { WorkstreamHolder } from './workstream'

/** Next step — the ONE thing to do next on an open object (flow G1–G3).
 *
 *      GET    /sales/{leads|opportunities}/:code/next-step        the step, or null
 *      PUT    /sales/{leads|opportunities}/:code/next-step        set or replace it
 *      POST   /sales/{leads|opportunities}/:code/next-step/done   `next-step-done`
 *                                          touch, then set `next` or clear, one tx
 *      DELETE /sales/{leads|opportunities}/:code/next-step        clear; no touch
 *
 *  Keyed by `ObjectCode`, so `LD-` and `OP-` share every shape. Optional (G2):
 *  null is not a warning. `dueLevel` is graded by the server on the same 3-level
 *  ladder for both (`stepLevelOf`, 0067 D11) — the screen never derives it.
 *  `JourneyNextAction` IS `NextStep`; the journey carries this fact, not a copy. */

export const NEXT_STEP_TEXT_MAX = 200

export const NextStepParams = z.object({ code: ObjectCode })

/** Declared here, not in `./step-frame`, so imports run one way: that file
 *  reads this one, and two files reading each other's constants die at load. */
export const StepTemplateId = z.uuid('Mã mẫu bước phải là UUID')

/** `doerId` absent means the object's holder, resolved by the server at write time.
 *  `kindId` is a `STEP_KIND` entry; optional here because the step card predates
 *  it — the comm close-out door is where a kind is required.
 *  `templateId` absent means a typed step. Whether the state allows one is the
 *  admin's live answer (ADR 0080 §2), so the server judges it, not this schema. */
export const NextStepSetBody = z.object({
  text: textInput(NEXT_STEP_TEXT_MAX),
  due: Day,
  doerId: z.string().min(1).max(64).optional(),
  kindId: ConfigCode.optional(),
  templateId: StepTemplateId.optional(),
})

/** On `NextStep` the name is read live from the config row; a debrief keeps a copy. */
export const NextStepKind = z.object({ id: ConfigCode, name: z.string().min(1) })

/** `closing` names the step the person saw, so a retried or double-sent "done"
 *  finds a different step under the lock and is refused instead of logging a
 *  second touch for work nobody did. `next` rides in the same request so "done"
 *  never leaves a gap another tab could read as "no next step".
 *  `closing` carries no `templateId`: the touch is stamped from the locked row
 *  (ADR 0080 §5), so a client cannot misreport where a finished step came from. */
export const NextStepDoneBody = z.object({
  closing: z.object({ text: textInput(NEXT_STEP_TEXT_MAX), due: Day }),
  next: NextStepSetBody.optional(),
})

export const NextStep = z.object({
  text: textInput(NEXT_STEP_TEXT_MAX),
  due: Day,
  doer: WorkstreamHolder,
  dueLevel: DueLevel,
  kind: NextStepKind.nullable(),
  /** Optional, not nullable: every existing mapper stays valid, and a typed
   *  step simply has none. Kept even after the template is switched off. */
  templateId: StepTemplateId.optional(),
})

/** Every door answers with the step as it now stands, so no write needs a re-read. */
export const NextStepResponse = z.object({
  step: NextStep.nullable(),
})

export type StepTemplateId = z.infer<typeof StepTemplateId>
export type NextStepParams = z.infer<typeof NextStepParams>
export type NextStepSetBody = z.infer<typeof NextStepSetBody>
export type NextStepDoneBody = z.infer<typeof NextStepDoneBody>
export type NextStepKind = z.infer<typeof NextStepKind>
export type NextStep = z.infer<typeof NextStep>
export type NextStepResponse = z.infer<typeof NextStepResponse>
