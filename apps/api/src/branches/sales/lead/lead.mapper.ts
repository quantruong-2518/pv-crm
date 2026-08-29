import type { ObjectRef } from '@pv/engines'
import type { LeadMailTimelineRow, LeadProfile, LeadRow, MailRunState } from '@pv/contracts'
import type { LeadRowDb } from './lead.schema'

/** One row of `LeadRepository.mailTimeline()`, in the DRIVER's own spelling.
 *
 *  `snake_case`, because that query is a raw `db.execute()` and Postgres hands
 *  back whatever the statement named — there is no Drizzle mapper on a raw
 *  statement to rename or convert anything. `toMailTimeline` below is the
 *  conversion, and keeping the two shapes apart is what stops an ISO string
 *  from being invented inside the repository, where the only honest value is
 *  whatever the driver returned.
 *
 *  ------------------------------------------------------------------
 *  `Date | string` ON EVERY TIMESTAMP, AND THAT UNION IS NOT DEFENSIVE
 *  ------------------------------------------------------------------
 *  It is what the two drivers actually do. `Db` is driver-agnostic
 *  (`create-db.ts`), and on a RAW statement the two disagree about
 *  `timestamptz`: node-postgres parses it into a `Date`, PGlite hands back the
 *  text Postgres printed. Drizzle's typed `select()` normalises that; a raw
 *  `execute()` is precisely the path where it does not.
 *
 *  Typing this as `Date` alone compiles perfectly and then throws
 *  `read.scheduled_at.toISOString is not a function` — on ONE of the two
 *  drivers. Which means the version that ships is green on the developer's
 *  machine and 500s in production, or the reverse, and neither is caught by
 *  `tsc`. `isoOf` below is the one place the two are reconciled.
 *
 *  Declared HERE rather than beside the query, exactly like `LeadRead` and
 *  `LeadProfileRead`: the repository imports its read-shapes from the mapper,
 *  and reversing that for one of the three would be a cycle between the two
 *  files — harmless today because both imports are type-only, and a real one
 *  the day either side needs a value.
 *
 *  `delivery_state` is typed `string` on purpose and travels to the wire that
 *  way — see `LeadMailTimelineRow.deliveryState` for the whole argument. The
 *  ten values live in `apps/api/src/platform/mail/mail.contract.ts`, and a
 *  branch re-declaring them is the second copy of one vocabulary. */
export type LeadMailTimelineRead = {
  run_id: string
  label: string
  run_state: MailRunState
  scheduled_at: Date | string | null
  sent_at: Date | string | null
  delivered_at: Date | string | null
  delivery_state: string
  fail_reason: string | null
  open_count: number
  last_open_at: Date | string | null
  click_count: number
  last_click_at: Date | string | null
}

/** Một dòng đã đọc xong từ bảng, kèm thứ không phải cột.
 *
 *  `daysHere` KHÔNG có trong `LeadRowDb` vì nó không phải cột — máy chủ tính
 *  nó từ `stage_since` ngay trong câu truy vấn. Mang nó cạnh hàng thay vì nhét
 *  vào hàng để `tsc` vẫn phân biệt được "thứ bảng có" và "thứ câu hỏi tính
 *  ra".
 *
 *  Same reasoning now covers four more fields the contract needs:
 *  `ownerName` and `ownerEmail` come from the `actor` left join,
 *  `campaignName` from the `config_entry` left join, `signed` from the
 *  `EXISTS(contract …)` subquery — none of the four is a column on `lead`, so
 *  none of them belongs inside `row` either. */
export type LeadRead = {
  row: LeadRowDb
  daysHere: number
  ownerName: string | null
  ownerEmail: string | null
  /** Name of the campaign `campaign_id` points at, or `null` when the lead has
   *  no campaign OR the campaign row was turned off underneath it. The two
   *  cases are told apart by whether `row.campaignId` is set — see `sourceOf`. */
  campaignName: string | null
  signed: boolean
}

