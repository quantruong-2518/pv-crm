import { z } from 'zod'
import { textInput } from '../primitives'
import { ConfigCode, ConfigEntryCreate } from './config'
import { LEAD_OPEN_STATES, LeadState, StageKey } from './enums'
import { NEXT_STEP_TEXT_MAX, NextStepKind, StepTemplateId } from './next-step'

/** Journey frame — per-state next-step templates and the free-entry flag (ADR 0080).
 *
 *      GET   /sales/config/step-frame                    `config.view`
 *      POST  /sales/config/step-frame/templates          `config.propose` → 202
 *      PATCH /sales/config/step-frame/templates/order    `config.propose` → 202
 *      PATCH /sales/config/step-frame/templates/:id      `config.propose` → 202
 *      PATCH /sales/config/step-frame/rules              `config.propose` → 202
 *      GET   /sales/leads/:code/next-step/options          `lead.view`
 *      GET   /sales/opportunities/:code/next-step/options  `opportunity.view`
 *
 *  The state SETS stay closed enums; only the rules hanging on them are data.
 *  Every write answers `ConfigProposalReceipt`. The two picker doors exist
 *  because sellers hold no `config.view`, and are split by kind because a door
 *  carries one permission. A stage's deadline is NOT here: `limitDays` on `STAGE`. */

/** What a state answers when no rule row exists. The server resolves it into
 *  every read, so the web receives a boolean and never applies a default itself. */
export const FREE_ENTRY_DEFAULT = true

/** Open states only: the next-step doors refuse a lead outside the funnel, so
 *  a template on `converted` or `disqualified` could never be picked. */
export const StepLeadState = LeadState.extract(
  LEAD_OPEN_STATES,
  'Trạng thái lead không nhận bước tiếp theo',
)

/** A union on `kind`, so an opportunity can never carry a lead state. Kept as a
 *  FIELD on its owners: a union cannot be picked from or extended. */
export const StateAddress = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lead'), state: StepLeadState }),
  z.object({ kind: z.literal('opportunity'), state: StageKey }),
])

/** The schema itself, not a retyped 365: one typo fence for every day count. */
const DueDays = ConfigEntryCreate.shape.limitDays.unwrap()

export const StepTemplate = z.object({
  id: StepTemplateId,
  address: StateAddress,
  /** Copied into the step's `text` when picked, hence the same ceiling. */
  name: z.string().min(1).max(NEXT_STEP_TEXT_MAX),
  /** Required, unlike `NextStepSetBody.kindId`: the comm close-out door refuses
   *  a step with no kind, so a kindless template would fail the moment it is picked. */
  kindId: ConfigCode,
  /** Absent means nobody set one — the picker then leaves the date empty. */
  dueDays: DueDays.optional(),
  /** Order within ONE address, from 1. */
  ord: z.number().int().positive(),
  /** Off hides it from the picker; steps and touches already carrying it keep it. */
  active: z.boolean(),
})

export const StateRule = z.object({ address: StateAddress, freeEntry: z.boolean() })

/** `rules` holds one row per address, defaults already resolved; `templates`
 *  includes switched-off rows, since this is the screen that switches them back on. */
export const StepFrameResponse = z.object({
  templates: z.array(StepTemplate),
  rules: z.array(StateRule),
})

// ---------------------------------------------------------------------------
// THE PICKER'S READ — no `config.view`
// ---------------------------------------------------------------------------

/** `kind` carries its name because this reader cannot open the config bundle
 *  to look a `STEP_KIND` id up — the reason `NextStep.kind` does the same. */
export const StepTemplateOption = StepTemplate.pick({
  id: true,
  name: true,
  dueDays: true,
}).extend({ kind: NextStepKind })

/** Active templates only, in `ord`, for the state the object stands in NOW —
 *  the door is keyed by the object's code so the server resolves the state and
 *  a stale client cannot ask about another one. `address` is `null` for an
 *  object with no frame state (a deal off the board): no templates, free entry. */
export const StepOptionsResponse = z.object({
  address: StateAddress.nullable(),
  freeEntry: z.boolean(),
  templates: z.array(StepTemplateOption),
})

// ---------------------------------------------------------------------------
// PROPOSE — nothing below is applied until somebody approves it
// ---------------------------------------------------------------------------

export const StepTemplateParams = z.object({ id: StepTemplateId })

/** No `id`, `ord` or `active`: the server makes all three, as it does for a
 *  config entry. A new template lands last in its state, switched on. */
export const StepTemplateCreate = z.object({
  address: StateAddress,
  name: textInput(NEXT_STEP_TEXT_MAX),
  kindId: ConfigCode,
  dueDays: DueDays.optional(),
})

/** Absent leaves a field alone; `null` on `dueDays` clears it. `address` is not
 *  here: `ord` only means something inside one state. */
export const StepTemplatePatch = z
  .object({
    name: textInput(NEXT_STEP_TEXT_MAX).optional(),
    kindId: ConfigCode.optional(),
    dueDays: DueDays.nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'Không có trường nào để sửa',
  })

/** The FULL id list of one state in its new order, for the reason
 *  `ConfigOrderPatch` gives: a whole list is something the server can check. */
export const StepTemplateOrderPatch = z
  .object({ address: StateAddress, ids: z.array(StepTemplateId).min(1) })
  .refine((p) => new Set(p.ids).size === p.ids.length, {
    message: 'Có mã lặp lại trong thứ tự mới',
    path: ['ids'],
  })

/** The address rides in the body, so one door serves both kinds without a
 *  path that would have to validate a state against a kind. */
export const StateRulePatch = StateRule

export type StepLeadState = z.infer<typeof StepLeadState>
export type StateAddress = z.infer<typeof StateAddress>
export type StepTemplate = z.infer<typeof StepTemplate>
export type StateRule = z.infer<typeof StateRule>
export type StepFrameResponse = z.infer<typeof StepFrameResponse>
export type StepTemplateOption = z.infer<typeof StepTemplateOption>
export type StepOptionsResponse = z.infer<typeof StepOptionsResponse>
export type StepTemplateParams = z.infer<typeof StepTemplateParams>
export type StepTemplateCreate = z.infer<typeof StepTemplateCreate>
export type StepTemplatePatch = z.infer<typeof StepTemplatePatch>
export type StepTemplateOrderPatch = z.infer<typeof StepTemplateOrderPatch>
export type StateRulePatch = z.infer<typeof StateRulePatch>
