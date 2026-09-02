import { z } from 'zod'
import { MaObject, Moc, textNhap } from '../primitives'
import { PageQuery, paged, SortDir } from '../pagination'

/** MAS mail — sending ONE batch to many leads. `/sales/mail/*`.
 *
 *  ------------------------------------------------------------------
 *  THE UNIT IS A `mail_run`, AND EVERY NAME BELOW FOLLOWS FROM THAT
 *  ------------------------------------------------------------------
 *  A run is ONE act of sending: one subject, one body, one audience, one
 *  moment. Both doors into MAS produce exactly one:
 *
 *   · Quick MAS from the lead book — a bare `mail_run` and nothing else. The
 *     person picked rows, typed a subject, pressed send. No campaign is
 *     involved and none should be invented, for the same reason `LeadCreate`
 *     refuses to mint a campaign code (`./lead-source`): a campaign that
 *     appears in no campaign book is worse than no campaign.
 *   · A campaign send — the same `mail_run`, plus one `campaign_run` row
 *     joining it to the campaign. A campaign fires several times; the run is
 *     what makes "the third send" a thing with its own numbers.
 *
 *  So the campaign link is a nullable field on the way in (`campaignCode`) and
 *  a join on the way out, never a second schema. Two send shapes would be two
 *  places for one send to drift.
 *
 *  ------------------------------------------------------------------
 *  WHAT IS DELIBERATELY NOT IN THIS FILE
 *  ------------------------------------------------------------------
 *  The DELIVERY state of an individual letter — `pending` · `accepted` ·
 *  `delivered` · `bounced` · `suppressed` … — belongs to the platform mail
 *  ledger and is declared once, in `apps/api/src/platform/mail/mail.contract.ts`
 *  (`MAIL_STATES`). It is not redeclared here. That vocabulary is about ONE
 *  letter and one provider; everything in this file is about a BATCH. See
 *  `LeadMailTimelineRow.deliveryState` for how the two meet on the wire, and
 *  why they meet as an opaque string rather than as a copied enum.
 *
 *  Three axes, and keeping them apart is most of the value of this file:
 *
 *      MailRunState        what the BATCH is doing        (this file)
 *      MailState           whether ONE letter arrived     (platform ledger)
 *      MailEngagementKind  what the RECIPIENT did with it (this file)
 *
 *  Collapsing any two of them produces a status column that cannot answer
 *  "did it arrive" and "did anyone read it" at the same time. */

// ---------------------------------------------------------------------------
// The batch and its states
// ---------------------------------------------------------------------------

/** Where a run is in its own life. Five states, and the list is closed.
 *
 *  `CANCELLED` is not the same as an empty `SENT`: a run stopped by a person
 *  before it fired and a run that fired at nobody are two different facts, and
 *  only one of them is a mistake somebody should go look at.
 *
 *  `UPPER_SNAKE` because that is the naming law for enum VALUES (see
 *  `./enums`). These are keys — on the wire and in the column. */
export const MailRunState = z.enum(['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED'])

/** The display name of every run state — ONE table, both ends read it.
 *
 *  Same deliberate exception as `SOURCE_KIND_LABEL` in `./lead-source`, and for
 *  the same reason: this is not screen copy, it is the agreed NAME of each key,
 *  and the browser is not its only reader. The server renders these strings
 *  too — in the digest mail that reports what went out, and in the audit line
 *  that records who cancelled a run. Two copies of a five-row table is how
 *  "Đang gửi" and "Đang chạy" end up describing one value in two places.
 *
 *  Vietnamese, because these reach a user's eyes. Anything ABOUT a label — a
 *  tone, an icon, a shortened form for a narrow column — stays in the view
 *  layer. */
export const MAIL_RUN_STATE_LABEL = {
  DRAFT: 'Nháp',
  SCHEDULED: 'Đã hẹn giờ',
  SENDING: 'Đang gửi',
  SENT: 'Đã gửi',
  CANCELLED: 'Đã huỷ',
} as const satisfies Record<z.infer<typeof MailRunState>, string>

/** What the RECIPIENT did with a letter. The vocabulary of `mail_event.kind`.
 *
 *  ------------------------------------------------------------------
 *  A DIFFERENT AXIS FROM `MailState`, AND THE DIFFERENCE IS THE POINT
 *  ------------------------------------------------------------------
 *  `MailState` (platform ledger) answers "did the letter get there". This
 *  answers "did the person do something with it". They are independent: a
 *  `delivered` mail with no engagement is the normal case, and an `OPEN` on a
 *  mail whose delivery webhook never arrived happens whenever events land out
 *  of order.
 *
 *  Bounce and complaint are NOT in this list even though `mail_event` will
 *  carry rows for them. They are already `MailState` values (`bounced`,
 *  `complained`) — facts about the letter, decided by the receiving server, not
 *  by a human. Putting them here as well creates two answers to "did this
 *  bounce", and the two start disagreeing the first time a webhook is replayed.
 *
 *  `UNSUBSCRIBE` is here rather than in `MailState` for the mirror reason: a
 *  person clicking unsubscribe is a deliberate act, and the letter that carried
 *  the link arrived perfectly well. What it PRODUCES — a row in
 *  `platform.email_suppression` — is what stops the next send. */
export const MailEngagementKind = z.enum(['OPEN', 'CLICK', 'UNSUBSCRIBE'])

/** Id of one `mail_run`. A UUID, matching `email_delivery.mail_run_id` in
 *  `platform/mail/mail.schema.ts` — the foreign key that ties every letter back
 *  to the batch it went out with.
 *
 *  Not a `MaObject`: `LD-0042`-style codes are minted for things a person says
 *  out loud and types into a search box. Nobody says a run id out loud — a run
 *  is identified on screen by its `label` and its date. Declared once here
 *  because three schemas below carry it, and three hand-written `z.string()`
 *  are three chances for one of them to start accepting anything. */
export const MailRunId = z.uuid('Mã lô gửi phải là UUID')

// ---------------------------------------------------------------------------
// Templates — pre-filled text, not a rendering engine
// ---------------------------------------------------------------------------

