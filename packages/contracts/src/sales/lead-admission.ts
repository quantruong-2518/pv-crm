import { z } from 'zod'
import { Problem } from '../problem'
import { ObjectCode, email, phoneOptional, textInput } from '../primitives'
import { LEAD_MAX, taxCodeOptional } from './lead-fields'

/** Lead admission gate — one verdict per incoming lead, whatever door it uses.
 *
 *      POST /sales/leads/admission/check    permission `lead.edit` · read-only
 *
 *  The manual form, file import, image scan and landing form all ask the same
 *  server-side question and get one of five verdicts; each door then reacts in
 *  its own way. The check door only answers, it writes nothing.
 *
 *  A match outside the caller's scope reports `outOfScope` and drops the lead
 *  `code`: the caller learns "already in the book" and never whose customer it
 *  is. This file imports the field schemas from `./lead-fields` and
 *  `../primitives` rather than from `./lead`, which imports this file back. */

export const AdmissionVerdict = z.enum([
  'new-account',
  'same-lead',
  'new-contact',
  'returning-account',
  'needs-review',
])

export const ADMISSION_VERDICT_LABEL: Record<AdmissionVerdict, string> = {
  'new-account': 'Công ty mới',
  'same-lead': 'Đã có trong sổ',
  'new-contact': 'Người liên hệ mới của lead đang mở',
  'returning-account': 'Khách cũ quay lại',
  'needs-review': 'Chưa chắc trùng hay mới',
}

export const AdmissionMatchKey = z.enum([
  'tax-code',
  'email',
  'phone',
  'company-name',
  'email-domain',
  'person-name',
])

export const ADMISSION_MATCH_KEY_LABEL: Record<AdmissionMatchKey, string> = {
  'tax-code': 'Mã số thuế',
  email: 'Email',
  phone: 'Số điện thoại',
  'company-name': 'Tên công ty',
  'email-domain': 'Tên miền email',
  'person-name': 'Tên người liên hệ',
}

const AccountRef = z.object({ code: ObjectCode, name: z.string() })

/** A person can weigh a handful of look-alikes, not a page of them; the API
 *  cuts its list at the same number. */
export const ADMISSION_CANDIDATE_CAP = 10

/** `code` is optional on purpose: it is omitted when the lead is out of scope. */
const LeadRef = z.object({ code: ObjectCode.optional() })

export const AdmissionCandidate = z.object({
  account: AccountRef.nullable(),
  lead: LeadRef.nullable(),
  outOfScope: z.boolean(),
  matchedOn: z.array(AdmissionMatchKey),
})

export const AdmissionMatch = z.object({
  verdict: AdmissionVerdict,
  account: AccountRef.nullable(),
  lead: LeadRef.nullable(),
  outOfScope: z.boolean(),
  matchedOn: z.array(AdmissionMatchKey),
  /** Incoming people not yet on the matched lead. */
  newPeople: z.number().int().nonnegative(),
  /** Filled for `needs-review` only; same scope rule as `lead`. */
  candidates: z.array(AdmissionCandidate).max(ADMISSION_CANDIDATE_CAP),
})

export const AdmissionPerson = z.object({
  contactName: textInput(LEAD_MAX.contactName),
  email: email.optional(),
  phone: phoneOptional,
})

/** The company and people a lead form holds; same field schemas as `LeadCreate`. */
export const LeadAdmissionCheckBody = z.object({
  company: textInput(LEAD_MAX.company),
  taxCode: taxCodeOptional,
  people: z.array(AdmissionPerson).min(1).max(20),
})

export const LeadAdmissionCheckResponse = AdmissionMatch

/** What the form sends back with the create. `seen` is what the user looked at:
 *  the server re-decides under a lock and refuses if the book has moved on. */
export const AdmissionChoice = z.object({
  action: z.enum(['create-lead', 'add-contact']),
  seen: z.object({
    verdict: AdmissionVerdict,
    leadCode: ObjectCode.optional(),
    accountCode: ObjectCode.optional(),
  }),
})

/** The 409 a door answers when it will not write without a choice. It carries
 *  the match for any client that reads it; the web form re-runs the check
 *  instead, so its panel and its choice come from one read. */
export const AdmissionRefusal = Problem.extend({ admission: AdmissionMatch })

export type AdmissionVerdict = z.infer<typeof AdmissionVerdict>
export type AdmissionMatchKey = z.infer<typeof AdmissionMatchKey>
export type AdmissionCandidate = z.infer<typeof AdmissionCandidate>
export type AdmissionMatch = z.infer<typeof AdmissionMatch>
export type AdmissionPerson = z.infer<typeof AdmissionPerson>
export type LeadAdmissionCheckBody = z.infer<typeof LeadAdmissionCheckBody>
export type LeadAdmissionCheckResponse = z.infer<typeof LeadAdmissionCheckResponse>
export type AdmissionChoice = z.infer<typeof AdmissionChoice>
export type AdmissionRefusal = z.infer<typeof AdmissionRefusal>
