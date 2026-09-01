import {
  ArrowLeftRight,
  CalendarClock,
  FileSpreadsheet,
  Handshake,
  Megaphone,
  PenLine,
  PhoneIncoming,
  PhoneOutgoing,
  Plug,
  RefreshCw,
  ScanLine,
  type IconGlyph,
} from '@pv/ui'
import {
  INTAKE_TRUST,
  LEAD_INTAKES,
  LEAD_MOTIONS,
  type Actor,
  type IntakeTrust,
  type LeadIntake,
  type LeadMotion,
} from '@pv/engines'
import {
  LEAD_CATEGORIES,
  LEAD_TIERS,
  REQUIRED_SLOTS,
  SOURCES,
  type Lead,
  type LeadCategory,
  type LeadTier,
  type Opportunity,
  type OriginKind,
  type QuestionKey,
} from '@pv/engines/fixtures/das-vina'
import { EMAIL_MAX, LEAD_MAX, MAX_IMPORT_CELL, PHONE_MAX } from '@pv/contracts'
import { peopleIdOptions, peopleNameOptions } from '@/data/directory'
import { CHANNEL_LABEL } from '@/data/sales-config'
import { MAX_ROWS, type Sheet } from '@/data/intake-file'

/** Lead vào hệ bằng đường nào — phần TẦNG APP.
 *
 *  Từ vựng (sáu thế · năm đường vào · ba mức tin) nằm ở `@pv/engines`; file này
 *  giữ ba thứ mà platform không được biết:
 *   1 · cách VẼ chúng — nhãn, hình, câu giải thích (cùng chỗ với `ORIGIN_FACE`,
 *       và cùng lý do: "inbound trông như thế nào" là cách nói của phòng kinh
 *       doanh, không phải kiến thức của engine);
 *   2 · SPEC CỘT của từng luồng nạp — cột nào bắt buộc, bí danh nào dò ra nó;
 *   3 · LUẬT NẠP — dòng nào hợp lệ, dòng nào trùng, dòng nào hỏng.
 *
 *  Kịch bản 2 · DAS Vina. */

// ---------------------------------------------------------------------------
// Mặt của sáu thế
// ---------------------------------------------------------------------------

export type MotionFace = {
  label: string
  icon: IconGlyph
  /** Một câu định nghĩa — ai chủ động. */
  blurb: string
  /** Ví dụ thật, để người đọc tự xếp lead của mình vào đúng chỗ. */
  example: string
}

export const MOTION_FACE: Record<LeadMotion, MotionFace> = {
  inbound: {
    label: 'Inbound',
    icon: PhoneIncoming,
    blurb: 'Khách tự tìm tới mình.',
    example: 'Form landing · hotline gọi vào · thư về info@ · nhắn Zalo OA',
  },
  outbound: {
    label: 'Outbound',
    icon: PhoneOutgoing,
    blurb: 'Mình đi tìm khách, khách chưa biết mình là ai.',
    example: 'Chuỗi email lạnh · cold call · prospect LinkedIn · danh sách mua về',
  },
  event: {
    label: 'Sự kiện',
    icon: CalendarClock,
    blurb: 'Gặp mặt ở hội thảo, triển lãm hoặc webinar.',
    example: 'Danh sách đăng ký · quét thẻ tại gian hàng · sổ khách ghé bàn',
  },
  referral: {
    label: 'Giới thiệu',
    icon: Handshake,
    blurb: 'Khách cũ chỉ sang, không qua đợt nào.',
    example: 'Giám đốc nhà máy giới thiệu sang nhà máy anh em cùng tập đoàn',
  },
  partner: {
    label: 'Đối tác',
    icon: ArrowLeftRight,
    blurb: 'Đại lý hoặc nhà tích hợp đẩy khách sang.',
    example: 'Nhà tích hợp hệ thống chuyển lại phần phần mềm cho mình',
  },
  recycle: {
    label: 'Đánh thức lại',
    icon: RefreshCw,
    blurb: 'Lead cũ đã ra khỏi luồng, nay có cớ để quay lại.',
    example: 'Đơn thua vì hết ngân sách năm ngoái, sang năm mở lại',
  },
}

/** Thứ tự bày ra màn. Hai thế đầu là hai thế lớn nhất của mọi phòng kinh doanh
 *  nên đứng trước; `recycle` đứng cuối vì nó là thế của lead CŨ. */
export const MOTION_ORDER = LEAD_MOTIONS

// ---------------------------------------------------------------------------
// Mặt của năm đường vào
// ---------------------------------------------------------------------------

export type IntakeFace = {
  label: string
  icon: IconGlyph
  blurb: string
  /** Đường này đã dựng chưa. Nói thẳng ra chứ không giấu: một bảng phân loại
   *  vẽ đủ năm đường mà ba cái không bấm được là một bảng nói dối. */
  built: boolean
}

export const INTAKE_FACE: Record<LeadIntake, IntakeFace> = {
  'dong-bo': {
    label: 'Đợt tự đổ về',
    icon: Megaphone,
    blurb: 'Chiến dịch chạy xong, lead từ đợt rơi thẳng vào sổ.',
    built: true,
  },
  tep: {
    label: 'Nạp tệp',
    icon: FileSpreadsheet,
    blurb: 'Kéo một tệp CSV hoặc Excel vào sổ, khớp cột rồi nạp cả lô.',
    built: true,
  },
  tay: {
    label: 'Gõ tay',
    icon: PenLine,
    blurb: 'Một dòng một lần, người gõ chịu trách nhiệm từng ô.',
    built: false,
  },
  quet: {
    label: 'Quét thẻ',
    icon: ScanLine,
    blurb: 'Quét mã tại quầy sự kiện — khách đang đứng trước mặt.',
    built: false,
  },
  api: {
    label: 'Hệ khác đẩy sang',
    icon: Plug,
    blurb: 'Webhook từ form ngoài, tổng đài hoặc nền tảng marketing.',
    built: false,
  },
}

export const INTAKE_ORDER = LEAD_INTAKES

// ---------------------------------------------------------------------------
// Mặt của ba mức tin
// ---------------------------------------------------------------------------

export const TRUST_FACE: Record<
  IntakeTrust,
  { label: string; tone: 'success' | 'running' | 'draft'; blurb: string }
> = {
  'xac-minh': {
    label: 'Có khách xác nhận',
    tone: 'success',
    blurb: 'Người bên khách đã tự tay đưa thông tin.',
  },
  'khai-bao': {
    label: 'Có người mình đứng tên',
    tone: 'running',
    blurb: 'Một người bên mình chịu trách nhiệm dòng này.',
  },
  tho: {
    label: 'Chưa ai xác nhận',
    tone: 'draft',
    blurb: 'Mới là một dòng dữ liệu — chưa ai chạm khách.',
  },
}

export const trustOf = (intake: LeadIntake) => TRUST_FACE[INTAKE_TRUST[intake]]

// ---------------------------------------------------------------------------
// Thế của 100 dòng đang có trong sổ
// ---------------------------------------------------------------------------

/** Suy thế từ xuất xứ — dây nối bảng phân loại mới vào 100 dòng đã đóng băng.
 *
 *  Suy chứ không thêm trường vào fixture, và đó là điểm chính: `Lead` trong
 *  fixture không có ô `motion` nào, nên nếu bảng phân loại này đòi một ô mới
 *  thì 100 dòng cũ hoặc phải sửa hết (đụng số đã khoá), hoặc phải mang một ô
 *  rỗng mãi mãi. Suy ra được thì cả hai chuyện đó không xảy ra.
 *
 *  Chỗ suy KHÔNG khít, và phải nói ra: một chiến dịch email đẻ ra cả lead
 *  outbound (người trả lời thư mình gửi) lẫn lead inbound (người bấm landing
 *  rồi tự điền form) — fixture không phân biệt hai loại đó, nên ở đây cả chuỗi
 *  ra `outbound`. Có nhật ký đợt theo từng lead thì tách lại. */
