import { z } from 'zod'
import { Moment, textInput } from '../primitives'
import { StageKey } from './enums'

/** Stage gate — exit criteria per opportunity stage, ticked per deal.
 *
 *  Moving forward from S to T needs every ACTIVE criterion of S and of every
 *  stage strictly between S and T ticked; signing counts as moving past the
 *  last stage. Create and import ENTER at T as if moving from the first stage,
 *  and a new deal has no ticks. Reopening a lost deal moves from the stage it
 *  was lost at. Backward moves and marking a deal lost are never gated.
 *
 *  A criterion added later applies to open deals at once. Ticks survive a
 *  backward move. Only an open deal (not signed, not lost) can be ticked.
 *
 *  A refusal is a 409 `Problem` whose `errors.criteria` lists the missing
 *  labels (an import rejects the row instead). */

/** One bound for the label on both ends, so the input cannot drift from the gate. */
export const STAGE_CRITERION_LABEL_MAX = 80

export const StageCriterion = z.object({
  id: z.string().min(1).max(64),
  stage: StageKey,
  label: textInput(STAGE_CRITERION_LABEL_MAX),
  ord: z.number().int().nonnegative(),
  active: z.boolean(),
})

/** `GET /sales/config/stage-criteria` — every row, inactive included, in
 *  stage ladder order then `ord`. */
export const StageCriterionListResponse = z.object({
  rows: z.array(StageCriterion),
})

/** `POST /sales/config/stage-criteria` → 202 `ConfigProposalReceipt`: a config
 *  change like any other, so it waits on the same E3 approval. */
export const StageCriterionCreate = z.object({
  stage: StageKey,
  label: textInput(STAGE_CRITERION_LABEL_MAX),
})

/** `PATCH /sales/config/stage-criteria/:id` → 202 `ConfigProposalReceipt`. No
 *  delete door, same as every config row: a criterion is switched off. */
export const StageCriterionPatch = z
  .object({
    label: textInput(STAGE_CRITERION_LABEL_MAX).optional(),
    active: z.boolean().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'Không có trường nào để sửa',
  })

/** One ACTIVE criterion as seen on one deal. `tickedBy` is the name as it read
 *  at tick time — snapshotted, not joined, like `OpportunityStageEvent.by`. */
export const GateCriterionState = z.object({
  id: z.string().min(1).max(64),
  label: textInput(STAGE_CRITERION_LABEL_MAX),
  tickedAt: Moment.nullable(),
  tickedBy: textInput(120).nullable(),
})

/** `PATCH /sales/opportunities/:code/criteria/:criterionId` — idempotent, so a
 *  double click cannot untick what the first click ticked. */
export const CriterionTick = z.object({
  ticked: z.boolean(),
})

export const CriterionTickResponse = GateCriterionState

/** `GET /sales/opportunities/:code/criteria` — the deal's own checklist, so the
 *  deal's owner can tick without holding the run. Every stage with an active
 *  criterion, in ladder order; `stage` of the deal is null once it is closed. */
export const OpportunityGate = z.object({
  stage: StageKey.nullable(),
  stages: z.array(z.object({ stage: StageKey, criteria: z.array(GateCriterionState) })),
})

export type StageCriterion = z.infer<typeof StageCriterion>
export type StageCriterionListResponse = z.infer<typeof StageCriterionListResponse>
export type StageCriterionCreate = z.infer<typeof StageCriterionCreate>
export type StageCriterionPatch = z.infer<typeof StageCriterionPatch>
export type GateCriterionState = z.infer<typeof GateCriterionState>
export type CriterionTick = z.infer<typeof CriterionTick>
export type CriterionTickResponse = z.infer<typeof CriterionTickResponse>
export type OpportunityGate = z.infer<typeof OpportunityGate>
