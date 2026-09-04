import { z } from 'zod'

/** Nguyên thuỷ dùng chung — bốn thứ lặp lại ở mọi endpoint.
 *
 *  Định nghĩa MỘT lần ở đây chứ không `z.string()` rải khắp nơi: một chuỗi
 *  ngày viết `z.string()` ở mười chỗ là mười cơ hội để chỗ thứ mười nhận
 *  '17/08/2026' trong khi chín chỗ kia nhận '2026-08-17'.
 *
 *  Tên tiếng Việt không dấu, đúng luật định-danh-vs-nhãn của `e2-access.ts`:
 *  đây là khoá của hệ, nó đi vào JSON và log, nên không mang dấu. */

/** Does this string name a day that exists? A regex cannot count the days in
 *  February, so that half of the check has to be a function. */
function isRealCalendarDate(s: string): boolean {
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(5, 7))
  const d = Number(s.slice(8, 10))
  const at = new Date(Date.UTC(y, m - 1, d))
  /* `Date.UTC` maps a year of 0…99 onto 1900…1999 — a rule kept for code
     written before 2000, and one that made this function answer "that day does
     not exist" for '0026-10-15': it built 1926 and then compared 1926 to 26.
     The year 26 does exist; a four-digit year typed as two digits is a
     different complaint, and the field that cares says so itself (`deadlineDay`
     in `./sales/lead-fields`). Undoing the mapping is what keeps this function
     answering only the question it asks. */
  at.setUTCFullYear(y)
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d
}

/** Calendar day, no time. 'YYYY-MM-DD'.
 *
 *  The regex only guards the SHAPE, so it lets '2026-02-31' and '2026-13-01'
 *  through — two well-formed strings that name no day at all. `lead.deadline`
 *  is a Postgres `date`: it rejects both, but it rejects them down at the
 *  driver, which surfaces as a 500 that cannot say which field was wrong.
 *  Checking here turns the same input into one 400 pointing at one field. */
export const Ngay = z
  .string('Ngày là bắt buộc')
  /* `abort` on both checks, and it is what keeps ONE mistake to ONE sentence.
     Without it '15/10/2026' fails the regex AND `isRealCalendarDate` (which
     slices NaN out of a string shaped some other way), so the form prints two
     complaints about one typo — and any check chained on top of `Ngay`, such as
     `deadlineDay`, adds a third. A string that is not a date has nothing more
     to say about itself. */
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Ngày phải dạng YYYY-MM-DD', abort: true })
  .refine(isRealCalendarDate, { error: 'Ngày không có trên lịch', abort: true })

/** Mốc thời gian tuyệt đối, ISO 8601 kèm múi. */
export const Moc = z
  .string('Mốc thời gian là bắt buộc')
  .regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/, 'Mốc phải là ISO 8601 có múi giờ')

/** Tiền, ĐƠN VỊ ĐỒNG, số nguyên.
 *
 *  Số nguyên vì đồng không có phần lẻ, và vì float làm tổng của 100 dòng sổ
 *  lệch ở chữ số thứ mười lăm — đủ để hai màn cùng đọc một nguồn mà hiện hai
 *  con số. Nợ số 7 của `docs/ban-giao-backend.md` (tiền không mang tiền tệ)
 *  sửa bằng cách bọc thành `{ amount, currency }` khi có đơn ngoại tệ thật;
 *  hôm nay khai rõ đơn vị ở tên là bước một. */
export const Dong = z
  .number('Số tiền là bắt buộc')
  /* One sentence for both halves of what `.int()` checks — whole number, and
     inside the range JavaScript can still count exactly. Left to zod they are
     two English sentences ("Not an integer" · "Too big: expected int to be
     <=9007199254740991") appearing in the middle of a Vietnamese form, and a
     figure past the safe range produces BOTH plus whatever ceiling the field
     adds on top. `abort` cuts it to the first thing that is actually wrong. */
  .int({ error: 'Số tiền phải là số nguyên, trong khoảng ghi nhận được', abort: true })
  .nonnegative('Số tiền không được âm')