export function motionOfOrigin(kind: OriginKind): LeadMotion {
  switch (kind) {
    case 'chien-dich':
      return 'outbound'
    case 'su-kien':
      return 'event'
    case 'gioi-thieu':
      return 'referral'
    case 'tu-mo':
      return 'outbound'
  }
}

// ---------------------------------------------------------------------------
// Spec cột của một luồng nạp
// ---------------------------------------------------------------------------

export type ImportField = {
  key: string
  label: string
  /** Thiếu ô này thì DÒNG hỏng, không phải cả tệp hỏng. */
  required?: boolean
  /** Bí danh dò tiêu đề cột. Viết thường, không dấu — `normalise` lo phần đó. */
  aliases: string[]
  /** Danh sách đóng. Có thì giá trị phải khớp một `value` hoặc một `label`. */
  options?: { value: string; label: string }[]
  /** Character ceiling for ONE cell, taken from the contract rather than
   *  chosen here. Absent falls back to `ImportSpec.cellMax`.
   *
   *  An over-long cell breaks THAT ROW and not the batch, and the difference is
   *  the whole point of checking here at all: the same ceiling also sits on the
   *  request body (`importCell`, `LeadImportRow.first`), where crossing it
   *  fails `safeParse` and the panel reports every row of the file as broken
   *  because of one. Stopping the cell in the browser means the server never
   *  sees one, so that branch stops being reachable. */
  max?: number
  /** Ô này liệt kê NGƯỜI, và danh sách chỉ có sau khi sổ người dùng về.
   *
   *  Bản vẽ không giữ nổi một danh sách người: bảy cái tên đóng băng trong
   *  fixture là thứ vừa bị bỏ, và một `const` đọc query thì không tồn tại. Nên
   *  bản vẽ chỉ nói ô này hỏi ai, còn `withPeople` đổ tên vào lúc màn đã có sổ.
   *
   *  `'name'` hay `'id'` KHÔNG thay nhau được: sổ lead giữ TÊN ở `Lead.owner`,
   *  sổ cơ hội giữ ID ở `saleOwners`/`bdOwners`. Dùng nhầm thì tệp nạp xong
   *  trông vẫn đúng trên bảng mà mọi phép lọc theo người đều trượt — kiểu sai
   *  không compiler nào bắt được vì cả hai đều là `string`. */
  people?: 'name' | 'id'
  /** Ô này KHÔNG phải một cột của sổ: giá trị của nó ghép vào TRƯỚC trường
   *  `mergeBefore` (cách một dấu cách) rồi biến mất khỏi dòng.
   *
   *  Sinh ra cho đúng một ca, và nói thẳng ca đó ra: mọi bản xuất kiểu Apollo
   *  hay ZoomInfo tách tên người thành 'First Name' và 'Last Name', mà một
   *  trường chỉ nhận được MỘT cột — `ColumnMapping` là một chỉ số. Không có
   *  cửa này thì nửa còn lại của cái tên nằm lại trong tệp, và người nạp phải
   *  đi sửa tệp trước khi nạp — đúng thứ luồng này tồn tại để khỏi phải làm.
   *
   *  Hướng ghép nằm trong TÊN: TRƯỚC, không phải sau. Ở tên Việt và tên Hàn —
   *  hai nhóm chiếm gần hết mọi tệp chạy qua cửa này — 'Last Name' chính là
   *  HỌ, và "Trịnh Phùng" mới là thứ người ta gọi nhau. Tệp xếp kiểu Tây thì
   *  đổi hai ô cho nhau ở bước 2, chỗ vẫn bày ra để sửa. */
  mergeBefore?: string
  /** Một ô mẫu, dùng dựng tệp mẫu tải về. */
  sample: string
}

export type ImportSpec = {
  key: 'lead' | 'recipient' | 'op'
  /** Tiêu đề panel. */
  title: string
  /** Một câu: nạp cái gì vào đâu. */
  blurb: string
  /** Đường vào cố định của luồng — cả ba luồng đều là `tep`, và nói ra chứ
   *  không ngầm hiểu, vì đó là thứ quyết định mức tin của dòng nạp về. */
  intake: LeadIntake
  /** Thế được phép chọn cho cả lô. Cắt theo `MOTION_BY_INTAKE` của engine rồi
   *  cắt tiếp theo chỗ người dùng đang đứng — nạp trong hồ sơ một buổi hội thảo
   *  thì không có lý do gì để chọn `partner`.
   *
   *  VẮNG MẶT nghĩa là luồng này không có thế để chọn, và panel giấu hẳn ô đó
   *  thay vì bày một danh sách rỗng: cửa nạp cơ hội ghi vào một bảng không có
   *  cột `motion`, nên một ô chọn ở đó là một ô không làm gì. Danh sách RỖNG
   *  không phải cách nói điều này — nó vẫn vẽ ra một ô select trắng. */
  motions?: readonly LeadMotion[]
  /** Thế chọn sẵn khi mở panel, và là thế `ImportCommit` chở về cho màn. Vẫn bắt
   *  buộc kể cả khi `motions` vắng: một luồng không cho chọn vẫn phải trả về một
   *  giá trị, và màn nào không dùng tới thì bỏ nó ở đường dịch của mình. */
  defaultMotion: LeadMotion
  fields: ImportField[]
  /** Default ceiling for a cell with no `max` of its own — the body-level
   *  ceiling of whatever contract this loader posts to. Absent means no check,
   *  exactly as before. */
  cellMax?: number
  /** Tên tệp mẫu tải về, không có đuôi. */
  sampleStem: string
}

const CATEGORY_OPTIONS = LEAD_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))
const TIER_OPTIONS = LEAD_TIERS.map((t) => ({ value: t.key, label: t.label }))
const SOURCE_OPTIONS = SOURCES.map((s) => ({ value: s.code, label: s.label }))
const CHANNEL_OPTIONS = Object.entries(CHANNEL_LABEL).map(([value, label]) => ({ value, label }))

/** Bản vẽ + sổ người = bản vẽ dùng được.
 *
 *  Trả về một spec MỚI thay vì sửa tại chỗ: `LEAD_SPEC` là hằng số tầng module,
 *  và một hàm ghi đè lên nó sẽ ghi đè cho cả những màn đang mở panel khác.
 *
 *  Chưa có người thì `options` vắng, và ô nhập thành ô chữ tự do đúng như mọi
 *  ô không có danh sách đóng — KHÔNG phải danh sách rỗng, thứ sẽ từ chối sạch
 *  mọi dòng của một tệp 5.000 dòng chỉ vì sổ người về chậm hơn tệp. */
export function withPeople(spec: ImportSpec, people: readonly Actor[]): ImportSpec {
  if (people.length === 0) return spec
  const byName = peopleNameOptions(people)
  const byId = peopleIdOptions(people)
  return {
    ...spec,
    fields: spec.fields.map((f) =>
      f.people ? { ...f, options: f.people === 'name' ? byName : byId } : f,
    ),
  }
}