/** Code of a mail template — `'mas-edge-ai-intro'`.
 *
 *  A short ASCII slug rather than a `MaObject`, and the difference is what the
 *  value is FOR: a template code is written into `email_delivery.template` and
 *  read by the composer registry to pick a renderer, so it is a name in code,
 *  not a row number a user reads. `MAS-0007` tells whoever is debugging a
 *  wrongly-rendered mail nothing at all.
 *
 *  Lowercase, unaccented, hyphen-separated — the identifier law from the top of
 *  `../primitives`. It travels in URLs and in a Postgres `text` column that the
 *  transactional path already fills with `'lead-intake-internal'`; this keeps
 *  one spelling convention across both. */
export const MailTemplateCode = z
  .string('Mã mẫu mail là bắt buộc')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Mã mẫu chỉ gồm chữ thường, số và dấu nối')
  .max(64, 'Mã mẫu tối đa 64 ký tự')

/** One row of the template list. READ side — `GET /sales/mail/templates`.
 *
 *  `subject` and `body` travel with the row rather than being fetched one
 *  template at a time, because that is exactly what the compose panel does with
 *  them: picking a template pre-fills two fields that the user then edits by
 *  hand. A second round trip per pick would make choosing a template feel like
 *  loading a page, for two strings totalling a few hundred bytes.
 *
 *  Template vẫn là TEXT, không giữ React hay renderer, nhưng text được phép
 *  mang biến trộn `{{account}}` và `{{contact_name}}`. Panel preview bằng dữ
 *  liệu một lead; worker thay biến lại cho TỪNG delivery từ snapshot `merge`.
 *  Hai alias cũ `company`/`contactName` vẫn được giữ để template đã lưu không
 *  hỏng khi tên hiển thị được chuẩn hóa theo ngôn ngữ sản phẩm.
 *
 *  `active: false` is the only form of deletion, matching `ConfigEntry` in
 *  `./config`: a run already sent points at its template, and a row that
 *  vanishes underneath it leaves the run unable to say what it sent. */
/** The button inside a letter — label and destination, together or not at all.
 *
 *  ------------------------------------------------------------------
 *  ONE OBJECT, BECAUSE HALF A CTA IS NOT A STATE
 *  ------------------------------------------------------------------
 *  `mail_run_cta_pair` and `mail_template_cta_pair` both accept the two columns
 *  or neither, and a wire shape able to express "label without url" is a shape
 *  that reaches Postgres and fails there instead of at the zod gate. Same
 *  argument `MailRunCreate.cta` already makes on the repository side.
 *
 *  ------------------------------------------------------------------
 *  `http`/`https` ONLY, AND THAT IS NOT PARANOIA ABOUT MAIL CLIENTS
 *  ------------------------------------------------------------------
 *  `z.url()` alone accepts `javascript:`, `data:` and `file:`. Mail clients
 *  strip those, so the risk is not really the letter — it is everything else
 *  that ends up rendering the same string: the review step of the compose
 *  panel, the run detail screen, any future web view of what was sent. A
 *  destination that is not a web address is not a call to action, and the one
 *  place to refuse it is the gate both ends share.
 *
 *  Declared once and used by BOTH the template row below and `MasSendRequest`,
 *  because the panel's whole job is to carry one into the other. */
export const MailCta = z.object({
  label: textNhap(80),
  url: z
    .url('Địa chỉ nút phải là một URL đầy đủ')
    .refine(
      (u) => /^https?:$/.test(new URL(u).protocol),
      'Địa chỉ nút phải bắt đầu bằng http/https',
    ),
})

export const MailTemplateRow = z.object({
  code: MailTemplateCode,
  /** NAME shown in the picker. A label — never a key. */
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  /** The template's suggested button, when it has one.
   *
   *  It travels with the row for the same reason `subject` and `body` do: the
   *  panel PRE-FILLS from it and the person then edits or clears it, and what
   *  finally goes out is what they posted back (`MasSendRequest.cta`). Before
   *  this field existed the server read the pair straight off the template at
   *  send time, which meant nobody ever reviewed the link in their own letter.
   *  A template with no CTA is ordinary — most letters are prose. */
  cta: MailCta.optional(),
  active: z.boolean(),
})

/** EVERY `{{key}}` A MAS LETTER MAY NAME. Four names, two values.
 *
 *  ------------------------------------------------------------------
 *  WHY THE LIST LIVES IN THE CONTRACT AND NOT BESIDE THE SUBSTITUTION
 *  ------------------------------------------------------------------
 *  Three places need to agree on it and they are in three packages:
 *
 *   · the server builds the merge map (`MasService.mergeOf`);
 *   · the server substitutes it (`platform/mail/mas-letter.ts`), where an
 *     unknown key becomes THE EMPTY STRING — the slot disappears without a
 *     trace, in a letter that cannot be recalled;
 *   · the compose panel warns about a typed key that is not on this list,
 *     which is the only moment a human can still fix it.
 *
 *  The third only became possible once the list was somewhere the browser can
 *  read. Before that the panel had no way to tell `{{contactName}}` from
 *  `{{contact-name}}`, and the second one is a blank space in two hundred
 *  letters. `mergeOf`'s return type is keyed off this array, so adding a name
 *  here without supplying its value is a compile error rather than a silent gap.
 *
 *  Two spellings per value on purpose: the seeded templates use one pair, the
 *  compose box's own hint text uses the other, and both are already in letters
 *  people have written. Accepting both costs two properties. */
export const MAIL_MERGE_KEYS = ['account', 'company', 'contactName', 'contact_name'] as const

export type MailMergeKey = (typeof MAIL_MERGE_KEYS)[number]

// ---------------------------------------------------------------------------
// Preflight — who would actually receive this, asked BEFORE anything is sent
// ---------------------------------------------------------------------------

/** Why a picked lead will NOT receive this run.
 *
 *  Four reasons, kept apart because they need four different actions from the
 *  person about to press send:
 *
 *   · `EXITED`     — the lead has left the funnel (`sales.lead.exit_reason`).
 *     Nothing to do: this is not a gap to fill or a block to appeal, it is a
 *     person we decided to stop pursuing.
 *   · `SUPPRESSED` — the address is in `platform.email_suppression`: it hard
 *     bounced, complained, or unsubscribed. Nobody may send there again, and
 *     nothing the sender does changes that.
 *   · `NO_EMAIL`   — the lead has no mailbox to send to. A gap in the data;
 *     someone can go fill it and the lead becomes sendable.
 *   · `DUPLICATE`  — two picked leads share one address. One letter goes out;
 *     this says which pick was folded into which, so a person is not left
 *     wondering why 40 leads produced 39 mails.
 *
 *  One combined "blocked" flag would leave all four looking identical on
 *  screen while only two of them are anybody's problem. */