/** Mã object — 'LD-0042', 'OP-0301'. ASCII, không dấu (nợ số 1). */
export const MaObject = z
  .string('Mã object là bắt buộc')
  .regex(/^[A-Z]{1,3}-\d{3,6}$/, 'Mã object sai dạng')

/** Mã hợp đồng — 'HĐ-2711', 'HĐ-5001'. KHÔNG khớp `MaObject` và không được
 *  ép cho khớp: `MaObject` là `^[A-Z]{1,3}-\d{3,6}$`, còn 'Đ' không nằm trong
 *  `A-Z`. Tiền tố đó là DỮ LIỆU đã có trong sổ đóng băng, không phải một lựa
 *  chọn đặt tên còn mở — câu chuyện đầy đủ ở docblock của `ContractRow`.
 *
 *  Đặt ở `primitives.ts` chứ không ở `sales/contract.ts` vì HAI hợp đồng cùng
 *  cần nó — `ContractRow` và `OpportunityRow` (đơn đã ký in mã hợp đồng ngay
 *  trên dòng sổ). Mà `sales/contract.ts` đã import `sales/opportunity.ts` để
 *  dựng `ContractSignResponse`, nên để nguyên chỗ cũ rồi import ngược lại là
 *  một VÒNG TRÒN chết ngay lúc nạp module: hai file dùng hằng của nhau ngay
 *  trong thân file, nên bên nào chạy sau cũng đọc phải một hằng chưa khởi tạo.
 *  `primitives.ts` không import gì từ `sales/`, nên nó là chỗ duy nhất giữ
 *  được ĐÚNG MỘT bản của cái regex này. */
export const MaHopDong = z
  .string()
  .trim()
  .regex(/^HĐ-\d{3,6}$/, 'Mã hợp đồng sai dạng')

export type Ngay = z.infer<typeof Ngay>
export type Moc = z.infer<typeof Moc>
export type Dong = z.infer<typeof Dong>
export type MaObject = z.infer<typeof MaObject>
export type MaHopDong = z.infer<typeof MaHopDong>

/** Cờ bật/tắt ĐI QUA QUERY STRING.
 *
 *  KHÔNG dùng `z.coerce.boolean()` ở đây, và đây là lý do — nó gọi thẳng
 *  `Boolean(value)`, mà mọi thứ tới từ query string đều là chuỗi:
 *
 *      Boolean('true')  === true
 *      Boolean('false') === true      ← ô lọc thôi lọc, im lặng
 *      Boolean('0')     === true      ←
 *
 *  Một ô lọc luôn trả nhánh `true` không báo lỗi, không đỏ test, và chỉ lộ ra
 *  khi có người hỏi "sao bấm 'đã rơi' vẫn ra đủ sổ". Nhận đúng hai chuỗi rồi
 *  tự đổi sang boolean thì `?running=xyz` là lỗi 400 nói rõ tên ô. */
export const Bool = z.enum(['true', 'false']).transform((v) => v === 'true')

// ---------------------------------------------------------------------------
// CHUẨN HOÁ Ô TEXT — một nơi, mọi cửa vào đi qua
// ---------------------------------------------------------------------------

/** Gộp khoảng trắng: bỏ trắng hai đầu, mọi chuỗi trắng liên tiếp ở giữa thành
 *  ĐÚNG một dấu cách.
 *
 *  Vì sao phải gộp ở giữa chứ không chỉ `trim()`: 'Đã  demo' và 'Đã demo' là hai
 *  chuỗi khác nhau với `=`, khác nhau với `UNIQUE`, và giống hệt nhau với mắt
 *  người. Không gộp thì một danh mục có hai dòng trông y như nhau mà hệ coi là
 *  hai mục, và người nhập không có cách nào nhìn ra mình vừa làm gì. */