/** Spec của sổ lead — luồng nạp chính.
 *
 *  ------------------------------------------------------------------
 *  BA CỘT SAO LÀ ĐÚNG BA CỘT MÁY CHỦ ĐÒI, KHÔNG PHẢI BA CỘT KHÁC
 *  ------------------------------------------------------------------
 *  `company` · `contactName` · `email` — cùng ba ô `checkRow` của
 *  `apps/api/.../lead-import.check.ts` chặn, và cùng ba ô hợp đồng gọi là tối
 *  thiểu (`packages/contracts/src/sales/lead.ts`: một lead vào bằng landing
 *  page chỉ có bấy nhiêu, phần còn lại là thứ MOI RA sau).
 *
 *  Bản trước đánh sao vào `province` và `category`, và đó là một cửa chặn
 *  KHÔNG ai bên kia dây yêu cầu: trình duyệt từ chối đúng những dòng máy chủ
 *  sẵn sàng nhận. Tệ hơn, `category` là danh sách ĐÓNG bốn giá trị, nên mọi
 *  tệp mua về — Apollo, ZoomInfo, danh sách hội chợ — chết sạch ở dòng đầu
 *  tiên vì "aviation & aerospace" không phải Chip/Cơ khí/Ô tô/Dược. Hai cột ấy
 *  nay là tuỳ chọn: ô sai danh sách đóng khi KHÔNG bắt buộc thì bị bỏ và dòng
 *  vẫn vào sổ (xem `buildRows`) — mất một ô nhẹ hơn mất cả một khách.
 *
 *  Đổi cửa chặn ở đây KHÔNG hạ chuẩn dữ liệu: ô nào tệp không lấp thì cổng
 *  init data không tính, lead vào sổ ở bậc Đầu mối và nằm chờ người moi tiếp.
 *  Đó đúng là chỗ một dòng mua về phải nằm.
 *
 *  Phần còn lại của danh sách rơi thẳng vào bộ 10 câu (`LeadProfile`) và ĐẾM
 *  vào cổng init data: nạp một tệp đầy đủ thì lead vào sổ đã qua sẵn cổng,
 *  không phải moi lại từ đầu. Đó là lý do danh sách này dài hơn ba cột — cắt
 *  ngắn cho gọn là bắt BD gõ lại bằng tay đúng những ô tệp đã có sẵn. */
export const LEAD_SPEC: ImportSpec = {
  key: 'lead',
  title: 'Nạp lead vào sổ',
  blurb: 'Mỗi dòng của tệp thành một lead. Cột nào khớp được thì tính luôn vào cổng init data.',
  intake: 'tep',
  motions: ['outbound', 'event', 'partner', 'recycle'],
  defaultMotion: 'outbound',
  sampleStem: 'mau-nap-lead',
  /* `importCell`'s ceiling in the contract. The columns with no `max` of their
     own — industry, campaign, tier, channel, headcount — still have to stay
     under it, because it is a ceiling on the BODY: one cell over it fails
     `LeadImportBody.safeParse`, which reports 5.000 rows broken because of
     one. */
  cellMax: MAX_IMPORT_CELL,
  fields: [
    {
      key: 'company',
      label: 'Account',
      required: true,
      max: LEAD_MAX.company,
      aliases: ['account', 'cong ty', 'ten cong ty', 'ten khach hang', 'khach hang', 'company'],
      sample: 'Điện tử Kỳ Anh',
    },
    {
      key: 'province',
      label: 'Tỉnh',
      max: LEAD_MAX.province,
      /* 'company city' và 'company state' có mặt vì tệp Apollo — bản xuất
         phổ biến nhất của khối outbound — chở BỐN cột địa danh: 'City' và
         'State' của NGƯỜI, 'Company City' và 'Company State' của CÔNG TY. Sổ
         lead hỏi tỉnh của công ty, và ở bản Việt Nam thì đúng cột là
         'Company State' ("Ho Chi Minh", "Da Nang") — 'Company City' giữ tên
         quận/phường.

         Bốn cột cùng khớp thì bộ đoán chọn cột ĐẦY nhất, không chọn cột đứng
         trước (xem `guessMapping`): 'City' đứng trước trong tệp mà rỗng ở
         năm trên tám dòng, và một cột rỗng thắng là cả lô chết vì "Thiếu
         Tỉnh". */
      aliases: [
        'tinh',
        'tinh thanh',
        'dia phuong',
        'province',
        'city',
        'company city',
        'company state',
      ],
      sample: 'Hải Phòng',
    },
    {
      key: 'category',
      label: 'Ngành',
      /* KHÔNG bắt buộc, và danh sách đóng là chính lý do: bốn ngành của
         `LEAD_CATEGORIES` là cách PV One chia thị trường, không phải cách
         Apollo hay ZoomInfo chia. Bắt buộc + danh sách đóng nghĩa là mọi tệp
         mua về chết ở dòng đầu tiên. Nay ô lệch danh sách bị bỏ, ngành để
         trống, và ô số 2 của cổng init data đơn giản là chưa điền. */
      aliases: ['nganh', 'linh vuc', 'nhom nganh', 'category', 'industry'],
      options: CATEGORY_OPTIONS,
      sample: 'Chip',
    },
    {
      key: 'source',
      label: 'Nguồn',
      aliases: ['nguon', 'ma nguon', 'chien dich', 'source', 'campaign'],
      options: SOURCE_OPTIONS,
      sample: 'CD-0101',
    },
    {
      key: 'owner',
      label: 'Lead PIC',
      aliases: ['lead pic', 'pic', 'nguoi giu', 'phu trach', 'owner', 'sale'],
      max: LEAD_MAX.contactName,
      people: 'name',
      sample: 'Lê Hoàng Nam',
    },
    {
      key: 'tier',
      label: 'Bậc',
      aliases: ['bac', 'tier', 'stage', 'muc'],
      options: TIER_OPTIONS,
      sample: 'Đầu mối',
    },
    {
      key: 'legalName',
      label: 'Tên pháp nhân',
      aliases: ['ten phap nhan', 'phap nhan', 'ten dang ky', 'legal name'],
      max: LEAD_MAX.legalName,
      sample: 'Công ty CP Điện tử Kỳ Anh',
    },
    {
      key: 'taxCode',
      label: 'Mã số thuế',
      aliases: ['ma so thue', 'mst', 'tax code', 'tax'],
      max: LEAD_MAX.taxCode,
      sample: '0201234567',
    },
    {
      key: 'address',
      label: 'Địa chỉ',
      aliases: ['dia chi', 'address', 'dia chi nha may'],
      max: LEAD_MAX.address,
      sample: 'KCN Nomura, Hải Phòng',
    },
    {
      key: 'contactName',
      label: 'Người liên hệ',
      required: true,
      max: LEAD_MAX.contactName,
      /* 'contact' TRẦN đã bỏ: vòng dò thứ hai khớp theo CHỨA, và
         "Last Contacted" của Apollo chứa nó — cột ngày liên hệ gần nhất giành
         mất ô Người liên hệ, rồi mọi dòng chết ở máy chủ vì thiếu tên. Giữ
         'contact name' là đủ: một cột tên đúng "Contact" vẫn khớp được ở vòng
         hai theo chiều ngược (`'contact name'.includes('contact')`).

         'first name' vào danh sách vì mọi bản xuất kiểu Apollo TÁCH họ và tên
         thành hai cột. Nửa còn lại KHÔNG bị bỏ lại trong tệp: trường 'Họ' ngay
         dưới nhặt nó rồi ghép vào đây (`mergeBefore`). */
      aliases: [
        'nguoi lien he',
        'lien he',
        'ten lien he',
        'contact name',
        'first name',
        'ho ten',
        'ho va ten',
        'full name',
      ],
      sample: 'Nguyễn Văn Thành',
    },
    {
      key: 'contactSurname',
      /* Nhãn nói rõ "nếu tách cột" chứ không chỉ "Họ", và không phải để cho
         đẹp: nhãn cũng là một bí danh dò cột (`guessMapping` ghép nó vào đầu
         danh sách targets), và một target hai ký tự như 'ho' thì ở vòng dò
         THEO CHỨA sẽ khớp trúng "Home Phone" của chính tệp Apollo. Nhãn dài
         hơn ba chữ là cách rẻ nhất để chuyện đó không xảy ra — mà một cột tên
         đúng "Họ" vẫn khớp được ở vòng hai theo chiều ngược. */
      label: 'Họ (nếu tách cột)',
      aliases: ['last name', 'surname', 'family name', 'ho lot', 'ho va ten dem'],
      mergeBefore: 'contactName',
      max: LEAD_MAX.contactName,
      /* Ô mẫu RỖNG có chủ ý: tệp mẫu tải về là tệp gõ tay, và người gõ tay
         điền cả họ tên vào một ô "Người liên hệ". Cột này chỉ có nghĩa với tệp
         MÁY xuất ra, nên để trống là câu trả lời đúng cho "ô này điền gì". */
      sample: '',
    },
    {
      key: 'contactTitle',
      label: 'Chức danh',
      aliases: ['chuc danh', 'chuc vu', 'title', 'position'],
      max: LEAD_MAX.contactTitle,
      sample: 'Giám đốc nhà máy',
    },
    {
      key: 'phone',
      label: 'Điện thoại',
      aliases: ['dien thoai', 'sdt', 'so dien thoai', 'phone', 'mobile', 'tel'],
      max: PHONE_MAX,
      sample: '0912345678',
    },
    {
      key: 'email',
      label: 'Email',
      /* Bắt buộc vì hai cửa dưới nó đều bắt buộc: máy chủ khoá chống trùng
         theo `email:lower(email)`, và cả sổ lead sinh ra là để gửi được MAS
         mail. Một dòng không hòm thư vừa không so trùng được vừa không làm
         được việc nó được nạp vào để làm. */
      required: true,
      aliases: ['email', 'thu dien tu', 'mail', 'e-mail'],
      max: EMAIL_MAX,
      sample: 'thanh.nv@kyanh.vn',
    },
    {
      key: 'channel',
      label: 'Kênh liên hệ',
      aliases: ['kenh', 'kenh lien he', 'channel'],
      options: CHANNEL_OPTIONS,
      sample: 'Zalo OA',
    },
    {
      key: 'headcount',
      label: 'Quy mô',
      aliases: ['quy mo', 'so nguoi', 'nhan su', 'headcount', 'size'],
      sample: '1400',
    },
    {
      key: 'pain',
      label: 'Vấn đề đang gặp',
      aliases: ['van de', 'nhu cau', 'pain', 'ghi chu', 'note'],
      max: LEAD_MAX.pain,
      sample: 'Theo dõi tiến độ chuyền bằng Excel, cuối tháng mới biết trễ',
    },
  ],
}

