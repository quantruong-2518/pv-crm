import {
  CURRENCIES,
  INIT_DATA_QUESTIONS,
  LEAD_CATEGORIES,
  LEAD_TIERS,
  PIPELINE_STAGES,
  SLOT_FIELDS,
  type LeadProfile,
  type QuestionKey,
} from '@pv/engines/fixtures/das-vina'
import {
  DEADLINE_YEARS,
  EMAIL_MAX,
  LEAD_MAX,
  LEAD_NUM,
  LeadPatch,
  PHONE_MAX,
  type LeadCreate,
} from '@pv/contracts'
import { CHANNEL_LABEL } from '@/data/sales-config'

/** Module 2 · BẢN VẼ CỦA FORM HỒ SƠ LEAD.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO FORM LÀ DỮ LIỆU CHỨ KHÔNG PHẢI JSX
 *  ------------------------------------------------------------------
 *  Hồ sơ có hơn ba chục trường. Viết tay ba chục khối `<Field><Input/></Field>`
 *  thì bốn thứ hỏng gần như chắc chắn: thứ tự trôi khỏi thứ tự của bộ 10 câu,
 *  nhãn hai chỗ lệch nhau, một trường mới thêm vào `LeadProfile` mà quên vẽ ra
 *  màn, và không chỗ nào trả lời được "ô số 5 gồm những trường nào".
 *
 *  ------------------------------------------------------------------
 *  BỀ RỘNG: MỌI Ô BẰNG NHAU — chốt 22/08, sau hai lần sai
 *  ------------------------------------------------------------------
 *  Lần 1 · lưới ba cột trải hết bề ngang màn: ô "số nhà máy" rộng 440px để chứa
 *  chữ số `1`, ô "đau ở đâu" rộng 1.470px để chứa một dòng.
 *
 *  Lần 2 · mỗi ô một bề rộng riêng theo nội dung, xếp bằng flex-wrap. Hết ô quá
 *  rộng, nhưng đổi lấy một cái tệ ngang: các ô không còn thẳng cột nào, và một
 *  form ba mươi ô không thẳng hàng thì mắt phải bám lại từ đầu ở mỗi dòng.
 *
 *  Lần 3, bản đang chạy · **lưới đều, mọi ô đúng một ô lưới.** Cột nội dung
 *  chính giờ chỉ chiếm 3/4 màn, nên một ô lưới rơi vào khoảng 340px — vừa đúng
 *  cho tên công ty, không quá rộng cho một con số. Bề rộng không còn là thuộc
 *  tính của trường nữa, nên bảng dưới đây không khai nó.
 *
 *  Ô văn bản (`long`) cũng đúng một ô lưới; nó cao lên chứ không rộng ra.
 *
 *  ------------------------------------------------------------------
 *  DẤU SAO, KHÔNG PHẢI SỐ Ô
 *  ------------------------------------------------------------------
 *  Bản trước đeo nhãn `ô 4` cạnh mỗi nhãn trường để nối form với cổng init data.
 *  Ý đúng, cái giá sai: ba mươi cái nhãn mã số trên một form là ba mươi thứ mắt
 *  phải bỏ qua, và người điền form không quan tâm câu đó đánh số mấy — họ quan
 *  tâm ô nào bắt buộc.
 *
 *  Giờ chỉ còn **dấu sao cho ô không được để trống** (`isRequiredOnSave`), hỏi
 *  thẳng hợp đồng chứ không hỏi cổng init data — xem docblock của hàm đó. Cổng
 *  vẫn đếm y như cũ ở dải trên đầu thẻ.
 *
 *  ------------------------------------------------------------------
 *  BIÊN GIỚI: CÁI GÌ Ở ĐÂY, CÁI GÌ Ở FIXTURE
 *  ------------------------------------------------------------------
 *  `@pv/engines` giữ thứ ĐÚNG-SAI: hồ sơ có những trường nào (`LeadProfile`),
 *  trường nào chở ô nào của bộ 10 câu (`SLOT_FIELDS`), ô nào đã moi được
 *  (`filledSlots`). Đó là luật của phòng kinh doanh, backend nào cũng phải theo.
 *
 *  File này giữ thứ TRÔNG-NHƯ-THẾ-NÀO: nhãn tiếng Việt, thứ tự, bề rộng, ô nào
 *  là select và select đó có gì. Đổi nhãn không đổi luật; đổi luật thì phải
 *  sang fixture. Cùng cách chia với `ORIGIN_FACE` ở `data/leads.ts`.
 *
 *  Kịch bản 2 · DAS Vina. */