/** The two halves of an origin, assembled into the one object the wire carries.
 *
 *  ------------------------------------------------------------------
 *  THE ID NEVER TRAVELS WITHOUT ITS NAME, AND THAT IS THE WHOLE POINT
 *  ------------------------------------------------------------------
 *  `campaign_id` holds `SR-09`. That code is a KEY: it is what a filter
 *  compares and what a log line is worth reading for, and it is meaningless to
 *  the person looking at the screen. Before this function existed the bare
 *  code went out on the wire alone, and the profile card printed it — because
 *  when a field's only content is an id, printing the id is the only thing a
 *  screen CAN do with it.
 *
 *  So the name is looked up here, once, in the same query that reads the row,
 *  and both travel together. `sourceKindLabel` on the contract side turns the
 *  other half into words. Between them the screen never has a reason to render
 *  either raw value, which is the structural version of "don't show users the
 *  primary key" — a rule that holds because there is nothing left to break it
 *  with, not because everyone remembered.
 *
 *  Absent keys, not nulls, for the same wire reason as everywhere else in this
 *  file: `JSON.stringify` drops an absent key, while `null` reaches the screen
 *  as a value it has to special-case. The object itself is always present even
 *  when empty — the contract requires it, so the screen reads `source.kind`
 *  rather than guarding one more level. */
function sourceOf({ row, campaignName }: LeadRead) {
  return {
    ...(row.sourceKind ? { kind: row.sourceKind } : {}),
    ...(row.campaignId ? { campaignId: row.campaignId } : {}),
    ...(campaignName ? { campaignName } : {}),
  }
}

/** Hàng trong bảng ↔ dòng trong hợp đồng. Chỗ DUY NHẤT biết cả hai hình.
 *
 *  Có một tầng chuyển đổi tường minh chứ không trả thẳng hàng Drizzle ra
 *  ngoài: cột thêm vào bảng thì lộ ngay ra API mà không ai quyết định, và cột
 *  đổi tên thì hợp đồng vỡ lặng lẽ. Ở đây `tsc` bắt được cả hai.
 *
 *  Hai mươi trường hồ sơ (`pain`, `budget`, `decision_maker`…) CỐ TÌNH vắng:
 *  chúng thuộc hợp đồng của `GET /sales/leads/:code`, không thuộc dòng sổ —
 *  `toProfile` ở cuối file chở chúng, và nó GỌI hàm này chứ không chép lại. */