/** Spec danh sách người nhận của một chiến dịch.
 *
 *  Ngắn hơn spec lead có chủ đích: ở bậc này chưa ai là khách hàng, họ mới là
 *  một địa chỉ trong danh sách gửi. Đòi ngành và tỉnh ở đây là đòi thứ chỉ biết
 *  được SAU khi có người trả lời. */
export const RECIPIENT_SPEC: ImportSpec = {
  key: 'recipient',
  title: 'Nạp danh sách người nhận',
  blurb: 'Danh sách gửi của một đợt, hoặc danh sách đăng ký và người đến của một buổi.',
  intake: 'tep',
  motions: ['outbound', 'event'],
  defaultMotion: 'outbound',
  sampleStem: 'mau-nap-nguoi-nhan',
  fields: [
    {
      key: 'company',
      label: 'Account',
      required: true,
      aliases: ['account', 'cong ty', 'ten cong ty', 'khach hang', 'company'],
      sample: 'Điện tử Kỳ Anh',
    },
    {
      key: 'contactName',
      label: 'Người nhận',
      aliases: ['nguoi nhan', 'ho ten', 'ten', 'contact', 'name'],
      sample: 'Nguyễn Văn Thành',
    },
    {
      key: 'contactTitle',
      label: 'Chức danh',
      aliases: ['chuc danh', 'chuc vu', 'title'],
      sample: 'Giám đốc nhà máy',
    },
    {
      key: 'email',
      label: 'Email',
      required: true,
      aliases: ['email', 'mail', 'thu dien tu', 'e-mail'],
      sample: 'thanh.nv@kyanh.vn',
    },
    {
      key: 'phone',
      label: 'Điện thoại',
      aliases: ['dien thoai', 'sdt', 'phone', 'mobile'],
      sample: '0912345678',
    },
    {
      key: 'province',
      label: 'Tỉnh',
      aliases: ['tinh', 'province', 'city'],
      sample: 'Hải Phòng',
    },
  ],
}

/** Spec sổ cơ hội — luồng DI TRÚ, không phải luồng hằng ngày.
 *
 *  Đơn bình thường sinh ra từ một lead qua phiếu đổi, và đó vẫn là đường chính.
 *  Nạp tệp ở đây trả lời đúng một tình huống: phòng đang giữ pipeline trong một
 *  file Excel và muốn mang nó vào hệ trong một lần.
 *
 *  Cột `Account` là một PHÉP TRA, không phải một ô tạo khách: `lead_code` của
 *  bảng đơn là `NOT NULL` và có khoá ngoại, nên mỗi dòng phải tìm ra một lead
 *  ĐÃ CÓ trong sổ; không có thì máy chủ từ chối đúng dòng đó và nói ra lý do.
 *  Cửa tệp lặng lẽ đẻ lead cho đủ ô sẽ là một cửa nạp lead thứ hai, không mang
 *  `sourceKind` cũng không mang thế — xem `packages/contracts/src/sales/
 *  opportunity-import.ts`, khác biệt 1.
 *
 *  KHÔNG có `motions`, và đó là một quyết định đã gật (`docs/ban-giao-co-hoi.md`
 *  · "Năm quyết định còn treo" số 2): thế nói một LEAD đến bằng đường nào và nó
 *  rơi vào một cột của bảng lead. Đơn không có cột đó, `OpportunityImportBody`
 *  vì thế không hỏi, và bày một ô chọn mà máy chủ bỏ qua là nói dối người dùng.
 *  `defaultMotion` ở lại vì `ImportCommit` chở một thế cho cả ba luồng — cửa này
 *  bỏ nó ở `data/opportunity-import-wire.ts`, không ai chọn nó.
 *
 *  ĐỪNG đổ spec này qua `withPeople`. Hai ô người đi lên máy chủ dưới dạng TÊN
 *  và chính máy chủ tra sang id (`personOf` ở `opportunity-import.check.ts`:
 *  không thấy là hỏng, thấy hai người trùng tên cũng hỏng, không bao giờ đoán).
 *  `people: 'id'` bên dưới vì thế đang nằm im — nó chỉ có tác dụng khi có ai gọi
 *  `withPeople`, và ngày đó phải đổi sang `'name'` trước, nếu không ô chọn đổ id
 *  vào tệp và mọi dòng đều trượt ở phép tra theo tên. */
export const OP_SPEC: ImportSpec = {
  key: 'op',
  title: 'Nạp cơ hội vào sổ',
  blurb: 'Mang pipeline đang giữ trong Excel vào sổ cơ hội, mỗi dòng một đơn.',
  intake: 'tep',
  defaultMotion: 'outbound',
  sampleStem: 'mau-nap-co-hoi',
  fields: [
    {
      key: 'name',
      label: 'Tên cơ hội',
      required: true,
      aliases: ['ten co hoi', 'co hoi', 'ten don', 'opportunity', 'deal'],
      sample: 'Điện tử Kỳ Anh — Factory MES',
    },
    {
      key: 'company',
      label: 'Account',
      required: true,
      aliases: ['account', 'cong ty', 'khach hang', 'company'],
      sample: 'Điện tử Kỳ Anh',
    },
    {
      key: 'amount',
      label: 'Giá trị đơn',
      required: true,
      aliases: ['gia tri', 'gia tri don', 'so tien', 'amount', 'value'],
      sample: '1800000000',
    },
    {
      key: 'closedDate',
      label: 'Ngày đóng dự kiến',
      required: true,
      aliases: ['ngay dong', 'ngay dong du kien', 'close date', 'closed date'],
      sample: '2026-10-15',
    },
    {
      key: 'saleOwner',
      label: 'Sale đứng đơn',
      required: true,
      aliases: ['sale', 'sale owner', 'nguoi ban', 'owner'],
      people: 'id',
      sample: 'Đỗ Quang Huy',
    },
    {
      key: 'bdOwner',
      label: 'BD đứng đơn',
      aliases: ['bd', 'bd owner', 'business development'],
      people: 'id',
      sample: 'Lê Hoàng Nam',
    },
  ],
}

// ---------------------------------------------------------------------------
// Khớp cột — dò tự động
// ---------------------------------------------------------------------------

