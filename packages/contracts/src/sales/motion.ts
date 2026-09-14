import { z } from 'zod'
import { RoleId } from '../auth'
import { LeadMotion } from './enums'

/** What each of the six lead motions DECLARES about itself.
 *
 *      GET   /sales/config/motions            permission `config.view`
 *      PATCH /sales/config/motions/:motion    permission `config.propose` → 202
 *
 *  ------------------------------------------------------------------
 *  A MOTION IS A LABEL UNTIL IT DECLARES THESE
 *  ------------------------------------------------------------------
 *  `LeadMotion` is written at every intake door and then nothing downstream
 *  reads it: `HANDOFF_SLA` is flat — two stages, three days each, identical for
 *  all six — and its own comment admits what was lost, that the documented
 *  targets were in MINUTES and HOURS and the frozen book only kept days. There
 *  is no assignment rule per motion, and `IntakeTrust` blocks nothing.
 *
 *  `docs/tam-nhin-pipeline-toan-he.md` §5 names the four things a motion must
 *  declare before it is behaviour rather than a label, and this is that list,
 *  one field each. Nothing more: a fifth field nobody asked for is a column
 *  every motion would have to leave empty forever.
 *
 *  ------------------------------------------------------------------
 *  EVERY FIELD IS NULLABLE, AND NULL MEANS "NOBODY HAS DECIDED YET"
 *  ------------------------------------------------------------------
 *  Not "no limit", not "allowed", not "false". §8.5 of the same document says
 *  the numbers do not exist yet and must not be invented, so the shape says so
 *  too: a screen draws it as undeclared, and a rule that reads a `null` must refuse
 *  to act rather than fall back to a default nobody agreed to. A default here
 *  would be exactly the invented number the document forbids, only harder to
 *  find later.
 *
 *  The two return paths that never enter the lead book — expansion and renewal,
 *  which start at P4 and P5 — are deliberately absent. They have no first
 *  touch, no intake and no MQL gate, so a row for them would be four empty
 *  fields pretending to be a policy. */

/** How long after arrival the first human contact is due.
 *
 *  MINUTES at rest, one unit, because this number gets compared: an inbound
 *  target of 30 minutes and an outbound one of 3 days have to sort. The screen
 *  writes and reads it in the largest unit that divides evenly, which is how
 *  §6·A's "deadlines in real units" is honoured without storing the unit beside
 *  the number — two columns that can disagree about one fact.
 *
 *  Cap: 90 days. Not a policy, a typo fence — somebody entering days into a
 *  minutes box is the mistake this catches. */
export const FirstTouchMinutes = z.number().int().positive().max(129_600)

/** The three units a first-touch deadline is ever written in, with the words a
 *  screen prints. Vietnamese because they are labels; the machine keeps
 *  minutes.
 *
 *  Here rather than on either end, because BOTH ends need the same answer: the
 *  screen fills its input and its unit select, and the server writes the
 *  sentence the approver reads. Two copies of this rule is how one side starts
 *  saying "1 day" while the other says "1440 minutes" about the same row. */
export const FIRST_TOUCH_UNITS = [
  { unit: 'minute', label: 'phút', minutes: 1 },
  { unit: 'hour', label: 'giờ', minutes: 60 },
  { unit: 'day', label: 'ngày', minutes: 1440 },
] as const

export type FirstTouchUnit = (typeof FIRST_TOUCH_UNITS)[number]['unit']

/** Minutes → the largest unit that divides them evenly.
 *
 *  30 stays 30 minutes, 120 reads as 2 hours, 1440 as 1 day. Somebody who
 *  typed 60 minutes is shown 1 hour — the same fact, and the price of keeping
 *  ONE number at rest instead of a value and a unit that can disagree. */
export function splitFirstTouch(minutes: number): { value: number; unit: FirstTouchUnit } {
  for (const step of [...FIRST_TOUCH_UNITS].reverse()) {
    if (minutes % step.minutes === 0) return { value: minutes / step.minutes, unit: step.unit }
  }
  return { value: minutes, unit: 'minute' }
}

/** The other direction, for a screen that has a number and a unit in hand. */
export function firstTouchToMinutes(value: number, unit: FirstTouchUnit): number {
  return value * (FIRST_TOUCH_UNITS.find((u) => u.unit === unit)?.minutes ?? 1)
}

export const MotionPolicy = z.object({
  motion: LeadMotion,

  /** §5, first of the four: how long until the first human contact is due. */
  firstTouchMinutes: FirstTouchMinutes.nullable(),

  /** §5, second: who receives it. A ROLE, never a person — a rule that names a person
   *  stops being true the day they change desks, and the assignment door
   *  resolves the role to whoever holds it at that moment. */
  ownerRoleId: RoleId.nullable(),

  /** §5, third: what may be done at once and what must wait, in the one
   *  concrete form the document states — `referral` is never pushed into cold mail
   *  campaign, `outbound` needs a reason to open the conversation and passes
   *  `suppression` first. So: may a lead from this motion enter a cold
   *  campaign at all. */
  coldMailAllowed: z.boolean().nullable(),

  /** §5, fourth: the gate up to `mql`. `INIT_DATA_QUESTIONS` already settled
   *  that the gate is "the six required boxes are filled"; what nobody has
   *  answered is whether a form the customer filled in themselves counts as
   *  having passed it. That is this field, and it is a real question rather
   *  than a setting: `inbound` and `event` can arrive fully self-described,
   *  `outbound` never does. */
  selfServeCountsAsInitData: z.boolean().nullable(),
})

export const MotionPolicyResponse = z.object({ rows: z.array(MotionPolicy) })

/** One motion's declaration, changed.
 *
 *  Absent means "leave it alone", `null` means "un-declare it". The two are
 *  different answers and the wire has to keep them apart: a screen clearing a
 *  box is saying nobody has decided, which is not the same as a screen that did
 *  not send that box at all.
 *
 *  Nothing is applied by this door. `config.propose` is the only permission
 *  that exists here — there is no `config.edit` anywhere in the matrix — so the
 *  answer is a receipt for a request in the One inbox, and the change lands
 *  when somebody approves it. */
export const MotionPolicyPatch = z
  .object({
    firstTouchMinutes: FirstTouchMinutes.nullable().optional(),
    ownerRoleId: RoleId.nullable().optional(),
    coldMailAllowed: z.boolean().nullable().optional(),
    selfServeCountsAsInitData: z.boolean().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Không có ô nào được gửi lên.',
  })

export type MotionPolicy = z.infer<typeof MotionPolicy>
export type MotionPolicyResponse = z.infer<typeof MotionPolicyResponse>
export type MotionPolicyPatch = z.infer<typeof MotionPolicyPatch>
