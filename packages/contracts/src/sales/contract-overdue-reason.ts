import { z } from 'zod'
import { ContractCode, Moment } from '../primitives'
import { KpiPeriodKey } from './kpi'

/** Why an overdue installment is overdue, and whether a head accepts it (ADR 0100).
 *  `I` = `/sales/contracts/:code/installments/:no`.
 *
 *      GET  I/overdue-reasons               `contract.view` · scoped
 *      POST I/overdue-reasons               `contract.view` · scoped · the contract's owner only
 *      POST /sales/overdue-reasons/:id/decide      `contract.approve-overdue-reason`
 *      GET  /sales/overdue-reasons?state=waiting&period=   same · month-close dialog
 *
 *  A reason explains ONE due date: `due` is the installment's due when it was
 *  written, so editing the due leaves the old row behind as `stale`. The writer
 *  never decides their own reason; the server answers 409. */

/** Same ceiling as the KPI counter's reason (kpi-allocation.ts). */
export const OVERDUE_REASON_TEXT_MAX = 500

const text = z
  .string()
  .trim()
  .min(1, 'Không được để trống.')
  .max(OVERDUE_REASON_TEXT_MAX, `Tối đa ${OVERDUE_REASON_TEXT_MAX} ký tự.`)

export const OverdueReasonState = z.enum(['waiting', 'approved', 'rejected'])

export const OVERDUE_REASON_STATE_LABEL: Record<z.infer<typeof OverdueReasonState>, string> = {
  waiting: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
}

export const OverdueReasonParams = z.object({ id: z.coerce.number().int().positive() })

export const OverdueReasonActor = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1),
})

export const OverdueReasonRow = z.object({
  id: z.number().int().positive(),
  contractCode: ContractCode,
  installmentNo: z.number().int().positive(),
  due: Moment,
  reason: z.string().min(1),
  writtenBy: OverdueReasonActor,
  writtenAt: Moment,
  state: OverdueReasonState,
  decidedBy: OverdueReasonActor.nullable(),
  decidedAt: Moment.nullable(),
  decisionNote: z.string().min(1).nullable(),
  /** Written against a due the installment no longer has, so it no longer applies. */
  stale: z.boolean(),
})

/** `current` judges the newest reason against the installment's present due:
 *  `stale` = the due moved since it was written, so it no longer applies. */
export const OverdueReasonCurrent = z.enum(['none', ...OverdueReasonState.options, 'stale'])

export const OverdueReasonListResponse = z.object({
  current: OverdueReasonCurrent,
  /** The server's own overdue rule, so the form never shows when the door would refuse. */
  canWrite: z.boolean(),
  reasons: z.array(OverdueReasonRow),
})

export const OverdueReasonBody = z.object({ reason: text })

export const OverdueReasonDecideBody = z
  .object({ decision: z.enum(['approve', 'reject']), note: text.optional() })
  .refine((v) => v.decision === 'approve' || v.note !== undefined, {
    message: 'Ghi lý do từ chối.',
    path: ['note'],
  })

/** `period` is the month being closed: reasons whose installment is due before
 *  that month ends. `state` is fixed to `waiting`, the only list anyone opens. */
export const OverdueReasonWaitingQuery = z.object({
  state: z.literal('waiting'),
  period: KpiPeriodKey,
})

export const OverdueReasonWaitingResponse = z.object({
  period: KpiPeriodKey,
  reasons: z.array(OverdueReasonRow),
})

export type OverdueReasonState = z.infer<typeof OverdueReasonState>
export type OverdueReasonParams = z.infer<typeof OverdueReasonParams>
export type OverdueReasonActor = z.infer<typeof OverdueReasonActor>
export type OverdueReasonRow = z.infer<typeof OverdueReasonRow>
export type OverdueReasonCurrent = z.infer<typeof OverdueReasonCurrent>
export type OverdueReasonListResponse = z.infer<typeof OverdueReasonListResponse>
export type OverdueReasonBody = z.infer<typeof OverdueReasonBody>
export type OverdueReasonDecideBody = z.infer<typeof OverdueReasonDecideBody>
export type OverdueReasonWaitingQuery = z.infer<typeof OverdueReasonWaitingQuery>
export type OverdueReasonWaitingResponse = z.infer<typeof OverdueReasonWaitingResponse>