export function toContract(read: LeadRead): LeadRow {
  const { row, daysHere, ownerName, ownerEmail, signed } = read
  return {
    code: row.code,
    company: row.company,
    contactName: row.contactName,
    email: row.email,
    ...(row.contactTitle ? { contactTitle: row.contactTitle } : {}),
    ...(row.province ? { province: row.province } : {}),
    ...(row.category ? { category: row.category } : {}),
    ...(row.tier ? { tier: row.tier } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.contactChannel ? { contactChannel: row.contactChannel } : {}),
    requiredFilled: row.requiredFilled,
    optionalFilled: row.optionalFilled,
    ...(row.ownerId ? { ownerId: row.ownerId } : {}),
    ...(ownerName ? { ownerName } : {}),
    ...(ownerEmail ? { ownerEmail } : {}),
    ...(row.stage ? { stage: row.stage } : {}),
    daysHere,
    source: sourceOf(read),
    signed,
    score: row.score,
    ...(row.lastTouchAt ? { lastTouchAt: row.lastTouchAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.exitReason ? { exitReason: row.exitReason } : {}),
    ...(row.exitedAt ? { exitedAt: row.exitedAt.toISOString() } : {}),
  }
}

/** Một hồ sơ đã đọc xong: dòng sổ, cộng hai người được ghi công.
 *
 *  Same rule as `LeadRead` above, one level wider. `bd_owner_id` and
 *  `marketing_owner_id` ARE columns — they sit inside `row` — while the four
 *  fields below are not: they come from two more `leftJoin(actor, …)`, exactly
 *  the way `ownerName`/`ownerEmail` already do for the holder.
 *
 *  Intersection with `LeadRead` rather than a fresh type, for the reason
 *  `LeadProfile` extends `LeadRow` on the contract side: one shape of the read
 *  row, widened, never a second one written by hand. */
export type LeadProfileRead = LeadRead & {
  bdOwnerName: string | null
  bdOwnerEmail: string | null
  marketingOwnerName: string | null
  marketingOwnerEmail: string | null
}

/** Hàng trong bảng → HỒ SƠ. Một lớp mỏng đặt trên `toContract`.
 *
 *  ------------------------------------------------------------------
 *  IT SPREADS `toContract`, IT DOES NOT RE-MAP THE ROW
 *  ------------------------------------------------------------------
 *  Every field the book already carries is produced by exactly one function,
 *  and this is that same function. Writing the twenty-odd shared assignments
 *  out again here would compile, pass every check, and then quietly answer two
 *  different things for one lead the first time `toContract` gains a rule the
 *  copy never heard about — the failure mode `LeadProfile.extend()` removes on
 *  the contract side, removed here on the mapping side by the same means.
 *
 *  So this function is allowed to know only what the book does NOT carry.
 *
 *  The `? { x } : {}` spread is the same convention `toContract` uses, and it is
 *  about the WIRE: an absent key is what `JSON.stringify` drops, while
 *  `x: undefined` and `x: null` both reach the screen as a value it has to
 *  special-case. The contract spells every one of these fields `optional()`,
 *  meaning "not dug out yet" — that is an absence, not a null. */
export function toProfile(read: LeadProfileRead): LeadProfile {
  const { row } = read
  return {
    ...toContract(read),

    ...(row.legalName ? { legalName: row.legalName } : {}),
    ...(row.taxCode ? { taxCode: row.taxCode } : {}),
    ...(row.address ? { address: row.address } : {}),
    ...(row.mainProduct ? { mainProduct: row.mainProduct } : {}),
    /* `!== null` and not a truthiness test, unlike the strings above: `0` plants
       is a fact somebody dug out, `null` is a question nobody has asked yet, and
       `if (row.plants)` cannot tell those two apart. */
    ...(row.headcount !== null ? { headcount: row.headcount } : {}),
    ...(row.plants !== null ? { plants: row.plants } : {}),

    /* Here and not in `toContract`: the book lists WHICH channel, the profile
       is the only screen that needs the address on it. */
    ...(row.contactChannelUrl ? { contactChannelUrl: row.contactChannelUrl } : {}),

    ...(row.pain ? { pain: row.pain } : {}),
    ...(row.currentStack ? { currentStack: row.currentStack } : {}),
    ...(row.decisionMaker ? { decisionMaker: row.decisionMaker } : {}),
    ...(row.approver ? { approver: row.approver } : {}),
    /* Same `!== null` reasoning; `CHECK lead_money_pair` already guarantees the
       two travel together, so the profile can never print a number whose unit
       nobody knows. */
    ...(row.budget !== null ? { budget: row.budget } : {}),
    ...(row.currency ? { currency: row.currency } : {}),
    ...(row.deadline ? { deadline: row.deadline } : {}),

    ...(row.bdOwnerId ? { bdOwnerId: row.bdOwnerId } : {}),
    ...(read.bdOwnerName ? { bdOwnerName: read.bdOwnerName } : {}),
    ...(read.bdOwnerEmail ? { bdOwnerEmail: read.bdOwnerEmail } : {}),
    ...(row.marketingOwnerId ? { marketingOwnerId: row.marketingOwnerId } : {}),
    ...(read.marketingOwnerName ? { marketingOwnerName: read.marketingOwnerName } : {}),
    ...(read.marketingOwnerEmail ? { marketingOwnerEmail: read.marketingOwnerEmail } : {}),

    ...(row.motion ? { motion: row.motion } : {}),
  }
}

/** Hàng trong bảng → object của E1/E2.
 *
 *  `owner` là TÊN HIỂN THỊ, không phải id — vì trục phạm vi của E2 hiện so
 *  `ref.owner !== actor.name`. Đó là nợ số 2 của `docs/ban-giao-backend.md` và
 *  nó chưa được trả; câu truy vấn ở `lead.repository.ts` đã lọc bằng `id`
 *  (trục đúng), nên hàng rào thật không phụ thuộc vào chỗ này. Ngày engine so
 *  bằng `id`, xoá tham số `ownerName` và mọi thứ khớp lại. */
export function toRef(row: LeadRowDb, ownerName: string | null): ObjectRef {
  return {
    code: row.code,
    kind: 'LD',
    branch: 'Sales',
    label: row.company,
    ...(ownerName ? { owner: ownerName } : {}),
    ...(row.stage ? { state: row.stage } : {}),
  }
}

/** Một mốc mail của lead: hình của driver → hình của hợp đồng.
 *
 *  ------------------------------------------------------------------
 *  VẮNG LÀ VẮNG — KHÔNG CÓ GIÁ TRỊ MẶC ĐỊNH NÀO Ở ĐÂY
 *  ------------------------------------------------------------------
 *  Bốn mốc thời gian và `failReason` đều là `optional` bên hợp đồng, và chúng
 *  được BỎ HẲN khỏi object chứ không gán `null` hay chuỗi rỗng — cùng luật
 *  `toProfile` ở trên đang theo. Một lô chưa tới giờ không có `scheduledAt`
 *  bằng epoch, một lá thư chưa ai mở không có `lastOpenAt` bằng "chưa mở".
 *
 *  `failReason` chỉ đi cùng những trạng thái đã hỏng. `last_error_summary` là
 *  cột dùng chung: bộ vớt dòng kẹt và cầu dao bounce cũng ghi vào đó, nên một
 *  dòng đã `pending` trở lại sau khi được vớt vẫn còn câu chữ của lần hỏng
 *  trước. In nó cạnh một lá thư đang chờ gửi là nói với người xem rằng thư đã
 *  hỏng, trong khi nó sắp đi. */
export function toMailTimeline(read: LeadMailTimelineRead): LeadMailTimelineRow {
  const scheduledAt = isoOf(read.scheduled_at)
  const sentAt = isoOf(read.sent_at)
  const deliveredAt = isoOf(read.delivered_at)
  const lastOpenAt = isoOf(read.last_open_at)
  const lastClickAt = isoOf(read.last_click_at)

  return {
    runId: read.run_id,
    label: read.label,
    runState: read.run_state,
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(sentAt ? { sentAt } : {}),
    ...(deliveredAt ? { deliveredAt } : {}),
    deliveryState: read.delivery_state,
    openCount: read.open_count,
    ...(lastOpenAt ? { lastOpenAt } : {}),
    clickCount: read.click_count,
    ...(lastClickAt ? { lastClickAt } : {}),
    ...(read.fail_reason && FAILED_DELIVERY[read.delivery_state]
      ? { failReason: read.fail_reason }
      : {}),
  }
}

/** Mốc thời gian của driver → `Moc` của hợp đồng (ISO 8601 CÓ múi).
 *
 *  Nhận cả `Date` lẫn chuỗi vì hai driver trả hai kiểu trên một câu SQL thô —
 *  lý do đầy đủ ở `LeadMailTimelineRead`. Chuỗi vẫn đi qua `new Date(...)` chứ
 *  không được trả thẳng: PGlite in ra `2027-01-01 02:00:00+00`, dạng của
 *  Postgres chứ không phải ISO 8601, và `Moc` sẽ từ chối nó ở `.parse()` — một
 *  500 ngay trên đường trả về, đúng thứ mà lớp `.parse()` sinh ra để bắt.
 *
 *  Chuỗi không đọc được thì trả `undefined` chứ không trả `Invalid Date`:
 *  `toISOString()` trên một Date hỏng NÉM, và một mốc không đọc được không đáng
 *  làm cả cái timeline chết. Vắng mốc là một câu trả lời hợp lệ ở mọi trường
 *  của `LeadMailTimelineRow`. */
function isoOf(at: Date | string | null): string | undefined {
  if (!at) return undefined
  const date = at instanceof Date ? at : new Date(at)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/** Những trạng thái giao mà một câu giải thích là ĐÚNG NGHĨA.
 *
 *  Viết ra bằng chữ chứ không suy từ `MAIL_STATE_RANK`: bảng thứ hạng đó nằm
 *  trong `platform/`, và nhánh đọc nó là nhánh phụ thuộc vào một chi tiết của
 *  nền để trả lời một câu hỏi của màn. Bốn giá trị này là hợp đồng của chính
 *  hàm trên — thêm một trạng thái hỏng mới ở nền thì dòng này phải được đọc
 *  lại, và đó là điều đúng. */
const FAILED_DELIVERY: Record<string, true | undefined> = {
  bounced: true,
  complained: true,
  failed_permanent: true,
  dead: true,
}