// ---------------------------------------------------------------------------
// Bốn cụm — mỗi cụm nói rõ nó dùng để làm gì
// ---------------------------------------------------------------------------

/** Thứ tự bốn cụm LÀ thứ tự người cầm lead cần đọc, không phải thứ tự trong
 *  `LeadProfile`.
 *
 *  `purpose` là câu trả lời cho "mở cụm này ra để làm gì" và nó phải NGẮN —
 *  một dòng, dưới mười hai chữ. Câu dài thì người ta bỏ qua, và một cụm không
 *  ai đọc lời dẫn thì lời dẫn đó chỉ còn là chỗ chiếm mét vuông. Lý do đầy đủ
 *  nằm trong docblock của code, không nằm trên màn. */
export const PROFILE_GROUPS = [
  {
    key: 'khach',
    label: 'Thông tin doanh nghiệp',
    purpose: 'Thông tin pháp lý, ngành và quy mô hoạt động.',
  },
  {
    key: 'nguoi',
    label: 'Người liên hệ',
    purpose: 'Thông tin để gọi và trao đổi với khách.',
  },
  {
    key: 'viec',
    label: 'Nhu cầu và quyết định',
    purpose: 'Vấn đề, ngân sách, người duyệt và thời hạn.',
  },
  {
    key: 'so',
    label: 'Thông tin hệ thống',
    purpose: 'Dữ liệu hệ thống tự ghi, chỉ sửa khi cần thiết.',
  },
] as const

export type GroupKey = (typeof PROFILE_GROUPS)[number]['key']

// ---------------------------------------------------------------------------
// Một trường
// ---------------------------------------------------------------------------

/** Kiểu ô nhập.
 *
 *  `read` KHÔNG phải "input bị disabled": ô chỉ đọc vẽ ra thành chữ, không vẽ
 *  thành một ô nhập xám. Một ô nhập không gõ được là một lời mời bấm vào rồi
 *  thất vọng — và trên tablet thì nó còn ăn mất một vùng chạm 48px. */
export type FieldKind = 'text' | 'long' | 'num' | 'money' | 'date' | 'select' | 'read'

export type ProfileField = {
  key: keyof LeadProfile
  label: string
  kind: FieldKind
  group: GroupKey
  /** Ô nào của bộ 10 câu. Bỏ trống = hệ tự ghi, không đếm vào cổng. */
  slot?: QuestionKey
  /** Câu dẫn dưới ô. Chỉ dùng khi ô có một cái BẪY thật — đổi ô này làm đổi thứ
   *  khác, hoặc ô này hay bị điền sai nghĩa. Không dùng để mô tả lại cái nhãn. */
  hint?: string
  placeholder?: string
  /** Đơn vị in cạnh ô — "người", "nhà máy". */
  unit?: string
  options?: { value: string; label: string }[]
  /** Ô này liệt kê NGƯỜI của phòng, và chuỗi này là dòng "chưa ai" của nó.
   *
   *  Bản vẽ không giữ được danh sách người nữa: sổ người nằm trên máy chủ
   *  (`GET /users/directory`), còn đây là một hằng số tầng module. Nên bản vẽ
   *  chỉ nói ô này hỏi ai và gọi trống là gì; `FieldRow` đổ tên vào lúc vẽ.
   *
   *  Dòng trống KHÔNG dùng chung một chữ cho cả ba ô: "Còn ở kho chung, chưa ai
   *  nhận" và "Chưa BD nào chạm" nói hai chuyện khác nhau về cùng một khoảng
   *  trắng, và đó là chỗ người dùng đọc để biết ô này bỏ trống có sao không. */
  people?: string
  /** Chữ mono: mã, số thuế, số điện thoại — thứ người ta đọc từng ký tự. */
  mono?: boolean
}

