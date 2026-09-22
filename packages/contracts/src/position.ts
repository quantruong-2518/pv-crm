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
 *  Rule 1 of `docs/decisions/0015-pipeline-queue-and-ledger-are-different-things.md`
 *  makes this the forcing function of the whole vision: an object the function
 *  cannot place does not
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
   *  needed on the wire too, since two ladders may both call a phase `quotation`
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

/** One link of the object chain a record belongs to: lead, then deal, then
 *  contract.
 *
 *  ------------------------------------------------------------------
 *  A CHAIN OF OBJECTS, NOT A CHAIN OF PEOPLE
 *  ------------------------------------------------------------------
 *  This is what ContextRail (M-04) draws, and rule 10 makes `E1.story()` its
 *  only legal input — so the server walks the graph and sends the answer rather
 *  than letting a screen assemble one from whatever codes it happens to hold.
 *  `FlowVector` (M-16) answers a different question on the same screen: who has
 *  HELD one object. Two bars, two questions, and merging them breaks rule 10.
 *
 *  `kind` travels because the screen routes on it — a lead opens under
 *  `/sales/leads`, a deal under `/sales/opportunities`, a contract under
 *  `/sales/contracts` — and a chip that cannot say which door it opens is a
 *  chip nobody can press.
 *
 *  The chain is already CUT BY PERMISSION when it arrives: `GraphService`
 *  filters every link through E2, so a reader who may not see a deal does not
 *  learn its code from the rail of a lead they may see. */
export const ObjectChainLink = z.object({
  code: textInput(20),
  kind: textInput(4),
  label: textInput(160),
})

export type ObjectChainLink = z.infer<typeof ObjectChainLink>
