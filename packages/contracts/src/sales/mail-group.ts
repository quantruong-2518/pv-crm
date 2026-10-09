import { z } from 'zod'
import { ContractCode, ObjectCode, Moment, textInput } from '../primitives'
import {
  MAIL_SUBJECT_MAX,
  MailCta,
  MailRunCreator,
  MailRunId,
  MailTemplateCode,
  MasRecipientBlock,
  MasSendResponse,
  mailBody,
} from './mail'
import { MailSubjectKind, MailTransport } from './mail-door'

/** Group mail — ONE letter every recipient sees in To/CC, from a detail door.
 *
 *    POST /sales/mail/letters/preflight  who of these contacts would receive it
 *    POST /sales/mail/letters/preview    render it; answers `MasPreviewResponse`
 *    POST /sales/mail/letters            file the run and queue the letter
 *    GET  /sales/{leads,opportunities,contracts}/:code/letters  activity line
 *
 *  The POSTs are `lead.send-email`, scoped on the subject's lead; the timeline
 *  is one route per view permission (ADR 0004). Recipients are contact CODES
 *  and colleague ACTOR IDS, never addresses — the server resolves both and
 *  checks suppression on what it trusts. `sales@` is CC'd server-side (G7).
 *  A 1:1 correspondence: no booking link, waves, attachments, List-Unsubscribe
 *  or open/click tracking (G6). Spec: canvas row G, 28/09/2026. */

/** Addresses on one message, `SALES_INBOX` included. The provider refuses a
 *  message past 50 recipients, and a group letter cannot be split into waves. */
export const MAIL_GROUP_MAX_ADDRESSES = 50

const unique = (xs: readonly string[]) => new Set(xs).size === xs.length

const contactCodes = z
  .array(ObjectCode)
  .min(1, 'Chưa có người nhận')
  .refine(unique, 'Người nhận bị lặp')

/** A contract code starts with a non-ASCII letter, which `ObjectCode` refuses
 *  (it is `A-Z` only); the door says which of the two the code must be. */
const SubjectCode = z.union([ObjectCode, ContractCode], 'Mã đối tượng sai dạng')
const fitsDoor = (v: { door: MailSubjectKind; subjectCode: string }) =>
  (v.door === 'contract') === v.subjectCode.startsWith('HĐ-')
const DOOR_MISMATCH = { message: 'Mã đối tượng không khớp nơi gửi', path: ['subjectCode'] }

/** The contacts a letter is addressed to, and the object it is about. The
 *  server checks every contact belongs to the subject's company — a code is
 *  not an address the client may pick freely. Left unrefined because zod 4
 *  throws on `.extend` of a refined object: each request below extends this
 *  and adds `fitsDoor` last. */
const MailGroupAddressing = z.object({
  door: MailSubjectKind,
  subjectCode: SubjectCode,
  to: contactCodes,
})

export const MailGroupPreflightRequest = MailGroupAddressing.refine(fitsDoor, DOOR_MISMATCH)

/** The group verdicts: `EXITED` is a lead-level fact the detail door already
 *  shows, so only the three per-address reasons apply. */
export const MailGroupBlock = MasRecipientBlock.extract(['NO_EMAIL', 'SUPPRESSED', 'DUPLICATE'])

export const MailGroupRecipient = z.object({
  contactCode: ObjectCode,
  name: z.string().min(1),
  email: z.string().min(1).optional(),
  /** Absent = will receive. Same convention as `MasRecipient.block`. */
  block: MailGroupBlock.optional(),
  /** Why the address is suppressed — one `SuppressionReason` of the platform
   *  ledger, opaque here for the reason `LeadMailTimelineRow.deliveryState`
   *  gives. Present only with `block: 'SUPPRESSED'`. */
  suppressedReason: z.string().min(1).optional(),
})

/** Blocked contacts are dropped from the letter, not fatal (decision 4); the
 *  composer locks Send only when `sendable` is 0. */
export const MailGroupPreflightResponse = z.object({
  recipients: z.array(MailGroupRecipient),
  sendable: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  /** The mailbox the letter will show as From; the client never picks it.
   *  `remainingToday` is the Gmail daily address allowance, null on Resend. */
  sender: z.object({
    transport: MailTransport,
    address: z.string().min(1),
    remainingToday: z.number().int().min(0).nullable(),
  }),
})

export const MailGroupSendRequest = MailGroupAddressing.extend({
  /** Minted by the composer when it opens; a retried POST with the same id
   *  answers with the run it already filed instead of mailing the customer twice. */
  letterId: z.uuid(),
  /** Colleagues copied in; the server resolves their mailboxes. */
  ccActorIds: z.array(z.string().min(1).max(64)).refine(unique, 'Người CC bị lặp'),
  templateCode: MailTemplateCode.optional(),
  subject: textInput(MAIL_SUBJECT_MAX),
  body: mailBody,
  /** Absent = no button, exactly as `MasSendRequest.cta`. */
  cta: MailCta.optional(),
  /** Absent = send now. Compared against the server's clock, not here. */
  scheduledAt: Moment.optional(),
})
  .refine((v) => v.to.length + v.ccActorIds.length + 1 <= MAIL_GROUP_MAX_ADDRESSES, {
    message: `Một thư tối đa ${MAIL_GROUP_MAX_ADDRESSES} địa chỉ, tính cả hộp thư chung`,
    path: ['to'],
  })
  .refine(fitsDoor, DOOR_MISMATCH)