export const MasRecipientBlock = z.enum(['EXITED', 'SUPPRESSED', 'NO_EMAIL', 'DUPLICATE'])

/** What each block reason is called. Same shared-label rule as
 *  `MAIL_RUN_STATE_LABEL` above — the preflight panel prints these, and so does
 *  the server-side send report. */
export const MAS_RECIPIENT_BLOCK_LABEL = {
  EXITED: 'Đã rơi khỏi phễu',
  SUPPRESSED: 'Đã chặn',
  NO_EMAIL: 'Thiếu email',
  DUPLICATE: 'Trùng địa chỉ',
} as const satisfies Record<z.infer<typeof MasRecipientBlock>, string>

/** One picked lead, as the preflight sees it.
 *
 *  `company` and `contactName` ride along so the panel can name a blocked lead
 *  without holding the book: the picks survive across pages, and by the time
 *  someone opens the compose panel the rows for page 1 may be long gone from
 *  the client. Sending back a bare code and "3 blocked" leaves the user with a
 *  number and no way to act on it.
 *
 *  `email` is OPTIONAL here even though `LeadRow.email` is required — that is
 *  the `NO_EMAIL` branch above, and it is deliberately defensive rather than
 *  merely mirrored. See the handover note; this contract does not want to be
 *  the thing that breaks the day a lead reaches the book without a mailbox. */
export const MasRecipient = z.object({
  leadCode: MaObject,
  company: z.string().min(1),
  contactName: z.string().min(1),
  /** Chức danh để người gửi phân biệt đúng người trước khi bấm gửi. */
  contactTitle: z.string().min(1).optional(),
  email: z.email().optional(),
  /** Absent = this one will be sent. Present = it will not, for this reason. */
  block: MasRecipientBlock.optional(),
})

/** Ceiling on one run's audience.
 *
 *  Exported because the SCREEN has to enforce it too — the lead book keeps
 *  picks across pages, so it is entirely possible to select more than this
 *  without noticing, and finding out at the send button means losing the
 *  composed mail. A ceiling that lives only in the browser is a suggestion
 *  (the endpoint is reachable without one), and a ceiling that lives only on
 *  the server is a trap; it has to be one number read by both.
 *
 *  200 rather than "as many as you like": past a couple of hundred recipients
 *  the right tool is a campaign with an audience definition, not a hand-picked
 *  list nobody can review before pressing send. */
export const MAS_MAX_RECIPIENTS = 200

/** The audience of one run, as picked. Declared once and reused by both bodies
 *  below — preflight and send must accept exactly the same list, or a batch can
 *  pass the preview and be refused at the send, which makes the preview not
 *  worth reading. (Same rule `LeadImportBody` follows for its two endpoints.) */
const leadCodes = z
  .array(MaObject)
  .min(1, 'Chưa chọn lead nào')
  .max(MAS_MAX_RECIPIENTS, `Một lô tối đa ${MAS_MAX_RECIPIENTS} lead`)

/** `POST /sales/mail/preflight` — a dry run that writes NOTHING.
 *
 *  Only the codes: the preflight is about the AUDIENCE, and the subject and
 *  body have no bearing on who can be written to. Keeping the composed text out
 *  of it also means the panel can run this the moment rows are picked, before
 *  anything is typed. */
export const MasPreflightRequest = z.object({
  leadCodes,
})

/** What the preflight answers with. Rows AND counts, and the redundancy is on
 *  purpose: the counts are what the send button prints ("Gửi cho 37 lead · 3 bị
 *  chặn"), the rows are what the expandable list shows when somebody asks which
 *  three. A response carrying only the counts gets trusted blindly or ignored;
 *  one carrying only the rows makes the button count them on every render. */