const CATEGORY_OPTIONS = LEAD_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))
const TIER_OPTIONS = LEAD_TIERS.map((t) => ({ value: t.key, label: t.label }))
const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: c.label }))

const CHANNEL_OPTIONS = [
  { value: '', label: 'Chưa có kênh liên hệ' },
  ...Object.entries(CHANNEL_LABEL).map(([value, label]) => ({ value, label })),
]

/** What the URL box is called when no channel is picked yet — and the static
 *  label in the field table, which the hand-typing drawer uses as it stands. */
const CHANNEL_URL_LABEL = 'URL kênh liên hệ'

/** The URL box's label, naming the channel currently picked: "URL LinkedIn".
 *
 *  A bare "URL" next to the channel select reads as the URL of something else —
 *  of the lead, of the company, of the campaign. A label that follows the
 *  channel states what it is asking for, instead of making the person infer it
 *  from the control beside it.
 *
 *  Only the detail screen can call this, because only there is a profile being
 *  edited in hand. `CREATE_FIELDS` is built once at module level, so the create
 *  drawer keeps the static label. */
export function channelUrlLabel(channel: string): string {
  const name = (CHANNEL_LABEL as Record<string, string | undefined>)[channel]
  return name ? `URL ${name}` : CHANNEL_URL_LABEL
}

const STAGE_OPTIONS = [
  { value: '', label: 'Chưa vào sổ cơ hội' },
  ...PIPELINE_STAGES.map((s) => ({ value: s.key, label: `${s.label} · hạn ${s.limitDays} ngày` })),
]

/** BẢN VẼ. Thứ tự dòng ở đây là thứ tự trên màn.
 *
 *  Mỗi trường của `LeadProfile` phải có ĐÚNG một dòng — `profileFieldsMissing`
 *  ở cuối file là chỗ chứng minh điều đó, để một trường mới thêm vào kiểu dữ
 *  liệu không lặng lẽ vắng mặt trên màn. */