/** Chuẩn hoá một chuỗi để so: thường, bỏ dấu, gộp khoảng trắng.
 *
 *  Bỏ dấu chứ không chỉ hạ hoa: tiêu đề cột trong tệp thật viết đủ kiểu — "Tỉnh",
 *  "TINH", "tinh/thanh". Ba cái đó phải ra cùng một chuỗi, nếu không thì bảng bí
 *  danh phải liệt kê mọi biến thể và sẽ không bao giờ đủ. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Cột nào của tệp ứng với trường nào của sổ.
 *
 *  Khoá là `field.key`, giá trị là CHỈ SỐ cột trong tệp; `-1` = bỏ qua trường
 *  này. Dùng chỉ số chứ không dùng tên cột vì tệp thật có cột trùng tên (hai
 *  cột đều tên "Ghi chú"), và khoá theo tên thì một trong hai biến mất.
 *
 *  Dò hai vòng, và thứ tự có ý nghĩa: khớp CHÍNH XÁC trước, khớp CHỨA sau. Đảo
 *  lại thì cột "Email người ký" cướp mất trường Email của cột "Email". */
export type ColumnMapping = Record<string, number>

/** Số dòng bộ đoán đọc thử để đếm ô có chữ. Đọc hết 5.000 dòng chỉ để xếp
 *  hạng vài cột là trả giá cho một việc mà 200 dòng đã trả lời xong: một cột
 *  rỗng ở 200 dòng đầu thì gần như chắc chắn rỗng, và nếu không thì bước 2 vẫn
 *  đang bày ra để người sửa. */
const SNIFF_ROWS = 200

/** Đếm ô CÓ CHỮ của từng cột, trong `SNIFF_ROWS` dòng đầu. */
function fillOf(rows: readonly string[][], width: number): number[] {
  const count = new Array<number>(width).fill(0)
  const seen = Math.min(rows.length, SNIFF_ROWS)

  for (let r = 0; r < seen; r += 1) {
    const row = rows[r] ?? []
    for (let c = 0; c < width; c += 1) {
      if ((row[c] ?? '').trim() !== '') count[c] = (count[c] ?? 0) + 1
    }
  }

  return count
}

export function guessMapping(
  headers: string[],
  spec: ImportSpec,
  /** Dòng dữ liệu để phân xử khi NHIỀU cột cùng khớp một trường. Vắng mặt thì
   *  bộ đoán quay về luật cũ — cột đứng trước thắng — nên mọi chỗ gọi cũ vẫn
   *  chạy y như trước. */
  rows: readonly string[][] = [],
): ColumnMapping {
  const norm = headers.map(normalise)
  const fill = fillOf(rows, headers.length)
  const used = new Set<number>()
  const out: ColumnMapping = {}

  const claim = (key: string, index: number) => {
    out[key] = index
    used.add(index)
  }

  /** Trong các cột cùng khớp, lấy cột NHIỀU Ô CÓ CHỮ nhất; hoà thì cột đứng
   *  trước thắng.
   *
   *  Tên cột một mình không đủ để chọn, và tệp thật chứng minh điều đó: bản
   *  xuất Apollo có 'City', 'Company City', 'Company State' cùng khớp trường
   *  Tỉnh, cột đứng đầu thì rỗng ở phần lớn dòng. Luật cũ — cột đầu tiên khớp
   *  thắng — biến một tệp dùng được thành một tệp mà MỌI dòng báo "Thiếu Tỉnh",
   *  và người nạp không có cách nào biết vì sao ngoài mở tệp ra đếm bằng mắt.
   *
   *  Đây vẫn KHÔNG phải một đề xuất của AI (luật 9 không áp): cùng một tệp luôn
   *  ra cùng một bảng khớp, và mọi ô vẫn sửa được ở bước 2 trước khi bấm. */
  const fullest = (hits: number[]): number | undefined => {
    let best: number | undefined
    for (const i of hits) {
      if (best === undefined || (fill[i] ?? 0) > (fill[best] ?? 0)) best = i
    }
    return best
  }

  const matches = (ok: (h: string) => boolean) =>
    norm.flatMap((h, i) => (!used.has(i) && h !== '' && ok(h) ? [i] : []))

  for (const field of spec.fields) {
    const targets = [normalise(field.label), ...field.aliases.map(normalise)]
    const hit = fullest(matches((h) => targets.includes(h)))
    if (hit !== undefined) claim(field.key, hit)
  }

  for (const field of spec.fields) {
    if (out[field.key] !== undefined) continue
    const targets = [normalise(field.label), ...field.aliases.map(normalise)]
    const hit = fullest(matches((h) => targets.some((t) => h.includes(t) || t.includes(h))))
    if (hit !== undefined) claim(field.key, hit)
  }

  for (const field of spec.fields) {
    if (out[field.key] === undefined) out[field.key] = -1
  }

  return out
}

/** Trường bắt buộc chưa khớp được cột nào. Nút "Nạp" tắt khi danh sách này còn
 *  dòng — và nó trả về CHỮ chứ không `boolean`, cùng lý do với `missingOf` của
 *  sổ cơ hội: nút mờ không lý do là một ngõ cụt. */
export function unmappedRequired(mapping: ColumnMapping, spec: ImportSpec): string[] {
  return spec.fields.filter((f) => f.required && (mapping[f.key] ?? -1) < 0).map((f) => f.label)
}

// ---------------------------------------------------------------------------
// Luật của một dòng
// ---------------------------------------------------------------------------

/** Một ô thuộc danh sách đóng, đọc về giá trị chuẩn.
 *
 *  Nhận cả `value` lẫn `label` vì tệp của người dùng in NHÃN ("Chip"), còn sổ
 *  giữ KHOÁ ("chip"). Không nhận cả hai thì mọi tệp xuất từ chính màn này nạp
 *  ngược lại đều hỏng — vòng xuất-rồi-nạp là phép thử đầu tiên ai cũng làm. */
function readOption(raw: string, options: { value: string; label: string }[]): string | undefined {
  const want = normalise(raw)
  const hit = options.find((o) => normalise(o.value) === want || normalise(o.label) === want)
  return hit?.value
}

/** Một dòng đã dựng xong, hoặc lý do nó hỏng. */
export type BuiltRow = {
  /** Số dòng TRONG TỆP, tính cả dòng tiêu đề — đây là số người dùng thấy khi
   *  mở tệp ra kiểm, nên nó phải là số in ra trong bảng lỗi. */
  line: number
  values: Record<string, string>
  /** Khoá chống trùng. Rỗng = không đủ dữ liệu để so trùng. */
  key: string
}

export type RowError = {
  line: number
  /** Nhắc lại ô đầu tiên của dòng để người dùng tìm được nó trong tệp. */
  first: string
  /** Which column is wrong — the field key, matching `ImportSpec.fields[].key`.
   *
   *  Absent means the row failed as a WHOLE and not at one column, which is a
   *  real answer rather than a missing one. Only the server fills it in
   *  (`LeadImportError.field`); rows the browser refuses carry the column in
   *  the sentence already, and the panel prints whichever it has. */
  field?: string
  reason: string
}

/** A row dropped for being a duplicate — the ROW, not just a place in a count.
 *
 *  Optional on `ImportReport` because only the lead door has them: it reads the
 *  arrays the server returns (`LeadImportReport.dupWithBook` /
 *  `dupWithinFile`), while the two browser-only loaders still report duplicates
 *  as numbers. A panel that draws a list when it has one and a number when it
 *  does not is honest about both. */
export type DupRow = {
  line: number
  first: string
  /** The lead already holding the key. Only on a collision with the BOOK — a
   *  collision inside the file has no lead behind it yet. */
  code?: string
}

/** Khoá chống trùng: mã số thuế trước, không có thì tên + tỉnh.
 *
 *  MST là khoá THẬT — một pháp nhân đúng một mã, và nó không đổi khi ai đó gõ
 *  tên công ty theo kiểu khác. Chỉ khi tệp không có cột đó mới lùi về tên+tỉnh,
 *  và cặp đó chỉ gần đúng: "Cơ khí Đại Việt" ở Vĩnh Phúc và "CTY CP Cơ khí Đại
 *  Việt" ở Vĩnh Phúc là một công ty mà hai khoá khác nhau. Nói ra chỗ gần đúng
 *  đó chứ không giả vờ nó chính xác — người nạp cần biết để đọc lại phần trùng. */
