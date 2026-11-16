import { z } from 'zod'
import { Day } from '../primitives'
import { RoleId } from '../auth'
import { OrgUnitKind } from '../platform/org-unit'
import { KpiMetricKey, KpiVerdict } from './kpi'
import { KpiGrade } from './kpi-score'

/** The per-role KPI desk (ADR 0159): the server decides which tabs a caller holds.
 *
 *      GET /sales/kpi/:period/desk?unit=       the unit tab: units the caller acts for + one unit's members
 *      GET /sales/kpi/:period/company/desk     the company tab: one row per unit, who is slipping
 *
 *  `units` empty means the tab is not drawn; `company` false means the same for the company tab.
 *  `unitId` is an org-unit id from `TIERED_FROM` and a roster team id before it,
 *  both uuids. `unit` absent selects the first of `units`. */

const actorId = z.string().min(1).max(64)
const name = z.string().min(1)
const unitId = z.uuid()

export const KpiDeskQuery = z.object({ unit: unitId.optional() })

/** `holder` heads the unit, `stand-in` acts for its head, `above` reads it from higher up (read-only). */
export const KpiDeskSeat = z.enum(['holder', 'stand-in', 'above'])

export const KpiDeskUnit = z.object({
  unitId,
  name,
  level: OrgUnitKind,
  seat: KpiDeskSeat,
  /** The head a stand-in acts for; on `above`, the unit's head. `null` on `holder`. */
  forName: name.nullable(),
  until: Day.nullable(),
})

/** A role's primary metric as read for a person or a unit total. */
export const KpiDeskPrimary = z.object({
  key: KpiMetricKey,
  value: z.number().nullable(),
  target: z.number().nonnegative().nullable(),
  verdict: KpiVerdict,
})

export const KpiDeskMember = z.object({
  actorId,
  name,
  role: RoleId,
  /** The newcomer's ramp factor (ADR 0156); `null` when not ramping. */
  rampFactor: z.number().min(0).max(1).nullable(),
  primary: KpiDeskPrimary.nullable(),
  coverage: z.number().nonnegative().nullable(),
  /** Under the floor on the real pipeline, even when `coverage` is hidden; `null` = no signed-value holder. */
  coverageLow: z.boolean().nullable(),
  lastScore: z.object({ score: z.number().nonnegative(), grade: KpiGrade }).nullable(),
  /** `null` when the person records no weekly commit. */
  forecastSaved: z.boolean().nullable(),
})

const count = z.number().int().nonnegative()

export const KpiDeskUnitView = z.object({
  unitId,
  members: z.array(KpiDeskMember),
  primary: KpiDeskPrimary.nullable(),
  coverage: z.number().nonnegative().nullable(),
  /** Under the floor on the real pipeline, even when `coverage` is hidden; `null` = no signed-value holder. */
  coverageLow: z.boolean().nullable(),
  lastAccuracy: z.number().min(0).max(1).nullable(),
  /** `null` while the month is not closed. */
  oneOnOnes: z.object({ written: count, acknowledged: count, total: count }).nullable(),
})

export const KpiDeskResponse = z.object({
  company: z.boolean(),
  units: z.array(KpiDeskUnit),
  unit: KpiDeskUnitView.nullable(),
})

export const KpiCompanyDeskUnit = z.object({
  unitId,
  name,
  headName: name.nullable(),
  standInName: name.nullable(),
  primary: KpiDeskPrimary.nullable(),
  coverage: z.number().nonnegative().nullable(),
  /** Under the floor on the real pipeline, even when `coverage` is hidden; `null` = no signed-value holder. */
  coverageLow: z.boolean().nullable(),
  averageScore: z.number().nonnegative().nullable(),
  /** `null` when the unit holds nobody who records a weekly commit. */
  forecastCommitted: z.boolean().nullable(),
  /** Two more of the unit's metrics beside the primary (ADR 0160 §10). */
  others: z.array(KpiDeskPrimary).max(2),
  /** The member furthest along their own primary target; `null` with no target set. */
  top: z.object({ actorId, name, percent: z.number().nonnegative() }).nullable(),
})

/** Every person with a primary target, by % of it, highest first (ADR 0160 §10,
 *  amends ADR 0159 §6). `percent` is `value ÷ target`, `null` while no value reads. */
export const KpiLeaderboardRow = z.object({
  actorId,
  name,
  unitName: name.nullable(),
  role: RoleId,
  primary: KpiDeskPrimary,
  percent: z.number().nonnegative().nullable(),
})

export const KpiCompanyDeskResponse = z.object({
  units: z.array(KpiCompanyDeskUnit),
  leaderboard: z.array(KpiLeaderboardRow),
  /** People behind on their primary metric, widest gap first. */
  slipping: z.array(
    z.object({ actorId, name, unitName: name.nullable(), gap: z.number().nonnegative() }),
  ),
  committed: z
    .object({
      amount: z.number().int().nonnegative(),
      accuracyLastMonth: z.number().min(0).max(1).nullable(),
    })
    .nullable(),
})

export type KpiDeskQuery = z.infer<typeof KpiDeskQuery>
export type KpiDeskSeat = z.infer<typeof KpiDeskSeat>
export type KpiDeskUnit = z.infer<typeof KpiDeskUnit>
export type KpiDeskPrimary = z.infer<typeof KpiDeskPrimary>
export type KpiDeskMember = z.infer<typeof KpiDeskMember>
export type KpiDeskUnitView = z.infer<typeof KpiDeskUnitView>
export type KpiDeskResponse = z.infer<typeof KpiDeskResponse>
export type KpiCompanyDeskUnit = z.infer<typeof KpiCompanyDeskUnit>
export type KpiLeaderboardRow = z.infer<typeof KpiLeaderboardRow>
export type KpiCompanyDeskResponse = z.infer<typeof KpiCompanyDeskResponse>
