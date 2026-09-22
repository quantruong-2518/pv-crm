import { z } from 'zod'

/** Enum của nhánh Sales — BẢN CHÍNH THỨC.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO Ở ĐÂY CHỨ KHÔNG IMPORT TỪ FIXTURE
 *  ------------------------------------------------------------------
 *  Hôm nay `LeadCategory`, `LeadTier`, `StageKey`, `ExitReason` đều đang được
 *  định nghĩa bên trong `@pv/engines/fixtures/das-vina.ts` — tức tên một khách
 *  hàng đang nằm trong đường import của hệ kiểu. Kéo đường đó vào
 *  `packages/contracts` là hàn tên khách vào cả hợp đồng dữ liệu.
 *
 *  Nên bản chính thức đặt ở đây. Bước tách domain khỏi fixture sẽ để fixture
 *  NHẬP từ file này, không phải ngược lại.
 *  Trong lúc chưa tách, hai bên còn là hai bản chép tay — chốt chặn duy nhất là
 *  test khoá số của fixture. Đây là nợ ĐÃ BIẾT, không phải chỗ quên. */

/** EVERY enum below carries a Vietnamese sentence, and it is not decoration.
 *
 *  zod writes its own sentence for a value outside the list, and that sentence
 *  LISTS the list: `Invalid option: expected one of "email"|"zalo-oa"|…` — a
 *  seven-clause English line dropped into a Vietnamese form, underneath the very
 *  control the user picked from. `closedList` in
 *  `apps/api/.../lead-import.check.ts` already had to write its own sentence for
 *  exactly this reason; declaring one here pays that debt for every door at once
 *  instead of leaving each to fend for itself.
 *
 *  The sentence names the FIELD and does not repeat the allowed values: the
 *  screen is already showing them, and a value outside the list means a column
 *  was mapped wrong, not that somebody failed to choose. */
export const LeadCategory = z.enum(
  ['chip', 'mechanical', 'automotive', 'pharma'],
  'Ngành không có trong danh sách',
)

export const LeadTier = z.enum(['prospect', 'mql', 'sql'], 'Bậc không có trong danh sách')

/** Where a deal stands in its OWN lifecycle — five columns, no sixth (ADR 0064).
 *  STORED, nullable on the row, and written only by the server's single stage
 *  writer: `assigned` follows the PIC set, the last three follow a recorded
 *  milestone (`sample-sent`, `poc-run`, `quotation-sent`). A seller never picks
 *  one, so no write body carries this enum. */
export const StageKey = z.enum(['new', 'assigned', 'sample', 'poc', 'quotation'])

/** Vietnamese label per column, declared ONCE for the reason `LEAD_STATE_LABEL`
 *  is: the board door prints these server-side while the book prints them in the
 *  browser, and two copies of one word drift. */
export const OPPORTUNITY_STAGE_LABEL: Record<StageKey, string> = {
  new: 'Khởi tạo opp',
  assigned: 'Nhận PIC',
  sample: 'Sample',
  poc: 'POC',
  quotation: 'Quotation',
}

/** How a deal READS: the two stored values plus `won`, which is not stored at
 *  all — it is the existence of a `sales.contract` row, folded in on the way
 *  out. The stored half is `OpportunityState` in `./opportunity`, derived from
 *  this list so the two can never disagree on spelling. */
export const OpportunityStatus = z.enum(
  ['open', 'care', 'won'],
  'Trạng thái cơ hội không có trong danh sách',
)

export const OPPORTUNITY_STATE_LABEL: Record<OpportunityStatus, string> = {
  open: 'Đang triển khai',
  care: 'Danh sách chăm sóc',
  won: 'Thành hợp đồng',
}

/** SÁU lý do rơi — KHOÁ ASCII, không phải nhãn tiếng Việt.
 *
 *  Đây là một khoản nợ được trả ngay: fixture đang
 *  lưu thẳng NHÃN ('Không gọi được ai') làm giá trị của `Lead.exitReason`, nên
 *  sửa một chữ trên màn là đổi dữ liệu 52 dòng sổ. Trả bây giờ tốn một bảng
 *  tra; trả sau khi có dữ liệu thật thì tốn một migration.
 *
 *  Nhãn hiển thị KHÔNG nằm ở đây — nhãn là việc của tầng màn. */
export const ExitReason = z.enum([
  'unreachable',
  'not-a-fit',
  'no-budget',
  'contact-left',
  'chose-competitor',
  'silent-after-quote',
])

/** Where a lead stands in its OWN lifecycle (ADR 0058, entry rules ADR 0063).
 *  STORED under a CHECK and moved only by the server; a screen never derives it.
 *
 *   · `new` / `assigned` — no PIC yet / a PIC who has scheduled nothing yet
 *   · `verifying`  — the owner scheduled care (future meeting, timed mail run)
 *   · `working`    — a real exchange was logged (call, message, meeting held)
 *   · `nurturing`  — parked "not ready", from verifying|working; archived after 6 months
 *   · `converted`  — the first opportunity was opened from it
 *   · `disqualified` — dropped with an `ExitReason`; reopen recomputes from facts
 *   · `archived`   — retired by the system after six months in `nurturing`
 *
 *  Tier (prospect/mql/sql) belongs to no state. Not `StageKey`: that is the deal's. */
