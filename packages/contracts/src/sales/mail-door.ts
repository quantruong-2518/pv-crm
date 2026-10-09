import { z } from 'zod'

/** Mail doors — WHERE a letter is composed from, which decides its mould (G1).
 *
 *  A detail door (lead · opportunity · quote · contract) opens the one-screen
 *  group composer; the lead/opportunity books open the three-step bulk mould;
 *  `campaign` is the campaign wave. Templates are tagged with the doors they
 *  serve and may be the default of a door (G4). Spec: canvas row G, 28/09/2026.
 *
 *  Lowercase values because they are the same words as `MasAudience.subjectType`
 *  and the object kinds, not a state machine. */
export const MailDoor = z.enum(
  ['lead', 'opportunity', 'quote', 'contract', 'campaign'],
  'Cửa gửi thư không có trong danh sách',
)

/** `quote` is reserved: the quote door and its PDF are out of this turn's scope,
 *  but the tag set must not need a migration when they land. */
export const MAIL_DOOR_LABEL = {
  lead: 'Lead',
  opportunity: 'Cơ hội',
  quote: 'Báo giá',
  contract: 'Hợp đồng',
  campaign: 'Chiến dịch',
} as const satisfies Record<z.infer<typeof MailDoor>, string>

/** Doors a template created without `doors` serves — where every pre-G4
 *  template already appears, so old rows and old callers keep their place. */
export const MAIL_DOOR_LEGACY = [
  'lead',
  'opportunity',
  'campaign',
] as const satisfies ReadonlyArray<z.infer<typeof MailDoor>>

/** The object a letter is written ABOUT — the detail doors that exist this turn.
 *  Keys the group composer, its preflight and the activity timeline (G8). */
export const MailSubjectKind = MailDoor.extract(['lead', 'opportunity', 'contract'])

/** The shared sales mailbox. CC'd server-side on every group letter (G7) and
 *  sent one archive copy per bulk run — its own delivery, not a BCC on a
 *  recipient's letter (G9). Never a request field, so no client can drop it or
 *  swap it for another address. */
export const SALES_INBOX = 'sales@pebblevina.com'

/** Only mailboxes on this domain may send a group letter through Gmail; any
 *  other linked account stays on the shared Resend sender. */
export const COMPANY_MAIL_DOMAIN = 'pebblevina.com'

/** Rolling window of the per-sender Gmail ceiling. One constant so the count
 *  query, the refusal message and the composer line cannot drift apart. */
export const MAIL_PERSONAL_WINDOW_HOURS = 24

/** Which pipe a run leaves through, frozen on the run at send click so a later
 *  link change can never silently change who the letter is from. */
export const MailTransport = z.enum(['resend', 'gmail'])

/** A door's tag set: unique, non-empty. Empty would make a template invisible
 *  in every picker while still `active` — retiring is `active: false`. */
export const MailDoorSet = z
  .array(MailDoor)
  .min(1, 'Chọn ít nhất một nơi dùng mẫu')
  .refine((ds) => new Set(ds).size === ds.length, 'Nơi dùng mẫu bị lặp')

/** `GET /sales/mail/templates?door=…` — the picker only lists what its door
 *  serves. Absent = every template (the template book). */
export const MailTemplateListQuery = z.object({
  door: MailDoor.optional(),
})

export type MailDoor = z.infer<typeof MailDoor>
export type MailSubjectKind = z.infer<typeof MailSubjectKind>
export type MailTransport = z.infer<typeof MailTransport>
export type MailTemplateListQuery = z.infer<typeof MailTemplateListQuery>
