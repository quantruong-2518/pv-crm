import { z } from 'zod'
import { Moment, Bool, textInput } from '../primitives'
import { LeadOriginId } from './lead-origin'

/** The partner book — someone who SENDS us leads: a dealer, an integration
 *  partner, an old customer, an employee, an acquaintance. `sales.partner`.
 *
 *      GET   /sales/partners            `lead.view`
 *      POST  /sales/partners            `lead-origin.manage`
 *      PATCH /sales/partners/:code      `lead-origin.manage`
 *
 *  `code` (`REF-nnnn`) IS the id, minted by the server from a sequence — never
 *  chosen by the caller, same reason `LeadCreate` refuses its own `code`.
 *  `originId` names WHICH KIND of partner this is (dealer, old customer) and
 *  must be an origin offered under `REFERRAL` or `PARTNER` — that pairing is
 *  server-enforced, not a zod refinement, because it reads the live catalog. */

export const PartnerCode = z.string().regex(/^REF-\d{4,}$/, 'Mã đối tác sai dạng')
export type PartnerCode = z.infer<typeof PartnerCode>

export const Partner = z.object({
  code: PartnerCode,
  name: z.string().min(1),
  originId: LeadOriginId,
  active: z.boolean(),
  createdAt: Moment,
  updatedAt: Moment,
})
export type Partner = z.infer<typeof Partner>

export const PartnerListQuery = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  includeInactive: Bool.optional(),
})
export type PartnerListQuery = z.infer<typeof PartnerListQuery>

export const PartnerListResponse = z.object({ rows: z.array(Partner) })
export type PartnerListResponse = z.infer<typeof PartnerListResponse>

export const PARTNER_NAME_MAX = 120
const partnerName = textInput(PARTNER_NAME_MAX)

export const PartnerCreate = z.object({
  name: partnerName,
  originId: LeadOriginId,
})
export type PartnerCreate = z.infer<typeof PartnerCreate>

export const PartnerCreateResponse = Partner
export type PartnerCreateResponse = z.infer<typeof PartnerCreateResponse>

export const PartnerPatch = z
  .object({
    name: partnerName.optional(),
    originId: LeadOriginId.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Không có ô nào để sửa',
  })
export type PartnerPatch = z.infer<typeof PartnerPatch>

export const PartnerPatchResponse = Partner
export type PartnerPatchResponse = z.infer<typeof PartnerPatchResponse>