export function dedupeKeys(values: Record<string, string>): string[] {
  const out: string[] = []

  const tax = (values.taxCode ?? '').replace(/\D/g, '')
  if (tax !== '') out.push(`mst:${tax}`)

  const company = normalise(values.company ?? '')
  if (company !== '') out.push(`ten:${company}|${normalise(values.province ?? '')}`)

  return out
}

/** Khoá CHÍNH của một dòng — mã số thuế nếu có, không thì tên+tỉnh.
 *
 *  Dùng để in ra và để tra một dòng, KHÔNG dùng để so trùng: so trùng phải xét
 *  cả hai khoá (`dedupeKeys`), nếu không thì một tệp có cột mã số thuế sẽ không
 *  bao giờ đụng dòng cũ nào — sổ lead không giữ mã số thuế nên khoá của nó luôn
 *  là tên+tỉnh, và hai bên sẽ so hai loại khoá khác nhau. */
export function dedupeKey(values: Record<string, string>): string {
  return dedupeKeys(values)[0] ?? ''
}

export type ImportReport = {
  rows: BuiltRow[]
  errors: RowError[]
  /** Số dòng bỏ vì trùng dòng ĐÃ CÓ trong sổ. */
  duplicates: number
  /** Số dòng bỏ vì trùng một dòng KHÁC trong chính tệp này. Đếm riêng: trùng
   *  trong tệp là lỗi của tệp, trùng với sổ là chuyện bình thường của lần nạp
   *  thứ hai. Gộp một số thì người nạp không biết nên đi sửa tệp hay kệ nó. */
  dupInFile: number
  total: number
  /** WHICH rows were dropped as duplicates, when the loader knows. See
   *  `DupRow`: a count answers "how many" and the question people actually have
   *  is "which ones, and is that right". */
  dupWithBook?: DupRow[]
  dupWithinFile?: DupRow[]
  /** Codes minted for `rows`, in the same order, when the write has happened.
   *  Absent on a browser-only report and on a preview — a row that went nowhere
   *  has no code, and inventing a blank column for it would suggest it does. */
  codes?: string[]
}

/** Nhường lại một nhịp vẽ cho trình duyệt.
 *
 *  Không có nó thì 5.000 dòng chạy hết trong một lượt JS, thanh tiến độ nhảy
 *  thẳng từ 0 lên 100 và cả tab đứng hình quãng đó — tức là thanh tiến độ chỉ
 *  còn là một hình trang trí. Nhường bằng `setTimeout(0)` chứ không
 *  `requestAnimationFrame`: tab chạy nền không có khung hình nào, và rAF ở đó
 *  đứng im vô hạn. */
const yieldToPaint = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Số dòng xử lý giữa hai lần nhường. Nhỏ hơn thì thanh mượt mà chậm, lớn hơn
 *  thì nhanh mà giật. 200 là chỗ 5.000 dòng chạy quãng 25 nhịp. */
const CHUNK = 200

/** Dựng dòng, kiểm dòng, loại trùng — có nhường nhịp vẽ.
 *
 *  `existingKeys` là khoá của những dòng ĐÃ có trong sổ. Truyền vào chứ không
 *  tự đọc sổ ở đây: hàm này thuần, và ba luồng nạp đọc ba cái sổ khác nhau. */
export async function buildRows(
  sheet: Sheet,
  mapping: ColumnMapping,
  spec: ImportSpec,
  existingKeys: ReadonlySet<string>,
  onProgress: (done: number, total: number) => void,
): Promise<ImportReport> {
  const rows: BuiltRow[] = []
  const errors: RowError[] = []
  const seen = new Set<string>()
  let duplicates = 0
  let dupInFile = 0

  const total = Math.min(sheet.rows.length, MAX_ROWS)

  for (let i = 0; i < total; i += 1) {
    const raw = sheet.rows[i] ?? []
    /* +2: một cho dòng tiêu đề, một vì Excel đếm từ 1. Số này phải trùng với
       số dòng người dùng thấy ở lề trái khi mở tệp. */
    const line = i + 2
    const first = (raw[0] ?? '').trim()
    const values: Record<string, string> = {}
    let bad: string | undefined

    for (const field of spec.fields) {
      const at = mapping[field.key] ?? -1
      const cell = at < 0 ? '' : (raw[at] ?? '').trim()

      if (cell === '') {
        if (field.required) bad ??= `Thiếu ${field.label}`
        continue
      }

      if (field.options) {
        const ok = readOption(cell, field.options)
        if (ok === undefined) {
          /* Ô sai danh sách đóng làm hỏng CẢ DÒNG khi nó bắt buộc, còn không thì
             bỏ ô đó và giữ dòng: mất một ô tuỳ chọn nhẹ hơn mất cả một khách. */
          if (field.required) bad ??= `${field.label} "${cell}" không có trong danh sách`
          continue
        }
        values[field.key] = ok
        continue
      }

      /* An over-long cell breaks THIS ROW. The same ceiling also sits on the
         request body, and there it breaks the WHOLE batch with one sentence at
         the root — so checking here is not a second copy of the server's rule,
         it is the only place left that can still name a line.

         AFTER the closed lists, deliberately. Whatever `readOption` stores came
         out of the option list, so it is short by construction; running the
         check first would turn a 1.001-character industry cell into a lost
         customer where the line above only loses the industry. */
      const limit = field.max ?? spec.cellMax
      if (limit !== undefined && cell.length > limit) {
        bad ??= `${field.label} dài ${cell.length} ký tự, trần là ${limit}`
        continue
      }

      values[field.key] = cell
    }

    /* Ô ghép đi vào chỗ của nó rồi biến mất — xem `mergeBefore`. Chạy SAU
       vòng trên vì nó đọc kết quả của vòng đó, và xoá vô điều kiện vì cửa ra
       (`pickImportValues`) chỉ nhận đúng mười sáu khoá của hợp đồng: một khoá
       lạ còn sót lại không nổ ở đây, nó im lặng rơi trên dây.

       Dòng thiếu ô CHÍNH vẫn hỏng ở vòng trên dù ô ghép có chữ. Đó là câu trả
       lời đúng: một tệp chỉ có cột Họ mà không có cột Tên là tệp thiếu tên
       người, không phải tệp đặt tên ở chỗ khác. */
    for (const field of spec.fields) {
      if (field.mergeBefore === undefined) continue
      const part = values[field.key]
      delete values[field.key]
      if (part === undefined) continue
      const head = values[field.mergeBefore]
      values[field.mergeBefore] = head === undefined ? part : `${part} ${head}`
    }

    if (bad) {
      errors.push({ line, first, reason: bad })
    } else {
      /* So bằng CẢ HAI khoá, không chỉ khoá chính: một dòng mang mã số thuế
         vẫn phải đụng được dòng cũ chỉ có tên+tỉnh, và ngược lại. Chỉ so khoá
         chính thì mọi tệp có cột mã số thuế đều lọt sạch qua cửa chống trùng. */
      const keys = dedupeKeys(values)
      if (keys.some((k) => existingKeys.has(k))) duplicates += 1
      else if (keys.some((k) => seen.has(k))) dupInFile += 1
      else {
        for (const k of keys) seen.add(k)
        rows.push({ line, values, key: keys[0] ?? '' })
      }
    }

    if ((i + 1) % CHUNK === 0) {
      onProgress(i + 1, total)
      await yieldToPaint()
    }
  }

  onProgress(total, total)
  return { rows, errors, duplicates, dupInFile, total }
}

// ---------------------------------------------------------------------------
// Tệp mẫu và tệp lỗi
// ---------------------------------------------------------------------------

