import { z } from 'zod'
import { Day, ObjectCode, textInput } from '../primitives'
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

export const NextStepParams = z.object({ code: ObjectCode })

/** `doerId` absent means the object's holder, resolved by the server at write time. */
export const NextStepSetBody = z.object({
  text: textInput(200),
  due: Day,
  doerId: z.string().min(1).max(64).optional(),
})

/** `closing` names the step the person saw, so a retried or double-sent "done"
 *  finds a different step under the lock and is refused instead of logging a
 *  second touch for work nobody did. `next` rides in the same request so "done"
 *  never leaves a gap another tab could read as "no next step". */
export const NextStepDoneBody = z.object({
  closing: z.object({ text: textInput(200), due: Day }),
  next: NextStepSetBody.optional(),
})

export const NextStep = z.object({
  text: textInput(200),
  due: Day,
  doer: WorkstreamHolder,
  dueLevel: DueLevel,
})

/** Every door answers with the step as it now stands, so no write needs a re-read. */
export const NextStepResponse = z.object({
  step: NextStep.nullable(),
})

export type NextStepParams = z.infer<typeof NextStepParams>
export type NextStepSetBody = z.infer<typeof NextStepSetBody>
export type NextStepDoneBody = z.infer<typeof NextStepDoneBody>
export type NextStep = z.infer<typeof NextStep>
export type NextStepResponse = z.infer<typeof NextStepResponse>