export const LeadState = z.enum(
  ['new', 'assigned', 'verifying', 'working', 'nurturing', 'converted', 'disqualified', 'archived'],
  'Trạng thái lead không có trong danh sách',
)

/** Vietnamese label for each stored state — content, not an identifier (law 2
 *  in the root `CLAUDE.md`), and declared exactly ONCE so the server and the
 *  screen can never disagree on what a state is called. Pill TONE stays out:
 *  colour is presentation, not part of the wire contract, so
 *  `apps/web/src/data/lead-state.ts` pairs this label with a tone locally. */
export const LEAD_STATE_LABEL: Record<LeadState, string> = {
  new: 'Khởi tạo lead',
  assigned: 'Nhận PIC',
  verifying: 'Tạo chiến lược chăm sóc',
  working: 'Tình trạng chăm sóc',
  nurturing: 'Chờ thời điểm',
  converted: 'Đổi thành Opp',
  disqualified: 'Không theo nữa',
  archived: 'Lưu trữ',
}

/** The states still in the funnel — the book's default tab and every "still
 *  open" count. Declared once so no two readers disagree on which five. */
export const LEAD_OPEN_STATES = [
  'new',
  'assigned',
  'verifying',
  'working',
  'nurturing',
] as const satisfies readonly LeadState[]

export type LeadCategory = z.infer<typeof LeadCategory>
export type LeadTier = z.infer<typeof LeadTier>
export type StageKey = z.infer<typeof StageKey>
export type OpportunityStatus = z.infer<typeof OpportunityStatus>
export type ExitReason = z.infer<typeof ExitReason>
export type LeadState = z.infer<typeof LeadState>

/** WHERE a lead originated — the closed half of `LeadSource`.
 *
 *  ------------------------------------------------------------------
 *  ONE ENUM, NOT A CATALOGUE ROW — AND WHY THAT IS THE RIGHT SPLIT
 *  ------------------------------------------------------------------
 *  A lead's origin is TWO facts, and they have opposite lifetimes:
 *
 *   · WHICH CAMPAIGN it is attributed to — open-ended, renamed by the sales
 *     team, new rows added every quarter. That belongs in `sales.config_entry`
 *     and travels as `LeadSource.campaignId`. It is OPTIONAL: a lead typed in
 *     by hand belongs to no campaign, and minting a fake code to fill the
 *     column invents a campaign that is in no campaign book.
 *   · WHICH KIND OF ORIGIN produced the row — this enum. Closed, small, and
 *     every value has a code path behind it. Trust is derived from it
 *     (`CHANNEL_TRUST`), so it cannot be a row someone adds at runtime: a new
 *     catalogue entry would arrive with no trust level and no import path.
 *
 *  The four values:
 *
 *   · `MANUAL`       — a person typed the row in. Somebody here owns every
 *     cell of it.
 *   · `IMPORT`       — a batch arrived from a file we did not name a vendor
 *     for: an event registration list, a partner's spreadsheet.
 *   · `APOLLO`       — a batch bought from Apollo. More specific than
 *     `IMPORT` on purpose: "what did the purchased data actually convert at"
 *     is a question with a budget attached, and it is unanswerable once
 *     vendor rows are mixed into the generic file bucket.
 *   · `LANDING_PAGE` — the public form posted it. The customer pressed send.
 *
 *  Adding a fifth vendor (ZoomInfo, Lusha) is a migration, not a config row,
 *  and that is the intended cost: each one needs its own trust level, its own
 *  importer column map, and its own line on the spend report.
 *
 *  `UPPER_SNAKE` because that is the naming law for enum VALUES here. These
 *  are keys — on the wire and in the column. The Vietnamese labels live in
 *  `./lead-source`, ONE table shared by the server and the screen; see the
 *  docblock there for why they are no longer view-layer-only. */
export const LeadSourceKind = z.enum(
  ['MANUAL', 'IMPORT', 'APOLLO', 'LANDING_PAGE'],
  'Đường vào không có trong danh sách',
)

