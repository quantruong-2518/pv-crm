import { z } from 'zod'
import {
  Day,
  Moment,
  ObjectCode,
  collapseSpaces,
  textInput,
  textInputOptional,
} from '../primitives'
import { DueLevel } from './enums'
import { OpportunityStopBody } from './opportunity'
import { WorkstreamHolder } from './workstream'

/** Hold — a dated pause laid OVER a lead or a deal (ADR 0088 §10). An
 *  overlay row in `sales.hold`, not a state: the subject keeps its stored state
 *  or column and returns to it on resume, so no ladder grows a value.
 *
 *  Doors: `POST|PATCH /sales/leads/:code/hold`, `POST /sales/leads/:code/hold/end`,
 *  the same three under `/sales/opportunities/:code/hold`, and `GET /sales/holds`.
 *  The set/patch/end doors answer the subject's profile (`LeadHoldResponse` in
 *  `./lead`, `OpportunityHoldResponse` in `./opportunity-profile`).
 *  At `until` nothing moves by itself: the row stays and its `dueLevel` turns
 *  `due`, then `overdue`. Reminders are the `hold-due-soon` / `hold-due` bells. */

export const HoldSubjectType = z.enum(['lead', 'opportunity'])

/** How a hold ended — the `end_kind` CHECK on `sales.hold`. Never printed. */
export const HoldEndKind = z.enum([
  'resumed',
  'to-waiting',
  'touch',
  'stopped',
  'disqualified',
  'converted',
])

export const HOLD_NOTE_MAX = 1_000

/** The open hold on one subject. `dueLevel` is the server's grading of `until`
 *  on the shared due ladder (never `done`: an ended hold is not sent). */
export const Hold = z.object({
  subjectType: HoldSubjectType,
  code: ObjectCode,
  until: Day,
  note: z.string().min(1).nullable(),
  setBy: WorkstreamHolder,
  setAt: Moment,
  dueLevel: DueLevel,
})

/** `POST …/:code/hold`, lead and deal alike. "Later than today" needs the
 *  server's clock, so the door judges it, not this schema. */
export const HoldSetBody = z.object({
  until: Day,
  note: textInputOptional(HOLD_NOTE_MAX),
})

/** `PATCH …/:code/hold` — absent keeps, `''` or `null` clears the note. */
export const HoldPatchBody = z
  .object({
    until: Day.optional(),
    note: z
      .string('Ô này phải là chữ.')
      .max(HOLD_NOTE_MAX, `Tối đa ${HOLD_NOTE_MAX} ký tự.`)
      .transform(collapseSpaces)
      .transform((s): string | null => (s === '' ? null : s))
      .nullish(),
  })
  .refine((p) => p.until !== undefined || p.note !== undefined, {
    message: 'Không có gì để sửa.',
  })

/** `POST /sales/leads/:code/hold/end`. `waiting` runs the nurture door, so it
 *  carries that door's body (`LeadNurtureBody` = the stop body). */
export const LeadHoldEndBody = z.discriminatedUnion('to', [
  z.object({ to: z.literal('resume') }),
  OpportunityStopBody.safeExtend({ to: z.literal('waiting') }),
])

/** `POST /sales/opportunities/:code/hold/end`. Giving up on a held deal is the
 *  stop door, which ends the hold itself — so `resume` is the only way out here. */
export const OpportunityHoldEndBody = z.object({ to: z.literal('resume') })

/** `GET /sales/holds` — one list for both kinds, scoped like each book. */
export const HoldListQuery = z.object({
  subject: z.enum(['lead', 'opportunity', 'all']).default('all'),
})

/** One row of the list, sorted by `until` (nearest first). `name` is the lead's
 *  contact or the deal's name; `customer` the company. `stepLabel` is the
 *  lead's `LEAD_STATE_LABEL` or the deal's stage label, resolved server-side. */
export const HoldRow = Hold.extend({
  name: textInput(200),
  customer: textInput(200),
  holder: WorkstreamHolder.nullable(),
  stepLabel: z.string().min(1),
})

export const HoldListResponse = z.object({ rows: z.array(HoldRow) })

export type HoldSubjectType = z.infer<typeof HoldSubjectType>
export type HoldEndKind = z.infer<typeof HoldEndKind>
export type Hold = z.infer<typeof Hold>
export type HoldSetBody = z.infer<typeof HoldSetBody>
export type HoldPatchBody = z.infer<typeof HoldPatchBody>
export type LeadHoldEndBody = z.infer<typeof LeadHoldEndBody>
export type OpportunityHoldEndBody = z.infer<typeof OpportunityHoldEndBody>
export type HoldListQuery = z.infer<typeof HoldListQuery>
export type HoldRow = z.infer<typeof HoldRow>
export type HoldListResponse = z.infer<typeof HoldListResponse>