/** Tệp mẫu: một dòng tiêu đề + một dòng ví dụ.
 *
 *  Có dòng ví dụ chứ không chỉ tiêu đề, vì phân nửa câu hỏi của người nạp là
 *  "ô này điền kiểu gì" — `2026-10-15` hay `15/10/2026`, `Chip` hay `chip`. Một
 *  dòng mẫu trả lời hết, và trả lời bằng chính thứ họ sắp gõ đè lên.
 *
 *  Tiêu đề bắt buộc có dấu sao để người điền thấy ngay ô nào không được bỏ. */
export function sampleRows(spec: ImportSpec): string[][] {
  return [
    spec.fields.map((f) => (f.required ? `${f.label} *` : f.label)),
    spec.fields.map((f) => f.sample),
  ]
}

/** Tệp lỗi tải về: số dòng · ô đầu · lý do.
 *
 *  Đây là thứ biến "17 dòng lỗi" từ một lời than thành một việc làm được: mở
 *  tệp lỗi cạnh tệp gốc, sửa 17 dòng đó, nạp lại. Không có nó thì cách duy nhất
 *  tìm ra 17 dòng ấy trong 500 là dò bằng mắt. */
export function errorRows(errors: RowError[], spec?: ImportSpec): string[][] {
  /* The column, spelled the way the header of the user's own file spells it.
     A reason is a sentence and a sentence cannot be sorted or filtered; the
     column is what turns "17 rows failed" into "seventeen rows, all of them
     the Email column". Blank when the row failed as a whole rather than at one
     field — see `RowError.field`. */
  const labelOf = (key: string | undefined) =>
    key === undefined ? '' : (spec?.fields.find((f) => f.key === key)?.label ?? key)

  return [
    ['Dòng trong tệp', 'Ô đầu dòng', 'Cột sai', 'Vì sao không nạp được'],
    ...errors.map((e) => [String(e.line), e.first, labelOf(e.field), e.reason]),
  ]
}

// ---------------------------------------------------------------------------
// Từ dòng đã dựng sang dòng SỔ
// ---------------------------------------------------------------------------

/** Một lead nạp từ tệp — dòng sổ đầy đủ, cộng hai trục phân loại.
 *
 *  `Lead` của fixture không có hai ô đó và sẽ không bao giờ có (100 dòng đã
 *  đóng băng). Với dòng NẠP thì hai ô ấy là thứ biết chắc — người nạp vừa chọn
 *  thế, và đường vào thì cố định là `tep` — nên giữ thẳng chứ không suy lại. */
export type ImportedLead = Lead & {
  motion: LeadMotion
  intake: LeadIntake
  /** Lô nạp sinh ra dòng này. Xoá lô là xoá đúng những dòng của nó. */
  batchId: string
}

/** Sáu ô BẮT BUỘC của init data, ô nào tệp lấp được.
 *
 *  Bảng này là chỗ dễ nói dối nhất của cả luồng nạp, nên nó bảo thủ có chủ ý:
 *  một ô chỉ tính là đã điền khi tệp mang đúng phần NẶNG của câu hỏi, không
 *  phải khi tệp có một cột trùng tên.
 *
 *   · ô 1 Pháp nhân   ← MÃ SỐ THUẾ, không phải tên pháp nhân. Tên thì ai cũng
 *     gõ được; mã số thuế là thứ phải tra, và là thứ hợp đồng cần.
 *   · ô 2 Ngành       ← cột Ngành. KHÔNG còn "luôn có": cột này thôi bắt
 *     buộc, và giá trị lệch bốn ngành của PV One thì bị bỏ. Một tệp mua về
 *     thường trống ô này, và lead vào sổ ở bậc Đầu mối là đúng.
 *   · ô 3 Quy mô      ← số người.
 *   · ô 4 Liên hệ     ← tên người, không tính chức danh đứng một mình.
 *   · ô 5 Kênh        ← có ÍT NHẤT một đường gọi lại được.
 *   · ô 6 Đau         ← câu vấn đề. Không có cột nào thay được câu này.
 *
 *  Bốn ô tuỳ chọn (đang dùng gì · ai ký · tiền · mốc) KHÔNG có trong spec cột
 *  và cũng không nên có: chúng là thứ moi ra trong lúc nói chuyện, không phải
 *  thứ nằm trong một tệp mua về. Vì thế `optionalFilled` của mọi dòng nạp là 0,
 *  và đó là số ĐÚNG chứ không phải chỗ chưa làm. */
const SLOT_FROM_IMPORT: { key: QuestionKey; from: (v: Record<string, string>) => boolean }[] = [
  { key: 'phap-nhan', from: (v) => (v.taxCode ?? '') !== '' },
  { key: 'nganh', from: (v) => (v.category ?? '') !== '' },
  { key: 'quy-mo', from: (v) => (v.headcount ?? '') !== '' },
  { key: 'nguoi-lien-he', from: (v) => (v.contactName ?? '') !== '' },
  { key: 'kenh', from: (v) => [v.phone, v.email, v.channel].some((c) => (c ?? '') !== '') },
  { key: 'dau', from: (v) => (v.pain ?? '') !== '' },
]

/** Nguồn mặc định của một lô nạp không gắn chiến dịch nào: `TM` — BD tự mở.
 *
 *  Phải là một mã CÓ THẬT trong `SOURCES`, không phải chuỗi rỗng: `leadOrigin()`
 *  ném lỗi khi lead trỏ vào nguồn không tồn tại, nên một dòng nạp thiếu nguồn sẽ
 *  làm vỡ màn hồ sơ chứ không lặng lẽ hiện dấu gạch. `TM` cũng đúng nghĩa —
 *  một tệp mang vào mà không kèm chiến dịch nào thì đúng là có người tự mở. */
export const FALLBACK_SOURCE = 'TM'

/** Mã lead kế tiếp — lớn nhất trong sổ cộng một.
 *
 *  Cùng cách với `nextOpportunityCode` của fixture, và cùng lý do phải truyền
 *  `taken`: nạp hai lô trong một phiên mà không kể tới mã vừa cấp thì hai lô ra
 *  hai dãy mã trùng nhau. */
export function nextLeadCode(book: readonly { code: string }[], taken: readonly string[]): string {
  const top = [...book.map((l) => l.code), ...taken].reduce(
    (max, code) => Math.max(max, Number(code.slice(3)) || 0),
    0,
  )
  return `LD-${String(top + 1).padStart(4, '0')}`
}

/** Bậc của một dòng nạp — trần là MQL, không bao giờ SQL.
 *
 *  Đây là luật, không phải mặc định lười: SQL nghĩa là đã qua cổng init data VÀ
 *  đã có người mở phiếu cơ hội. Một dòng trong tệp chưa ai chạm mà vào sổ ở bậc
 *  SQL là 500 cơ hội giả xuất hiện trong phễu chỉ vì ai đó gõ chữ "SQL" vào một
 *  cột Excel. Cột Bậc trong tệp vì thế chỉ hạ được chứ không nâng được. */
function tierOfRow(asked: string | undefined, requiredFilled: number): LeadTier {
  if (asked === 'dau-moi') return 'dau-moi'
  return requiredFilled >= REQUIRED_SLOTS ? 'mql' : 'dau-moi'
}

/** Dựng dòng sổ lead từ dòng tệp.
 *
 *  `at` truyền vào chứ không gọi `new Date()` ở đây: cả lô phải mang đúng MỘT
 *  mốc thời gian, nếu không thì dòng đầu và dòng cuối của cùng một lần nạp lệch
 *  nhau vài giây và bảng xếp theo thời gian trông như hai lô. */