export const MasPreflightResponse = z.object({
  /** Every picked lead, blocked or not, so the panel can show one list with the
   *  blocked ones marked rather than two lists the user has to reconcile. */
  recipients: z.array(MasRecipient),
  /** How many letters would actually go out. Equals the number of recipients
   *  with no `block`. */
  sendable: z.number().int().nonnegative(),
  /** How many picks will produce no letter. */
  blocked: z.number().int().nonnegative(),

  /** Picks that came back in NO row at all — luật 7, the same word the lead
   *  book and the run list already use.
   *
   *  ------------------------------------------------------------------
   *  WITHOUT THIS NUMBER THE PANEL'S OWN ARITHMETIC LIES
   *  ------------------------------------------------------------------
   *  `recipients` carries one entry per pick the server could see, and a lead
   *  the scope axis cut is deliberately not one of them: `MasRecipient` requires
   *  `company` and `contactName`, so the only way to list it would be to print
   *  two fields this caller is not allowed to read (see `MasRepository.audience`).
   *  So it vanishes — and a person who ticked 40 rows reads "37 gửi được · 0 bị
   *  chặn" with no account of the other three.
   *
   *  `sendable + blocked + hidden` therefore equals the number of DISTINCT codes
   *  posted, which is the identity the panel prints. It absorbs both reasons a
   *  pick can produce no row, and they are not separable from here: a code the
   *  scope axis cut and a code naming no lead at all look identical to the
   *  query, and telling them apart on screen would itself confirm that a row
   *  exists — the enumeration this cut exists to prevent.
   *
   *  Note the word DISTINCT: the same code posted twice is one pick, folded
   *  before any of the three counters is computed. `MasSendResponse.skipped`
   *  measures against the raw list instead and absorbs the repeat there — the
   *  two identities answer two different questions and are not the same sum. */
  hidden: z.number().int().nonnegative(),

  /** How many of the picked leads came from `source_kind = 'APOLLO'` — a
   *  WARNING, and deliberately not a fourth `MasRecipientBlock`.
   *
   *  ------------------------------------------------------------------
   *  WHY THIS NUMBER EXISTS AT ALL
   *  ------------------------------------------------------------------
   *  Apollo rows are PURCHASED contact data, and Resend's Acceptable Use
   *  Policy (updated 27/08/2026) prohibits exactly that: "sending unsolicited
   *  messages of any kind, including cold outreach, purchased lists, or scraped
   *  contact data". The two hard ceilings underneath it are a bounce rate below
   *  4% and a complaint rate below 0.08%, and crossing either means the
   *  "account may be shut down without warning".
   *
   *  ACCOUNT level, not domain level — which is the part that decides where
   *  this field belongs. One bad marketing batch does not merely burn the
   *  marketing subdomain it went out on; it takes the whole Resend account with
   *  it, and the transactional pipeline (lead alerts, and every operational
   *  mail added later) rides that same account. A bought list of 200 addresses
   *  typically carries 10–30% dead mailboxes, i.e. 20–60 bounces, five to seven
   *  times the ceiling, from ONE send.
   *
   *  ------------------------------------------------------------------
   *  WHY IT WARNS AND DOES NOT BLOCK
   *  ------------------------------------------------------------------
   *  The project owner weighed this and decided to WARN rather than refuse
   *  (`docs/ban-giao-mas-mail.md`, "AUP của Resend"): the source label is
   *  internal data that never travels in the letter, Resend does not read
   *  labels — it measures bounces and complaints — and the judgement of whether
   *  a particular Apollo row was genuinely opted in belongs to the person
   *  pressing send, not to a `z.enum`. So this is the one place that number
   *  surfaces, and the machine-enforced half of the same decision lives
   *  elsewhere: the run-time bounce breaker (`PV_MAS_BOUNCE_CEILING_PERCENT`)
   *  and the batch ceiling (`PV_MAS_BATCH_MAX`).
   *
   *  Counted over EVERY row of `recipients`, blocked ones included, because it
   *  answers "where did this list come from" rather than "how many letters go
   *  out" — so it can legitimately exceed `sendable`. */
  apolloCount: z.number().int().nonnegative(),
})

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** The mail BODY. Normalised, but NOT through `textNhap` — and that exception
 *  is the whole reason this exists.
 *
 *  `textNhap` collapses every run of whitespace to a single space
 *  (`gomKhoangTrang`), which is exactly right for a name or a subject and
 *  destructive here: it turns
 *
 *      'Chào anh/chị,\n\nPebble Vina xin…'   into   'Chào anh/chị, Pebble Vina xin…'
 *
 *  Every paragraph break in every mass mail, silently, with nothing going red
 *  anywhere. A body is the one field in this product where a newline is
 *  content.
 *
 *  So it normalises the two things that ARE noise and keeps the rest:
 *   · CRLF → LF. A browser textarea submits CRLF (the HTML spec says so) while
 *     a template seeded from code carries LF, so one body ends up with two
 *     spellings depending on whether the user touched it.
 *   · trailing spaces at end of line, and blank space at both ends of the whole
 *     body — invisible to the person typing, visible to `=` and to any diff. */
const mailBody = z
  .string('Nội dung mail là bắt buộc')
  .max(20_000, 'Nội dung mail tối đa 20.000 ký tự')
  .transform((s) =>
    s
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .trim(),
  )
  .pipe(z.string().min(1, 'Nội dung mail không được để trống'))

/** `POST /sales/mail/runs` — create a run and hand it to the queue.
 *
 *  ------------------------------------------------------------------
 *  SENDING IS ASYNCHRONOUS, AND THIS CONTRACT SAYS SO OUT LOUD
 *  ------------------------------------------------------------------
 *  Nothing is sent inside this request. It writes one `mail_run` and N rows of
 *  `platform.email_delivery`; a worker sweeps them afterwards. That is why the
 *  response below is `queued` and a `state`, not "sent" — see `MasSendResponse`.
 *
 *  What this deliberately does not accept:
 *   · the run `id` — the server mints it.
 *   · any counter (`sent`, `delivered`, `opened`…) — those are counted FROM the
 *     ledger, and accepting them offers a way for the count to disagree with
 *     the thing it counts.
 *   · a recipient LIST of raw addresses — only lead codes. A mass mail whose
 *     addresses came from the client is a mass mail that cannot be traced back
 *     to a lead, cannot be checked against `email_suppression` by anything the
 *     server trusts, and cannot appear on any lead's timeline. */
export const MasSendRequest = z.object({
  leadCodes,
  /** What this batch is CALLED — what the run list shows and what a person
   *  says when asking "how did the March mailing do". Required: an unnamed run
   *  in a list of thirty runs is a row nobody can identify, and "Untitled" is
   *  what every one of them ends up called. */
  label: textNhap(200),
  /** Which template pre-filled the text, when one did. Recorded rather than
   *  inferred: `subject`/`body` below are what actually goes out, and once the
   *  user has edited them there is no way to work out afterwards which template
   *  they started from. That is the answer to "which of our templates works". */
  templateCode: MailTemplateCode.optional(),
  /** Single line — `textNhap` is correct here, unlike for `body`. 200 is the
   *  hard cap; be aware that most clients stop showing a subject somewhere
   *  around 70 characters, so anything past that is written for nobody. */
  subject: textNhap(200),
  body: mailBody,
  /** The button in the letter — ABSENT MEANS NO BUTTON, it does not mean
   *  "whatever the template says".
   *
   *  The template's own CTA pre-fills this field in the panel exactly the way
   *  it pre-fills `subject` and `body`, and the panel then posts what is on
   *  screen. Falling back to `mail_template.cta_url` on the server instead —
   *  which is what this endpoint did before the field existed — puts a link in
   *  two hundred letters that the person who pressed send never saw and never
   *  agreed to, and it keeps doing so after somebody edits the template. The
   *  run snapshots subject and body for that exact reason; the button is part
   *  of the letter and belongs in the same snapshot. */
  cta: MailCta.optional(),
  /** Absent = send now. Present = hold the run at `SCHEDULED` until then.
   *
   *  Not validated as "in the future" here: the client's clock and the
   *  server's disagree by seconds routinely, and a contract that rejects on
   *  that difference rejects legitimate sends. The service compares against
   *  its own clock, which is the only one that decides when the run fires. */
  scheduledAt: Moc.optional(),
  /** Present = this run belongs to a campaign, and the service also writes the
   *  `campaign_run` row joining the two. Absent = Quick MAS from the lead book:
   *  a run that belongs to no campaign, which is a complete answer and not a
   *  gap (same rule as `LeadSource.campaignId` in `./lead-source`). */
  campaignCode: MaObject.optional(),
})