/** Preview of a group letter, answered with `MasPreviewResponse`:
 *  `{{contactName}}` is filled from the FIRST `to` contact — everyone reads one
 *  copy, so there is exactly one name to show. */
export const MailGroupPreviewRequest = MailGroupAddressing.extend({
  subject: textInput(MAIL_SUBJECT_MAX),
  body: mailBody,
  cta: MailCta.optional(),
}).refine(fitsDoor, DOOR_MISMATCH)

/** `skipped` counts the blocked `to` contacts the send re-checked and dropped. */
export const MailGroupSendResponse = MasSendResponse.pick({
  mailRunId: true,
  queued: true,
  skipped: true,
  state: true,
})

// ---------------------------------------------------------------------------
// The subject's activity line (G8)
// ---------------------------------------------------------------------------

/** What ONE letter line on a timeline says. Folded server-side from the run
 *  state, the delivery ledger and engagement, strongest fact first: bounced ›
 *  replied › opened › sent for a letter that left; cancelled › scheduled ›
 *  sending for one that did not. A GROUP letter is never `OPENED` — it records
 *  no open/click (owner decision) — and "replied" means ANY recipient did;
 *  `OPENED` comes only from a bulk letter filed on the same subject. */
export const MailLetterState = z.enum(
  ['SCHEDULED', 'SENDING', 'SENT', 'OPENED', 'REPLIED', 'BOUNCED', 'SUPPRESSED', 'CANCELLED'],
  'Trạng thái thư không có trong danh sách',
)

export const MAIL_LETTER_STATE_LABEL = {
  SCHEDULED: 'Hẹn giờ',
  SENDING: 'Đang gửi',
  SENT: 'Đã gửi',
  OPENED: 'Đã mở',
  REPLIED: 'Đã trả lời',
  BOUNCED: 'Bị trả lại',
  /** Never left: every address was on the suppression list at send time. */
  SUPPRESSED: 'Bị chặn',
  CANCELLED: 'Đã huỷ',
} as const satisfies Record<z.infer<typeof MailLetterState>, string>

/** An address as the ledger posted it; `name` absent for a shared mailbox. */
export const MailAddressee = z.object({
  name: z.string().min(1).optional(),
  email: z.string().min(1),
})

export const MailSubjectTimelineRow = z.object({
  runId: MailRunId,
  subject: z.string().min(1),
  state: MailLetterState,
  scheduledAt: Moment.optional(),
  sentAt: Moment.optional(),
  to: z.array(MailAddressee),
  cc: z.array(MailAddressee),
  createdBy: MailRunCreator,
  /** The caller filed this run. Server-computed, like `MailRunRow.mine`. */
  mine: z.boolean(),
  /** Edit · Stop may show on this line: the caller created it (`mine`), it is
   *  still editable (scheduled, no letter left) and it is not a campaign wave.
   *  A broadcast holder edits the rest from the run book; `/own` re-checks. */
  canEdit: z.boolean(),
  transport: MailTransport,
  /** The bare mailbox frozen on the run when it was filed. */
  fromAddress: z.string().min(1),
  /** Non-null only for the run's creator: a Gmail thread id is per mailbox, so
   *  the link opens nothing for anyone else. */
  threadUrl: z.url().nullable(),
  /** The delivery's last readable error; the row had no other slot for it. */
  failureReason: z.string().nullable(),
})

/** Newest first, not paged — bounded by how often one object is written to. */
export const MailSubjectTimelineResponse = z.object({
  rows: z.array(MailSubjectTimelineRow),
})

export type MailGroupPreflightRequest = z.infer<typeof MailGroupPreflightRequest>
export type MailGroupBlock = z.infer<typeof MailGroupBlock>
export type MailGroupRecipient = z.infer<typeof MailGroupRecipient>
export type MailGroupPreflightResponse = z.infer<typeof MailGroupPreflightResponse>
export type MailGroupSendRequest = z.infer<typeof MailGroupSendRequest>
export type MailGroupPreviewRequest = z.infer<typeof MailGroupPreviewRequest>
export type MailGroupSendResponse = z.infer<typeof MailGroupSendResponse>
export type MailLetterState = z.infer<typeof MailLetterState>
export type MailAddressee = z.infer<typeof MailAddressee>
export type MailSubjectTimelineRow = z.infer<typeof MailSubjectTimelineRow>
export type MailSubjectTimelineResponse = z.infer<typeof MailSubjectTimelineResponse>