export function rowsToLeads(
  rows: BuiltRow[],
  opts: {
    /** Sổ đang có, CHỈ để cấp mã kế tiếp — `nextLeadCode` đọc đúng một ô
     *  `code`. Hình tối thiểu vì cùng lý do với `leadBookKeys` ngay trên: sổ
     *  lead nay là `LeadRow` của máy chủ, sổ chiến dịch vẫn là `Lead` của
     *  fixture, và cả hai đều cấp mã được. */
    book: readonly { code: string }[]
    motion: LeadMotion
    intake: LeadIntake
    /** Mã nguồn của cả lô — mã chiến dịch khi nạp trong một hồ sơ. */
    source?: string
    batchId: string
    by: string
    at: string
  },
): ImportedLead[] {
  const taken: string[] = []

  return rows.map((row) => {
    const v = row.values
    const filled = SLOT_FROM_IMPORT.filter((s) => s.from(v)).map((s) => s.key)
    const requiredFilled = filled.length
    const code = nextLeadCode(opts.book, taken)
    taken.push(code)

    return {
      code,
      company: v.company ?? '',
      province: v.province ?? '',
      category: (v.category ?? 'chip') as LeadCategory,
      tier: tierOfRow(v.tier, requiredFilled),
      requiredFilled,
      optionalFilled: 0,
      answered: requiredFilled,
      filled,
      owner: v.owner === '' ? undefined : v.owner,
      daysHere: 0,
      source: opts.source ?? v.source ?? FALLBACK_SOURCE,
      createdAt: opts.at,
      motion: opts.motion,
      intake: opts.intake,
      batchId: opts.batchId,
      history: [
        {
          at: opts.at,
          kind: 'vao-so',
          by: opts.by,
          /* Dòng lịch sử nói ra ĐƯỜNG VÀO và số dòng trong tệp gốc. Sáu tháng
             sau, câu hỏi duy nhất về một lead lạ là "cái này ở đâu ra" — và
             "nạp từ tệp X, dòng 312" trả lời xong, còn "vào sổ" thì không. */
          note: `Nạp từ tệp · dòng ${row.line} · ${MOTION_FACE[opts.motion].label}`,
        },
      ],
    }
  })
}

/** Khoá chống trùng của sổ lead hiện có.
 *
 *  Sổ không mang mã số thuế (nó nằm trong hồ sơ, dựng riêng), nên khoá của dòng
 *  cũ luôn là cặp tên+tỉnh. Hệ quả phải biết: một tệp CÓ mã số thuế sẽ không bắt
 *  được trùng với dòng cũ nào — hai bên dùng hai loại khoá khác nhau. Vì thế
 *  hàm này dựng CẢ HAI khoá cho mỗi dòng cũ.
 *
 *  Nhận HÌNH TỐI THIỂU chứ không nhận `Lead`: sổ lead đã cắt sang máy chủ và
 *  dòng của nó là `LeadRow` (`@pv/contracts`) chứ không còn là `Lead` của
 *  fixture, trong khi khoá chống trùng chỉ đọc đúng hai ô. Bó vào một trong
 *  hai kiểu dòng là bắt bên kia ép kiểu — và một chỗ ép kiểu là chỗ ngày mai
 *  ai đó ép nhầm. `province` để tuỳ chọn vì `LeadRow` khai nó tuỳ chọn: một
 *  lead về từ landing page chưa có tỉnh nào. */
export function leadBookKeys(book: readonly { company: string; province?: string }[]): Set<string> {
  return new Set(
    book.flatMap((l) => dedupeKeys({ company: l.company, province: l.province ?? '' })),
  )
}

/* `mergeLeadBook` đã XOÁ 27/08 cùng lượt cắt sổ lead sang máy chủ. Nó gộp kho
   `intake-desk` vào sổ đang vẽ, và từ lúc sổ do máy chủ trả thì phép gộp đó in
   mỗi dòng nạp hai lần. `mergeOps` của module Ops còn nguyên — sổ cơ hội chưa
   cắt, nên ở đó phép gộp vẫn đúng. */

// ---------------------------------------------------------------------------
// Từ dòng đã dựng sang dòng SỔ CƠ HỘI
// ---------------------------------------------------------------------------

/** Một cơ hội nạp từ tệp. Cùng hình với `ImportedLead`: dòng sổ đầy đủ cộng
 *  hai trục phân loại và mã lô. */
export type ImportedOpportunity = Opportunity & {
  motion: LeadMotion
  intake: LeadIntake
  batchId: string
}

/** Đọc một ô tiền. Nhận cả `1.800.000.000`, `1 800 000 000` và `1800000000`.
 *
 *  Bỏ mọi thứ không phải chữ số, và đó là chỗ phải cẩn thận: dấu chấm trong
 *  tệp Việt là dấu ngăn nghìn, không phải dấu thập phân. `parseFloat` đọc
 *  `1.800` thành 1,8 — tức một đơn 1,8 tỷ vào sổ thành một đơn 1,8 đồng. Tiền
 *  của kịch bản này không có phần lẻ, nên cắt sạch là đúng chứ không phải xấp xỉ. */
function readMoney(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, '')
  return digits === '' ? null : Number(digits)
}

/** Đọc một ô ngày về ISO ngày.
 *
 *  Nhận `2026-10-15` (xlsx đã chuẩn hoá sẵn) và `15/10/2026` (người Việt gõ
 *  tay). KHÔNG đưa vào `new Date(raw)`: chuỗi `10/15/2026` và `15/10/2026` đều
 *  hợp lệ với bộ đọc của trình duyệt và nó chọn kiểu Mỹ, nên một nửa số ngày
 *  của tệp sẽ đúng và một nửa lệch bốn tháng — kiểu sai tệ nhất vì nó im lặng. */
function readDate(raw: string): string | undefined {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return raw.slice(0, 10)

  const vn = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!vn) return undefined
  const [, d, m, y] = vn
  return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
}

/** Dựng dòng sổ cơ hội từ dòng tệp.
 *
 *  Trạng thái luôn là `pending`, không đọc từ tệp. Lý do cùng loại với trần bậc
 *  của lead: `close-won` là một đơn ĐÃ KÝ, và một cột Excel gõ chữ "won" không
 *  phải là một hợp đồng. Đơn di trú vào sổ ở bậc thấp nhất rồi người bán tự kéo
 *  lên — mất vài phút, đổi lại sổ không tự cộng ra doanh số chưa có thật.
 *
 *  `leadCode` để rỗng: đơn di trú thường không có lead nào đứng sau, và bịa một
 *  mã cho đủ ô là đẻ ra lead ma trong sổ lead. */
export function rowsToOps(
  rows: BuiltRow[],
  opts: {
    nextCode: (taken: readonly string[]) => string
    motion: LeadMotion
    intake: LeadIntake
    batchId: string
    at: string
  },
): ImportedOpportunity[] {
  const taken: string[] = []

  return rows.map((row) => {
    const v = row.values
    const code = opts.nextCode(taken)
    taken.push(code)

    return {
      code,
      name: v.name ?? '',
      account: v.company ?? '',
      accountCode: '',
      closedDate: readDate(v.closedDate ?? '') ?? '',
      state: 'pending' as const,
      stage: 'tim-hieu' as const,
      amount: readMoney(v.amount ?? ''),
      currency: 'VND' as const,
      saleOwners: v.saleOwner === undefined || v.saleOwner === '' ? [] : [v.saleOwner],
      bdOwners: v.bdOwner === undefined || v.bdOwner === '' ? [] : [v.bdOwner],
      description: `Nạp từ tệp · dòng ${row.line} · ${MOTION_FACE[opts.motion].label}`,
      attachments: [],
      lossReason: '',
      lossNote: '',
      leadCode: '',
      motion: opts.motion,
      intake: opts.intake,
      batchId: opts.batchId,
    }
  })
}

/** Khoá chống trùng của sổ cơ hội: tên account, không có tỉnh để ghép.
 *
 *  Yếu hơn khoá của sổ lead, và nói ra chứ không giấu: sổ cơ hội không giữ
 *  tỉnh, nên hai đơn khác nhau của cùng một account sẽ đụng khoá. Đó là chỗ
 *  người nạp phải đọc lại phần "trùng" thay vì tin thẳng. */
export function opsBookKeys(book: readonly Opportunity[]): Set<string> {
  return new Set(book.flatMap((o) => dedupeKeys({ company: o.account })))
}