/** What the send answers with. Three numbers and a state, and NOT "sent".
 *
 *  `queued` is the honest word: rows are written, the worker polls, and mail
 *  leaves the building seconds to minutes later. A response that says "sent"
 *  teaches the panel to print "Đã gửi" at a moment when nothing has been, and
 *  then there is no vocabulary left for what happens when a delivery fails.
 *  The panel says "đã xếp hàng" and links to the run.
 *
 *  `queued + skipped` equals the number of codes posted — that identity is the
 *  point of returning both, because it is what lets a person see that 40 picks
 *  became 37 letters without going to count anything. */
export const MasSendResponse = z.object({
  mailRunId: MailRunId,
  /** Rows written to the ledger. Letters that WILL be attempted. */
  queued: z.number().int().nonnegative(),
  /** Picks that produced no row — suppressed, no mailbox, duplicate address.
   *  The same three reasons the preflight names; the send re-checks them rather
   *  than trusting the preflight, because a hard bounce can land in between. */
  skipped: z.number().int().nonnegative(),
  /** `SENDING` for an immediate run, `SCHEDULED` for one with a time on it.
   *  Returned rather than assumed so the panel does not have to re-derive from
   *  whether it sent a `scheduledAt`. */
  state: MailRunState,
})

// ---------------------------------------------------------------------------
// The preview — `POST /sales/mail/preview`
// ---------------------------------------------------------------------------

/** `POST /sales/mail/preview` — render this letter, send nothing.
 *
 *  ------------------------------------------------------------------
 *  WHY THE SERVER RENDERS A PREVIEW THE BROWSER COULD FAKE
 *  ------------------------------------------------------------------
 *  The panel used to draw its own approximation: the body in a `<p>`, the CTA
 *  as a styled `<span>`. That preview agreed with the letter on the words and
 *  on nothing else — no logo, no footer, no unsubscribe line, no button, and
 *  none of the width and colour decisions `BrandShell` makes. A person reading
 *  it had reviewed a paraphrase and pressed send on a letter they had not seen.
 *
 *  So this door runs the SAME `renderMasShell` the worker runs, over the SAME
 *  merge substitution, and hands back the exact HTML. `@pv/mail-templates` is
 *  server-side (it pulls React and `@react-email/render`), which settles where
 *  this has to happen: rendering it in the browser would put a second copy of
 *  the letter's markup in the bundle, and a second copy is a copy that drifts.
 *
 *  ------------------------------------------------------------------
 *  IT TAKES THE TEXT ON SCREEN, NOT A TEMPLATE CODE
 *  ------------------------------------------------------------------
 *  Same reason `MasSendRequest` carries `subject`/`body` rather than reading
 *  them off `mail_template`: what goes out is what the person edited, so what
 *  they preview must be what they edited too. A preview that re-read the
 *  template would show the letter they started from.
 *
 *  ------------------------------------------------------------------
 *  NOTHING IS WRITTEN, AND NOTHING IS SENT
 *  ------------------------------------------------------------------
 *  No `mail_run`, no `email_delivery`, no queue row. The unsubscribe link in
 *  the rendered footer is a dead sample — there is no delivery id to sign yet,
 *  and minting one to make a preview look complete would be minting a token
 *  that unsubscribes somebody. It is `POST` for the same reason `preflight` is:
 *  a 20.000-character body does not fit in a query string. */
export const MasPreviewRequest = z.object({
  subject: textNhap(200),
  body: mailBody,
  cta: MailCta.optional(),
  /** Whose name and company fill the `{{…}}` slots. Optional, and the fallback
   *  is not a blank letter: with no lead the server substitutes visible sample
   *  values, so somebody previewing before picking recipients still sees the
   *  shape of a real letter rather than a greeting with a hole in it. */
  leadCode: MaObject.optional(),
})

/** What the preview answers with — the three strings a send would carry.
 *
 *  `text` travels with the HTML although the panel shows the HTML: it is the
 *  half of every letter that nobody ever looks at until a recipient's client
 *  refuses images, and the only place it can be looked at is here. */
export const MasPreviewResponse = z.object({
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string(),
  /** Merge keys named in the letter that the chosen lead had no value for.
   *  The composer turns these into one hint rather than a silent empty string —
   *  the exact failure `mas.composer.ts` can only log after the fact. */
  missing: z.array(z.string()),
})

// ---------------------------------------------------------------------------
// The run list — `GET /sales/mail/runs`
// ---------------------------------------------------------------------------

/** One row of the run list: a whole batch and how it went.
 *
 *  ------------------------------------------------------------------
 *  `opened` IS A NOISY LOWER BOUND. NO SCREEN MAY READ IT AS TRUTH.
 *  ------------------------------------------------------------------
 *  Open tracking is a 1×1 image the mail client fetches, and two things
 *  routinely break that measurement in OPPOSITE directions:
 *
 *   · Apple Mail Privacy Protection pre-fetches every image on Apple's
 *     servers, whether or not the human ever opened the mail. Those opens are
 *     COUNTED and did not happen. On a Vietnamese B2B list this is not a rare
 *     case; it is a large share of the iPhone recipients.
 *   · Everyone reading with images off — the default in several corporate
 *     clients and in Outlook's plain-text preview — reads the mail and is NOT
 *     counted.
 *
 *  So `opened` is a floor with noise on top of it, and the only defensible
 *  reading is a RELATIVE one: run A against run B under the same conditions.
 *  A screen printing "tỉ lệ mở 42%" as though it were measured is stating a
 *  number nobody measured. `clicked` is far sounder — a click is a request the
 *  recipient's own action caused — and is what a decision should rest on.
 *
 *  ------------------------------------------------------------------
 *  THE COUNTERS ARE COUNTED, NEVER WRITTEN
 *  ------------------------------------------------------------------
 *  Every number below is an aggregate over `email_delivery` and `mail_event`
 *  for this run, computed at read time. None of them is a column somebody
 *  increments: a counter maintained by hand and the rows it counts disagree the
 *  first time a webhook is replayed, and after that nobody can tell which of
 *  the two is lying. */
