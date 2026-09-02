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
 *  Nên bản chính thức đặt ở đây. Bước B của `docs/ban-giao-backend.md` (tách
 *  domain khỏi fixture) sẽ để fixture NHẬP từ file này, không phải ngược lại.
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
  ['chip', 'co-khi', 'o-to', 'duoc'],
  'Ngành không có trong danh sách',
)

export const LeadTier = z.enum(['dau-moi', 'mql', 'sql'], 'Bậc không có trong danh sách')

/** Năm cột của sổ cơ hội. Không có cột thứ sáu. */
export const StageKey = z.enum(['moi', 'tim-hieu', 'da-demo', 'da-bao-gia', 'cho-ky'])

/** SÁU lý do rơi — KHOÁ ASCII, không phải nhãn tiếng Việt.
 *
 *  Đây là nợ số 4 của `docs/ban-giao-backend.md` được trả ngay: fixture đang
 *  lưu thẳng NHÃN ('Không gọi được ai') làm giá trị của `Lead.exitReason`, nên
 *  sửa một chữ trên màn là đổi dữ liệu 52 dòng sổ. Trả bây giờ tốn một bảng
 *  tra; trả sau khi có dữ liệu thật thì tốn một migration.
 *
 *  Nhãn hiển thị KHÔNG nằm ở đây — nhãn là việc của tầng màn. */
export const ExitReason = z.enum([
  'khong-goi-duoc',
  'khong-phai-khach-cua-minh',
  'khong-co-ngan-sach',
  'nguoi-lien-he-nghi',
  'chon-ben-khac',
  'im-sau-bao-gia',
])

export type LeadCategory = z.infer<typeof LeadCategory>
export type LeadTier = z.infer<typeof LeadTier>
export type StageKey = z.infer<typeof StageKey>
export type ExitReason = z.infer<typeof ExitReason>

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
 *  "enum declared twice" debt recorded in `docs/ban-giao-api.md`, and it is
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

/** Kênh gọi lại được khách — ô 5 của cổng init data.
 *
 *  Cùng bộ với kênh của module 1 (`WaveChannel` bên fixture): một chiến dịch
 *  bắn qua kênh nào thì khách trả lời qua đúng kênh đó, nên hai bảng phải là
 *  MỘT. Ngày bước B tách domain khỏi fixture, fixture nhập từ đây. */
export const ContactChannel = z.enum(
  ['email', 'zalo-oa', 'telegram', 'in-app', 'linkedin', 'facebook', 'website'],
  'Kênh liên hệ không có trong danh sách',
)

/** Đơn vị tiền. Nợ số 7 của `docs/ban-giao-backend.md`: mọi cột tiền phải đi
 *  kèm một cột này, và ràng buộc "có tiền thì phải có đơn vị" được ép ở tầng
 *  bảng bằng CHECK chứ không nhờ người nhớ. */
export const CurrencyCode = z.enum(['VND', 'USD'], 'Đơn vị tiền không có trong danh sách')

export type LeadSourceKind = z.infer<typeof LeadSourceKind>
export type LeadMotion = z.infer<typeof LeadMotion>
export type ContactChannel = z.infer<typeof ContactChannel>
export type CurrencyCode = z.infer<typeof CurrencyCode>
