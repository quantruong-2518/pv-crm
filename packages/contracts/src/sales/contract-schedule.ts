import { z } from 'zod'
import { ContractCode, Moment, intFromQuery } from '../primitives'
import {
  CONTRACT_INSTALLMENTS_MAX,
  ContractDetailRow,
  InstallmentConditionRow,
  InstallmentDraft,
  InstallmentRecordRow,
} from './contract'

/** Write doors on a signed contract's schedule (ADR 0090).
 *  `I` = `/sales/contracts/:code/installments`.
 *
 *      PUT    I                           `contract.edit` · scoped
 *      POST   I/:no/paid                  `contract.record-payment` · scoped
 *      DELETE I/:no/paid                  same · only whoever recorded it · no body
 *      POST   I/:no/records               `contract.edit` or `contract.record-payment` · scoped
 *      POST   I/:no/conditions            `contract.edit` · scoped
 *      POST   I/:no/conditions/:id/done   same · no body
 *
 *  Every door answers `ContractScheduleResponse` — the whole contract re-read,
 *  so no screen patches a schedule it has cached. Rules that need the stored row
 *  (paid installments, the contract's amount and signing day) are the server's. */

const installmentNo = intFromQuery.pipe(z.number().int().positive('Số đợt sai dạng.'))

export const ContractInstallmentParams = z.object({ code: ContractCode, no: installmentNo })
export const ContractConditionParams = ContractInstallmentParams.extend({ id: z.uuid() })

/** One line of the replace body. `no` names an existing UNPAID installment to
 *  keep (its conditions, reminders and files stay with it); absent = a new one. */
export const InstallmentEdit = InstallmentDraft.extend({
  no: z.number().int().positive().optional(),
})

/** `PUT I` — the unpaid installments become exactly this list: a line with `no`
 *  updates that installment, a line without adds one, an unpaid installment the
 *  list omits is deleted; paid ones stay. The server refuses unless paid + these
 *  shares total 100 and the amounts total the contract's value. */
export const ContractInstallmentsBody = z.object({
  installments: z.array(InstallmentEdit).max(CONTRACT_INSTALLMENTS_MAX, 'Tối đa 24 đợt.'),
})

/** `POST I/:no/paid`. The server keeps `paidAt` between the signing day and today. */
export const InstallmentPaidBody = z.object({ paidAt: Moment })

/** `POST I/:no/records` — one reminder already made. `what` is what was said,
 *  `detail` what came of it; `at` absent = now. */
export const InstallmentRecordBody = InstallmentRecordRow.pick({
  channel: true,
  what: true,
  detail: true,
}).extend({ at: Moment.optional() })

/** `POST I/:no/conditions` — one unlock line. Marking it done carries no body. */
export const InstallmentConditionBody = InstallmentConditionRow.pick({
  side: true,
  what: true,
  due: true,
  who: true,
})

export const ContractScheduleResponse = ContractDetailRow

export type ContractInstallmentParams = z.infer<typeof ContractInstallmentParams>
export type ContractConditionParams = z.infer<typeof ContractConditionParams>
export type InstallmentEdit = z.infer<typeof InstallmentEdit>
export type ContractInstallmentsBody = z.infer<typeof ContractInstallmentsBody>
export type InstallmentPaidBody = z.infer<typeof InstallmentPaidBody>
export type InstallmentRecordBody = z.infer<typeof InstallmentRecordBody>
export type InstallmentConditionBody = z.infer<typeof InstallmentConditionBody>
export type ContractScheduleResponse = z.infer<typeof ContractScheduleResponse>