/** Who made the first move — the six lead MOTIONS.
 *
 *  ------------------------------------------------------------------
 *  A DIFFERENT AXIS FROM `LeadSourceKind`, AND THE DIFFERENCE IS THE POINT
 *  ------------------------------------------------------------------
 *  `LeadSourceKind` says WHERE the row came from; this says WHO MOVED
 *  FIRST. They are independent: an `EVENT` lead can arrive by `IMPORT` (the
 *  registration list exported the next morning) or by `MANUAL` (a BD typing
 *  up the badges that evening) — same event, two different rows. Folding the
 *  two axes into one enum of thirty values is the reliable way to make both
 *  of them unfilterable.
 *
 *  The list is CLOSED. There is no seventh motion and no "other" bucket: an
 *  "other" here is where every hard-to-classify lead ends up, and one quarter
 *  later it is the largest bucket in the table — at which point "which motion
 *  brings customers" has stopped being answerable. A lead that genuinely fits
 *  none of the six is a lead missing information, which is a PROBLEM, not a
 *  category.
 *
 *  ------------------------------------------------------------------
 *  KNOWN DEBT — THIS VOCABULARY IS DECLARED IN TWO PLACES
 *  ------------------------------------------------------------------
 *  `packages/engines/src/lead-intake.ts` holds `LEAD_MOTIONS`: the same six
 *  values in lower case (`inbound`, …), and `apps/web` reads that one. This
 *  copy is the stored/wire form. Two declarations of one vocabulary is the
 *  "enum declared twice" debt recorded in
 *  `docs/decisions/0012-rename-vietnamese-identifiers-in-six-batches.md`, and it is
 *  paid in its own sweep — not here, where it would drag `apps/web` into a
 *  migration.
 *
 *  Until that sweep: the conversion between the two spellings happens in
 *  `lead.mapper.ts`, in exactly ONE place. A second conversion site is how
 *  two spellings start to drift, so there must not be one. */
export const LeadMotion = z.enum(
  ['INBOUND', 'OUTBOUND', 'EVENT', 'REFERRAL', 'PARTNER', 'RECYCLE'],
  'Thế không có trong danh sách',
)

/** What a motion asks the intake form for NEXT — the field a create/import
 *  door requires once `LeadMotion` is chosen. Replaces the old boolean
 *  `motion_policy.requires_campaign`, which could only say yes/no to one
 *  field; `MotionAsks` names WHICH of the three doors is the one asked.
 *
 *   · `ORIGIN`   — `LeadOriginPick`, the free-form catalog pick.
 *   · `CAMPAIGN` — `campaignCode`; origin is then DERIVED from the campaign.
 *   · `REFERRER` — `refCode`; origin is then DERIVED from the partner.
 *
 *  Which motion asks what lives only in `sales.motion_policy` (seeded by 0059,
 *  admin-editable) — never restate that table in code. */
export const MotionAsks = z.enum(['ORIGIN', 'CAMPAIGN', 'REFERRER'])
export type MotionAsks = z.infer<typeof MotionAsks>

/** One wording per ask, read by the admin control, the approval sentence and
 *  both doors' refusals — so proposer, approver and typist see the same name. */
export const MOTION_ASKS_LABEL: Record<MotionAsks, string> = {
  ORIGIN: 'Nguồn chi tiết',
  CAMPAIGN: 'Chiến dịch',
  REFERRER: 'Mã giới thiệu',
}

/** The refusal when the asked field is missing, identical in browser and server. */
export const MOTION_ASKS_MISSING: Record<MotionAsks, string> = {
  ORIGIN: 'Phương án tiếp cận này cần chọn nguồn chi tiết',
  CAMPAIGN: 'Phương án tiếp cận này cần gắn một chiến dịch đang chạy',
  REFERRER: 'Phương án tiếp cận này cần mã giới thiệu',
}

/** Kênh gọi lại được khách — ô 5 của cổng init data.
 *
 *  Cùng bộ với kênh của module 1 (`WaveChannel` bên fixture): một chiến dịch
 *  bắn qua kênh nào thì khách trả lời qua đúng kênh đó, nên hai bảng phải là
 *  MỘT. Ngày bước B tách domain khỏi fixture, fixture nhập từ đây. */
export const ContactChannel = z.enum(
  ['email', 'zalo-oa', 'telegram', 'in-app', 'linkedin', 'facebook', 'website'],
  'Kênh liên hệ không có trong danh sách',
)

/** Đơn vị tiền: mọi cột tiền phải đi
 *  kèm một cột này, và ràng buộc "có tiền thì phải có đơn vị" được ép ở tầng
 *  bảng bằng CHECK chứ không nhờ người nhớ. */
export const CurrencyCode = z.enum(['VND', 'USD'], 'Đơn vị tiền không có trong danh sách')

/** Three ways one workstream closes. UPPER_SNAKE, the same law
 *  `LeadSourceKind` above states for a stored key that is never a label.
 *
 *  Null exactly when `closedAt` is null, non-null exactly when it is not —
 *  the pairing `sales.workstream`'s own CHECK enforces; this enum only
 *  supplies the closed side's vocabulary. */
export const WorkstreamCloseReason = z.enum(
  ['WON', 'LOST', 'CHURNED'],
  'Lý do đóng không có trong danh sách',
)

/** Vietnamese label for each close reason, declared once for the same reason
 *  `LEAD_STATE_LABEL` is: the board door prints these server-side while the
 *  book screen prints them in the browser, and two copies of one word drift. */
export const CLOSE_REASON_LABEL: Record<WorkstreamCloseReason, string> = {
  WON: 'Thắng',
  LOST: 'Thua',
  CHURNED: 'Rời bỏ',
}

export type LeadSourceKind = z.infer<typeof LeadSourceKind>
export type LeadMotion = z.infer<typeof LeadMotion>
export type ContactChannel = z.infer<typeof ContactChannel>
export type CurrencyCode = z.infer<typeof CurrencyCode>
export type WorkstreamCloseReason = z.infer<typeof WorkstreamCloseReason>