export function gomKhoangTrang(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

/** Ô text NGƯỜI NHẬP, bắt buộc. Chuẩn hoá TRƯỚC rồi mới kiểm.
 *
 *  Thứ tự đó là toàn bộ điểm của hàm này: `z.string().min(1)` đặt trước
 *  `trim()` sẽ nhận chuỗi '   ' là hợp lệ rồi ghi ba dấu cách xuống cột. Kiểm
 *  sau khi chuẩn hoá thì thứ đi vào bảng chính là thứ vừa được kiểm.
 *
 *  Dùng cho MỌI ô chữ người gõ — tên danh mục, tên công ty, nhãn nguồn. Đặt ở
 *  `primitives.ts` chứ không ở từng module vì bản thứ hai sẽ lệch bản thứ
 *  nhất, không phải nếu mà là khi (cùng lý do với `Ngay` và `Moc` ở trên). */
export const textNhap = (max = 200) =>
  z
    .string('Không được để trống')
    .transform(gomKhoangTrang)
    .pipe(z.string().min(1, 'Không được để trống').max(max, `Tối đa ${max} ký tự`))

/** Ô text NGƯỜI NHẬP, tuỳ chọn. Rỗng sau khi chuẩn hoá = KHÔNG CÓ.
 *
 *  `''` → `undefined`, và đó là một quyết định về dữ liệu chứ không phải một
 *  tiện nghi: bảng chỉ có MỘT quy ước cho "trống" là `NULL` (nợ số 5 của
 *  `docs/ban-giao-backend.md`, đã ép bằng CHECK ở tầng cột). Form HTML thì luôn
 *  gửi `''` cho ô người dùng bỏ trắng. Không đổi ở đây thì mỗi lần bỏ trắng một
 *  ô là một lần CHECK ném 500 — xem đúng cảnh báo đó ở cuối `ban-giao-db.md`. */
export const textNhapTuyChon = (max = 200) =>
  z
    .string('Ô này phải là chữ')
    .max(max, `Tối đa ${max} ký tự`)
    .transform(gomKhoangTrang)
    .transform((s) => (s === '' ? undefined : s))
    .optional()

// ---------------------------------------------------------------------------
// TWO FIELDS WITH RULES OF THEIR OWN — mailbox and phone are not plain text
// ---------------------------------------------------------------------------
//
// Both build ON TOP of the three normalisers above rather than beside them.
// Whitespace collapsing alone is not enough for either: a mailbox also has a
// case, and a phone number also has decoration.

/** RFC 5321 caps a mailbox at 254 octets; nothing longer is deliverable.
 *
 *  Exported because a `<input maxLength>` needs the same number: a ceiling only
 *  the schema knows is a ceiling the person types past and hears about after
 *  pressing the button. Same reason `LEAD_MAX` in `./sales/lead-fields` exists,
 *  one layer up. */
export const EMAIL_MAX = 254

/** Mailbox. trim, then LOWERCASE, then check the shape — in that order.
 *
 *  Lowercasing is mandatory, not a courtesy. `lead_email_live_idx` in
 *  `lead.schema.ts` is unique on the `email` column itself, so
 *  'Thanh.NV@kyanh.vn' and 'thanh.nv@kyanh.vn' land as two LIVE leads for one
 *  person — exactly what that index exists to prevent. Once the index moves to
 *  `lower(email)` the fence moves down into the table, but the column still
 *  holds two spellings and every hand-written `WHERE email = ?` still misses
 *  half the rows it was meant to find.
 *
 *  `Actor.email` on the platform side already stores trimmed lowercase (said
 *  so at `lead.schema.ts`), so this is also what keeps the two tables speaking
 *  one convention instead of each remembering it separately. */
export const email = z
  .string('Hòm thư là bắt buộc')
  .max(EMAIL_MAX, `Hòm thư tối đa ${EMAIL_MAX} ký tự`)
  .transform((s) => s.trim().toLowerCase())
  /* An EMPTY box is a box nobody filled in, and it has to say so. Without this
     line `''` fell through to `z.email` and came back as the malformed-mailbox
     complaint — the form telling somebody their address is wrong when what they
     did was skip it. `lead-patch.ts` recorded the wart in its own docblock; the
     fix belongs here, where every door reads it, not in one of them. */
  .refine((s) => s !== '', { error: 'Hòm thư là bắt buộc', abort: true })
  .pipe(z.email('Hòm thư sai dạng'))

/** Ceiling on the RAW cell — decoration included, so it is wider than the 15
 *  digits E.164 allows: '+84 (024) 3456 7890' is eleven digits wearing eight
 *  characters of punctuation. Exported for the same reason as `EMAIL_MAX`: the
 *  control has to stop where the schema stops. */
export const PHONE_MAX = 32

/** Country code every number with no `+` of its own is read as belonging to.
 *  A national number does not carry one: '0912 345 678' names a Vietnamese
 *  subscriber only because everybody filling in these files is in Vietnam.
 *
 *  Written down as a constant so the assumption is visible and changeable,
 *  rather than sitting unstated inside a regex. A number from anywhere else
 *  MUST bring its own `+` — `normalisePhone` never guesses a country. */
const DEFAULT_CC = '84'

/** Shortest national number under `DEFAULT_CC` — nine digits once the trunk
 *  zero is off (0912 345 678 · 024 3456 7890). Used to tell a leading country
 *  code apart from an operator prefix that merely starts with the same two
 *  digits; see `withoutDefaultCc`. */
const NATIONAL_MIN = 9

/** Normalise a phone number to E.164: `+`, country code, subscriber, digits
 *  only. THE one spelling this system stores.
 *
 *  Real files carry '0912 345 678', '(024) 3456 7890', '+84-912-345-678',
 *  '84 912 345 678', and — because a spreadsheet turns a phone number into a
 *  NUMBER and eats the leading zero unless stopped — "'0912345678". Left as
 *  typed, five spellings of ONE number are five different values to `=`: a
 *  search by phone comes back empty and the user concludes the book does not
 *  hold the number, not that they spelled it differently from whoever entered
 *  it. Two doors writing two spellings is the same lead saved twice.
 *
 *  How the country gets decided, in order. Only the first line is the person
 *  SAYING which country, and it is the only line believed unconditionally:
 *
 *      '+…' · '00…'    a country was named. Kept exactly as named.
 *      '84…' + long    the code is there, the `+` merely was not typed.
 *      anything else   `DEFAULT_CC`, national number, trunk zero dropped. */
export function normalisePhone(s: string): string {
  /* A spreadsheet writes a leading apostrophe to hold the cell as TEXT, which
     is precisely how the leading zero survives export. It is the file's mark,
     never part of the number — both the straight quote and the curly one an
     autocorrect leaves behind. */
  const raw = s.trim().replace(/^['\u2019]\s*/, '')
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return ''

  /* `+`, or the '00' that stands in for it abroad. A country that is not ours
     is passed through untouched on purpose: we know the trunk-prefix rule of
     ONE country, and applying it to the other two hundred is how '+39 06…'
     (Rome, where the zero is part of the number) loses a digit. */
  const named = raw.startsWith('+') ? digits : digits.startsWith('00') ? digits.slice(2) : ''
  if (named !== '' && !named.startsWith(DEFAULT_CC)) return `+${named}`

  /* What is left is one of ours, wearing the country code, the trunk zero, or
     neither. '+84 0912 345 678' wears BOTH — a spelling that exists nowhere
     but is typed constantly — so the zero comes off after the code does. */
  const body = named !== '' ? named.slice(DEFAULT_CC.length) : withoutDefaultCc(digits)
  return `+${DEFAULT_CC}${body.replace(/^0+/, '')}`
}

/** Drop a leading `DEFAULT_CC` — but only when a whole national number is left
 *  standing behind it.
 *
 *  '84912345678' is the code plus nine digits. '846123456' is 0846 123 456, a
 *  Vinaphone number whose zero a spreadsheet ate, and its '84' is an operator
 *  prefix: cutting it would turn a real subscriber into a seven-digit stump.
 *  Length is what tells the two apart, and it is the only thing that can. */
function withoutDefaultCc(digits: string): string {
  const rest = digits.slice(DEFAULT_CC.length)
  const isCountryCode =
    digits.startsWith(DEFAULT_CC) && rest.replace(/^0+/, '').length >= NATIONAL_MIN
  return isCountryCode ? rest : digits
}

/** Phone field, optional. Empty after normalising means ABSENT.
 *
 *  `''` becomes `undefined` under the same rule as `textNhapTuyChon`, and for
 *  one concrete reason: `phone` is listed in `CHECK lead_no_blank`, so a field
 *  the user left alone — which an HTML form always submits as `''` — is one
 *  more 500 thrown by that CHECK.
 *
 *  The 15-digit ceiling is E.164. Anything longer is not a number anyone can
 *  dial, and such a value in the book is a dead click-to-call on the profile.
 *  `PHONE_MAX` above bounds what is typed, decoration and all; the 8…15 rule
 *  applies to what is left once the decoration comes off and the country code
 *  goes on. */
export const phoneOptional = z
  .string('Số điện thoại phải là chữ số')
  .max(PHONE_MAX, { error: `Số điện thoại tối đa ${PHONE_MAX} ký tự`, abort: true })
  /* Letters are REFUSED rather than stripped, and the difference is a whole
     class of silent wrong data. `normalisePhone` keeps only digits, so before
     this line a cell reading 'goi 0912345678' or '0912345678 (di dong)' parsed
     cleanly into `0912345678` — the schema quietly deciding which part of the
     cell the person meant. That is exactly the guess `readHeadcount` in
     `apps/api/.../lead-import.check.ts` refuses to make about a number, and a
     phone number typed with a note beside it is the same situation: what got
     thrown away might have been a second number, or an extension.
     Punctuation stays welcome — that is decoration, not content, and the
     apostrophe a spreadsheet glues on front is decoration the file added by
     itself, without anybody typing it. */
  .refine((s) => !/[^\d\s+\-().'\u2019]/.test(s), 'Số điện thoại chỉ gồm chữ số và dấu ngăn')
  .transform(normalisePhone)
  .transform((s) => (s === '' ? undefined : s))
  .pipe(
    z
      .string()
      .regex(/^\+\d{8,15}$/, 'Số điện thoại phải có 8…15 chữ số')
      .optional(),
  )
  .optional()

// ---------------------------------------------------------------------------
// QUERY STRING — everything arriving here is a STRING, including what looks
// like a number
// ---------------------------------------------------------------------------

/** Integer arriving THROUGH A QUERY STRING. Converted explicitly, never with
 *  `z.coerce.number()`.
 *
 *  Same family as `Bool` above and the same trap — `coerce` calls JavaScript's
 *  own conversion, and that function has opinions about the empty string:
 *
 *      Number('')      === 0        <- an empty filter becomes a floor of 0
 *      Number('  ')    === 0        <-
 *      Number('1,400') === NaN      <- thousands separator, nobody says a word
 *
 *  Browsers still submit the key for a filter the user left blank, so the
 *  first line happens daily: `?headcountMin=` turns into "from 0 upwards"
 *  instead of "do not filter", and nothing goes red anywhere. Accepting the
 *  integer shape and converting it here turns all three lines into one 400
 *  that names the field.
 *
 *  `PageQuery` in `./pagination` still uses `coerce`, and that is NOT an
 *  oversight: the `.min(1)` right behind it turns `page=''` into a 400. Use
 *  this one wherever no lower bound is covering for you. */
export const intFromQuery = z
  .string()
  .trim()
  .regex(/^-?\d+$/, 'Phải là số nguyên, không dấu ngăn nghìn')
  .transform(Number)
  .pipe(z.number().int('Số quá lớn để đếm chính xác'))

/** Money arriving THROUGH A QUERY STRING, in dong. `intFromQuery` first, `Dong`
 *  second — so `?budgetMin=-1` dies at `nonnegative()` instead of becoming a
 *  negative floor that quietly matches the whole book. */
export const moneyFromQuery = intFromQuery.pipe(Dong)

/** Date arriving THROUGH A QUERY STRING. ISO only, deliberately.
 *
 *  '15/10/2026' is refused at the boundary because every date reader has to
 *  guess between day-first and month-first: '10/11/2026' is valid under both
 *  readings and the two readings differ by a month, silently. The place that
 *  accepts the Vietnamese hand-typed form is the screen layer (`readDate` in
 *  `apps/web/src/data/intake.ts`); by the time it reaches here there is one
 *  form left — and `Ngay` has already checked the day exists. */
export const dateFromQuery = z.string().trim().pipe(Ngay)
