import { z } from 'zod'
import { RoleId, RoleIds } from '../auth'
import {
  KpiMetricKey,
  KpiMonthClose,
  KpiPeriodKey,
  KpiPeriodParams,
  KpiPerson,
  KpiTargetActor,
  KpiVerdict,
} from './kpi'
import { KpiAllocation, KpiCounter, KpiCounterParams } from './kpi-allocation'

/** KPI teams (ADR 0101). `KpiTeamRef` lives in kpi-allocation.ts, which this
 *  file imports; the barrel exports both.
 *
 *      GET    /sales/kpi/teams?period=             `kpi.view`
 *      POST   /sales/kpi/teams                     `kpi.set-target`
 *      PUT    /sales/kpi/teams/:teamId             `kpi.set-target`
 *      DELETE /sales/kpi/teams/:teamId             `kpi.set-target`
 *      GET    /sales/kpi/:period/teams/:teamId     `kpi.view` · the team's lead or `kpi.view-all`
 *      PUT    …/:period/teams/:teamId/allocations/draft            the team's lead
 *      POST   …/:period/teams/:teamId/allocations/submit           the team's lead
 *      POST   …/:period/teams/:teamId/counters/:counterId/resolve  the team's lead
 *
 *  The roster is versioned by month: a write lands on `editableFrom`, the month
 *  after the last one anything was sent for, so a month handed down never shifts. */

const amount = z.number().nonnegative()
const actorId = z.string().min(1).max(64)
const teamId = z.uuid()

export const KpiTeamMember = z.object({
  actorId,
  name: z.string().min(1),
  roleIds: RoleIds,
  lead: z.boolean(),
})

export const KpiTeam = z.object({
  id: teamId,
  name: z.string().min(1),
  lead: KpiTargetActor,
  /** A locked lead's counters go to the target setters (ADR 0101 default 16). */
  leadLocked: z.boolean(),
  members: z.array(KpiTeamMember),
})

export const KpiTeamRosterQuery = z.object({ period: KpiPeriodKey })

export const KpiTeamRosterResponse = z.object({
  period: KpiPeriodKey,
  /** First month a team edit takes effect: the month after the last one anything
   *  was sent for, never before this month. */
  editableFrom: KpiPeriodKey,
  teams: z.array(KpiTeam),
  /** Eligible people in no team; filled only for a `kpi.view-all` caller. */
  unassigned: z.array(KpiTeamMember),
  myTeamId: teamId.nullable(),
  iLead: z.boolean(),
})

/** Answers for period `editableFrom`, so the screen needs no second read. */
export const KpiTeamWriteResponse = KpiTeamRosterResponse

export const KpiTeamBody = z
  .object({
    /* Every screen and bell already prefixes the team word, so it may not lead the name. */
    name: z
      .string()
      .trim()
      .min(1, 'Nhập tên nhóm.')
      .max(80, 'Tên nhóm tối đa 80 ký tự.')
      .refine((n) => !/^nhóm\s/iu.test(n), { message: 'Bỏ chữ "Nhóm" ở đầu tên.' }),
    leadId: z.string().min(1, 'Chọn trưởng nhóm.').max(64),
    memberIds: z
      .array(actorId)
      .min(1, 'Chọn ít nhất một thành viên.')
      .refine((m) => new Set(m).size === m.length, { message: 'Thành viên bị lặp.' }),
  })
  .refine((b) => b.memberIds.includes(b.leadId), {
    message: 'Chọn trưởng nhóm trong số thành viên.',
    path: ['leadId'],
  })

export const KpiTeamParams = KpiPeriodParams.extend({ teamId })
export const KpiTeamIdParams = z.object({ teamId })
export const KpiTeamCounterParams = KpiCounterParams.extend({ teamId })

/** One role-and-metric slice of the room's target given to the team. */
export const KpiTeamShare = z.object({ role: RoleId, metricKey: KpiMetricKey, value: amount })

/** `value` and `share` are `null` for a ratio, hours or days metric: members'
 *  figures do not add up, so the page shows members only. */
export const KpiTeamReading = z.object({
  role: RoleId,
  metricKey: KpiMetricKey,
  value: z.number().nullable(),
  share: amount.nullable(),
  expected: z.number().nonnegative().nullable(),
  verdict: KpiVerdict,
})

export const KpiTeamViewResponse = z.object({
  period: KpiPeriodKey,
  monthClose: KpiMonthClose,
  team: KpiTeam,
  /** The reader acts for the lead: the lead, or a stand-in while the lead is locked. */
  iLead: z.boolean(),
  shares: z.array(KpiTeamShare),
  readings: z.array(KpiTeamReading),
  people: z.array(KpiPerson),
  /** This team's live or last packages. */
  allocations: z.array(KpiAllocation),
  counters: z.array(KpiCounter),
})

export type KpiTeamMember = z.infer<typeof KpiTeamMember>
export type KpiTeam = z.infer<typeof KpiTeam>
export type KpiTeamRosterQuery = z.infer<typeof KpiTeamRosterQuery>
export type KpiTeamRosterResponse = z.infer<typeof KpiTeamRosterResponse>
export type KpiTeamWriteResponse = z.infer<typeof KpiTeamWriteResponse>
export type KpiTeamBody = z.infer<typeof KpiTeamBody>
export type KpiTeamParams = z.infer<typeof KpiTeamParams>
export type KpiTeamIdParams = z.infer<typeof KpiTeamIdParams>
export type KpiTeamCounterParams = z.infer<typeof KpiTeamCounterParams>
export type KpiTeamShare = z.infer<typeof KpiTeamShare>
export type KpiTeamReading = z.infer<typeof KpiTeamReading>
export type KpiTeamViewResponse = z.infer<typeof KpiTeamViewResponse>