export const PROFILE_FIELDS: ProfileField[] = [
  // ── 1 · Khách là ai ──────────────────────────────────────────────────────
  {
    key: 'legalName',
    label: 'Tên pháp nhân',
    kind: 'text',
    group: 'khach',
    slot: 'phap-nhan',
    hint: 'Hợp đồng ký theo tên này, không theo tên gọi trong sổ.',
  },
  {
    key: 'taxCode',
    label: 'Mã số thuế',
    kind: 'text',
    group: 'khach',
    slot: 'phap-nhan',
    mono: true,
    placeholder: '10 chữ số',
  },
  {
    key: 'address',
    label: 'Địa chỉ nhà máy',
    kind: 'text',
    group: 'khach',
    slot: 'phap-nhan',
  },
  { key: 'province', label: 'Tỉnh', kind: 'text', group: 'khach' },
  {
    key: 'category',
    label: 'Ngành',
    kind: 'select',
    group: 'khach',
    slot: 'nganh',
    options: CATEGORY_OPTIONS,
    hint: 'Đổi ngành có thể thay đổi người phụ trách mặc định.',
  },
  {
    key: 'mainProduct',
    label: 'Sản phẩm chính',
    kind: 'text',
    group: 'khach',
    slot: 'nganh',
  },
  {
    key: 'headcount',
    label: 'Số người tại chỗ',
    kind: 'num',
    group: 'khach',
    slot: 'quy-mo',
    unit: 'người',
  },
  {
    key: 'plants',
    label: 'Số nhà máy',
    kind: 'num',
    group: 'khach',
    slot: 'quy-mo',
    unit: 'nhà máy',
  },

  // ── 2 · Nói chuyện với ai ────────────────────────────────────────────────
  {
    key: 'contactName',
    label: 'Người liên hệ',
    kind: 'text',
    group: 'nguoi',
    slot: 'nguoi-lien-he',
  },
  {
    key: 'contactTitle',
    label: 'Chức danh',
    kind: 'text',
    group: 'nguoi',
    slot: 'nguoi-lien-he',
  },
  {
    key: 'phone',
    label: 'Điện thoại',
    kind: 'text',
    group: 'nguoi',
    slot: 'kenh',
    mono: true,
  },
  { key: 'email', label: 'Email', kind: 'text', group: 'nguoi', slot: 'kenh' },
  {
    key: 'channel',
    label: 'Kênh gọi lại được',
    kind: 'select',
    group: 'nguoi',
    slot: 'kenh',
    options: CHANNEL_OPTIONS,
    hint: 'Chọn kênh khách vừa sử dụng để phản hồi.',
  },
  {
    key: 'channelUrl',
    label: CHANNEL_URL_LABEL,
    kind: 'text',
    group: 'nguoi',
    /* NO `slot`, and this is the easiest line in the table to get wrong. Slot 5
       of the ten questions asks "which way can we call them back" —
       `SLOT_FIELDS.kenh` measures phone · email · channel, and the server
       measures those same three columns in a generated column. A link is not a
       way to call somebody back. Declaring a slot here would also make
       `isRequiredOnSave` put a star on a box nobody requires. */
    mono: true,
    placeholder: 'linkedin.com/in/…',
  },

  // ── 3 · Việc khách muốn giải ─────────────────────────────────────────────
  {
    key: 'pain',
    label: 'Vấn đề cần giải quyết',
    kind: 'long',
    group: 'viec',
    slot: 'dau',
    placeholder: 'Việc khách muốn giải, kể bằng lời của khách…',
    hint: 'Ghi lại vấn đề do khách xác nhận, không tự suy đoán.',
  },
  {
    key: 'currentStack',
    label: 'Giải pháp đang sử dụng',
    kind: 'long',
    group: 'viec',
    slot: 'dang-dung',
  },
  {
    key: 'decisionMaker',
    label: 'Người ký cuối',
    kind: 'text',
    group: 'viec',
    slot: 'nguoi-ky',
  },
  {
    key: 'approver',
    label: 'Người duyệt ngân sách',
    kind: 'text',
    group: 'viec',
    slot: 'nguoi-ky',
  },
  {
    key: 'budget',
    label: 'Ngân sách dự kiến',
    kind: 'money',
    group: 'viec',
    slot: 'tien',
    hint: 'Ghi ngân sách khách đã chia sẻ, không dùng giá đang chào.',
  },
  {
    key: 'currency',
    label: 'Đồng tiền',
    kind: 'select',
    group: 'viec',
    slot: 'tien',
    options: CURRENCY_OPTIONS,
  },
  { key: 'deadline', label: 'Thời hạn mong muốn', kind: 'date', group: 'viec', slot: 'moc' },

  // ── 4 · Sổ sách ──────────────────────────────────────────────────────────
  { key: 'code', label: 'Mã lead', kind: 'read', group: 'so', mono: true },
  { key: 'company', label: 'Tên gọi trong sổ', kind: 'text', group: 'so' },
  { key: 'tier', label: 'Bậc', kind: 'select', group: 'so', options: TIER_OPTIONS },
  {
    key: 'stage',
    label: 'Cột trong sổ cơ hội',
    kind: 'select',
    group: 'so',
    options: STAGE_OPTIONS,
  },
  {
    key: 'owner',
    label: 'Người phụ trách',
    kind: 'select',
    group: 'so',
    people: 'Còn ở kho chung, chưa ai nhận',
    hint: 'Đổi người phụ trách có thể ảnh hưởng đến phân bổ hoa hồng.',
  },
  {
    key: 'bdOwner',
    label: 'BD đã liên hệ',
    kind: 'select',
    group: 'so',
    people: 'Chưa BD nào chạm',
  },
  {
    key: 'marketingOwner',
    label: 'Marketing phụ trách',
    kind: 'select',
    group: 'so',
    people: 'Không qua Marketing',
  },
  { key: 'source', label: 'Nguồn lead', kind: 'read', group: 'so', mono: true },
  { key: 'createdAt', label: 'Ngày tạo', kind: 'read', group: 'so' },
  /* `dealCode` và `contractCode` KHÔNG còn được vẽ. Lead → cơ hội nay là 1-n,
     nên không cột nào gọi tên được "cái" cơ hội hay "cái" hợp đồng, và
     `GET /sales/leads/:code` không chở trường nào cho chúng — thứ sống sót là
     `signed`, một boolean, và badge trạng thái ở đầu trang đã in nó. Hai ô chỉ
     đọc treo lại ở đây sẽ vĩnh viễn hiện "—", hoặc tệ hơn, in tiếp mã của
     fixture cho một hợp đồng cơ sở dữ liệu chưa từng nghe tên. Hai trường vẫn
     còn trong kiểu `LeadProfile` của fixture (`profileForm` để trống chúng);
     chúng biến mất hẳn ngày form bỏ được hình đóng băng. */
  { key: 'exitReason', label: 'Lý do ra khỏi luồng', kind: 'read', group: 'so' },
]