export const MailRunRow = z.object({
  id: MailRunId,
  label: z.string().min(1),
  /** Which template the text started from, if any. See `MasSendRequest`. */
  templateCode: MailTemplateCode.optional(),
  subject: z.string().min(1),
  state: MailRunState,

  /** Set only on a run that was given a time. */
  scheduledAt: Moc.optional(),
  /** When the first letter of this run was actually attempted. Absent while
   *  the run is `DRAFT` or `SCHEDULED` — and that absence is what distinguishes
   *  "will fire at 9am" from "fired at 9am and is still going". */
  startedAt: Moc.optional(),
  finishedAt: Moc.optional(),

  /** Letters this run OWED when it was opened — the picks that survived
   *  preflight, not the size of the pick.
   *
   *  Blocked picks are already gone by the time this number is written
   *  (`mail_run.audience_count`, filled from the sendable list): a run aimed at
   *  40 ticked rows of which 3 were suppressed reports 37 here, and the 3 live
   *  in the preflight the sender read, not on the batch. Stored rather than
   *  counted, so a run can still say how big it was meant to be after its rows
   *  are pruned by retention.
   *
   *  `audienceCount - sent` is therefore what was written to the ledger and
   *  never left the building — held by the bounce breaker, suppressed between
   *  the send and its turn, or out of retries. It is the on-screen sign that
   *  something went wrong INSIDE the run, which is a different question from
   *  how many picks were rejected before it opened. */
  audienceCount: z.number().int().nonnegative(),

  /** Handed to the provider and accepted by it. */
  sent: z.number().int().nonnegative(),
  /** Confirmed accepted by the RECEIVING server. Always ≤ `sent`, and the gap
   *  is normal: some receivers never report back. */
  delivered: z.number().int().nonnegative(),
  /** Read the warning at the top of this docblock before putting this on a
   *  screen next to a percent sign. */
  opened: z.number().int().nonnegative(),
  clicked: z.number().int().nonnegative(),
  /** Rejected by the receiving server. Each one also suppresses the address, so
   *  this number is also the size of the hole burnt in the list. */
  bounced: z.number().int().nonnegative(),
  /** Never got as far as a receiving server — provider refused, retries
   *  exhausted, row parked as `dead`. A sending-side problem, which is why it
   *  is not folded into `bounced`: one means fix the list, the other means look
   *  at the pipe. */
  failed: z.number().int().nonnegative(),

  /** Pressed "this is spam".
   *
   *  The single most consequential number on this row, and it needs its own
   *  field because it is otherwise invisible: a complaint lands in `sent` —
   *  the letter did leave and did arrive — so without this counter the run
   *  that is destroying the sending domain looks exactly like the run that
   *  went perfectly.
   *
   *  Resend terminates above a 0.08% complaint rate, and does it at ACCOUNT
   *  level, which takes the transactional pipeline with it. Two complaints in
   *  a batch of a thousand is already over. */
  complained: z.number().int().nonnegative(),

  /** Held back because the address was already blocked when its turn came.
   *
   *  A third category on purpose, because the other two would each tell a lie
   *  about it. It is not `bounced` — nothing was posted, so no receiving server
   *  refused anything. It is not `failed` — the pipe worked perfectly and did
   *  the correct thing. Folding it into either one hides the only number that
   *  says "this list is decaying" while the pipe is healthy, which is exactly
   *  the split `bounced`/`failed` already exists to protect. */
  suppressed: z.number().int().nonnegative(),

  /** Recipients who asked to stop hearing from us, out of this run.
   *
   *  The one number here worth more than the open rate. An unsubscribe is an
   *  unambiguous act by a real person — no image proxy invents one — and it is
   *  the leading indicator of the complaint rate that decides whether this
   *  domain keeps being able to deliver mail at all. A run whose unsubscribes
   *  spike is a run to stop, not a run to repeat. */
  unsubscribed: z.number().int().nonnegative(),

  /** When the run was created — NOT when it was sent.
   *
   *  Present on every state including `DRAFT`, which is what makes it the only
   *  field the list can order and page on without holes; the three timestamps
   *  above are each absent for at least one legitimate state. Paging on a key
   *  that is NULL for some rows silently drops them from the list. */
  createdAt: Moc,
})

/** Sort keys of the run list — exactly two, and both are columns that exist on
 *  every row regardless of state.
 *
 *  `scheduledAt` is deliberately absent even though it reads like the obvious
 *  third: it is NULL on every send-now run, and a NULL sort key silently drops
 *  rows out of a paged list. Same rule `LeadSortKey` states — a sort key with
 *  no dependable column behind it must die at the zod gate rather than in a
 *  half-empty page nobody can explain. */
export const MailRunSortKey = z.enum(['createdAt', 'audienceCount'])

/** Filters of the run list. */
export const MailRunListQuery = PageQuery.extend({
  state: MailRunState.optional(),
  /** Runs of ONE campaign. Absent = every run, including the campaign-less
   *  Quick MAS ones — which are the majority today. */
  campaign: MaObject.optional(),
  /** Substring search over the run's `label` and `subject`. */
  q: z.string().trim().min(1).max(120).optional(),
  sort: MailRunSortKey.default('createdAt'),
  dir: SortDir.default('desc'),
})

export const MailRunListResponse = paged(MailRunRow)

// ---------------------------------------------------------------------------
// Stopping a batch — `PATCH /sales/mail/runs/:id`
// ---------------------------------------------------------------------------

