import { z } from 'zod'
import { RoleIds } from '../auth'
import { MonthKey, textInput } from '../primitives'

/** The org tree — Company → Department → Team, versioned by month (ADR 0118).
 *
 *      GET    /platform/org?period=           `kpi.view`        (branch Sales)
 *      POST   /platform/org/units             `kpi.set-target`  (branch Sales)
 *      PATCH  /platform/org/units/:unitId     `kpi.set-target`
 *      DELETE /platform/org/units/:unitId     `kpi.set-target`
 *      PUT    /platform/org/members/:actorId  `kpi.set-target`
 *      DELETE /platform/org/members/:actorId  `kpi.set-target`
 *
 *  It lives under platform, not KPI, because visibility will read the same tree.
 *  Every write lands on `editableFrom` and answers with the tree there, as the
 *  KPI team roster does. Members are ids into `people`, so a name is sent once.
 *  The kind ladder is checked at the door; the database holds the rest. */

const actorId = z.string().min(1).max(64)
const unitId = z.uuid()

/* Values go into a Postgres CHECK, hence English. */
export const OrgUnitKind = z.enum(['company', 'department', 'team'])

export const OrgUnit = z
  .object({
    id: unitId,
    kind: OrgUnitKind,
    name: z.string().min(1).max(80),
    parentId: unitId.nullable(),
    headId: actorId.nullable(),
    memberIds: z.array(actorId),
  })
  .refine((u) => (u.parentId === null) === (u.kind === 'company'), { path: ['parentId'] })
  .refine((u) => u.headId === null || u.memberIds.includes(u.headId), { path: ['headId'] })

/** Who can be placed; the KPI team roster's person shape, declared here so a
 *  platform contract imports nothing from sales. */
export const OrgPerson = z.object({ actorId, name: z.string().min(1), roleIds: RoleIds })

export const OrgTreeQuery = z.object({ period: MonthKey })

export const OrgTreeResponse = z.object({
  period: MonthKey,
  /** The version in force for `period`; `null` before the tree's first month, where
   *  the old KPI team roster still answers and `units` is empty. With no version
   *  at all, `units` from `editableFrom` on is the seed the first write keeps. */
  fromPeriod: MonthKey.nullable(),
  /** The month an edit would land on now (ADR 0118 §5). */
  editableFrom: MonthKey,
  units: z.array(OrgUnit),
  people: z.array(OrgPerson),
})

/** The company comes with the version, one per version, so it is never created here. */
export const OrgUnitCreateBody = z.object({
  kind: OrgUnitKind.exclude(['company']),
  name: textInput(80),
  parentId: unitId,
})

export const OrgUnitUpdateBody = z
  .object({
    name: textInput(80).optional(),
    parentId: unitId.optional(),
    /** `null` clears the head; a new head must already be a member of the unit. */
    headId: actorId.nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'Không có gì để lưu.' })

/** Placing a person moves them: one unit per person per version. */
export const OrgMemberBody = z.object({ unitId, head: z.boolean().default(false) })

export const OrgUnitParams = z.object({ unitId })
export const OrgMemberParams = z.object({ actorId })

export type OrgUnitKind = z.infer<typeof OrgUnitKind>
export type OrgUnit = z.infer<typeof OrgUnit>
export type OrgPerson = z.infer<typeof OrgPerson>
export type OrgTreeQuery = z.infer<typeof OrgTreeQuery>
export type OrgTreeResponse = z.infer<typeof OrgTreeResponse>
export type OrgUnitCreateBody = z.infer<typeof OrgUnitCreateBody>
export type OrgUnitUpdateBody = z.infer<typeof OrgUnitUpdateBody>
export type OrgMemberBody = z.infer<typeof OrgMemberBody>
export type OrgUnitParams = z.infer<typeof OrgUnitParams>
export type OrgMemberParams = z.infer<typeof OrgMemberParams>