// ---------------------------------------------------------------------------
// How many characters one box takes — ONE table, both write doors read it
// ---------------------------------------------------------------------------

/** The profile fields that answer to a different name on the wire.
 *
 *  `LeadProfile.channel` is `LeadCreate.contactChannel` — same value set
 *  (`ContactChannel`), two names, because the profile calls it "the channel"
 *  while the table has a `contact_channel` column and a `contact_*` family
 *  around it. Kept as a two-entry table rather than renamed on either side:
 *  renaming the profile field touches the fixture, the gate (`SLOT_FIELDS`) and
 *  four screens for a cosmetic win.
 *
 *  It lives HERE rather than in `data/lead-create.ts`, where it used to, and
 *  the move is the point: BOTH write doors need it, and the edit door borrowing
 *  it from the create door made two peers into a dependency. The blueprint is
 *  what both of them already read.
 *
 *  Typed against `LeadCreate` so a typo does not compile; `LeadPatch` spells
 *  every name it shares identically, which is why the patch door can read the
 *  same table through a widening cast. */
export const PROFILE_TO_WIRE: Partial<Record<ProfileField['key'], keyof LeadCreate>> = {
  channel: 'contactChannel',
  channelUrl: 'contactChannelUrl',
}

/** Narrowed to the one method these lookups ask a schema for, same reason
 *  `data/lead-create.ts` narrows it: `apps/web` does not depend on zod. */
type FieldProbe = { safeParse: (value: unknown) => { success: boolean } }

/** `LEAD_MAX` widened to a plain lookup. Every text field it names is spelled
 *  the same on both sides, so the wire name IS the key. */
const TEXT_MAX: Record<string, number | undefined> = LEAD_MAX

/** A numeric box holds DIGITS, so its ceiling is how many digits the largest
 *  legal value has — `1.000.000` is seven. Derived rather than counted by hand,
 *  so raising a bound in the contract widens the box in the same commit. */
const digitsOf = (n: number) => String(n).length

const NUM_MAX: Record<string, number | undefined> = {
  headcount: digitsOf(LEAD_NUM.headcountMax),
  plants: digitsOf(LEAD_NUM.plantsMax),
  budget: digitsOf(LEAD_NUM.budgetMax),
}

/** How many characters this box accepts — `maxLength` on the control, and never
 *  a second opinion about the rule: it is the contract's own ceiling, read off
 *  the same table `LeadCreate` and `LeadPatch` are built from.
 *
 *  Absent means the field has no character ceiling of its own — a select, a
 *  date, a read-only line. Everything else has one, and the box has to stop
 *  where the schema stops: a person who pastes 900 characters into a box that
 *  takes them happily learns about the 1.000-character rule after pressing the
 *  button, at the bottom of a thirty-field form.
 *
 *  Two fields carry a ceiling of their own rather than one from `LEAD_MAX`: a
 *  mailbox and a phone number are bounded by what is deliverable and what is
 *  dialable, not by what this book chose to store. */