/** THE ONLY DOOR A PERSON HAS INTO `MailRunState`, AND IT LEADS ONE WAY.
 *
 *  ------------------------------------------------------------------
 *  WHY `CANCELLED` IS THE WHOLE VOCABULARY OF THIS REQUEST
 *  ------------------------------------------------------------------
 *  Four of the five run states are reached by the machine and must stay that
 *  way: `SENDING` and `SENT` are conclusions the sweeper draws from the ledger
 *  (`sweepStates()` — "no attempt is outstanding"), `SCHEDULED` is set at
 *  creation by the presence of `scheduledAt`, and `DRAFT` is written by nothing
 *  today. Letting a request assert any of those would let a screen claim a
 *  batch had finished while its letters were still in a worker's hands, and
 *  every counter on the run list is computed on the assumption that never
 *  happens.
 *
 *  `CANCELLED` is the one state that is a DECISION rather than an observation —
 *  a person saying "do not post the rest of these" — so it is the one a person
 *  may write. Before this door existed only the bounce breaker could reach it
 *  (`tripBounced`), which meant a batch scheduled for 9am with the wrong body
 *  in it could be watched but not stopped.
 *
 *  An enum of one rather than a bare boolean `cancel: true`: the field is a
 *  `MailRunState` and reads as one on both ends, and the day a second reachable
 *  state exists it is one more value here instead of a second flag beside the
 *  first. */
export const MailRunPatch = z.object({
  state: z.enum(['CANCELLED']),
})

/** What the cancel answers with — and `held` is the reason it is not a 204.
 *
 *  Cancelling a run is not only a column change: the letters it had not posted
 *  yet are killed in the same statement, because a "cancelled" batch whose two
 *  hundred `pending` rows are still sitting there for the worker is a batch
 *  that goes out anyway. `held` is how many of those this call stopped, and it
 *  is the sentence the panel prints — "đã huỷ · giữ lại 42 thư chưa gửi".
 *
 *  It is legitimately `0`: a `SCHEDULED` run cancelled after the sweeper moved
 *  it, a run every letter of which had already left, or the second click on a
 *  cancel button. Zero means "nothing left to stop", never "nothing happened" —
 *  the state below is the receipt for that. */
export const MailRunPatchResponse = z.object({
  id: MailRunId,
  state: MailRunState,
  /** Letters that were still owed and will now never be attempted. */
  held: z.number().int().nonnegative(),
})

// ---------------------------------------------------------------------------
// One run's recipients — the other half of every number on `MailRunRow`
// ---------------------------------------------------------------------------

/** WHO exactly got this batch, and what happened to each letter.
 *  `GET /sales/mail/runs/:id/recipients`.
 *
 *  ------------------------------------------------------------------
 *  THE ROW `MailRunRow` COUNTS BUT CANNOT NAME
 *  ------------------------------------------------------------------
 *  A run row says `sent 3 · delivered 1 · bounced 1`. Every question that
 *  follows from those numbers — WHICH one bounced, whose address to fix, who
 *  never opened it — has no door to go through. This is that door: one row per
 *  letter, the same aggregate `LeadMailTimelineRow` carries for one lead, read
 *  from the run's side instead.
 *
 *  ------------------------------------------------------------------
 *  `deliveryState` IS A BARE STRING HERE FOR THE SAME REASON
 *  ------------------------------------------------------------------
 *  The ten values of `MAIL_STATES` live in `apps/api`, which the browser must
 *  not import — the whole argument is at `LeadMailTimelineRow.deliveryState`
 *  and is not repeated. Screens read it through their own lookup table and
 *  fall back to "on its way" for a value they do not know, which is the safe
 *  direction to be wrong in.
 *
 *  Not paged, and that is a decision the ceiling makes for us: one wave is one
 *  MAS batch, and a batch cannot exceed `MAS_MAX_RECIPIENTS`. A list bounded
 *  at two hundred rows that hides its tail behind "load more" is a list that
 *  cannot answer "did everyone get it". */
export const MailRunRecipientRow = z.object({
  leadCode: MaObject,
  company: z.string().min(1),
  contactName: z.string().min(1),
  /** The address the letter was POSTED to, off the ledger — not the lead's
   *  address as it reads today. The two differ exactly when somebody corrected
   *  a typo after the send, and it is the old one that explains the bounce. */
  email: z.string().min(1),

  /** State of THIS letter — one value of `MAIL_STATES`. See the docblock. */
  deliveryState: z.string().min(1),
  sentAt: Moc.optional(),
  deliveredAt: Moc.optional(),

  openCount: z.number().int().nonnegative(),
  lastOpenAt: Moc.optional(),
  clickCount: z.number().int().nonnegative(),
  lastClickAt: Moc.optional(),

  /** The provider's own sentence about why it did not arrive. Free text for
   *  the reason `LeadMailTimelineRow.failReason` gives: "mailbox full" and
   *  "domain does not exist" call for opposite actions. */
  failReason: z.string().optional(),
})

export const MailRunRecipientsResponse = z.object({
  rows: z.array(MailRunRecipientRow),
})

// ---------------------------------------------------------------------------
// One lead's mail history — what the lead detail screen draws as a timeline
// ---------------------------------------------------------------------------

/** Every letter this lead was sent, one row per run. `GET /sales/leads/:code`
 *  side data.
 *
 *  Deliberately joined from the lead's side and not derived from `MailRunRow`:
 *  the run row carries counts across the WHOLE audience, and on a lead's
 *  timeline every one of those numbers would be about other people. Here they
 *  are about this lead — `openCount` is how many times THIS person opened it.
 *
 *  The run's own identity (`runId`, `label`, `runState`) travels along so the
 *  timeline can link to the run without a second request per row, and so a
 *  cancelled run shows as cancelled instead of as a mail that never arrived. */
