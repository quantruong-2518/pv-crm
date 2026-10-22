import { z } from 'zod'
import { Day, Moment } from '../primitives'
import { KpiTargetActor } from './kpi'

/** KPI absences and stand-ins (ADR 0117).
 *
 *      GET    /sales/kpi/absences                       `kpi.view`
 *      POST   /sales/kpi/absences                       self, or `kpi.set-target` for anyone
 *      PATCH  /sales/kpi/absences/:absenceId            same
 *      POST   /sales/kpi/absences/:absenceId/cancel     same, no body
 *      GET    /sales/kpi/absences/stand-ins?actorId=    `kpi.view`
 *
 *  Days are Vietnam days, both ends inclusive. Rules that need today or other
 *  absences (start not in the past, no overlap, stand-in eligible and not away)
 *  are the server's: the form cannot know them. */

const actorId = z.string().min(1).max(64)
const absenceId = z.string().min(1).max(64)

export const KpiAbsence = z.object({
  id: absenceId,
  actor: KpiTargetActor,
  fromDay: Day,
  toDay: Day,
  standIn: KpiTargetActor,
  declaredBy: KpiTargetActor,
  declaredAt: Moment,
  /** A cancelled absence ends at once (ADR 0117 default 2); the row stays for history. */
  cancelledAt: Moment.nullable(),
})

export const KpiAbsenceParams = z.object({ absenceId })

/** `actorId` absent = the caller is away. Self as stand-in is refused below only when
 *  `actorId` is given; the server refuses it for the caller's own absence. */
export const KpiAbsenceCreate = z
  .object({
    actorId: actorId.optional(),
    fromDay: Day,
    toDay: Day,
    standInId: z.string('Chọn người làm thay.').min(1, 'Chọn người làm thay.').max(64),
  })
  .refine((b) => b.fromDay <= b.toDay, {
    message: 'Ngày kết thúc không được trước ngày bắt đầu.',
    path: ['toDay'],
  })
  .refine((b) => b.actorId === undefined || b.standInId !== b.actorId, {
    message: 'Chọn người khác làm thay.',
    path: ['standInId'],
  })

/** Only the end moves: an absence already running cannot start later or earlier
 *  (ADR 0117 default 4). The server checks it stays on or after `fromDay` and today. */
export const KpiAbsenceUpdate = z.object({ toDay: Day })

/** Filtered server-side: the caller's own, the ones they stand in for, and every
 *  absence for a `kpi.set-target` holder. */
export const KpiAbsenceListResponse = z.object({ absences: z.array(KpiAbsence) })

/** `actorId` absent = candidates for the caller. */
export const KpiStandInCandidatesQuery = z.object({ actorId: actorId.optional() })

/** Who may stand in for that person (ADR 0117 §2); eligibility is the server's. */
export const KpiStandInCandidatesResponse = z.object({ candidates: z.array(KpiTargetActor) })

export type KpiAbsence = z.infer<typeof KpiAbsence>
export type KpiAbsenceParams = z.infer<typeof KpiAbsenceParams>
export type KpiAbsenceCreate = z.infer<typeof KpiAbsenceCreate>
export type KpiAbsenceUpdate = z.infer<typeof KpiAbsenceUpdate>
export type KpiAbsenceListResponse = z.infer<typeof KpiAbsenceListResponse>
export type KpiStandInCandidatesQuery = z.infer<typeof KpiStandInCandidatesQuery>
export type KpiStandInCandidatesResponse = z.infer<typeof KpiStandInCandidatesResponse>