export function maxCharsOf(field: ProfileField): number | undefined {
  if (field.kind === 'read' || field.kind === 'select' || field.kind === 'date') return undefined
  const wire: string = PROFILE_TO_WIRE[field.key] ?? field.key
  if (field.kind === 'num' || field.kind === 'money') return NUM_MAX[wire]
  if (wire === 'email') return EMAIL_MAX
  if (wire === 'phone') return PHONE_MAX
  return TEXT_MAX[wire]
}

/** The window `deadlineDay` accepts, spelled the way `<input type="date">`
 *  wants it. Given to the control so the year spinner cannot leave the range in
 *  the first place — `min`/`max` on a date box is the one native constraint
 *  that stops the two-key typo (`26` → the year 26) before it is a value.
 *
 *  Both write doors draw a date box, so the pair is computed here rather than
 *  twice: two copies of a boundary is two places for it to stop matching the
 *  schema that actually enforces it. */
export const DEADLINE_MIN = `${DEADLINE_YEARS.from}-01-01`
export const DEADLINE_MAX = `${DEADLINE_YEARS.to}-12-31`

/** Which soft keyboard this box asks for on the tablet — rule 3 of
 *  `docs/luat-thiet-ke.md` puts the tablet on the same footing as the desktop.
 *
 *  Only the three boxes where the default alphabetic keyboard is the wrong one.
 *  A phone number typed on a letter keyboard is four taps of mode-switching per
 *  digit, and a mailbox without the `@` key in reach is where this book's typos
 *  come from. `taxCode` is digits and a dash, which is what `numeric` offers;
 *  `tel` would be wrong there — it hands over a dial pad carrying `*` and `#`. */
export function inputModeOf(field: ProfileField): 'email' | 'tel' | 'numeric' | undefined {
  const wire: string = PROFILE_TO_WIRE[field.key] ?? field.key
  if (wire === 'email') return 'email'
  if (wire === 'phone') return 'tel'
  if (wire === 'taxCode') return 'numeric'
  return undefined
}

/** Ô đã chọn, gom theo cụm — màn lặp qua đây thay vì lọc lại ở bốn chỗ. */
export const fieldsOf = (group: GroupKey) => PROFILE_FIELDS.filter((f) => f.group === group)

/** Is this box one the SAVE will refuse to leave empty?
 *
 *  ------------------------------------------------------------------
 *  THE STAR MEANS ONE THING, AND IT IS THIS ONE
 *  ------------------------------------------------------------------
 *  It used to mean something else on this screen: "this box carries a REQUIRED
 *  question of the ten", read off `INIT_DATA_QUESTIONS`. That put a star on
 *  thirteen boxes while the patch door refuses exactly two of them — so eleven
 *  stars marked boxes a person could clear and save without a word of
 *  complaint. Meanwhile the create drawer, built later, used the same glyph for
 *  "the contract will not take this empty". One symbol, two meanings, two
 *  screens: whichever one somebody learned first, they read the other wrong.
 *
 *  So the star now asks the CONTRACT, on both screens, and means the same
 *  thing on both: leave it blank and the write is refused.
 *
 *  The init-data gate did not go anywhere — it is what the progress strip at
 *  the head of each group counts, and a strip that says "4 of 6" is a better
 *  account of it than a glyph that also has to mean something else.
 *
 *  `LeadPatch` is the door this screen posts through. A field it does not carry
 *  at all cannot be required BY it, so those come back false. */
const PATCH_SHAPE = LeadPatch.shape as Record<string, FieldProbe>

export function isRequiredOnSave(field: ProfileField): boolean {
  const wire: string = PROFILE_TO_WIRE[field.key] ?? field.key
  const probe = PATCH_SHAPE[wire]
  /* Refuses `null` = the column is NOT NULL and this door may not empty it.
     Asked of the schema, never listed: the day the contract makes a third field
     unclearable, the star follows in the same commit. */
  return probe !== undefined && !probe.safeParse(null).success
}