export const LeadMailTimelineRow = z.object({
  runId: MailRunId,
  label: z.string().min(1),
  /** State of the BATCH. Prefixed `run` because the row carries two states and
   *  an unprefixed `state` next to `deliveryState` is an invitation to read the
   *  wrong one. */
  runState: MailRunState,
  scheduledAt: Moc.optional(),

  /** When the provider accepted this recipient's letter. This is the first
   *  honest moment the lead screen may call it "sent"; scheduling or queueing
   *  a row is not a successful send. */
  sentAt: Moc.optional(),
  /** When the receiving server confirmed delivery, when that webhook exists. */
  deliveredAt: Moc.optional(),

  /** State of THIS lead's letter — one value of `MAIL_STATES`, declared in
   *  `apps/api/src/platform/mail/mail.contract.ts`.
   *
   *  A bare string, and that is the honest shape rather than a lazy one. The
   *  ten values live inside an APP, and this package is imported by the
   *  browser: reaching into `apps/api/src/…` from here inverts the dependency
   *  and drags server source into the web bundle. (Worth knowing when reading
   *  this: `eslint.config.js` blocks that import from `apps/**`, from
   *  `packages/ui` and from `packages/engines`, but has NO block for
   *  `packages/contracts` — so here the boundary is held by this comment and by
   *  review, not by CI. That gap is worth closing.)
   *
   *  The remaining option is to type the ten values out again here, which is
   *  precisely the second declaration of one vocabulary that this package
   *  exists to prevent: it agrees on the day it is written and drifts the first
   *  time a state is added on the ledger side, at which point the profile
   *  answers 500 for a lead whose mail is in a perfectly valid state.
   *
   *  The fix is to move `MAIL_STATES` down into a shared package and reference
   *  it from both ends — a known, recorded debt. Until then this field is
   *  opaque to the contract and read through the ledger's own label table. */
  deliveryState: z.string().min(1),

  /** How many times THIS lead opened it. Carries the same measurement noise as
   *  `MailRunRow.opened` — Apple MPP counts opens nobody performed, images-off
   *  clients perform opens nobody counts — and at the single-lead scale that
   *  noise is proportionally far worse: one phantom open turns a lead that
   *  ignored us into a lead that "read it twice". Do not let a screen say
   *  "quan tâm" on the strength of this number alone. */
  openCount: z.number().int().nonnegative(),
  lastOpenAt: Moc.optional(),

  /** Clicks by this lead. The trustworthy half of the pair: a click is caused
   *  by the recipient, not by their mail client fetching images. */
  clickCount: z.number().int().nonnegative(),
  lastClickAt: Moc.optional(),

  /** Why this lead's letter did not make it, in words. Present only for a
   *  failed or bounced delivery. Free text because it is the PROVIDER's
   *  sentence passed through — an enum here would force every unrecognised
   *  provider message into an "other" bucket, and the message is the entire
   *  value of the field ("mailbox full" and "domain does not exist" call for
   *  opposite actions). */
  failReason: z.string().optional(),

  /** Which campaign this run belongs to, if any. Both present together or
   *  both absent — a run is joined to at most one campaign (`campaign_run`)
   *  or none at all. Absent means Quick MAS, sent straight from the lead
   *  book — a real state, not a missing value; the screen must label this
   *  case as a manual send, never leave a blank where a campaign name would
   *  go. */
  campaignCode: z.string().optional(),
  campaignName: z.string().optional(),

  /** How many times THIS lead replied, and when they last did. Same shape as
   *  `openCount`/`clickCount` but without their noise problem — a reply is an
   *  inbound letter the lead's own mail client sent, not an image fetch a
   *  privacy proxy invented. Zero when reply tracking is off or this run
   *  predates it — a real "no" for those cases, not "unknown". */
  replyCount: z.number().int().nonnegative(),
  lastReplyAt: Moc.optional(),
})

/** One engagement moment on a single run, for the lead-timeline detail panel.
 *  Deliberately a SEPARATE door from `LeadMailTimelineRow` (`GET
 *  /sales/leads/:code/mail/:runId/events`) rather than an array embedded in
 *  the summary row: the summary is not paged and a lead can rack up dozens of
 *  opens, so folding the full event list into every row of an unpaged
 *  response would make the common case pay for the rare one. */
export const LeadMailEventRow = z.object({
  kind: z.enum(['OPEN', 'CLICK', 'REPLY']),
  at: Moc,
  /** CLICK carries the (truncated) URL, REPLY carries "from · subject". OPEN
   *  has nothing more to say than the moment itself. */
  detail: z.string().optional(),
})

export const LeadMailEventsResponse = z.object({
  rows: z.array(LeadMailEventRow),
})

/** The picker's list. Not paged: the catalogue is a handful of rows a human
 *  maintains, the same shape and for the same reason as `ConfigEntry` lists —
 *  a dropdown that pages is a dropdown missing options. Inactive templates are
 *  carried too, so a run that names a retired one can still print its name. */
export const MailTemplateListResponse = z.object({
  rows: z.array(MailTemplateRow),
})

/** One lead's whole mail history, newest run first. Not paged either: it is
 *  bounded by how many campaigns one lead has been in, and a timeline that
 *  hides its own tail behind a "load more" is a timeline that lies about how
 *  often we have written to this person. */
export const LeadMailTimelineResponse = z.object({
  rows: z.array(LeadMailTimelineRow),
})

export type MailRunState = z.infer<typeof MailRunState>
export type MailEngagementKind = z.infer<typeof MailEngagementKind>
export type MailRunId = z.infer<typeof MailRunId>
export type MailTemplateCode = z.infer<typeof MailTemplateCode>
export type MailTemplateRow = z.infer<typeof MailTemplateRow>
export type MasRecipientBlock = z.infer<typeof MasRecipientBlock>
export type MasRecipient = z.infer<typeof MasRecipient>
export type MasPreflightRequest = z.infer<typeof MasPreflightRequest>
export type MasPreflightResponse = z.infer<typeof MasPreflightResponse>
export type MasSendRequest = z.infer<typeof MasSendRequest>
export type MasSendResponse = z.infer<typeof MasSendResponse>
export type MasPreviewRequest = z.infer<typeof MasPreviewRequest>
export type MasPreviewResponse = z.infer<typeof MasPreviewResponse>
export type MailRunRow = z.infer<typeof MailRunRow>
export type MailRunListQuery = z.infer<typeof MailRunListQuery>
export type MailRunListResponse = z.infer<typeof MailRunListResponse>
export type MailRunSortKey = z.infer<typeof MailRunSortKey>
export type MailRunPatch = z.infer<typeof MailRunPatch>
export type MailRunRecipientRow = z.infer<typeof MailRunRecipientRow>
export type MailRunRecipientsResponse = z.infer<typeof MailRunRecipientsResponse>
export type MailRunPatchResponse = z.infer<typeof MailRunPatchResponse>
export type MailTemplateListResponse = z.infer<typeof MailTemplateListResponse>
export type LeadMailTimelineRow = z.infer<typeof LeadMailTimelineRow>
export type LeadMailTimelineResponse = z.infer<typeof LeadMailTimelineResponse>
export type LeadMailEventRow = z.infer<typeof LeadMailEventRow>
export type LeadMailEventsResponse = z.infer<typeof LeadMailEventsResponse>
