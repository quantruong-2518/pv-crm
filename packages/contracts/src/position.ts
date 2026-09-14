import { z } from 'zod'
import { Branch } from './auth'
import { Moment, textInput } from './primitives'

/** Where one object stands on its pipeline, and who is being waited on.
 *
 *  The wire shape of `pipelinePosition()` in `@pv/engines` — mirrored field for
 *  field rather than reshaped, because one answer written two ways is two
 *  answers the day somebody edits one of them. The engine decides; this only
 *  carries.
 *
 *  Rule 1 of `docs/tam-nhin-pipeline-toan-he.md` §2 makes this the forcing
 *  function of the whole vision: an object the function cannot place does not
 *  exist in the system. `null` on a read is therefore not a gap to paper over
 *  with a default — it is the system saying this kind has no ladder yet, and
 *  the screen should say so too. */
export const PipelinePositionView = z.object({
  branch: Branch,

  /** A phase key carried WITH the pipeline it belongs to.
   *
   *  §7 warns that a phase drawn from Sales' own `P0…P7` scale either gets
   *  rewritten when Supply and Factory arrive or serves Sales forever. Scoping
   *  the key to its pipeline is that warning answered in the shape — and it is
   *  needed on the wire too, since two ladders may both call a phase `cho-ky`
   *  and a screen listing several pipelines could not tell them apart. */
  phase: z.object({
    pipeline: textInput(40),
    key: textInput(60),
  }),

  /** The object's own state value, passed through untranslated: every pipeline
   *  keeps its own vocabulary and nothing here is entitled to convert it. */
  state: z.string().nullable(),
  holder: z.string().nullable(),

  /** The first approval still waiting on this object. `null` means nobody is
   *  being waited on, and then the answer to "who has it" is `holder`. */
  waitingOn: z
    .object({
      person: textInput(120),
      role: textInput(60),
      due: Moment.nullable(),
    })
    .nullable(),

  /** `daysHere − limitDays`: negative is days still in hand, positive is days
   *  late. One subtraction serves both readings, so a screen prints "2 days
   *  left" and "1 day late" from one field. `null` when the phase has no limit
   *  configured — which is "nothing can be late here yet", not "nothing is
   *  late". */
  overdueBy: z.number().int().nullable(),
})

export type PipelinePositionView = z.infer<typeof PipelinePositionView>