/** Which of the ten questions a box carries — kept for the gate strip, and NOT
 *  for the star any more. See `isRequiredOnSave` for why they parted ways. */
export function isMandatory(field: ProfileField): boolean {
  if (!field.slot) return false
  return INIT_DATA_QUESTIONS.find((q) => q.key === field.slot)?.required ?? false
}

// ---------------------------------------------------------------------------
// Đọc và ghi một ô
// ---------------------------------------------------------------------------

/** Giá trị của một trường, quy về chuỗi để ô nhập cầm được.
 *
 *  `null` và `undefined` cùng ra chuỗi rỗng — ô nhập không có khái niệm "chưa
 *  biết", và một chữ "null" hiện trong ô là lỗi cổ điển của form dựng vội. */
export function readField(profile: LeadProfile, key: keyof LeadProfile): string {
  const v = profile[key]
  if (v === null || v === undefined) return ''
  return String(v)
}

/** Chuỗi từ ô nhập, quy ngược về kiểu của trường.
 *
 *  Ô số rỗng trả `null` chứ không trả `0`: xoá trắng ô "số người" nghĩa là
 *  "chưa moi được", còn `0` nghĩa là "nhà máy không có ai" — hai chuyện khác
 *  hẳn nhau, và `filledSlots` đọc đúng khác biệt đó. */
export function writeField(field: ProfileField, raw: string): LeadProfile[keyof LeadProfile] {
  if (field.kind === 'num' || field.kind === 'money') {
    const digits = raw.replace(/\D/g, '')
    return digits === '' ? null : Number(digits)
  }
  return raw as LeadProfile[keyof LeadProfile]
}

/** Trường nào đã đổi so với bản dựng từ fixture.
 *
 *  Màn cần con số này để nói "3 ô đã sửa" và để bật nút hoàn tác. So từng
 *  trường chứ không so cả object: hai object luôn khác nhau về tham chiếu, và
 *  một dirty state luôn bật là một dirty state vô dụng. */
export function changedFields(base: LeadProfile, work: LeadProfile): (keyof LeadProfile)[] {
  return PROFILE_FIELDS.filter((f) => base[f.key] !== work[f.key]).map((f) => f.key)
}

/** Ô của bộ 10 câu mà một cụm đang chở — dùng cho dòng đếm trên đầu cụm. */
export function slotsOfGroup(group: GroupKey): QuestionKey[] {
  const keys = new Set(fieldsOf(group).map((f) => f.slot))
  return INIT_DATA_QUESTIONS.filter((q) => keys.has(q.key)).map((q) => q.key)
}

/** Bản vẽ có phủ hết `LeadProfile` không.
 *
 *  Trả về những trường CÓ TRONG KIỂU mà bản vẽ quên vẽ. Không phải hàm trang
 *  trí: thêm một trường vào `LeadProfile` mà quên thêm dòng ở đây thì trường đó
 *  tồn tại trong dữ liệu, đi qua được TypeScript, và biến mất khỏi màn — không
 *  ai phát hiện cho tới lúc khách hỏi "sao không thấy ô này". Hàm này biến im
 *  lặng đó thành một danh sách đọc được. */
export function profileFieldsMissing(profile: LeadProfile): string[] {
  const drawn = new Set<string>(PROFILE_FIELDS.map((f) => f.key))
  return Object.keys(profile).filter((k) => !drawn.has(k))
}

/** Trường nào thuộc ô nào — bản đảo của `SLOT_FIELDS`, dựng một lần.
 *
 *  Màn cần chiều ngược lại: đứng ở một ô nhập, hỏi "ô này thuộc câu số mấy" để
 *  in cái nhãn `ô 4` bên cạnh nhãn trường. */
export const FIELD_SLOT = new Map<keyof LeadProfile, QuestionKey>(
  Object.entries(SLOT_FIELDS).flatMap(([slot, fields]) =>
    fields.map((f) => [f, slot as QuestionKey] as const),
  ),
)
