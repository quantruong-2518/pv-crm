import { CURRENCIES, USD_VND, toDong, type CurrencyCode } from '@pv/contracts'
import { loadScenario, type Scenario } from './scenario'
import type { Actor } from '../types'

/** KỊCH BẢN 2 · DAS Vina — khách CHƯA MUA. Dùng cho cả năm module Sales và mọi
 *  màn nói về *trước khi có hợp đồng*. Đóng băng tại 17/08 · 09:10.
 *
 *  Nhà máy đóng gói chip · Bắc Ninh · 1.400 người.
 *  AC-0142 → CT-0391 Kim Dae-ho (giám đốc nhà máy) → OP-0288 (bán Factory MES +
 *  One Plus) → BG-1077 · 4,2 tỷ/năm. Giám đốc bên Hàn Quốc ký cuối; trên 3 tỷ
 *  phải xin công ty mẹ. */
export const DAS_VINA_FROZEN_AT = '2026-08-17T09:10:00+07:00'

/** Ngày đầu của kỳ — mọi mốc trong kịch bản đếm bằng số ngày kể từ đây.
 *  01/05 → 17/08 là 108 ngày; `DAY_FROZEN` phải trỏ đúng vào ngày đóng băng. */
const PERIOD_START_UTC = Date.UTC(2026, 4, 1)
const DAY_MS = 86_400_000
export const DAY_FROZEN = 108

/** Mốc thời gian tất định. KHÔNG dùng `Date.now()` ở fixture — kịch bản đóng
 *  băng thì hai lần chạy phải ra đúng một chuỗi. */
export function dayISO(offset: number, hhmm = '09:00'): string {
  const d = new Date(PERIOD_START_UTC + offset * DAY_MS)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${hhmm}:00+07:00`
}

const scenario: Scenario = {
  id: 'das-vina',
  name: 'DAS Vina',
  frozenAt: DAS_VINA_FROZEN_AT,

  objects: [
    { code: 'AC-0142', kind: 'AC', branch: 'Sales', label: 'DAS Vina · Bắc Ninh · 1.400 người' },
    { code: 'CT-0391', kind: 'CT', branch: 'Sales', label: 'Kim Dae-ho · giám đốc nhà máy' },
    {
      code: 'OP-0288',
      kind: 'OP',
      branch: 'Sales',
      label: 'Factory MES + One Plus',
      owner: 'Đỗ Quang Huy',
      state: 'Đang tìm hiểu',
      amount: 4_200_000_000,
    },
    {
      code: 'BG-1077',
      kind: 'BG',
      branch: 'Sales',
      label: 'Báo giá DAS Vina',
      amount: 4_200_000_000,
    },
  ],

  edges: [
    { from: 'AC-0142', to: 'CT-0391', kind: 'thuộc-về' },
    { from: 'CT-0391', to: 'OP-0288', kind: 'sinh-ra' },
    { from: 'OP-0288', to: 'BG-1077', kind: 'sinh-ra' },
  ],

  /** Bảy người của phòng Kinh doanh Pebble Vina — KHÔNG phải người của DAS Vina.
   *  DAS Vina là khách, nằm ở `objects`; đây là những người nhìn màn.
   *
   *  `email` là phần đuôi của `id` ghép với tên miền công ty (u-ha → ha@…), nên
   *  không có bảng ánh xạ thứ hai phải giữ cho khớp. Viết thẳng ra chứ không
   *  sinh bằng hàm: đây là fixture ĐÓNG BĂNG, người đọc phải thấy được chuỗi
   *  gõ vào ô đăng nhập mà không phải chạy code trong đầu. */
  actors: [
    {
      id: 'u-ha',
      name: 'Trần Thu Hà',
      email: 'sales@pebblevina.com',
      role: 'Trưởng phòng Kinh doanh',
      roleId: 'trưởng-phòng',
      branches: ['One', 'Sales'],
    },
    {
      id: 'u-chau',
      name: 'Vũ Minh Châu',
      email: 'chau@pebblevina.com',
      role: 'Marketing',
      roleId: 'marketing',
      branches: ['One', 'Sales'],
    },
    {
      id: 'u-nam',
      name: 'Lê Hoàng Nam',
      email: 'nam@pebblevina.com',
      role: 'BD',
      roleId: 'bd',
      branches: ['One', 'Sales'],
    },
    {
      /** Ba người mang `roleId: 'sale'` nhưng ba nhãn `role` khác nhau — đó
       *  chính là lý do hai trường tách nhau. Ngành phụ trách đổi thì sửa nhãn,
       *  quyền không nhúc nhích. */
      id: 'u-huy',
      name: 'Đỗ Quang Huy',
      email: 'huy@pebblevina.com',
      role: 'Sale · chip',
      roleId: 'sale',
      branches: ['One', 'Sales'],
      ownOnly: true,
    },
    {
      id: 'u-binh',
      name: 'Đặng Thanh Bình',
      email: 'binh@pebblevina.com',
      role: 'Sale · cơ khí, ô tô',
      roleId: 'sale',
      branches: ['One', 'Sales'],
      ownOnly: true,
    },
    {
      id: 'u-linh',
      name: 'Nguyễn Khánh Linh',
      email: 'linh@pebblevina.com',
      role: 'Sale · dược',
      roleId: 'sale',
      branches: ['One', 'Sales'],
      ownOnly: true,
    },
    {
      id: 'u-anh',
      name: 'Phạm Diệu Anh',
      email: 'anh@pebblevina.com',
      role: 'Presales',
      roleId: 'presales',
      branches: ['One', 'Sales'],
    },
  ],
}

export const dasVina = loadScenario(scenario)

/** Tên bốn vai hay bị gõ tay ở nhiều chỗ. Lấy từ `actors`, không gõ lại. */
export const MARKETING = 'Vũ Minh Châu'
export const BD = 'Lê Hoàng Nam'
export const HEAD_OF_SALES = 'Trần Thu Hà'

// ---------------------------------------------------------------------------
// Sổ 10 cơ hội đang mở — thuộc kịch bản 2, chốt 17/08.
// Tổng 18,5 tỷ/năm · Huy 4 đơn · Bình 3 · Linh 3.
// ---------------------------------------------------------------------------

/** Năm cột của sổ. Số kèm theo là HẠN của cột, tính bằng ngày —
 *  quá hạn thì đơn tô cảnh báo. Không có cột thứ sáu.
 *
 *  Sửa được ở module Cấu hình (mục 5.2), không sửa ở tầng màn. */
export const PIPELINE_STAGES = [
  { key: 'moi', label: 'Mới', limitDays: 2 },
  { key: 'tim-hieu', label: 'Đang tìm hiểu', limitDays: 14 },
  { key: 'da-demo', label: 'Đã demo', limitDays: 21 },
  { key: 'da-bao-gia', label: 'Đã báo giá', limitDays: 30 },
  { key: 'cho-ky', label: 'Chờ ký', limitDays: 10 },
] as const

export type StageKey = (typeof PIPELINE_STAGES)[number]['key']

export type OpenDeal = {
  code: string
  company: string
  province: string
  amount: number
  owner: string
  stage: StageKey
  /** Số ngày đã nằm trong cột hiện tại. */
  daysInStage: number
}

export const OPEN_DEALS: OpenDeal[] = [
  {
    code: 'OP-0301',
    company: 'Điện tử Kỳ Anh',
    province: 'Hải Phòng',
    amount: 780_000_000,
    owner: 'Đỗ Quang Huy',
    stage: 'moi',
    daysInStage: 4,
  },
  {
    code: 'OP-0304',
    company: 'Nhựa Tân Á',
    province: 'Hưng Yên',
    amount: 320_000_000,
    owner: 'Đặng Thanh Bình',
    stage: 'moi',
    daysInStage: 2,
  },
  {
    code: 'OP-0288',
    company: 'DAS Vina',
    province: 'Bắc Ninh',
    amount: 4_200_000_000,
    owner: 'Đỗ Quang Huy',
    stage: 'tim-hieu',
    daysInStage: 11,
  },
  {
    code: 'OP-0295',
    company: 'Bao bì Minh Long',
    province: 'Bình Dương',
    amount: 1_100_000_000,
    owner: 'Nguyễn Khánh Linh',
    stage: 'tim-hieu',
    daysInStage: 6,
  },
  {
    code: 'OP-0263',
    company: 'Cơ khí Phú Thái',
    province: 'Hải Dương',
    amount: 900_000_000,
    owner: 'Đặng Thanh Bình',
    stage: 'da-demo',
    daysInStage: 24,
  },
  {
    code: 'OP-0271',
    company: 'Dược Vĩnh Hà',
    province: 'Hà Nam',
    amount: 2_600_000_000,
    owner: 'Nguyễn Khánh Linh',
    stage: 'da-demo',
    daysInStage: 19,
  },
  {
    code: 'OP-0248',
    company: 'Thực phẩm Hải Vân',
    province: 'Đà Nẵng',
    amount: 1_700_000_000,
    owner: 'Nguyễn Khánh Linh',
    stage: 'da-bao-gia',
    daysInStage: 31,
  },
  {
    code: 'OP-0284',
    company: 'Thép Đông Đô',
    province: 'Thái Nguyên',
    amount: 3_400_000_000,
    owner: 'Đặng Thanh Bình',
    stage: 'da-bao-gia',
    daysInStage: 9,
  },
  {
    code: 'OP-0259',
    company: 'Nhựa An Phát Tây',
    province: 'Hưng Yên',
    amount: 2_200_000_000,
    owner: 'Đỗ Quang Huy',
    stage: 'cho-ky',
    daysInStage: 5,
  },
  {
    code: 'OP-0252',
    company: 'Điện lạnh Thái Bình Dương',
    province: 'Bắc Ninh',
    amount: 1_300_000_000,
    owner: 'Đỗ Quang Huy',
    stage: 'cho-ky',
    daysInStage: 14,
  },
]

const stageLimit = new Map(PIPELINE_STAGES.map((s) => [s.key, s.limitDays]))

/** Đơn đang mục: nằm trong cột lâu hơn hạn của cột đó. */
export function isRotting(deal: OpenDeal): boolean {
  return deal.daysInStage > (stageLimit.get(deal.stage) ?? Infinity)
}

// ---------------------------------------------------------------------------
// Phễu 01/05 → 17/08 (cũng thuộc kịch bản 2). Bậc `cong-ty-that` là MQL,
// bậc `co-hoi` là SQL — module 2 Lead.
// ---------------------------------------------------------------------------

export const FUNNEL = [
  { key: 'dau-moi', label: 'Đầu mối', count: 100 },
  { key: 'cong-ty-that', label: 'Công ty thật', count: 44 },
  { key: 'co-hoi', label: 'Cơ hội', count: 30 },
  { key: 'bao-gia', label: 'Báo giá', count: 19 },
  { key: 'cho-ky', label: 'Chờ ký', count: 11 },
  { key: 'hop-dong', label: 'Hợp đồng', count: 6 },
] as const

/** Buổi gặp đầu tiên trong kỳ — 38 trên 100 đầu mối.
 *
 *  KHÔNG phải bậc thứ bảy của `FUNNEL`. Phễu là sáu bậc đã chốt, và cả màn
 *  Performance lẫn thẻ điểm của Sổ lead đọc thẳng vào nó — nhét thêm một bậc là
 *  đổi nghĩa mọi tỉ lệ qua bậc đang có. Đây là một con số RIÊNG, đo cùng kỳ, nằm
 *  giữa hai bậc đã chốt: 44 công ty thật ≥ 38 buổi gặp ≥ 30 cơ hội.
 *
 *  Con số này không khai bằng tay rồi sinh sự kiện cho vừa: nó ĐẾM RA từ chính
 *  100 dòng sổ bằng điều kiện ở `hasFirstMeeting`. Khai một số rời là cách chắc
 *  chắn nhất để số và sổ trôi khỏi nhau — `scenario.test.ts` khoá đẳng thức. */
export const FIRST_MEETINGS = 38

/** SÁU lý do ra khỏi luồng. Không có lý do thứ bảy, không có ô "khác".
 *  Sửa được ở module Cấu hình (mục 5.4) — nhưng vẫn là danh sách ĐÓNG.
 *
 *  SỬA 19/08 · tổng 94 → 52. Bản cũ ghi "tổng đúng bằng 100 đầu mối trừ 6 hợp
 *  đồng", tức quên mất 10 đơn ĐANG MỞ của `OPEN_DEALS` và 32 lead còn sống ở
 *  hai bậc đầu — chúng chưa rơi mà cũng chưa ký. Phép cân đúng:
 *
 *      100 đầu mối = 6 đã ký + 42 đang chạy + 52 đã ra khỏi luồng
 *
 *  Thứ tự sáu lý do giữ nguyên. */
export const EXIT_REASONS = [
  { label: 'Không gọi được ai', count: 21 },
  { label: 'Không phải khách của mình', count: 10 },
  { label: 'Năm nay không có tiền', count: 8 },
  { label: 'Người liên hệ nghỉ việc', count: 6 },
  { label: 'Khách chọn bên khác', count: 4 },
  { label: 'Im sau báo giá', count: 3 },
] as const

export type ExitReason = (typeof EXIT_REASONS)[number]['label']

/** Ba phần của 100 dòng sổ lead. Khoá ở `scenario.test.ts`. */
export const BOOK_SPLIT = { signed: 6, running: 42, exited: 52 } as const

// ---------------------------------------------------------------------------
// Hoa hồng và công trạng — HAI thứ khác nhau
// ---------------------------------------------------------------------------

/** Hoa hồng chỉ chia được khi có đơn ký. Đơn đổi tay giữa hai Sale thì chia lại
 *  phần chốt theo số lần chạm; phần của BD không đụng tới. */
export const COMMISSION_SPLIT = { moCua: 30, chot: 60, diCungDemo: 10 } as const

/** Công trạng ghi ở MỌI lần chạm, kể cả khi chưa có đơn — mỗi vai đo bằng đúng
 *  thứ vai đó làm. Sửa được ở module Cấu hình (mục 5.6). */
export const CREDIT_RULES = [
  {
    role: 'Marketing',
    metrics: ['Lead kéo về', 'Lead tốt — qua được cổng init data', 'Số lead tốt trên mỗi đợt'],
  },
  {
    role: 'BD',
    metrics: [
      'Ô bắt buộc moi được',
      'Lead xác minh là công ty thật',
      'Phản hồi trả ngược cho Marketing',
    ],
  },
  {
    role: 'Sale',
    metrics: ['Đơn chốt', 'Giá trị đơn', 'Tốc độ qua từng cột'],
  },
  {
    role: 'Presales',
    metrics: ['Buổi demo đi cùng', 'Demo ra được báo giá'],
  },
  {
    /** Vai này phân công chứ không giữ khách — số của phòng chính là số của họ. */
    role: 'Trưởng phòng Kinh doanh',
    metrics: [],
  },
] as const

// ---------------------------------------------------------------------------
// Sổ lead — module 2.
// ---------------------------------------------------------------------------

/** Bốn ngành của phòng, lấy đúng từ vai đã chốt của ba Sale ở `actors`:
 *  Huy chip · Bình cơ khí + ô tô · Linh dược. Không có ngành thứ năm.
 *  Sửa được ở module Cấu hình (mục 5.3). */
export const LEAD_CATEGORIES = [
  { key: 'chip', label: 'Chip', sale: 'Đỗ Quang Huy' },
  { key: 'co-khi', label: 'Cơ khí', sale: 'Đặng Thanh Bình' },
  { key: 'o-to', label: 'Ô tô', sale: 'Đặng Thanh Bình' },
  { key: 'duoc', label: 'Dược', sale: 'Nguyễn Khánh Linh' },
] as const

export type LeadCategory = (typeof LEAD_CATEGORIES)[number]['key']

/** Ba bậc đầu của phễu nhìn dưới góc lead. MQL và SQL KHÔNG phải nhãn mới —
 *  chúng là hai bậc `cong-ty-that` và `co-hoi` đã có trong `FUNNEL`. */
export const LEAD_TIERS = [
  { key: 'dau-moi', label: 'Đầu mối', funnelKey: 'dau-moi' },
  { key: 'mql', label: 'MQL', funnelKey: 'cong-ty-that' },
  { key: 'sql', label: 'SQL', funnelKey: 'co-hoi' },
] as const

export type LeadTier = (typeof LEAD_TIERS)[number]['key']

/** Bộ 10 câu — của HỆ, không của vai nào. Ai chạm khách cũng điền vào đây.
 *
 *  ĐỔI 19/08: cổng không còn là 10/10. Đủ **sáu ô bắt buộc** là thành init data,
 *  tức chạy được vào pipeline và agent 2 chạy được. Bốn ô còn lại làm dày hồ sơ,
 *  thiếu thì không chặn — nhưng vẫn đếm, vì đó là thước công trạng của BD.
 *
 *  Ô nào bắt buộc là CẤU HÌNH (module Cấu hình · mục 5.1), bảng này là mặc định. */
export const INIT_DATA_QUESTIONS = [
  { no: 1, key: 'phap-nhan', label: 'Công ty là ai — tên pháp nhân, mã số thuế', required: true },
  { no: 2, key: 'nganh', label: 'Ngành và sản phẩm chính', required: true },
  { no: 3, key: 'quy-mo', label: 'Quy mô — số người, số nhà máy', required: true },
  { no: 4, key: 'nguoi-lien-he', label: 'Người liên hệ và chức danh', required: true },
  { no: 5, key: 'kenh', label: 'Kênh liên lạc gọi lại được', required: true },
  { no: 6, key: 'dau', label: 'Đau ở đâu — việc khách muốn giải', required: true },
  { no: 7, key: 'dang-dung', label: 'Đang dùng gì', required: false },
  { no: 8, key: 'nguoi-ky', label: 'Ai ký cuối, ai duyệt tiền', required: false },
  { no: 9, key: 'tien', label: 'Khoảng tiền', required: false },
  { no: 10, key: 'moc', label: 'Khi nào cần xong', required: false },
] as const

export type QuestionKey = (typeof INIT_DATA_QUESTIONS)[number]['key']

/** Vẫn là mười ô — chỉ cổng đổi, không phải bộ câu đổi. */
export const INIT_DATA_SLOTS = INIT_DATA_QUESTIONS.length

/** Số ô BẮT BUỘC. Đây mới là cổng MQL → SQL. */
export const REQUIRED_SLOTS = INIT_DATA_QUESTIONS.filter((q) => q.required).length

const REQUIRED_KEYS = INIT_DATA_QUESTIONS.filter((q) => q.required).map((q) => q.key)
const OPTIONAL_KEYS = INIT_DATA_QUESTIONS.filter((q) => !q.required).map((q) => q.key)

// ---------------------------------------------------------------------------
// Khung KPI — "Tài liệu tổng hợp vòng đời khách hàng, KPI & thiết kế CRM".
// Sửa được ở module Cấu hình (mục 5.6, cùng chỗ với CREDIT_RULES).
// ---------------------------------------------------------------------------

/** BA LỚP KPI — "Tách 3 lớp KPI thay vì 1 lớp".
 *
 *  Lý do tài liệu đưa ra, chép lại vì nó quyết định cách đọc cả màn Performance:
 *  chỉ nhìn lớp kết quả thì một người có đầu vào kém chất lượng bị chấm sai. Lớp
 *  hoạt động nói "người này làm bao nhiêu", lớp chuyển đổi nói "làm có ăn thua
 *  không", lớp chất lượng nói "làm có sạch không". */
export const KPI_LAYERS = [
  { key: 'hoat-dong', label: 'Hoạt động', note: 'Người này làm được bao nhiêu việc trong kỳ' },
  { key: 'chuyen-doi', label: 'Chuyển đổi', note: 'Việc đã làm có đẩy được sang bậc sau không' },
  { key: 'chat-luong', label: 'Chất lượng', note: 'Thứ làm ra có sạch không, có đắt không' },
] as const

export type KpiLayer = (typeof KPI_LAYERS)[number]['key']

/** Cách đọc con số. `ty-le` là 0–1, `tien` là đồng. */
export type KpiMeasureUnit = 'so' | 'tien' | 'ty-le'

export type RoleKpiSpec = {
  key: string
  layer: KpiLayer
  /** Tên thước. Thước nào có trong `CREDIT_RULES` thì chép ĐÚNG chữ ở đó —
   *  `scenario.test.ts` khoá việc này, để hai bảng không trôi khỏi nhau. */
  label: string
  unit: KpiMeasureUnit
  /** Công thức, viết theo đúng bảng "Nhóm 3 — Hiệu suất theo nhân sự". */
  formula: string
  /** Mục tiêu của MỘT THÁNG. `null` = thước quan sát, không chấm đạt/không đạt. */
  monthlyTarget: number | null
  /** Đúng cho hầu hết; `false` cho giá mỗi lead tốt — rẻ hơn mới là tốt hơn. */
  higherIsBetter: boolean
  /** Thước cộng dồn theo thời gian, tức đo được nhịp "còn thiếu bao nhiêu, còn
   *  mấy ngày". Tỷ lệ và số đo tại một thời điểm thì không. */
  paced: boolean
  /** Số chụp tại lát cắt 17/08, không cắt được theo kỳ — nhãn phải nói ra. */
  snapshot?: boolean
  /** Thước mà TIỀN ghi nhận trước còn KẾT QUẢ về sau.
   *
   *  Gian hàng 145 tr của SK-0106 rơi trọn vào tháng 8, còn lead của nó về rải
   *  ra các tháng sau — nên "giá mỗi lead tốt của tháng 8" đọc ra 72,5 tr trong
   *  khi đợt mới đi được 17/31 ngày. Con số ấy đúng, nhưng chấm Đạt/Trượt trên
   *  nó là chấm độ trễ kế toán chứ không chấm việc ai làm.
   *
   *  Vì thế thước mang cờ này VẪN HIỆN SỐ ở kỳ chưa đóng, nhưng KHÔNG chấm
   *  nhãn — trạng thái là "chưa chốt". Kỳ đã đóng thì chấm bình thường. */
  settlesLate?: boolean
  /** Thước đứng ở tâm đồng hồ KPI của vai. Đúng một cái mỗi vai. */
  primary?: boolean
}

/** Thước của từng vai. Vai nào cũng có đủ ba lớp trừ Presales (fixture thiếu
 *  nguồn số) và Trưởng phòng (không chấm cá nhân — luật ở bảng công trạng). */
export const ROLE_KPI_MODEL: { role: string; kpis: RoleKpiSpec[] }[] = [
  {
    role: 'Marketing',
    kpis: [
      {
        key: 'lead-keo-ve',
        layer: 'hoat-dong',
        label: 'Lead kéo về',
        unit: 'so',
        formula: 'COUNT(lead vào sổ trong kỳ, từ nguồn vai này đứng tên)',
        monthlyTarget: 24,
        higherIsBetter: true,
        paced: true,
        primary: true,
      },
      {
        key: 'lead-tot',
        layer: 'hoat-dong',
        label: 'Lead tốt — qua được cổng init data',
        unit: 'so',
        formula: `COUNT(lead trong kỳ điền đủ ${REQUIRED_SLOTS} ô bắt buộc)`,
        monthlyTarget: 9,
        higherIsBetter: true,
        paced: true,
      },
      {
        key: 'ty-le-lead-tot',
        layer: 'chuyen-doi',
        label: 'Tỷ lệ lead tốt',
        unit: 'ty-le',
        formula: '(Lead tốt ÷ Lead kéo về) × 100%',
        monthlyTarget: 0.4,
        higherIsBetter: true,
        paced: false,
      },
      {
        key: 'lead-tot-moi-dot',
        layer: 'chat-luong',
        label: 'Số lead tốt trên mỗi đợt',
        unit: 'so',
        formula: 'Lead tốt ÷ số đợt đã chạy trong kỳ',
        monthlyTarget: 1.2,
        higherIsBetter: true,
        paced: false,
      },
      {
        key: 'gia-moi-lead-tot',
        layer: 'chat-luong',
        label: 'Giá mỗi lead tốt',
        unit: 'tien',
        formula: 'Tổng chi của nguồn ÷ số lead tốt (CPL của tài liệu)',
        monthlyTarget: 12_000_000,
        higherIsBetter: false,
        paced: false,
        /* Hết `snapshot` từ 20/08: `Source.costLines[].day` cho phép cắt chi
           phí theo kỳ, nên tử số và mẫu số cuối cùng cũng cùng một khoảng thời
           gian. Đổi lại phải nhận `settlesLate` — xem chú thích của cờ đó. */
        snapshot: false,
        settlesLate: true,
      },
    ],
  },
  {
    role: 'BD',
    kpis: [
      {
        key: 'o-bat-buoc',
        layer: 'hoat-dong',
        label: 'Ô bắt buộc moi được',
        unit: 'so',
        formula: 'SUM(ô bắt buộc đã điền của lead BD chạm trong kỳ)',
        monthlyTarget: 60,
        higherIsBetter: true,
        paced: true,
        primary: true,
      },
      {
        key: 'lead-xac-minh',
        layer: 'hoat-dong',
        label: 'Lead xác minh là công ty thật',
        unit: 'so',
        formula: 'COUNT(lead lên bậc MQL trong kỳ)',
        monthlyTarget: 12,
        higherIsBetter: true,
        paced: true,
      },
      {
        key: 'mql-sang-sql',
        layer: 'chuyen-doi',
        label: 'Tỷ lệ MQL → SQL',
        unit: 'ty-le',
        formula: '(Số lead vào sổ cơ hội trong kỳ ÷ Số lead lên MQL trong kỳ) × 100%',
        monthlyTarget: 0.6,
        higherIsBetter: true,
        paced: false,
      },
      {
        key: 'phan-hoi-nguoc',
        layer: 'chat-luong',
        label: 'Phản hồi trả ngược cho Marketing',
        unit: 'so',
        formula: 'COUNT(phản hồi BD gửi về đợt) — sổ lead chưa ghi trường này',
        monthlyTarget: null,
        higherIsBetter: true,
        paced: false,
      },
    ],
  },
  {
    role: 'Sale',
    kpis: [
      {
        key: 'don-chot',
        layer: 'hoat-dong',
        label: 'Đơn chốt',
        unit: 'so',
        formula: 'COUNT(hợp đồng ký trong kỳ, đứng tên vai này)',
        monthlyTarget: 1,
        higherIsBetter: true,
        paced: true,
        primary: true,
      },
      {
        key: 'gia-tri-don',
        layer: 'hoat-dong',
        label: 'Giá trị đơn',
        unit: 'tien',
        formula: 'SUM(giá trị đơn đang mở đứng tên vai này)',
        monthlyTarget: 5_000_000_000,
        higherIsBetter: true,
        paced: false,
        snapshot: true,
      },
      {
        key: 'win-rate',
        layer: 'chuyen-doi',
        label: 'Win rate',
        unit: 'ty-le',
        formula: '(Đơn chốt trong kỳ ÷ SQL nhận trong kỳ) × 100%',
        monthlyTarget: 0.31,
        higherIsBetter: true,
        paced: false,
      },
      {
        key: 'toc-do-cot',
        layer: 'chat-luong',
        label: 'Tốc độ qua từng cột',
        unit: 'ty-le',
        formula: '(Đơn còn trong hạn cột ÷ Đơn đang mở) × 100%',
        monthlyTarget: 0.6,
        higherIsBetter: true,
        paced: false,
        snapshot: true,
      },
    ],
  },
  {
    role: 'Presales',
    kpis: [
      {
        key: 'demo-di-cung',
        layer: 'hoat-dong',
        label: 'Buổi demo đi cùng',
        unit: 'so',
        formula: 'COUNT(buổi demo có tên vai này) — sổ cơ hội chưa có trường này',
        monthlyTarget: null,
        higherIsBetter: true,
        paced: true,
        primary: true,
      },
      {
        key: 'demo-ra-bao-gia',
        layer: 'chuyen-doi',
        label: 'Demo ra được báo giá',
        unit: 'ty-le',
        formula: '(Báo giá sau demo ÷ Buổi demo) × 100% — chưa ghép được demo với người',
        monthlyTarget: null,
        higherIsBetter: true,
        paced: false,
      },
    ],
  },
  {
    /** Không có dòng nào: vai này phân công chứ không giữ khách. Màn hiện số
     *  của phòng thay cho thước cá nhân. */
    role: 'Trưởng phòng Kinh doanh',
    kpis: [],
  },
]

/** Ngưỡng SLA bàn giao — bảng "Nhóm 2 · SLA bàn giao" của tài liệu, phần chặng
 *  nào đo được bằng sổ lead của kịch bản này. Hai chặng sau (Sales → Onboarding,
 *  Onboarding → CS) thuộc giai đoạn sau bán: kịch bản DAS Vina là khách CHƯA
 *  MUA nên không có mốc nào để đo, và trộn sang kịch bản Sao Đỏ là phạm luật.
 *
 *  `targetDays` là mục tiêu; tài liệu chấm trạng thái theo ba mức: trong mục
 *  tiêu là đúng hạn, vượt ≤ 20% là cần theo dõi, quá 20% là trễ hạn. */
export const HANDOFF_SLA = [
  /* Tài liệu đặt mục tiêu bằng PHÚT và GIỜ (≤ 30 phút cho lead mới, ≤ 24 giờ
     cho SQL). Sổ lead của kịch bản chỉ ghi tới ngày, nên mục tiêu quy về ngày:
     ba ngày cho mỗi chặng — đủ chặt để chặng chậm lộ ra, đủ lỏng để không phải
     chặng nào cũng đỏ. Sửa được ở module Cấu hình như mọi ngưỡng khác. */
  { key: 'mkt-bd', label: 'Marketing → BD', note: 'lead vào sổ → BD chạm lần đầu', targetDays: 3 },
  { key: 'bd-sale', label: 'BD → Sale', note: 'lên MQL → vào sổ cơ hội', targetDays: 3 },
] as const

/** Ba mức trạng thái của tài liệu, dùng chung cho SLA và cho thước KPI. */
export const SLA_WATCH_MARGIN = 0.2

// ---------------------------------------------------------------------------
// Module 1 · Chiến dịch & Sự kiện — nguồn của sổ lead.
// ---------------------------------------------------------------------------

export type SourceKind = 'chien-dich' | 'su-kien' | 'tu-nhien'

/** Kênh của một đợt. Bốn kênh đầu là kênh E4 đã có; ba kênh sau là nền tảng
 *  đăng bài ra ngoài — E4 chưa hỗ trợ, đang là nợ treo số 2 của docs. */
export type WaveChannel =
  'email' | 'zalo-oa' | 'telegram' | 'in-app' | 'linkedin' | 'facebook' | 'website'

export type Wave = {
  no: number
  label: string
  channel: WaveChannel
  /** Ngày chạy, tính bằng ngày kể từ 01/05. */
  day: number
  /** Số người nhận / số người tiếp cận được. */
  sent: number
  /** Mở mail hoặc xem bài. */
  opened: number
  /** Trả lời hoặc tương tác. */
  replied: number
  /** Địa chỉ KHÔNG nhận được — mail dội về, số ZNS không tới nơi.
   *
   *  Chỉ kênh GỬI TỚI MỘT ĐỊA CHỈ mới hỏng được. Đợt đăng bài (LinkedIn,
   *  Facebook, website) và đợt quét mã tại chỗ (in-app) luôn bằng 0: chúng không
   *  có địa chỉ nào để dội. 0 ở đó là NỘI DUNG — "kênh này không hỏng được" —
   *  chứ không phải chỗ chưa ai nhập.
   *
   *  Trong chuỗi dùng lại CÙNG một danh sách, số này giải thích luôn chỗ danh
   *  sách teo đi: `sent` của đợt sau bằng `sent` trừ `bounced` của đợt trước.
   *  Đúng với cả hai chuỗi email thuần của kịch bản (CD-0101, CD-0105), và
   *  `campaigns.test.ts` khoá chuyện đó. */
  bounced: number
  /** Lead đổ về TỪ ĐỢT NÀY. Cộng mọi đợt = `leads` của chiến dịch. */
  leads: number
  /** Kỳ vọng lead của đợt — con số ĐẶT TRƯỚC khi gửi, không phải số đo.
   *
   *  Cách đặt, đúng như Marketing đặt thật: đợt **mở màn** tính theo số người
   *  nhận và chất lượng danh sách (danh sách lạnh quanh 0,8%; danh sách ấm hoặc
   *  danh sách người đã đăng ký thì cao hơn nhiều). Đợt **nhắc** đặt SAU khi đợt
   *  liền trước đã chạy: lấy tỉ lệ lead trên người trả lời của đợt đó, áp lên số
   *  người đợt nhắc còn giữ lại được.
   *
   *  Hệ quả có chủ ý: kỳ vọng luôn đuổi theo đợt trước nên trễ đúng một nhịp —
   *  đợt vừa vượt thì đợt sau bị đặt cao rồi hụt, và ngược lại. Vì thế
   *  `expected` gần như không bao giờ trùng `leads`. Một cột kỳ vọng lúc nào
   *  cũng đúng y số đo là cột không nói được điều gì. */
  expected: number
}

/** Chuỗi còn được coi là ĐANG CHẠY bao nhiêu ngày sau đợt cuối, ngày.
 *
 *  Một chiến dịch không chết ngay lúc đợt cuối rời máy chủ: mail còn nằm trong
 *  hộp thư, và trả lời còn lác đác về thêm chừng hai tuần. Cột trạng thái phải
 *  đọc theo cửa sổ đó, không đọc theo mốc "đã gửi xong" — gọi một chuỗi vừa gửi
 *  hôm kia là "đã xong" thì người chạy nó đóng sổ sớm mất hai tuần trả lời.
 *
 *  **Số ĐẶT, không phải số đo** — kịch bản chưa có nhật ký trả lời theo ngày để
 *  rút ra con số này. Đặt 14 vì đó là nhịp nhắc của chính các chuỗi trong kịch
 *  bản (CD-0101 cách nhau 14 ngày). Có nhật ký thật thì đo lại. */
export const WAVE_REPLY_WINDOW = 14

// ---------------------------------------------------------------------------
// Chi phí của một nguồn — NĂM loại chi tiền mặt
//
// `Source.cost` là một cục tiền: chia cho số lead tốt ra giá, hết. Không ai đọc
// được 145 triệu của SK-0106 đi đâu, và màn Performance phải tự thú "chi phí của
// một nguồn không chia được theo ngày". `costLines` trả lời cả hai chỗ đó bằng
// đúng một cấu trúc: mỗi dòng có LOẠI và có NGÀY.
//
// Danh sách năm loại là ĐÓNG — không có loại thứ sáu, không có ô "khác", cùng
// luật với `EXIT_REASONS`. Nhân công KHÔNG có mặt ở đây: 300 triệu là **tiền mặt
// đã ra khỏi tài khoản**, còn giờ người là một lớp khác và hôm nay chưa có bảng
// giờ nào trong hệ để đo. Nhét giờ vào đây là đổi NGHĨA của một con số đã khoá
// mà không đổi GIÁ TRỊ của nó — kiểu sai không test nào bắt được.
// ---------------------------------------------------------------------------

/** Năm loại chi TIỀN MẶT. Danh sách đóng, sửa được ở module Cấu hình nhưng
 *  vẫn phải là danh sách đóng: một ô "khác" là chỗ mọi hoá đơn khó phân loại
 *  chui vào, và sau ba tháng nó thành loại lớn nhất bảng. */
export type CostKind = 'du-lieu' | 'kenh' | 'noi-dung' | 'su-kien' | 'cong-cu'

export type CostLine = {
  kind: CostKind
  label: string
  /** Đồng. Cộng mọi dòng của một nguồn = `Source.cost`, không xê một đồng. */
  amount: number
  /** Ngày tiêu, tính bằng ngày kể từ 01/05 — cùng trục với `Source.startDay`.
   *  Có nó thì chi phí mới cắt được theo kỳ; hôm nay màn Performance phải thú
   *  nhận "chi phí của một nguồn không chia được theo ngày".
   *
   *  Quy ước điền, viết ra để không ai phải đoán:
   *  - dòng gắn với MỘT đợt → ngày của đợt đó;
   *  - dòng gắn với ngày diễn ra sự kiện → ngày sự kiện;
   *  - dòng GỘP cả chuỗi (gói ESP nhiều tháng, cả bộ nội dung, phần công cụ
   *    chia theo đợt) → `startDay` của nguồn, vì đó là lúc phòng cam kết chi để
   *    chuỗi chạy được.
   *
   *  Hệ quả phải nói ra thay vì giấu: **dòng gộp không chia nhỏ hơn được**, nên
   *  cắt kỳ ở giữa một chuỗi thì cả dòng rơi trọn vào lát đầu. Chia mịn hơn cần
   *  chứng từ mịn hơn, mà hôm nay chưa có chứng từ nào. */
  day: number
}

/** Đơn giá một dòng danh sách Apollo, đồng. DẪN XUẤT: gói Professional
 *  $79/ghế/tháng × 26.400 đ = 2.085.600 đ ÷ 2.000 credit = 1.042,80 đ/credit,
 *  làm tròn tới 100 đ. Phần chênh do làm tròn KHÔNG rải xuống nguồn — nó nằm
 *  trong `UNUSED_APOLLO_CREDIT`.
 *
 *  **Số ĐẶT bởi Trần Thu Hà · 20/08.** */
export const ROW_PRICE = 1_000

/** Phí xác minh một địa chỉ thư, đồng.
 *  **Số ĐẶT bởi Trần Thu Hà · 20/08** — chưa có hoá đơn nhà cung cấp nào. */
export const EMAIL_VERIFY_PRICE = 300

/** Pool công cụ dùng chung cả phòng, đồng: ghế Sales Navigator Core 4 tháng
 *  ($396) 10.450.000 + bộ thiết kế 4 tháng 3.500.000 + ghế CRM cho Marketing
 *  4 tháng 4.850.000.
 *
 *  Apollo KHÔNG nằm trong pool — nó tính thẳng vào loại `du-lieu` theo credit
 *  tiêu, để một đồng không bị tính hai lần.
 *
 *  **Số ĐẶT bởi Trần Thu Hà · 20/08.** */
export const TOOL_POOL = 18_800_000

/** Mẫu số chia pool công cụ: số ĐỢT đã chạy trong kỳ.
 *
 *  Khoá phân bổ là theo đợt chứ không theo dòng dữ liệu, vì ghế Sales Navigator
 *  và nền tảng webinar tiêu theo THỜI GIAN. Chia theo dòng thì một chuỗi email
 *  gánh hết tiền ghế LinkedIn — sai hẳn nghĩa.
 *
 *  **Khoá ĐẶT bởi Trần Thu Hà · 20/08.** Con số 20 không được gõ tay: nó phải
 *  bằng tổng `waves.length` của tám nguồn, và `scenario.test.ts` khoá chuyện đó. */
export const TOOL_POOL_WAVES = 20

/** 18.800.000 ÷ 20 = 940.000 đ mỗi đợt. */
export const TOOL_PER_WAVE = TOOL_POOL / TOOL_POOL_WAVES

export type Source = {
  code: string
  kind: SourceKind
  label: string
  owner: string
  /** Người theo dõi thêm — nguồn nào cũng có thể có hai ba người cùng nhìn.
   *
   *  Chủ nguồn (`owner`) KHÔNG nằm trong đây: chủ là người chịu trách nhiệm,
   *  follower là người xin theo. Trộn hai vai vào một danh sách thì mất luôn câu
   *  trả lời "hỏi ai khi số hụt". Tên phải có trong `actors`.
   *
   *  Vắng mặt là câu trả lời hợp lệ — nguồn không ai theo dõi thì bỏ trống, đừng
   *  điền cho đủ danh sách. */
  followers?: string[]
  /** Ngày chạy đầu tiên, tính bằng ngày kể từ 01/05. */
  startDay: number
  /** Tổng lead đổ về. Cộng cả tám nguồn = 100, đúng bậc đầu của phễu. */
  leads: number
  waves: Wave[]
  /** Chỉ sự kiện: có địa điểm, có người đăng ký, có người đến. */
  venue?: string
  registered?: number
  checkedIn?: number
  /** Chi phí đã tiêu, đồng. **Đây là TIỀN MẶT đã ra khỏi tài khoản** — không gồm
   *  giờ người. Dùng cho công trạng Marketing (giá mỗi lead tốt).
   *
   *  Giá trị của tám nguồn đã chốt và bị test khoá; `costLines` phân rã nó chứ
   *  không được sửa nó. */
  cost: number
  /** Phân rã `cost` thành các dòng chi có LOẠI và có NGÀY. Cộng lại đúng bằng
   *  `cost`, không xê một đồng — `scenario.test.ts` khoá từng nguồn một.
   *
   *  Nguồn tự nhiên không tiêu đồng nào thì mảng RỖNG. Không bịa dòng cho đủ
   *  bảng: 0 đồng tiền mặt là câu trả lời ĐÚNG cho GT và TM, không phải chỗ
   *  thiếu dữ liệu. (Hai nguồn đó vẫn tốn giờ người — nhưng giờ người là lớp
   *  khác, chưa dựng ở vòng này.) */
  costLines: CostLine[]
}

/** TÁM nguồn của kỳ 01/05 → 17/08. Sáu cái đầu là chiến dịch/sự kiện có người
 *  làm, hai cái cuối là nguồn tự nhiên — không ai chạy chiến dịch nào cả.
 *
 *  Tổng lead = 22+18+16+12+9+11+7+5 = 100 = bậc `dau-moi` của FUNNEL.
 *
 *  **Kỳ vọng của kỳ.** Cộng `expected` của cả hai mươi đợt được 101, về thật 88
 *  (12 lead còn lại đến từ hai nguồn tự nhiên, không ai đặt kỳ vọng cho chúng).
 *  Chỗ hụt không rải đều: SK-0104 là nguồn DUY NHẤT vượt kỳ vọng cả chuỗi, còn
 *  SK-0106 — gian hàng triển lãm, 145 triệu, đắt nhất kỳ — đặt 19 và về 11. Hai
 *  đầu này là lý do cột kỳ vọng đáng có mặt trên màn. */
export const SOURCES: Source[] = [
  {
    code: 'CD-0101',
    kind: 'chien-dich',
    label: 'Chuỗi email — nhà máy điện tử Bắc Ninh',
    owner: MARKETING,
    /** BD theo dõi vì lead của chuỗi này đổ thẳng vào tay anh để moi ô bắt buộc. */
    followers: [BD],
    startDay: 11,
    leads: 22,
    cost: 18_000_000,
    /* Chuỗi email thuần: hai phần ba tiền nằm ở nội dung và kênh, tiền dữ liệu
       chỉ 1.560.000 — tức 8,67% chi của nguồn. Đó là con số đáng đọc nhất của
       cả bảng: chỗ ai cũng nghĩ tới đầu tiên khi nghe "lead từ Apollo giá bao
       nhiêu" là chỗ nhỏ nhất. */
    costLines: [
      {
        kind: 'du-lieu',
        label: 'Danh sách Apollo — đợt mở màn',
        amount: 1_200 * ROW_PRICE,
        day: 11,
      },
      { kind: 'du-lieu', label: 'Xác minh email', amount: 1_200 * EMAIL_VERIFY_PRICE, day: 11 },
      { kind: 'kenh', label: 'Gói gửi ESP · 3 tháng', amount: 3_300_000, day: 11 },
      { kind: 'kenh', label: 'Quảng cáo dẫn lại', amount: 3_000_000, day: 25 },
      { kind: 'kenh', label: 'Gói ZNS Zalo OA · đợt 3', amount: 600_000, day: 39 },
      {
        kind: 'noi-dung',
        label: 'Nội dung 3 đợt · thư + bản so sánh + landing',
        amount: 6_720_000,
        day: 11,
      },
      { kind: 'cong-cu', label: 'Công cụ dùng chung · 3 đợt', amount: 3 * TOOL_PER_WAVE, day: 11 },
    ],
    waves: [
      {
        no: 1,
        label: 'Mở màn — thư giới thiệu',
        channel: 'email',
        day: 11,
        sent: 1_200,
        opened: 384,
        replied: 41,
        // 41 địa chỉ dội về — đúng chỗ danh sách teo từ 1.200 xuống 1.159 ở đợt
        // sau. Trùng số người trả lời là trùng ngẫu nhiên, không phải chép nhầm.
        bounced: 41,
        leads: 11,
        // Danh sách lạnh 1.200 nhà máy, đặt 0,83% — về 11, vượt một chút.
        expected: 10,
      },
      {
        no: 2,
        label: 'Nhắc lần 1 — bản so sánh trước/sau',
        channel: 'email',
        day: 25,
        sent: 1_159,
        opened: 301,
        replied: 22,
        // 1.159 − 22 = 1.137, đúng số gửi của đợt 3.
        bounced: 22,
        leads: 7,
        // Đợt 1 ra 11 lead trên 41 người trả lời (27%); đợt nhắc dự tính giữ
        // được chừng 30 người trả lời → đặt 8. Về 7.
        expected: 8,
      },
      {
        no: 3,
        label: 'Nhắc lần 2 — mời xem demo',
        channel: 'zalo-oa',
        day: 39,
        sent: 1_137,
        opened: 268,
        replied: 14,
        // ZNS gửi tới số điện thoại nên vẫn hỏng được; đợt cuối chuỗi, không có
        // đợt sau để đối chiếu chỗ teo.
        bounced: 19,
        leads: 4,
        // 7 trên 22 của đợt 2 (32%) áp lên chừng 16 người trả lời còn lại.
        expected: 5,
      },
    ],
  },
  {
    code: 'CD-0102',
    kind: 'chien-dich',
    label: 'Bài đa nền tảng — MES cho đóng gói chip',
    owner: MARKETING,
    startDay: 33,
    leads: 18,
    cost: 26_000_000,
    /* Nguồn DUY NHẤT không mua dòng nào: nó chạy trên bài đăng, khán giả là
       reach của nền tảng. Không có dòng `du-lieu` — và một dòng 0 đồng cho đủ
       bảng thì tệ hơn không có dòng, vì nó làm người đọc tưởng đã đo. */
    costLines: [
      { kind: 'kenh', label: 'Quảng cáo LinkedIn · reach 8.400', amount: 8_000_000, day: 33 },
      { kind: 'kenh', label: 'Đẩy bài Zalo OA · 5.100', amount: 2_000_000, day: 40 },
      { kind: 'kenh', label: 'Quảng cáo Facebook · reach 6.800', amount: 4_000_000, day: 47 },
      { kind: 'kenh', label: 'ESP thư nhắc đợt 4 · 900 lượt', amount: 500_000, day: 54 },
      {
        kind: 'noi-dung',
        label: 'Nội dung 4 ấn phẩm · bài dài, bài ngắn, bộ ảnh, thư',
        amount: 7_740_000,
        day: 33,
      },
      { kind: 'cong-cu', label: 'Công cụ dùng chung · 4 đợt', amount: 4 * TOOL_PER_WAVE, day: 33 },
    ],
    waves: [
      {
        no: 1,
        label: 'Bài dài — vì sao nhà máy chip cần MES',
        channel: 'linkedin',
        day: 33,
        sent: 8_400,
        opened: 512,
        replied: 63,
        // Bài đăng không có địa chỉ nào để dội — 0 ở đây là nội dung, không phải
        // ô chưa nhập. Ba đợt đầu của CD-0102 đều thế.
        bounced: 0,
        leads: 6,
        // Lần đầu chạy LinkedIn nên không có số cũ để dựa: đặt theo reach mong
        // đợi 8.400 người. Đặt cao và hụt — đúng cái giá của kênh chưa từng đo.
        expected: 8,
      },
      {
        no: 2,
        label: 'Bài ngắn — ba con số của một dây chuyền',
        channel: 'zalo-oa',
        day: 40,
        sent: 5_100,
        opened: 340,
        replied: 38,
        bounced: 0,
        leads: 5,
        // Sau đợt 1 đã biết bài đăng chỉ ra 6 lead trên 63 lượt tương tác (9,5%);
        // hạ kỳ vọng xuống 4 rồi lại vượt.
        expected: 4,
      },
      {
        no: 3,
        label: 'Bài ảnh — trong nhà máy khách cũ',
        channel: 'facebook',
        day: 47,
        sent: 6_800,
        opened: 291,
        replied: 25,
        bounced: 0,
        leads: 4,
        // Facebook đặt thấp hơn Zalo vì tương tác loãng hơn. Vượt lần nữa.
        expected: 3,
      },
      {
        no: 4,
        label: 'Thư nhắc cho người đã bấm vào bài',
        channel: 'email',
        day: 54,
        sent: 900,
        opened: 233,
        replied: 19,
        // Đợt duy nhất của CD-0102 gửi tới địa chỉ: 21 trên 900 người đã bấm vào
        // bài, tức 2,3% — danh sách ấm nên hỏng ít.
        bounced: 21,
        leads: 3,
        // Hai đợt vượt liên tiếp nên đợt cuối được đặt cao lên 4 — và hụt. Kỳ
        // vọng đuổi theo đợt trước thì luôn trễ đúng một nhịp.
        expected: 4,
      },
    ],
  },
  {
    code: 'SK-0103',
    kind: 'su-kien',
    label: 'Hội thảo · Số hoá nhà máy đóng gói',
    owner: MARKETING,
    /** Sự kiện có mặt người thật: BD trực bàn đăng ký, TP Kinh doanh gật khoản
     *  84 triệu. Cả hai theo dõi từ lúc mở đợt mời. */
    followers: [BD, HEAD_OF_SALES],
    startDay: 32,
    leads: 16,
    cost: 84_000_000,
    /* 72,6 trên 84 triệu là loại `su-kien`, và bốn dòng đó tiêu HẾT trong đúng
       một ngày — ngày 54, ngày hội trường mở cửa. Đây là lý do `day` phải có:
       một nguồn 84 triệu không tiêu đều suốt kỳ, nó tiêu dồn vào một buổi. */
    costLines: [
      { kind: 'du-lieu', label: 'Danh sách mời Apollo', amount: 640 * ROW_PRICE, day: 32 },
      { kind: 'kenh', label: 'ESP + ZNS mời và nhắc', amount: 1_000_000, day: 32 },
      { kind: 'noi-dung', label: 'Slide, thư mời, tài liệu phát tay', amount: 6_000_000, day: 32 },
      {
        kind: 'su-kien',
        label: 'Thuê hội trường + âm thanh + màn hình · nửa ngày',
        amount: 28_000_000,
        day: 54,
      },
      { kind: 'su-kien', label: 'Ăn giữa giờ · 78 người', amount: 78 * 250_000, day: 54 },
      { kind: 'su-kien', label: 'Quà + túi tài liệu · 120 bộ', amount: 120 * 150_000, day: 54 },
      { kind: 'su-kien', label: 'Đi lại + dựng khu trưng bày tại chỗ', amount: 7_100_000, day: 54 },
      { kind: 'cong-cu', label: 'Công cụ dùng chung · 4 đợt', amount: 4 * TOOL_PER_WAVE, day: 32 },
    ],
    venue: 'KCN Quế Võ · Bắc Ninh',
    registered: 120,
    checkedIn: 78,
    waves: [
      {
        no: 1,
        label: 'Thư mời',
        channel: 'email',
        day: 32,
        sent: 640,
        opened: 210,
        replied: 96,
        // Danh sách mời mua ngoài: 18 trên 640, tức 2,8%.
        bounced: 18,
        leads: 6,
        // Việc chính của thư mời là lấy ĐĂNG KÝ, lead chỉ là phần dôi ra — nên
        // đặt thấp, 5. Về 6.
        expected: 5,
      },
      {
        no: 2,
        label: 'Nhắc trước ngày diễn ra',
        channel: 'zalo-oa',
        day: 52,
        sent: 120,
        opened: 98,
        replied: 24,
        // 120 người TỰ ĐĂNG KÝ — số họ tự điền, nên gần như không hỏng.
        bounced: 2,
        leads: 2,
        // Nhắc cho đúng 120 người đã đăng ký, danh sách ấm nhất có thể → đặt 3.
        expected: 3,
      },
      {
        no: 3,
        label: 'Ngày diễn ra — check-in tại cửa',
        channel: 'in-app',
        day: 54,
        sent: 120,
        opened: 78,
        replied: 78,
        // Quét mã tại cửa — không gửi đi đâu cả, không hỏng được.
        bounced: 0,
        leads: 5,
        // Đặt theo số người dự kiến đến hội trường: cứ 10 người đến thì 1 thành
        // lead. Về 5 trên 78 người đến — chỗ hụt kinh điển của sự kiện: có mặt
        // không đồng nghĩa để lại việc.
        expected: 8,
      },
      {
        no: 4,
        label: 'Thư cảm ơn kèm tài liệu',
        channel: 'email',
        day: 56,
        sent: 120,
        opened: 84,
        replied: 31,
        bounced: 1,
        leads: 3,
        // Thư cuối chuỗi, đặt 2 cho có; về 3.
        expected: 2,
      },
    ],
  },
  {
    code: 'SK-0104',
    kind: 'su-kien',
    label: 'Webinar · Giá thành theo lệnh sản xuất',
    owner: MARKETING,
    /** Webinar chạy một mình được, chỉ BD theo để nhận lead ngay trong buổi. */
    followers: [BD],
    startDay: 61,
    leads: 12,
    cost: 21_000_000,
    /* Sự kiện trực tuyến nên khối `su-kien` chỉ còn quà cho người dự; phần lớn
       tiền chuyển sang `cong-cu` (nền tảng webinar) và `noi-dung`. Cùng là "sự
       kiện" với SK-0103 nhưng hình dạng chi phí khác hẳn — gộp hai cái vào một
       nhãn "sự kiện" trên màn là mất đúng chỗ đáng nhìn. */
    costLines: [
      { kind: 'du-lieu', label: 'Danh sách mời Apollo', amount: 980 * ROW_PRICE, day: 61 },
      { kind: 'kenh', label: 'ESP mời + nhắc + gửi bản ghi', amount: 700_000, day: 61 },
      { kind: 'kenh', label: 'ZNS nhắc trước 1 giờ · 86 tin', amount: 100_000, day: 75 },
      { kind: 'noi-dung', label: 'Slide + dựng lại bản ghi + ảnh bìa', amount: 7_940_000, day: 61 },
      { kind: 'su-kien', label: 'Quà cho người dự · 51 phần', amount: 51 * 60_000, day: 75 },
      {
        kind: 'cong-cu',
        label: 'Nền tảng webinar · gói 3 tháng, 500 chỗ',
        amount: 5_400_000,
        day: 61,
      },
      { kind: 'cong-cu', label: 'Công cụ dùng chung · 3 đợt', amount: 3 * TOOL_PER_WAVE, day: 61 },
    ],
    venue: 'Trực tuyến',
    registered: 86,
    checkedIn: 51,
    waves: [
      {
        no: 1,
        label: 'Thư mời',
        channel: 'email',
        day: 61,
        sent: 980,
        opened: 274,
        replied: 86,
        // 26 trên 980, tức 2,7% — cùng hạng với thư mời của SK-0103.
        bounced: 26,
        leads: 5,
        // Chép nhịp thư mời của SK-0103 nhưng danh sách lớn hơn một chút: đặt 4.
        expected: 4,
      },
      {
        no: 2,
        label: 'Nhắc trước 1 giờ',
        channel: 'zalo-oa',
        day: 75,
        sent: 86,
        opened: 71,
        replied: 51,
        bounced: 1,
        leads: 3,
        // Đặt theo số người dự kiến vào phòng. Buổi phát trực tiếp bao giờ cũng
        // được kỳ vọng nhiều nhất chuỗi — và ở đây hụt.
        expected: 5,
      },
      {
        no: 3,
        label: 'Gửi bản ghi cho người vắng',
        channel: 'email',
        day: 77,
        sent: 86,
        opened: 58,
        replied: 19,
        bounced: 1,
        leads: 4,
        // Đặt 2 vì đây là đợt vét. Về 4 — gấp đôi kỳ vọng, và nhiều hơn cả buổi
        // phát trực tiếp. Con số đáng để Marketing đọc lại cách đặt kỳ vọng.
        expected: 2,
      },
    ],
  },
  {
    code: 'CD-0105',
    kind: 'chien-dich',
    label: 'Nuôi lại khách im — quý 2',
    owner: MARKETING,
    /** Danh sách khách im là sổ cũ của phòng kinh doanh, nên TP Kinh doanh theo. */
    followers: [HEAD_OF_SALES],
    startDay: 19,
    leads: 9,
    cost: 6_000_000,
    /* KHÔNG có dòng `du-lieu`, và đó là dòng đáng giá nhất của cả bảng phân rã:
       danh sách là sổ cũ của phòng, không mua dòng nào. Hôm nay màn chỉ nói
       "6 triệu"; phân rã xong nó nói được VÌ SAO 6 triệu — và nói luôn rằng
       đường này KHÔNG nhân lên được, vì sổ cũ chỉ có 310 người. */
    costLines: [
      { kind: 'kenh', label: 'ESP 3 đợt · 885 lượt', amount: 500_000, day: 19 },
      { kind: 'noi-dung', label: '3 thư, viết trong nhà', amount: 2_500_000, day: 19 },
      { kind: 'cong-cu', label: 'Công cụ dùng chung · 3 đợt', amount: 3 * TOOL_PER_WAVE, day: 19 },
      { kind: 'kenh', label: 'ZNS đợt 3 · 282 tin', amount: 180_000, day: 82 },
    ],
    waves: [
      {
        no: 1,
        label: 'Hỏi thăm — có gì đổi không',
        channel: 'email',
        day: 19,
        sent: 310,
        opened: 118,
        replied: 17,
        // Sổ cũ của phòng, 310 người, nhiều địa chỉ đã chết theo người đổi việc:
        // 17 dội về — đúng chỗ danh sách teo còn 293 ở đợt 2. Lại trùng số người
        // trả lời, lại là trùng ngẫu nhiên.
        bounced: 17,
        leads: 4,
        // Danh sách ẤM 310 người từng nói chuyện: đặt gần 2%, tức 6. Về 4 —
        // khách im thì im thật, đây là chỗ hụt lớn nhất theo tỉ lệ của chuỗi.
        expected: 6,
      },
      {
        no: 2,
        label: 'Gửi việc mới làm cho khách cùng ngành',
        channel: 'email',
        day: 47,
        sent: 293,
        opened: 96,
        replied: 11,
        // 293 − 11 = 282, đúng số tin ZNS của đợt 3.
        bounced: 11,
        leads: 3,
        // Hạ xuống 2 sau khi đợt 1 hụt. Về 3.
        expected: 2,
      },
      {
        no: 3,
        label: 'Mời cà phê tại nhà máy',
        channel: 'zalo-oa',
        day: 82,
        sent: 282,
        opened: 71,
        replied: 8,
        bounced: 5,
        leads: 2,
        // Đợt 2 vượt nên nâng lại lên 3 — rồi hụt. Vẫn đúng một nhịp trễ.
        expected: 3,
      },
    ],
  },
  {
    code: 'SK-0106',
    kind: 'su-kien',
    label: 'Triển lãm công nghiệp hỗ trợ · gian hàng',
    owner: MARKETING,
    /** 145 triệu — khoản lớn nhất kỳ, nên cả BD lẫn TP Kinh doanh đứng cùng. */
    followers: [BD, HEAD_OF_SALES],
    startDay: 93,
    leads: 11,
    cost: 145_000_000,
    /* Khoản lớn nhất kỳ, và 120,44 triệu của nó là bốn dòng `su-kien`. Riêng
       tiền thuê gian 72 triệu đã lớn hơn cả chi phí của bốn nguồn cộng lại.
       Trên trục ngày: nguồn này chưa tiêu đồng nào cho tới ngày 93, rồi tiêu
       hết 145 triệu trong 7 ngày. */
    costLines: [
      { kind: 'du-lieu', label: 'Danh sách mời trước Apollo', amount: 1_400 * ROW_PRICE, day: 93 },
      { kind: 'kenh', label: 'ESP thư mời + thư sau hội chợ', amount: 600_000, day: 93 },
      {
        kind: 'noi-dung',
        label: 'Backdrop, standee, tờ rơi, video màn hình',
        amount: 18_000_000,
        day: 93,
      },
      { kind: 'su-kien', label: 'Thuê gian hàng 18 m² · ban tổ chức', amount: 72_000_000, day: 93 },
      { kind: 'cong-cu', label: 'Công cụ dùng chung · 3 đợt', amount: 3 * TOOL_PER_WAVE, day: 93 },
      { kind: 'su-kien', label: 'Thi công gian + điện nước', amount: 26_000_000, day: 99 },
      {
        kind: 'su-kien',
        label: 'Vận chuyển + lưu trú 3 ngày · 3 người',
        amount: 11_000_000,
        day: 99,
      },
      { kind: 'su-kien', label: 'Quà tại gian · 143 phần', amount: 143 * 80_000, day: 99 },
      {
        kind: 'cong-cu',
        label: 'Máy quét mã + phần mềm check-in · thuê 3 ngày',
        amount: 1_740_000,
        day: 99,
      },
    ],
    venue: 'Trung tâm triển lãm · Hà Nội',
    registered: 143,
    checkedIn: 143,
    waves: [
      {
        no: 1,
        label: 'Báo trước — mời ghé gian hàng',
        channel: 'email',
        day: 93,
        sent: 1_400,
        opened: 402,
        replied: 57,
        // Danh sách mời trước lớn nhất kỳ, 1.400 dòng mua ngoài: 47 dội về, 3,4%
        // — cùng hạng với đợt mở màn CD-0101, và cùng là danh sách lạnh.
        bounced: 47,
        leads: 3,
        // Thư báo trước chỉ để kéo người ghé gian, lead là phần dôi: đặt 4.
        expected: 4,
      },
      {
        no: 2,
        label: 'Ba ngày hội chợ — quét mã tại gian',
        channel: 'in-app',
        day: 99,
        sent: 143,
        opened: 143,
        replied: 143,
        bounced: 0,
        leads: 6,
        // Đây là con số biện minh cho 145 triệu: kỳ vọng một nửa số người quét
        // mã tại gian sẽ thành lead. Về 6 trên 143 — hụt đúng một nửa, và là
        // chỗ hụt đắt nhất của cả kỳ.
        expected: 12,
      },
      {
        no: 3,
        label: 'Thư sau hội chợ',
        channel: 'email',
        day: 103,
        sent: 143,
        opened: 91,
        replied: 22,
        bounced: 2,
        leads: 2,
        // Vét nốt 143 người đã quét mã: đặt 3.
        expected: 3,
      },
    ],
  },
  /** Hai nguồn tự nhiên: không có đợt nào nên KHÔNG có kỳ vọng nào để so, và
   *  cũng không ai theo dõi — chúng tự chảy. Đây là lý do màn phải tách "nguồn
   *  đang chạy" khỏi "tổng số nguồn": 12 lead dưới đây không thuộc về đợt nào. */
  {
    code: 'GT',
    kind: 'tu-nhien',
    label: 'Khách cũ giới thiệu',
    owner: HEAD_OF_SALES,
    startDay: 4,
    leads: 7,
    cost: 0,
    /* Không dòng nào, và 0 đồng TIỀN MẶT là câu trả lời đúng — không phải chỗ
       thiếu dữ liệu. Nguồn này vẫn tốn giờ người (TP Kinh doanh gọi lại khách
       cũ), nhưng giờ người là lớp khác: chưa có bảng giờ nào trong hệ, và bịa
       một dòng tiền mặt cho nó là làm hỏng đúng con số 300 triệu. */
    costLines: [],
    waves: [],
  },
  {
    code: 'TM',
    kind: 'tu-nhien',
    label: 'BD tự mở',
    owner: BD,
    startDay: 1,
    leads: 5,
    cost: 0,
    /* Như GT: 0 đồng tiền mặt, mảng rỗng. Xem chú thích ở GT. */
    costLines: [],
    waves: [],
  },
]

const sourceByCode = new Map(SOURCES.map((s) => [s.code, s]))

// ---------------------------------------------------------------------------
// Bảng giá nhà cung cấp và phép quy đổi "1.000 dòng tốn bao nhiêu"
//
// RANH GIỚI, đọc trước khi dùng: mọi thứ trong khối này là **đơn giá để LẬP KẾ
// HOẠCH**, không phải số đo của kỳ 01/05 → 17/08. Số đo nằm ở `Source.cost` và
// `Source.costLines`; hai bên KHÔNG được trộn. Màn kế hoạch dùng khối này để
// trả lời "muốn thêm ngần này đầu mối thì đặt bao nhiêu tiền"; màn Performance
// **không được đọc nó** — Performance chỉ đọc thứ đã tiêu thật.
//
// Trộn hai loại số này là kiểu sai khó thấy nhất: một bảng "chi phí" nửa dự
// toán nửa hoá đơn vẫn cộng ra một con số đẹp, và không ai biết nó là số nào.
// ---------------------------------------------------------------------------

/** Tỷ giá quy đổi, đồng/USD — nay ĐỨNG Ở `@pv/contracts`, xuất lại ở đây.
 *
 *  Nó đi cùng `CURRENCIES` và phải đi cùng: rời hai thứ ra hai package là dựng
 *  hai bản của một con số. Vì sao cả cụm rời khỏi fixture thì đọc docblock đầu
 *  `packages/contracts/src/sales/currency.ts` — nửa câu ngắn: máy chủ cũng cộng
 *  tiền, và nó không được cộng bằng bảng tỉ giá của một kịch bản demo. */
export { USD_VND }

/** Vì sao một dòng giá đứng được — hoặc vì sao nó không đứng được.
 *
 *  - `tra-duoc` — có bảng giá đọc được, ngày tra ghi ở `checkedOn`.
 *  - `khong-xac-minh-duoc` — các nguồn tra không thống nhất với nhau, con số
 *    đang dùng là số ĐẶT và phải đối chiếu bằng báo giá thật trước khi ký.
 *  - `khong-quy-doi-duoc` — nhà cung cấp KHÔNG bán theo dòng, nên phép chia ra
 *    đồng/1.000 dòng không tồn tại. Đây là KẾT LUẬN, không phải ô còn thiếu. */
export type RateConfidence = 'tra-duoc' | 'khong-xac-minh-duoc' | 'khong-quy-doi-duoc'

export type VendorRate = {
  vendor: string
  plan: string
  /** Giá niêm yết, giữ nguyên đơn vị nhà cung cấp công bố. Chuỗi chứ không phải
   *  số: "$79/ghế/tháng (trả năm)" và "99 triệu đ/năm, tối đa 5 người" không
   *  quy về một đơn vị được, và ép chúng vào một số là mất mất điều kiện bán. */
  listPrice: string
  /** Đồng cho 1.000 dòng dữ liệu lấy ra được. `null` khi không quy đổi được. */
  perThousandRows: number | null
  /** Ngày tra bảng giá. */
  checkedOn: string
  confidence: RateConfidence
  note: string
  source: string
}

/** Bảng giá tra ngày 20/08/2026. **Đơn giá LẬP KẾ HOẠCH** — xem chú thích khối.
 *
 *  Hai chỗ trống trong bảng là chỗ trống CÓ CHỦ Ý, không phải việc chưa làm:
 *
 *  1. **Sales Navigator không quy ra đồng/1.000 dòng được.** Nó bán quyền tìm
 *     và xem, không bán dòng dữ liệu — cả ba gói đều 0 email, 0 số điện thoại.
 *     Vì thế nó thuộc loại `cong-cu` (phân bổ theo thời gian), không thuộc
 *     `du-lieu`. Thêm nữa, chính giá ghế cũng **không xác minh được**: nguồn tra
 *     dao động $89,99 – $119,99/tháng.
 *  2. **Dữ liệu doanh nghiệp VN không quy ra được.** Vietdata công bố giá gói
 *     nhưng không công bố số dòng mỗi gói cho phép lấy ra, nên phép chia không
 *     thực hiện được. Các nơi bán "file data doanh nghiệp" trên Google Sites
 *     không có bảng giá công khai và không có pháp nhân kiểm được — không đưa
 *     vào mô hình.
 *
 *  Con số đắt nhất của bảng: mua credit lẻ đắt **5,06 lần** gói Professional.
 *  Một mô hình chi phí không nhìn thấy chỗ đó sẽ để phòng trả gấp năm lần mà
 *  không ai biết. */
export const VENDOR_RATES: VendorRate[] = [
  {
    vendor: 'Apollo.io',
    plan: 'Free',
    listPrice: '$0 · 10 export credit/tháng',
    perThousandRows: null,
    checkedOn: '2026-08-20',
    confidence: 'khong-quy-doi-duoc',
    note: '10 credit/tháng không bao giờ đủ 1.000 dòng — phép chia có ra số cũng vô nghĩa.',
    source: 'https://www.saleshandy.com/blog/apolloio-pricing/',
  },
  {
    vendor: 'Apollo.io',
    plan: 'Basic',
    listPrice: '$49/ghế/tháng (trả năm) · 1.000 credit/tháng',
    perThousandRows: 1_293_600,
    checkedOn: '2026-08-20',
    confidence: 'tra-duoc',
    note: '$49 × 26.400 = 1.293.600 đ ÷ 1.000 credit = 1.293,60 đ/dòng.',
    source: 'https://www.saleshandy.com/blog/apolloio-pricing/',
  },
  {
    vendor: 'Apollo.io',
    plan: 'Professional',
    listPrice: '$79/ghế/tháng (trả năm) · 2.000 credit/tháng',
    perThousandRows: 1_042_800,
    checkedOn: '2026-08-20',
    confidence: 'tra-duoc',
    note: 'Gói phòng đang dùng. $79 × 26.400 = 2.085.600 ÷ 2.000 = 1.042,80 đ/dòng — làm tròn thành ROW_PRICE = 1.000 đ.',
    source: 'https://www.saleshandy.com/blog/apolloio-pricing/',
  },
  {
    vendor: 'Apollo.io',
    plan: 'Organization',
    listPrice: '$119/ghế/tháng · tối thiểu 3 ghế · 4.000 credit/tháng',
    perThousandRows: 785_400,
    checkedOn: '2026-08-20',
    confidence: 'tra-duoc',
    note: 'Rẻ nhất mỗi dòng, nhưng phải mua tối thiểu 3 ghế — điều kiện bán không nằm trong đơn giá.',
    source: 'https://www.saleshandy.com/blog/apolloio-pricing/',
  },
  {
    vendor: 'Apollo.io',
    plan: 'Mua lẻ · overage',
    listPrice: '$0,20/credit · tối thiểu 250 credit mỗi lần',
    perThousandRows: 5_280_000,
    checkedOn: '2026-08-20',
    confidence: 'tra-duoc',
    note: 'Đắt 5,06 lần Professional và 6,72 lần Organization. Đây là cái bẫy: muốn 54.545 dòng ngay thì mua lẻ hết 288 triệu thay vì 70,9 triệu.',
    source: 'https://www.saleshandy.com/blog/apolloio-pricing/',
  },
  {
    vendor: 'LinkedIn Sales Navigator',
    plan: 'Core',
    listPrice: '$99/ghế/tháng',
    perThousandRows: null,
    checkedOn: '2026-08-20',
    confidence: 'khong-xac-minh-duoc',
    note: 'Không export dòng nào (0 email, 0 số điện thoại) nên không có đồng/1.000 dòng. Và chính giá ghế cũng dao động $89,99 – $119,99 tuỳ nguồn tra: $99 là số ĐẶT bởi Trần Thu Hà · 20/08, phải đối chiếu báo giá thật trước khi ký.',
    source: 'https://www.cleanlist.ai/blog/2026-05-08-linkedin-sales-navigator-pricing-guide',
  },
  {
    vendor: 'LinkedIn Sales Navigator',
    plan: 'Advanced',
    listPrice: '$149/ghế/tháng',
    perThousandRows: null,
    checkedOn: '2026-08-20',
    confidence: 'khong-quy-doi-duoc',
    note: 'Cũng không export dòng. Bán quyền tìm và xem, nên thuộc loại cong-cu chứ không phải du-lieu.',
    source: 'https://overloop.com/blog/linkedin-sales-navigator-pricing',
  },
  {
    vendor: 'LinkedIn Sales Navigator',
    plan: 'Advanced Plus',
    listPrice: '~$1.600/năm · báo giá riêng',
    perThousandRows: null,
    checkedOn: '2026-08-20',
    confidence: 'khong-xac-minh-duoc',
    note: 'Báo giá riêng, không có bảng công khai. Con số ~$1.600/năm chỉ để biết bậc giá.',
    source: 'https://overloop.com/blog/linkedin-sales-navigator-pricing',
  },
  {
    vendor: 'Vietdata',
    plan: 'Báo cáo ngành · BC003',
    listPrice: '5 triệu đ/năm',
    perThousandRows: null,
    checkedOn: '2026-08-20',
    confidence: 'khong-quy-doi-duoc',
    note: 'Không công bố số dòng doanh nghiệp mỗi gói cho lấy ra — phép chia không thực hiện được.',
    source: 'https://www.vietdata.vn/vi/data-sets',
  },
  {
    vendor: 'Vietdata',
    plan: 'Truy cập dữ liệu · Account001',
    listPrice: '7 triệu đ/năm',
    perThousandRows: null,
    checkedOn: '2026-08-20',
    confidence: 'khong-quy-doi-duoc',
    note: 'Như trên: giá gói có, số dòng không.',
    source: 'https://www.vietdata.vn/vi/data-sets',
  },
  {
    vendor: 'Vietdata',
    plan: 'Dữ liệu + báo cáo · Account002',
    listPrice: '11 triệu đ/năm',
    perThousandRows: null,
    checkedOn: '2026-08-20',
    confidence: 'khong-quy-doi-duoc',
    note: 'Như trên: giá gói có, số dòng không.',
    source: 'https://www.vietdata.vn/vi/data-sets',
  },
  {
    vendor: 'Vietdata',
    plan: 'Truy cập hệ thống · Account003',
    listPrice: '99 triệu đ/năm · tối đa 5 người',
    perThousandRows: null,
    checkedOn: '2026-08-20',
    confidence: 'khong-quy-doi-duoc',
    note: 'Gói đắt nhất mà vẫn không biết được bao nhiêu dòng. Cần một báo giá thật trước khi điền ô này.',
    source: 'https://demo-macro.vietdata.vn/b%E1%BA%A3ng-gi%C3%A1-d%E1%BB%AF-li%E1%BB%87u',
  },
]

/** Tỉ lệ dòng hỏng / không xác minh được, 0–1.
 *  **Số ĐẶT bởi Trần Thu Hà · 20/08 — chưa ai đo.** */
export const BAD_ROW_RATE = 0.12

/** Tỉ lệ một dòng danh sách LẠNH thành đầu mối. Đây là số **ĐO**, không phải số
 *  đặt: 22 lead của CD-0101 trên 1.200 dòng của đợt mở màn = 1,8333%.
 *
 *  Tử số là lead của CẢ chuỗi ba đợt, mẫu số là dòng của MỘT đợt — và đó là
 *  đúng phép chia, vì ba đợt đều gửi lại chính danh sách 1.200 dòng đó (đợt 2
 *  gửi 1.159 = 1.200 − 41 người đã trả lời, đợt 3 gửi 1.137 = 1.159 − 22). Cả
 *  22 lead ra từ một lô duy nhất.
 *
 *  `scenario.test.ts` khoá con số này bằng chính CD-0101, để nó không trôi khi
 *  ai đó sửa fixture. */
export const COLD_ROW_LEAD_RATE = 22 / 1_200

export type RowsToLeadsInput = {
  /** Đồng mỗi dòng mua vào. Mặc định `ROW_PRICE`. */
  rowPrice?: number
  /** Đồng mỗi dòng xác minh thư. Mặc định `EMAIL_VERIFY_PRICE`. */
  verifyPrice?: number
  /** Tỉ lệ dòng hỏng, 0–1. Mặc định `BAD_ROW_RATE`. */
  badRowRate?: number
  /** Tỉ lệ ra đầu mối, đo trên dòng NHƯ ĐÃ MUA. Mặc định `COLD_ROW_LEAD_RATE`. */
  leadRatePerRow?: number
}

export type RowsToLeadsResult = {
  rows: number
  /** Dòng còn gửi được sau khi trừ tỉ lệ hỏng. */
  usableRows: number
  /** Đầu mối kỳ vọng. KHÔNG làm tròn: 18,33 là một kỳ vọng, không phải 18 con
   *  người, và làm tròn ở đây thì bậc sau của chuỗi lệch theo. */
  leads: number
  /** Tiền DỮ LIỆU: mua dòng + xác minh. Không gồm kênh, nội dung, công cụ. */
  dataCost: number
  /** Tiền dữ liệu trên mỗi dòng GỬI ĐƯỢC — số để so bảng giá nhà cung cấp. */
  costPerUsableRow: number
  /** Tiền dữ liệu trên mỗi đầu mối. `null` khi chuỗi không ra đầu mối nào. */
  dataCostPerLead: number | null
}

/** Trả lời thẳng câu "1.000 dòng Apollo ra bao nhiêu đầu mối, tốn bao nhiêu".
 *
 *  Chuỗi: `dòng → trừ tỉ lệ hỏng → × tỉ lệ ra lead → đầu mối`. Với mặc định của
 *  kỳ này, `rowsToLeads(1.000)` ra **18,33 đầu mối** và **70.909 đ tiền dữ liệu
 *  mỗi đầu mối** (1.000 × 1.300 = 1.300.000 ÷ 18,33).
 *
 *  **Chỗ dễ tính sai, viết ra để không ai sửa nhầm:** `COLD_ROW_LEAD_RATE` đo
 *  trên dòng NHƯ ĐÃ MUA, tức nó đã chứa sẵn phần dòng hỏng. Muốn áp nó lên dòng
 *  GỬI ĐƯỢC thì phải quy đổi ngược bằng chính `badRowRate`, nếu không 12% bị
 *  trừ hai lần và cả chuỗi hụt đúng 12%. Hai bước vẫn viết tách ra vì chúng trả
 *  lời hai câu khác nhau — `costPerUsableRow` (1.477,27 đ) là số để so giá nhà
 *  cung cấp, `leads` là số để đặt kế hoạch.
 *
 *  **Và câu hỏi gốc sai đơn vị.** Apollo không bán lead, nó bán dòng. Muốn 1.000
 *  đầu mối cần 54.545 dòng ≈ 70,9 triệu tiền dữ liệu — nhưng ~818 triệu tổng
 *  chi, vì tiền dữ liệu chỉ chiếm 8,67% giá thật của một đầu mối ở CD-0101.
 *  Cái bẫy đi kèm: 54.545 credit KHÔNG mua lẻ được ở đơn giá này. Mua lẻ
 *  $0,20/credit thì hết 288 triệu — gấp 4,06 lần. Muốn 1.000 đ/dòng phải mua
 *  27,3 tháng-ghế Professional.
 *
 *  Hàm THUẦN, dùng cho bậc LẬP KẾ HOẠCH. Không đọc `Source.cost`, và
 *  `Source.cost` cũng không được tính ngược từ đây. */
export function rowsToLeads(rows: number, opts: RowsToLeadsInput = {}): RowsToLeadsResult {
  const rowPrice = opts.rowPrice ?? ROW_PRICE
  const verifyPrice = opts.verifyPrice ?? EMAIL_VERIFY_PRICE
  const badRowRate = opts.badRowRate ?? BAD_ROW_RATE
  const leadRatePerRow = opts.leadRatePerRow ?? COLD_ROW_LEAD_RATE

  const usableRows = rows * (1 - badRowRate)
  const leadRatePerUsableRow = badRowRate < 1 ? leadRatePerRow / (1 - badRowRate) : 0
  const leads = usableRows * leadRatePerUsableRow
  const dataCost = rows * (rowPrice + verifyPrice)

  return {
    rows,
    usableRows,
    leads,
    dataCost,
    costPerUsableRow: usableRows > 0 ? dataCost / usableRows : 0,
    dataCostPerLead: leads > 0 ? dataCost / leads : null,
  }
}

/** Credit Apollo mua rồi KHÔNG dùng — 4.122.400 đ. Chi phí chìm của kỳ.
 *
 *  **Nằm NGOÀI `Source.cost`, và đó là điểm chính.** 300.000.000 đ là *phần gán
 *  được cho nguồn*; tiền thật ra khỏi tài khoản kỳ này là **304.122.400 đ**.
 *
 *  Kiểm được: thuê bao Professional 4 tháng `$316 × 26.400 = 8.342.400 đ`; phần
 *  gán xuống nguồn `4.220 dòng × 1.000 = 4.220.000 đ`; chênh `4.122.400 đ`, gồm
 *  3.780 credit chưa dùng ở đơn giá thật (3.941.784 đ) và chênh do làm tròn đơn
 *  giá 1.042,80 → 1.000 (180.616 đ).
 *
 *  **Vì sao không chia xuống nguồn.** Credit thừa là kết quả của một quyết định
 *  MUA GÓI, không phải của một chiến dịch. Chia nó xuống thì nguồn bị chấm điểm
 *  vì một quyết định nó không tham gia, và tệ hơn: tháng nào phòng mua dư thì
 *  mọi nguồn tự dưng đắt lên mà không ai làm gì sai. Khoản này là thước của
 *  người mua gói (TP Kinh doanh), không phải của người chạy đợt.
 *
 *  Bỏ qua nó cũng không được: bỏ qua thì tổng phân bổ nhỏ hơn tiền thật, và CAC
 *  cấp phòng bị thổi đẹp. Vì thế nó đứng đây, có tên, ngoài 300 triệu. */
export const UNUSED_APOLLO_CREDIT = 4_122_400

// ---------------------------------------------------------------------------
// 100 dòng sổ lead. Đây là toàn bộ kỳ 01/05 → 17/08, không phải một trang.
// ---------------------------------------------------------------------------

export type LeadEventKind =
  | 'vao-so'
  | 'cham'
  | 'dien-o'
  | 'giao'
  | 'len-bac'
  | 'gap-lan-dau'
  | 'vao-pipeline'
  | 'doi-cot'
  | 'ky'
  | 'ra-khoi-luong'

export type LeadEvent = {
  /** ISO, giờ VN. */
  at: string
  kind: LeadEventKind
  /** Ai làm. 'Trợ lý AI' là agent 1 — vẫn phải có người bấm (luật 9). */
  by: string
  note: string
}

export type Lead = {
  code: string
  company: string
  province: string
  category: LeadCategory
  tier: LeadTier
  /** Số ô BẮT BUỘC đã điền, 0…6. Đây là thứ cổng nhìn vào. */
  requiredFilled: number
  /** Số ô tuỳ chọn đã điền, 0…4. */
  optionalFilled: number
  /** Tổng ô đã điền. Giữ lại vì màn cũ đọc trường này. */
  answered: number
  /** Ô nào đã điền — dựng thẳng từ hai con số trên, thứ tự theo `INIT_DATA_QUESTIONS`. */
  filled: QuestionKey[]
  /** Ai đang giữ. Bỏ trống = còn ở kho chung, chưa ai nhận. */
  owner?: string
  /** Bậc SQL còn sống thì đang nằm ở một cột của `PIPELINE_STAGES`. */
  stage?: StageKey
  /** Mã cơ hội trong sổ 10 đơn đang mở, nếu có. */
  dealCode?: string
  /** Mã hợp đồng, nếu đã ký. */
  contractCode?: string
  /** Số ngày nằm ở chỗ hiện tại. */
  daysHere: number
  /** Mã nguồn — trỏ vào `SOURCES`. Đây là dây nối module 1 ↔ module 2. */
  source: string
  createdAt: string
  /** Có giá trị = đã ra khỏi luồng. Phải là một trong SÁU lý do EXIT_REASONS. */
  exitReason?: ExitReason
  exitedAt?: string
  /** Toàn bộ đời của lead, theo thứ tự thời gian. */
  history: LeadEvent[]
}

/** Dòng của SỔ ĐÓNG BĂNG — không phải một dòng của máy chủ.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO CẦN MỘT NHÃN KIỂU, KHÔNG PHẢI MỘT QUY ƯỚC
 *  ------------------------------------------------------------------
 *  Hình `Lead` mô tả một dòng sổ, và dữ liệu máy chủ mặc vừa hình đó — app web
 *  có hẳn một cây cầu làm việc ấy (`leadOf` ở `apps/web/src/data/lead-profile.ts`)
 *  để sáu khối chưa có endpoint vẫn chạy. Cây cầu không nói dối: nó chép đúng
 *  giá trị trên dây. Thứ nói dối là KIỂU nó trả ra — một `Lead` dựng từ máy chủ
 *  không phân biệt được với một dòng của kịch bản đóng băng.
 *
 *  Hậu quả không phải giả thiết, nó đã xảy ra BA lần, cùng một lỗ:
 *   · `nextActions` tự gọi `leadContact()` → mã ngoài dải đóng băng ra một cái
 *     tên và một số điện thoại không ai từng cho;
 *   · `OriginCard` gọi `leadOrigin()` → mọi lead của máy chủ mang mã nguồn
 *     `SR-…`, hàm ném, vỡ màn hồ sơ;
 *   · `draftOpportunity` gọi `leadProfile()` → ném lại đúng chỗ đó, lần thứ ba.
 *
 *  Ba lần vá là ba vết rò của một lỗ. Nhãn này bịt lỗ: mọi hàm SINH dưới đây
 *  đòi `FrozenLead`, mà chỉ `LEADS` mới mang được nhãn. Đưa một dòng dựng từ
 *  máy chủ vào là **lỗi biên dịch**, không phải một màn trắng lúc chạy.
 *
 *  Nhãn chỉ tồn tại ở tầng kiểu — không có trường nào thêm lúc chạy, không tốn
 *  byte nào. `Lead` vẫn là hình công khai cho mọi thứ chỉ CHỞ dữ liệu; các hàm
 *  thuần tính toán (`isOverSla` · `isRunning` · `canPromoteToSql` ·
 *  `opportunityStateOf`) vẫn nhận `Lead` vì chúng chỉ đọc trường có thật và
 *  dòng máy chủ trả lời chúng đúng.
 *
 *  Luật 0 của CLAUDE.md: cưỡng chế được ở tầng kiểu thì đừng để lint làm hộ. */
declare const FROZEN_ROW: unique symbol
export type FrozenLead = Lead & { readonly [FROZEN_ROW]: true }

/** Một dòng thô. Cột theo thứ tự:
 *  công ty · tỉnh · ngành · bậc · ô bắt buộc · ô tuỳ chọn · người giữ ·
 *  cột pipeline · số ngày ở đây · chỉ số lý do rơi (-1 = còn trong luồng). */
type Row = readonly [
  string,
  string,
  LeadCategory,
  LeadTier,
  number,
  number,
  string,
  StageKey | '',
  number,
  number,
]

/** Mười dòng đầu là mười đơn đang mở, sáu dòng sau là sáu hợp đồng đã ký —
 *  thứ tự này có ý nghĩa, `buildBook` dựa vào nó để nối `dealCode`/`contractCode`. */
const OPEN_ROWS = OPEN_DEALS.length
const WON_ROWS = 6

const ROWS: Row[] = [
  // ── 10 SQL đang mở · khớp từng dòng với OPEN_DEALS ───────────────────────
  ['Điện tử Kỳ Anh', 'Hải Phòng', 'chip', 'sql', 6, 2, 'Đỗ Quang Huy', 'moi', 4, -1],
  ['Nhựa Tân Á', 'Hưng Yên', 'co-khi', 'sql', 6, 1, 'Đặng Thanh Bình', 'moi', 2, -1],
  ['DAS Vina', 'Bắc Ninh', 'chip', 'sql', 6, 4, 'Đỗ Quang Huy', 'tim-hieu', 11, -1],
  ['Bao bì Minh Long', 'Bình Dương', 'duoc', 'sql', 6, 2, 'Nguyễn Khánh Linh', 'tim-hieu', 6, -1],
  ['Cơ khí Phú Thái', 'Hải Dương', 'co-khi', 'sql', 6, 3, 'Đặng Thanh Bình', 'da-demo', 24, -1],
  ['Dược Vĩnh Hà', 'Hà Nam', 'duoc', 'sql', 6, 3, 'Nguyễn Khánh Linh', 'da-demo', 19, -1],
  ['Thực phẩm Hải Vân', 'Đà Nẵng', 'duoc', 'sql', 6, 4, 'Nguyễn Khánh Linh', 'da-bao-gia', 31, -1],
  ['Thép Đông Đô', 'Thái Nguyên', 'co-khi', 'sql', 6, 4, 'Đặng Thanh Bình', 'da-bao-gia', 9, -1],
  ['Nhựa An Phát Tây', 'Hưng Yên', 'chip', 'sql', 6, 4, 'Đỗ Quang Huy', 'cho-ky', 5, -1],
  ['Điện lạnh Thái Bình Dương', 'Bắc Ninh', 'chip', 'sql', 6, 3, 'Đỗ Quang Huy', 'cho-ky', 14, -1],

  // ── 6 hợp đồng đã ký · bậc cuối của phễu ─────────────────────────────────
  ['Linh kiện Trường Sơn', 'Bắc Giang', 'chip', 'sql', 6, 4, 'Đỗ Quang Huy', '', 12, -1],
  ['Cơ khí Đại Việt', 'Vĩnh Phúc', 'co-khi', 'sql', 6, 4, 'Đặng Thanh Bình', '', 20, -1],
  ['Dược Hồng Hà', 'Nam Định', 'duoc', 'sql', 6, 4, 'Nguyễn Khánh Linh', '', 33, -1],
  ['Phụ tùng Sông Công', 'Thái Nguyên', 'o-to', 'sql', 6, 4, 'Đặng Thanh Bình', '', 27, -1],
  ['Bán dẫn Nam Sơn', 'Bắc Ninh', 'chip', 'sql', 6, 4, 'Đỗ Quang Huy', '', 41, -1],
  ['Thiết bị y tế Việt Trì', 'Phú Thọ', 'duoc', 'sql', 6, 4, 'Nguyễn Khánh Linh', '', 15, -1],

  // ── 14 SQL đã rơi · rơi SAU khi đã vào sổ cơ hội ─────────────────────────
  ['Cơ khí Tiến Đạt', 'Hải Dương', 'co-khi', 'sql', 6, 3, 'Đặng Thanh Bình', '', 46, 2],
  ['Điện tử Quang Trung', 'Hà Nội', 'chip', 'sql', 6, 2, 'Đỗ Quang Huy', '', 52, 2],
  ['Dược Hoà Bình', 'Hoà Bình', 'duoc', 'sql', 6, 3, 'Nguyễn Khánh Linh', '', 38, 2],
  ['Ô tô Thành Công', 'Hưng Yên', 'o-to', 'sql', 6, 4, 'Đặng Thanh Bình', '', 44, 3],
  ['Linh kiện Bảo Sơn', 'Bắc Ninh', 'chip', 'sql', 6, 3, 'Đỗ Quang Huy', '', 29, 3],
  ['Dược phẩm Đức Thành', 'Hà Nội', 'duoc', 'sql', 6, 2, 'Nguyễn Khánh Linh', '', 61, 3],
  ['Khuôn mẫu Nhật Quang', 'Bắc Ninh', 'co-khi', 'sql', 6, 3, 'Đặng Thanh Bình', '', 35, 3],
  ['Điện tử Hưng Thịnh', 'Hải Phòng', 'chip', 'sql', 6, 4, 'Đỗ Quang Huy', '', 26, 4],
  ['Cơ khí Phúc Lâm', 'Hà Nam', 'co-khi', 'sql', 6, 4, 'Đặng Thanh Bình', '', 40, 4],
  ['Sinh học Tây Hồ', 'Hà Nội', 'duoc', 'sql', 6, 3, 'Nguyễn Khánh Linh', '', 33, 4],
  ['Phụ tùng An Bình', 'Vĩnh Phúc', 'o-to', 'sql', 6, 3, 'Đặng Thanh Bình', '', 48, 4],
  ['Bán dẫn Trung Kiên', 'Bắc Ninh', 'chip', 'sql', 6, 4, 'Đỗ Quang Huy', '', 57, 5],
  ['Dược Đông Á', 'Nam Định', 'duoc', 'sql', 6, 4, 'Nguyễn Khánh Linh', '', 43, 5],
  ['Thép Hoàng Long', 'Thái Nguyên', 'co-khi', 'sql', 6, 4, 'Đặng Thanh Bình', '', 50, 5],

  // ── 12 MQL còn sống · BD đang moi nốt ô bắt buộc ─────────────────────────
  ['Cơ khí Mai Linh', 'Hải Dương', 'co-khi', 'mql', 6, 1, BD, '', 9, -1],
  ['Điện tử Sao Việt', 'Bắc Ninh', 'chip', 'mql', 6, 0, BD, '', 14, -1],
  ['Dược Tân Phát', 'Hà Nam', 'duoc', 'mql', 6, 2, BD, '', 6, -1],
  ['Ô tô Việt Hưng', 'Hưng Yên', 'o-to', 'mql', 5, 1, BD, '', 21, -1],
  ['Linh kiện Nam Cường', 'Bắc Giang', 'chip', 'mql', 5, 0, BD, '', 17, -1],
  ['Cơ khí Đại Phong', 'Quảng Ninh', 'co-khi', 'mql', 4, 1, BD, '', 30, -1],
  ['Dược phẩm Lam Sơn', 'Thanh Hoá', 'duoc', 'mql', 4, 0, BD, '', 25, -1],
  ['Phụ tùng Cửu Long', 'Long An', 'o-to', 'mql', 3, 1, BD, '', 38, -1],
  ['Bán dẫn Thăng Long', 'Hà Nội', 'chip', 'mql', 3, 0, '', '', 42, -1],
  ['Thép Bạch Đằng', 'Hải Phòng', 'co-khi', 'mql', 5, 2, BD, '', 11, -1],
  ['Thiết bị y tế Hồng Lĩnh', 'Hà Tĩnh', 'duoc', 'mql', 4, 2, '', '', 34, -1],
  ['Điện tử Tân Cảng', 'Đồng Nai', 'chip', 'mql', 6, 1, BD, '', 8, -1],

  // ── 2 MQL đã rơi ─────────────────────────────────────────────────────────
  ['Cơ khí Sơn Hà', 'Hưng Yên', 'co-khi', 'mql', 5, 1, BD, '', 55, 3],
  ['Dược Bình An', 'Nam Định', 'duoc', 'mql', 4, 0, BD, '', 47, 3],

  // ── 20 đầu mối còn sống · kho chung hoặc Marketing đang nuôi ─────────────
  ['Nhựa Hải Long', 'Hải Phòng', 'co-khi', 'dau-moi', 3, 0, MARKETING, '', 12, -1],
  ['Điện tử Bắc Hà', 'Bắc Ninh', 'chip', 'dau-moi', 2, 1, MARKETING, '', 19, -1],
  ['Cơ khí Tam Đảo', 'Vĩnh Phúc', 'co-khi', 'dau-moi', 2, 0, '', '', 27, -1],
  ['Dược Thái Dương', 'Hà Nội', 'duoc', 'dau-moi', 3, 1, MARKETING, '', 8, -1],
  ['Ô tô Trường Hải Bắc', 'Hưng Yên', 'o-to', 'dau-moi', 1, 0, '', '', 44, -1],
  ['Linh kiện Yên Phong', 'Bắc Ninh', 'chip', 'dau-moi', 3, 0, MARKETING, '', 15, -1],
  ['Thép Vạn Xuân', 'Thái Nguyên', 'co-khi', 'dau-moi', 2, 1, '', '', 31, -1],
  ['Dược phẩm Nam Hà', 'Nam Định', 'duoc', 'dau-moi', 1, 1, '', '', 36, -1],
  ['Phụ tùng Đông Anh', 'Hà Nội', 'o-to', 'dau-moi', 2, 0, MARKETING, '', 23, -1],
  ['Bán dẫn Quế Võ', 'Bắc Ninh', 'chip', 'dau-moi', 3, 1, MARKETING, '', 5, -1],
  ['Cơ khí Chí Linh', 'Hải Dương', 'co-khi', 'dau-moi', 1, 0, '', '', 51, -1],
  ['Sinh học Ba Đình', 'Hà Nội', 'duoc', 'dau-moi', 2, 0, '', '', 29, -1],
  ['Điện tử Vân Trung', 'Bắc Giang', 'chip', 'dau-moi', 3, 0, MARKETING, '', 10, -1],
  ['Khuôn mẫu Gia Lâm', 'Hà Nội', 'co-khi', 'dau-moi', 2, 1, '', '', 33, -1],
  ['Ô tô Phù Cát', 'Bình Định', 'o-to', 'dau-moi', 1, 0, '', '', 58, -1],
  ['Dược Vĩnh Bảo', 'Hải Phòng', 'duoc', 'dau-moi', 2, 0, MARKETING, '', 22, -1],
  ['Linh kiện Tiên Du', 'Bắc Ninh', 'chip', 'dau-moi', 3, 1, MARKETING, '', 7, -1],
  ['Thép Uông Bí', 'Quảng Ninh', 'co-khi', 'dau-moi', 1, 1, '', '', 40, -1],
  ['Thiết bị y tế Cẩm Phả', 'Quảng Ninh', 'duoc', 'dau-moi', 2, 0, '', '', 26, -1],
  ['Điện tử Sông Lô', 'Vĩnh Phúc', 'chip', 'dau-moi', 3, 0, MARKETING, '', 13, -1],

  // ── 36 đầu mối đã rơi · 21 "không gọi được ai" ───────────────────────────
  ['Cơ khí Lương Tài', 'Bắc Ninh', 'co-khi', 'dau-moi', 1, 0, '', '', 63, 0],
  ['Điện tử Thuận Thành', 'Bắc Ninh', 'chip', 'dau-moi', 1, 0, '', '', 59, 0],
  ['Dược Kim Bảng', 'Hà Nam', 'duoc', 'dau-moi', 0, 0, '', '', 71, 0],
  ['Ô tô Mê Linh', 'Hà Nội', 'o-to', 'dau-moi', 1, 0, '', '', 54, 0],
  ['Thép Nghi Sơn', 'Thanh Hoá', 'co-khi', 'dau-moi', 0, 1, '', '', 66, 0],
  ['Linh kiện Đình Vũ', 'Hải Phòng', 'chip', 'dau-moi', 1, 0, '', '', 49, 0],
  ['Dược phẩm Ninh Giang', 'Hải Dương', 'duoc', 'dau-moi', 0, 0, '', '', 74, 0],
  ['Cơ khí Kim Thành', 'Hải Dương', 'co-khi', 'dau-moi', 1, 1, '', '', 45, 0],
  ['Phụ tùng Bình Xuyên', 'Vĩnh Phúc', 'o-to', 'dau-moi', 0, 0, '', '', 68, 0],
  ['Bán dẫn Phổ Yên', 'Thái Nguyên', 'chip', 'dau-moi', 1, 0, '', '', 41, 0],
  ['Nhựa Văn Lâm', 'Hưng Yên', 'co-khi', 'dau-moi', 0, 0, '', '', 77, 0],
  ['Dược Duy Tiên', 'Hà Nam', 'duoc', 'dau-moi', 1, 0, '', '', 37, 0],
  ['Điện tử Yên Mỹ', 'Hưng Yên', 'chip', 'dau-moi', 0, 1, '', '', 62, 0],
  ['Cơ khí Sóc Sơn', 'Hà Nội', 'co-khi', 'dau-moi', 1, 0, '', '', 56, 0],
  ['Ô tô Tiên Lãng', 'Hải Phòng', 'o-to', 'dau-moi', 0, 0, '', '', 70, 0],
  ['Thiết bị y tế Đồ Sơn', 'Hải Phòng', 'duoc', 'dau-moi', 1, 0, '', '', 43, 0],
  ['Linh kiện Việt Yên', 'Bắc Giang', 'chip', 'dau-moi', 0, 0, '', '', 65, 0],
  ['Thép Lục Nam', 'Bắc Giang', 'co-khi', 'dau-moi', 1, 1, '', '', 39, 0],
  ['Dược Lý Nhân', 'Hà Nam', 'duoc', 'dau-moi', 0, 0, '', '', 72, 0],
  ['Khuôn mẫu Đông Hưng', 'Thái Bình', 'co-khi', 'dau-moi', 1, 0, '', '', 48, 0],
  ['Điện tử Vũ Thư', 'Thái Bình', 'chip', 'dau-moi', 0, 0, '', '', 60, 0],

  // ── 10 "không phải khách của mình" ───────────────────────────────────────
  ['Cơ khí Quỳnh Phụ', 'Thái Bình', 'co-khi', 'dau-moi', 2, 0, MARKETING, '', 53, 1],
  ['Dược Hải Hậu', 'Nam Định', 'duoc', 'dau-moi', 1, 1, MARKETING, '', 46, 1],
  ['Ô tô Đại An', 'Hải Dương', 'o-to', 'dau-moi', 2, 0, MARKETING, '', 58, 1],
  ['Linh kiện Xuân Trường', 'Nam Định', 'chip', 'dau-moi', 1, 0, MARKETING, '', 64, 1],
  ['Thép Hạ Long', 'Quảng Ninh', 'co-khi', 'dau-moi', 2, 1, MARKETING, '', 42, 1],
  ['Điện tử Móng Cái', 'Quảng Ninh', 'chip', 'dau-moi', 1, 0, MARKETING, '', 69, 1],
  ['Dược phẩm Sông Cầu', 'Bắc Giang', 'duoc', 'dau-moi', 2, 0, MARKETING, '', 51, 1],
  ['Cơ khí Tân Uyên', 'Bình Dương', 'co-khi', 'dau-moi', 1, 1, MARKETING, '', 73, 1],
  ['Phụ tùng Bến Cát', 'Bình Dương', 'o-to', 'dau-moi', 2, 0, MARKETING, '', 47, 1],
  ['Sinh học Củ Chi', 'TP HCM', 'duoc', 'dau-moi', 1, 0, MARKETING, '', 67, 1],

  // ── 5 "năm nay không có tiền" · rơi ngay ở bậc đầu mối ───────────────────
  ['Cơ khí Thạch Thất', 'Hà Nội', 'co-khi', 'dau-moi', 3, 1, MARKETING, '', 44, 2],
  ['Điện tử Chương Mỹ', 'Hà Nội', 'chip', 'dau-moi', 3, 0, MARKETING, '', 50, 2],
  ['Dược Ứng Hoà', 'Hà Nội', 'duoc', 'dau-moi', 2, 1, MARKETING, '', 57, 2],
  ['Ô tô Quốc Oai', 'Hà Nội', 'o-to', 'dau-moi', 3, 0, MARKETING, '', 61, 2],
  ['Thép Phú Xuyên', 'Hà Nội', 'co-khi', 'dau-moi', 2, 0, MARKETING, '', 55, 2],
]

/** Nguồn của từng dòng, cùng thứ tự với `ROWS`.
 *
 *  Tách riêng khỏi `ROWS` có chủ ý: đếm được bằng mắt là mỗi nguồn kéo về đúng
 *  bao nhiêu lead, và `scenario.test.ts` khoá tổng này khớp với `SOURCES`. */
const SOURCE_PLAN: string[] = [
  // 10 SQL đang mở
  'CD-0102',
  'SK-0106',
  'SK-0103',
  'CD-0101',
  'SK-0104',
  'CD-0101',
  'CD-0102',
  'GT',
  'SK-0103',
  'CD-0101',
  // 6 hợp đồng
  'SK-0103',
  'CD-0101',
  'CD-0102',
  'SK-0104',
  'GT',
  'SK-0106',
  // 14 SQL đã rơi
  'CD-0101',
  'CD-0102',
  'SK-0103',
  'SK-0104',
  'CD-0101',
  'CD-0105',
  'SK-0106',
  'CD-0102',
  'CD-0101',
  'SK-0103',
  'GT',
  'CD-0102',
  'SK-0104',
  'CD-0101',
  // 12 MQL còn sống
  'CD-0101',
  'CD-0102',
  'SK-0103',
  'SK-0104',
  'CD-0105',
  'SK-0106',
  'CD-0101',
  'CD-0102',
  'SK-0103',
  'GT',
  'CD-0101',
  'TM',
  // 2 MQL đã rơi
  'CD-0102',
  'SK-0104',
  // 20 đầu mối còn sống
  'CD-0101',
  'CD-0102',
  'SK-0103',
  'SK-0104',
  'CD-0105',
  'SK-0106',
  'CD-0101',
  'CD-0102',
  'SK-0103',
  'SK-0106',
  'CD-0101',
  'CD-0102',
  'SK-0103',
  'CD-0105',
  'SK-0106',
  'TM',
  'CD-0101',
  'CD-0102',
  'GT',
  'TM',
  // 36 đầu mối đã rơi
  'CD-0101',
  'CD-0102',
  'SK-0103',
  'SK-0104',
  'CD-0105',
  'SK-0106',
  'GT',
  'TM',
  'CD-0101',
  'CD-0102',
  'SK-0103',
  'SK-0104',
  'CD-0105',
  'SK-0106',
  'GT',
  'TM',
  'CD-0101',
  'CD-0102',
  'SK-0103',
  'SK-0104',
  'CD-0105',
  'SK-0106',
  'CD-0101',
  'CD-0102',
  'SK-0103',
  'SK-0104',
  'CD-0105',
  'SK-0106',
  'CD-0101',
  'CD-0102',
  'SK-0103',
  'SK-0104',
  'CD-0105',
  'CD-0101',
  'SK-0103',
  'CD-0101',
]

const STAGE_LABEL = new Map(PIPELINE_STAGES.map((s) => [s.key, s.label]))
const TIER_LABEL = new Map(LEAD_TIERS.map((t) => [t.key, t.label]))

/** Lead này đã có buổi gặp đầu tiên chưa — MỘT chỗ hỏi, `buildHistory` và mọi
 *  màn đều đọc ở đây.
 *
 *  Hai điều kiện, cả hai đọc thẳng từ dòng sổ, không có hạn ngạch nào:
 *   · **đã lên MQL** — công ty có thật thì mới đáng đi gặp;
 *   · **đủ 5 ô bắt buộc** — ô số 4 là người liên hệ, ô số 5 là kênh gọi lại
 *     được. Gặp được là gặp NGƯỜI MÌNH GỌI LẠI ĐƯỢC, và đây cũng đúng là điều
 *     kiện `leadContact` trả về số điện thoại với email.
 *
 *  Cộng lại đúng 38 dòng = `FIRST_MEETINGS`, trong đó cả 30 lead đã vào sổ cơ
 *  hội (SQL nào cũng đủ 6 ô) và 8 lead còn đứng ở MQL. Đổi một trong hai điều
 *  kiện là `scenario.test.ts` đỏ ngay, không trôi âm thầm.
 *
 *  MỘT CHỖ CHƯA KHỚP, ghi ra đây để người sau khỏi dò lại. `leadTranscript` gắn
 *  nhãn "Gặp mặt" cho lần chạm nào do người hiện trường làm (`turnKindOf` đoán
 *  theo TÊN người, không đọc sự kiện nào cả) — đó là một phỏng đoán hiển thị,
 *  không phải một buổi gặp có thật. Sau khi mốc này về đúng chuyến đi của BD
 *  thì trên 38 lead: 27 lead hai chỗ trùng ngày, 1 lead lệch (nguồn do người
 *  hiện trường mở nên chính lần "vào sổ" cũng bị gọi là gặp), 10 lead có mốc
 *  nhưng lần chạm đó không moi thêm ô nào nên không thành turn. Ngược lại có 4
 *  lead transcript gọi là "Gặp mặt" mà chưa đủ điều kiện gặp.
 *
 *  Muốn hai chỗ khớp tuyệt đối thì bỏ phỏng đoán trong `turnKindOf` và cho nó
 *  đọc `gap-lan-dau`. Việc đó đổi panel lần chạm của màn hồ sơ lead nên chưa
 *  làm ở đợt này — đây là NỢ đã biết, không phải chỗ chưa ai nhìn. */
export function hasFirstMeeting(lead: Pick<Lead, 'tier' | 'requiredFilled'>): boolean {
  return lead.tier !== 'dau-moi' && lead.requiredFilled >= 5
}

/** Dựng timeline của một lead từ chính các trường của nó — không bịa thêm mốc
 *  nào ngoài những gì dòng đã nói. Cùng một dòng luôn ra cùng một chuỗi. */
function buildHistory(lead: Omit<Lead, 'history'>, bornDay: number): LeadEvent[] {
  const src = sourceByCode.get(lead.source)
  const out: LeadEvent[] = []

  /* Ngày ĐÓNG của dòng: hôm lead ký hoặc rơi. Mọi mốc trước đó phải nằm trước
     nó, còn lead đang chạy thì trần là ngày đóng băng.
     SỬA 19/08 — bản trước chỉ chặn trần ở `DAY_FROZEN`, nên một lead vào sổ
     muộn mà ký nhanh cho ra chuỗi "ký hợp đồng" đứng TRƯỚC "nhận vào sổ cơ
     hội": mốc pipeline tính theo `bornDay + 10`, còn mốc ký tính ngược từ
     `daysHere`, hai phép đếm không biết nhau. `scenario.test.ts` khoá thứ tự
     này lại. */
  const closeDay = lead.contractCode || lead.exitReason ? DAY_FROZEN - lead.daysHere : DAY_FROZEN

  const push = (day: number, kind: LeadEventKind, by: string, note: string) =>
    out.push({ at: dayISO(Math.min(day, closeDay)), kind, by, note })

  push(
    bornDay,
    'vao-so',
    src?.owner ?? MARKETING,
    src
      ? `Vào sổ từ ${src.kind === 'tu-nhien' ? 'nguồn' : 'chiến dịch'} ${src.code} · ${src.label}`
      : 'Vào sổ',
  )

  if (lead.requiredFilled > 0) {
    push(
      bornDay + 1,
      'cham',
      'Trợ lý AI',
      `Agent 1 nhắn lại trên kênh khách vừa dùng · lấy được ${Math.min(lead.requiredFilled, 3)} ô đầu`,
    )
  }

  if (lead.tier !== 'dau-moi') {
    push(bornDay + 4, 'len-bac', MARKETING, 'Xác minh công ty có thật · lên bậc MQL')
    push(bornDay + 5, 'giao', HEAD_OF_SALES, `Giao cho ${BD} đi lấy nốt ô bắt buộc`)
  }

  /* Buổi gặp đầu tiên và lần điền ô của BD là CÙNG một chuyến, không phải hai:
     BD được giao đi lấy nốt ô bắt buộc ở `bornDay + 5`, và moi được chúng vì đã
     ngồi được với người liên hệ. Tách ra hai ngày là đẻ thêm một chuyến thăm
     không có trong kịch bản — mà `leadTranscript` đã dựng đúng lần chạm này
     thành một turn "Gặp mặt" rồi, nên hai chỗ sẽ ghi hai ngày khác nhau cho
     cùng một buổi. `scenario.test.ts` khoá hai chỗ đó bằng nhau. */
  if (hasFirstMeeting(lead)) {
    push(bornDay + 7, 'gap-lan-dau', BD, 'Buổi gặp đầu tiên với người liên hệ')
  }

  if (lead.requiredFilled >= 3) {
    push(
      bornDay + 7,
      'dien-o',
      lead.tier === 'dau-moi' ? MARKETING : BD,
      `Điền thêm ô · còn thiếu ${Math.max(0, REQUIRED_SLOTS - lead.requiredFilled)} ô bắt buộc`,
    )
  }

  if (lead.tier === 'sql' && lead.owner) {
    push(bornDay + 9, 'len-bac', HEAD_OF_SALES, 'Đủ ô bắt buộc · qua cổng init data')
    push(bornDay + 10, 'vao-pipeline', lead.owner, `Nhận vào sổ cơ hội · ${lead.owner} đứng tên`)
    if (lead.stage) {
      push(
        DAY_FROZEN - lead.daysHere,
        'doi-cot',
        lead.owner,
        `Sang cột "${STAGE_LABEL.get(lead.stage) ?? lead.stage}"`,
      )
    }
    if (lead.contractCode) {
      push(DAY_FROZEN - lead.daysHere, 'ky', lead.owner, `Ký hợp đồng ${lead.contractCode}`)
    }
  }

  if (lead.exitReason) {
    push(
      DAY_FROZEN - lead.daysHere,
      'ra-khoi-luong',
      lead.owner ?? MARKETING,
      `Ra khỏi luồng · ${lead.exitReason} · rơi ở bậc ${TIER_LABEL.get(lead.tier) ?? lead.tier}`,
    )
  }

  return out.sort((a, b) => a.at.localeCompare(b.at))
}

function buildBook(): FrozenLead[] {
  if (ROWS.length !== SOURCE_PLAN.length) {
    throw new Error(`DAS Vina: ${ROWS.length} dòng nhưng ${SOURCE_PLAN.length} nguồn`)
  }

  return ROWS.map((row, i) => {
    const [company, province, category, tier, req, opt, owner, stage, daysHere, exitIdx] = row
    const source = SOURCE_PLAN[i] ?? 'TM'
    const src = sourceByCode.get(source)

    // Ngày vào sổ trải đều quanh ngày chạy đầu tiên của nguồn — tất định.
    const bornDay = Math.min((src?.startDay ?? 1) + (i % 9), DAY_FROZEN - daysHere)
    const deal = i < OPEN_ROWS ? OPEN_DEALS[i] : undefined
    const contractCode =
      i >= OPEN_ROWS && i < OPEN_ROWS + WON_ROWS ? `HĐ-27${11 + (i - OPEN_ROWS)}` : undefined

    const base: Omit<Lead, 'history'> = {
      code: `LD-0${101 + i}`,
      company,
      province,
      category,
      tier,
      requiredFilled: req,
      optionalFilled: opt,
      answered: req + opt,
      filled: [...REQUIRED_KEYS.slice(0, req), ...OPTIONAL_KEYS.slice(0, opt)],
      owner: owner === '' ? undefined : owner,
      stage: stage === '' ? undefined : stage,
      dealCode: deal?.code,
      contractCode,
      daysHere,
      source,
      createdAt: dayISO(Math.max(bornDay, 0)),
      exitReason: exitIdx >= 0 ? EXIT_REASONS[exitIdx]?.label : undefined,
      exitedAt: exitIdx >= 0 ? dayISO(DAY_FROZEN - daysHere) : undefined,
    }

    /* CHỖ DUY NHẤT nhãn `FrozenLead` được đóng, và nó đóng đúng chỗ: đây là
       nơi 100 dòng của kịch bản ra đời. Không có đường nào khác cấp nhãn này,
       nên không có đường nào khác đưa dữ liệu máy chủ vào các hàm sinh. */
    return { ...base, history: buildHistory(base, Math.max(bornDay, 0)) } as FrozenLead
  })
}

/** 100 dòng — đúng bậc `dau-moi` của phễu. Không phải một trang, là cả kỳ. */
export const LEADS: FrozenLead[] = buildBook()

/** Lead của chính DAS Vina — dòng mồi mọi màn mở ra đầu tiên. */
export const DAS_VINA_LEAD = 'LD-0103'

// ---------------------------------------------------------------------------
// Hàm tra cứu — màn gọi những cái này, không tự lọc bằng tay.
// ---------------------------------------------------------------------------

/** Quá SLA = nằm ở cột hiện tại lâu hơn hạn của cột.
 *
 *  CHỈ bậc SQL còn sống mới có hạn, vì hạn nằm ở `PIPELINE_STAGES`. Ngưỡng cho
 *  đầu mối và MQL là mục 5.5 của module Cấu hình — chưa ai đặt giá trị mặc định,
 *  đừng chế ở tầng màn. */
export function isOverSla(lead: Lead): boolean {
  if (!lead.stage) return false
  return lead.daysHere > (stageLimit.get(lead.stage) ?? Infinity)
}

/** Lead còn trong luồng — chưa rơi và chưa ký. */
export function isRunning(lead: Lead): boolean {
  return !lead.exitReason && !lead.contractCode
}

/** Cổng MQL → SQL của hành động giao/nhận lead.
 *
 *  ĐỔI 19/08: cổng là **sáu ô bắt buộc**, không phải 10/10. Trả luôn câu từ chối
 *  để màn hiện đúng chữ, không tự chế. */
export function canPromoteToSql(lead: Lead): { ok: boolean; reason?: string } {
  if (lead.exitReason) return { ok: false, reason: `Lead đã ra khỏi luồng · ${lead.exitReason}` }
  if (lead.tier === 'sql') return { ok: false, reason: 'Lead đã ở bậc SQL' }
  const missing = REQUIRED_SLOTS - lead.requiredFilled
  if (missing > 0) {
    return { ok: false, reason: `Còn thiếu ${missing} ô bắt buộc của bộ 10 câu` }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Giá mỗi lead tốt — MỘT phép chia, BA phạm vi có tên
//
// Ba màn hỏi ba câu khác nhau dưới cùng một nhãn, và đó là chuyện ĐÚNG: kế hoạch
// hỏi "đồng tiền tiếp theo nên dồn đâu", chiến dịch hỏi "phần đã chạy ăn thua ra
// sao", performance hỏi "công trạng của người đứng tên nguồn tới đâu". Ba câu ba
// tập nguồn, ép về một con số là sai nghiệp vụ.
//
// Cái KHÔNG được khác nhau là phép tính và cách gọi tên tập nguồn. Trước 20/08
// mỗi màn tự viết bộ lọc của mình (`cost > 0` · `waves.length > 0` · `owner ===
// Marketing`); hôm nay cả ba tình cờ ra cùng sáu nguồn nên cùng ra 10,0 tr và
// không ai thấy. Thêm một nguồn trả tiền mà chủ không phải Marketing là ba màn
// hiện ba con số dưới một nhãn, và không test nào đỏ.
//
// Vì thế: phạm vi phải xin ở đây, phép chia chỉ có ở đây, và nhãn trên màn phải
// khai nó đang xem phạm vi nào. `scenario.test.ts` khoá cả ba danh sách mã.
// ---------------------------------------------------------------------------

/** Nguồn CÓ TIÊU TIỀN — phạm vi của câu hỏi "tiền nên dồn vào đâu".
 *
 *  Hai nguồn tự nhiên phải đứng ngoài: chúng chi 0 đồng nên giá của chúng luôn
 *  là 0, và một bảng so giá có chúng thì nguồn rẻ nhất vĩnh viễn là thứ không
 *  mua thêm được bằng ngân sách. Câu hỏi này chỉ so những chỗ tiền đi qua. */
export function sourcesPaid(): Source[] {
  return SOURCES.filter((s) => s.cost > 0)
}

/** Nguồn ĐÃ CHẠY ĐỢT — phạm vi của câu hỏi "phần có người làm hiệu quả ra sao".
 *
 *  Mốc là có đợt chứ không phải có tiền: nguồn nào không đợt nào kéo về thì
 *  không đợt nào được ghi công. Đây là lý do màn Chiến dịch cộng ra 88 lead chứ
 *  không phải 100 — 12 lead còn lại tự chảy về, cộng vào là mọi tỉ lệ đội lên
 *  bằng số không ai làm ra. */
export function sourcesRan(): Source[] {
  return SOURCES.filter((s) => s.waves.length > 0)
}

/** Nguồn của MỘT NGƯỜI — phạm vi của câu hỏi "công trạng của vai này tới đâu".
 *
 *  Đọc `owner`, không đọc `followers`: chủ là người chịu trách nhiệm, follower
 *  là người xin theo dõi. Chấm công trạng theo follower thì một nguồn được tính
 *  cho ba người cùng lúc. Tên truyền vào phải có trong `actors` — dùng hằng
 *  `MARKETING` · `BD` · `HEAD_OF_SALES`, đừng gõ lại chuỗi. */
export function sourcesOwnedBy(owner: string): Source[] {
  return SOURCES.filter((s) => s.owner === owner)
}

export type GoodLeadCost = {
  /** Tổng chi của phạm vi, đồng. */
  cost: number
  /** Lead qua được cổng init data, đếm từ sổ lead của chính các nguồn đó. */
  good: number
  /** Giá mỗi lead tốt, đồng đã làm tròn. `null` khi chưa có lead tốt nào —
   *  KHÔNG phải 0: "chưa đo được" và "không mất đồng nào" là hai chuyện khác. */
  perGood: number | null
}

/** Giá mỗi lead tốt của một phạm vi nguồn. **Nơi duy nhất phép chia này tồn
 *  tại** — ba màn gọi cùng hàm này với ba phạm vi của mình, không màn nào tự
 *  chia lấy.
 *
 *  Mọi nguồn trong phạm vi đều góp chi phí, kể cả nguồn chưa ra lead tốt nào:
 *  tiền đã tiêu thì đã tiêu, bỏ nó khỏi tử số là làm cả phạm vi trông rẻ hơn
 *  thật.
 *
 *  **Phạm vi THỜI GIAN, đọc kỹ chỗ này.** `Source.cost` là chi phí CẢ KỲ, chưa
 *  có trục ngày. Màn nào cắt lead theo tháng rồi chia cho chi phí này thì tử số
 *  và mẫu số khác khoảng thời gian.
 *
 *  ĐÃ GỠ 20/08: `Source.costLines[].day` cắt được chi phí theo kỳ, và tầng app
 *  (`data/source-cost.ts`) dùng nó để tính thước theo đúng kỳ đang xem. Hàm này
 *  vẫn cộng CẢ KỲ — nó là phép chia dùng chung cho ba phạm vi nguồn, không phải
 *  chỗ cắt thời gian. Cần số theo kỳ thì lọc `costLines` trước rồi mới gọi. */
export function costOfGoodLead(sources: readonly Source[]): GoodLeadCost {
  let cost = 0
  let good = 0

  for (const s of sources) {
    cost += s.cost
    good += LEADS.filter((l) => l.source === s.code && l.requiredFilled >= REQUIRED_SLOTS).length
  }

  return { cost, good, perGood: good > 0 ? Math.round(cost / good) : null }
}

/** Số của một nguồn nhìn từ sổ lead — đây là cách module 1 đo bằng LEAD, không
 *  đo bằng lượt xem. "Lead tốt" = lead đã qua cổng init data.
 *
 *  **Bốn chỉ số giá, bốn MẪU SỐ khác nhau** — cùng một tử số `cost`. Chúng
 *  không thay thế nhau và không bao giờ được đứng chung một cột dưới nhãn "chi
 *  phí": một nguồn rẻ trên đầu mối có thể đắt trên SQL, và chênh lệch đó chính
 *  là thứ đáng nhìn.
 *
 *  **Bốn chỉ số CỐ TÌNH VẮNG MẶT** — ROAS · ROI · thời gian hoàn vốn · LTV. Cả
 *  bốn cần tiền của hợp đồng, mà `Lead.contractCode` chỉ có MÃ chứ không có
 *  tiền. Thêm trường trả `null` cho chúng ở đây cũng được, nhưng thà không có
 *  trường còn hơn có một trường luôn rỗng mà màn tưởng sẽ đầy. Bốn cái mở khoá
 *  cùng lúc khi có `CONTRACTS` mang giá trị tiền.
 *
 *  CAC (`cost ÷ signed`) thì tính được nhưng vô nghĩa về thống kê — mẫu số là 0
 *  hoặc 1 ở mọi nguồn — nên nó cũng không có mặt; `signed` đã ở đây cho ai muốn
 *  tự chia và tự chịu trách nhiệm với con số đó. */
export function sourceStats(code: string) {
  const src = sourceByCode.get(code)
  const mine = LEADS.filter((l) => l.source === code)
  const signed = mine.filter((l) => l.contractCode)
  /* Một nguồn là phạm vi nhỏ nhất có thể — đi qua đúng hàm chung để hàng của
     bảng và ô tổng phía trên nó không thể tính bằng hai công thức. */
  const spend = costOfGoodLead(src ? [src] : [])

  /* MQL+ là "bậc ≥ mql", tức gồm cả SQL: một lead lên SQL thì nó đã là công ty
     thật rồi, không đếm nó vào MQL là làm mẫu số teo đi ở đúng nguồn tốt nhất. */
  const mqlPlus = mine.filter((l) => l.tier === 'mql' || l.tier === 'sql').length
  const sql = mine.filter((l) => l.tier === 'sql').length

  /* Mẫu số 0 thì trả `null`, không trả 0 — cùng luật với `costPerGood`.
     Tử số 0 (nguồn tự nhiên) thì 0 là kết quả thật, giữ nguyên. */
  const per = (n: number) => (n > 0 ? Math.round(spend.cost / n) : null)

  return {
    source: src,
    leads: mine.length,
    good: spend.good,
    signed: signed.length,
    running: mine.filter(isRunning).length,
    cost: spend.cost,
    /** Giá mỗi lead tốt, đồng. 0 lead tốt thì trả `null` — không chia cho 0. */
    costPerGood: spend.perGood,
    /** Chi phí mỗi ĐẦU MỐI, đồng: `cost ÷ leads`. Mẫu số rộng nhất của bốn cái,
     *  nên cũng là con số dễ khiến một nguồn trông rẻ nhất. */
    costPerLead: per(mine.length),
    /** Chi phí mỗi MQL, đồng: `cost ÷ số lead bậc ≥ mql`. */
    costPerMql: per(mqlPlus),
    /** Chi phí mỗi SQL, đồng: `cost ÷ số lead bậc sql`. `null` khi nguồn chưa
     *  đẩy được ai vào sổ cơ hội — TM hôm nay là đúng trường hợp đó, và "chưa
     *  có SQL nào" khác hẳn "0 đồng mỗi SQL". */
    costPerSql: per(sql),
    /** Tỉ lệ lead tốt thô `p̂ = good ÷ leads`, 0–1. `null` khi nguồn chưa có
     *  lead nào.
     *
     *  **Không được hiện một mình ở chỗ liếc.** Trên cỡ mẫu 5–22 của tám nguồn,
     *  con số này là một câu chuyện về vài người: khoảng tin cậy 95% của nguồn
     *  lớn nhất vẫn rộng 38 điểm phần trăm. Khoảng tin cậy và phần co ngót về
     *  trung bình phòng là việc của `stats.ts` ở vòng sau; tới lúc đó bảng hiện
     *  số co ngót, còn số thô này chỉ nằm trong drawer. */
    goodRate: mine.length > 0 ? spend.good / mine.length : null,
  }
}

// ---------------------------------------------------------------------------
// Hồ sơ một lead — thứ màn chi tiết đọc. Ba khối: người liên hệ · transcript ·
// báo cáo tìm hiểu.
//
// TẤT CẢ dựng lại từ chính các trường của lead, KHÔNG có bảng thứ hai chép tay
// 100 dòng. Đó là điều kiện để sổ không bao giờ tự mâu thuẫn: ô số 4 chưa điền
// thì không có người liên hệ, ô số 5 chưa điền thì không có kênh gọi lại — đúng
// như cổng init data nói, không phải một danh bạ chạy song song.
// ---------------------------------------------------------------------------

/** 'LD-0103' → 2. Vị trí trong sổ, dùng làm hạt giống tất định cho mọi thứ suy
 *  ra dưới đây — hai lần chạy phải ra đúng một hồ sơ. */
function seedOf(code: string): number {
  return Math.max(0, Number(code.slice(3)) - 101)
}

/** Bỏ dấu tiếng Việt để dựng địa chỉ thư. Không dùng cho chữ hiển thị. */
function deburr(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

const CONTACT_FAMILY = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Vũ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Ngô',
  'Dương',
  'Lý',
] as const

const CONTACT_GIVEN = [
  'Minh Tuấn',
  'Thu Hằng',
  'Quốc Bảo',
  'Hải Yến',
  'Trung Kiên',
  'Thanh Tú',
  'Đức Anh',
  'Ngọc Lan',
  'Văn Hùng',
  'Phương Thảo',
  'Xuân Trường',
  'Kim Chi',
  'Hữu Đạt',
] as const

const CONTACT_TITLE = [
  'Giám đốc nhà máy',
  'Trưởng phòng sản xuất',
  'Phó giám đốc',
  'Trưởng phòng IT',
  'Giám đốc vận hành',
  'Trưởng phòng mua hàng',
  'Kế toán trưởng',
] as const

export type LeadContact = {
  name: string
  title: string
  /** Chỉ có khi ô số 5 "kênh liên lạc gọi lại được" đã điền. */
  phone?: string
  email?: string
  /** Kênh khách vừa dùng — cùng kênh của đợt kéo lead này về. */
  channel?: WaveChannel
}

/** Người liên hệ bên khách.
 *
 *  `null` là câu trả lời hợp lệ và hay gặp: ô số 4 chưa moi được thì CHƯA CÓ
 *  người liên hệ. Điền một cái tên cho đủ ô là phá đúng thứ cổng init data sinh
 *  ra để đo.
 *
 *  DAS Vina lấy người thật trong đồ thị object (CT-0391), không lấy tên suy ra —
 *  đây là dòng mồi của cả kịch bản, nó phải khớp với `objects`. */
export function leadContact(lead: FrozenLead): LeadContact | null {
  if (!lead.filled.includes('nguoi-lien-he')) return null

  const i = seedOf(lead.code)
  const reachable = lead.filled.includes('kenh')
  const channel = reachable ? primaryChannel(lead.source) : undefined

  if (lead.code === DAS_VINA_LEAD) {
    return {
      name: 'Kim Dae-ho',
      title: 'Giám đốc nhà máy',
      phone: reachable ? '0912 300 391' : undefined,
      email: reachable ? 'daeho.kim@dasvina.vn' : undefined,
      channel,
    }
  }

  const family = CONTACT_FAMILY[i % CONTACT_FAMILY.length] as string
  const given = CONTACT_GIVEN[(i * 5) % CONTACT_GIVEN.length] as string
  const title = CONTACT_TITLE[(i * 3) % CONTACT_TITLE.length] as string
  const box = deburr(given).toLowerCase().replace(/\s+/g, '.')
  const host = deburr(lead.company)
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 12)

  return {
    name: `${family} ${given}`,
    title,
    phone: reachable ? `0912 ${300 + i} ${100 + ((i * 7) % 900)}` : undefined,
    email: reachable ? `${box}@${host}.vn` : undefined,
    channel,
  }
}

/** Kênh chính của một nguồn — đợt kéo về nhiều lead nhất.
 *
 *  Nguồn tự nhiên không có đợt nào nên KHÔNG có kênh: trả `undefined` chứ không
 *  trả 'email' cho có. "Khách cũ giới thiệu" không đi qua kênh nào cả. */
export function primaryChannel(sourceCode: string): WaveChannel | undefined {
  const waves = sourceByCode.get(sourceCode)?.waves ?? []
  const best = waves.reduce<Wave | undefined>(
    (top, w) => (!top || w.leads > top.leads ? w : top),
    undefined,
  )
  return best?.channel
}

/** Bốn kiểu xuất xứ của một lead. Ba kiểu đầu suy từ `SourceKind`; kiểu thứ tư
 *  tách riêng vì "khách cũ giới thiệu" và "BD tự mở" là hai câu chuyện khác nhau
 *  dù cùng là nguồn tự nhiên. */
export type OriginKind = 'chien-dich' | 'su-kien' | 'gioi-thieu' | 'tu-mo'

export type LeadOrigin = {
  kind: OriginKind
  code: string
  label: string
  /** Ai chịu trách nhiệm nguồn này. */
  owner: string
  /** Kênh của đợt kéo lead về. Nguồn tự nhiên không có. */
  channel?: WaveChannel
  /** Sự kiện thì có chỗ và có người đến. */
  venue?: string
  checkedIn?: number
  registered?: number
  /** Ngày nguồn chạy lần đầu, ISO. */
  startedAt: string
  /** Một câu nói rõ lead này về bằng đường nào. */
  note: string
}

/** Lead này từ đâu về. Đây là dây nối module 2 → module 1. */
export function leadOrigin(lead: FrozenLead): LeadOrigin {
  const src = sourceByCode.get(lead.source)
  if (!src) {
    throw new Error(`Lead ${lead.code} trỏ vào nguồn "${lead.source}" không có trong SOURCES`)
  }

  const kind: OriginKind =
    src.kind === 'su-kien'
      ? 'su-kien'
      : src.kind === 'chien-dich'
        ? 'chien-dich'
        : src.code === 'GT'
          ? 'gioi-thieu'
          : 'tu-mo'

  const note = {
    'chien-dich': `Về từ chiến dịch ${src.code} — ${src.waves.length} đợt đã chạy.`,
    'su-kien': `Về từ sự kiện ${src.code} tại ${src.venue ?? 'chưa ghi địa điểm'}.`,
    'gioi-thieu': 'Khách cũ giới thiệu thẳng vào công ty — không đi qua đợt nào.',
    'tu-mo': `${src.owner} tự mở, tạo trực tiếp trong sổ — không đi qua đợt nào.`,
  }[kind]

  return {
    kind,
    code: src.code,
    label: src.label,
    owner: src.owner,
    channel: primaryChannel(src.code),
    venue: src.venue,
    checkedIn: src.checkedIn,
    registered: src.registered,
    startedAt: dayISO(src.startDay),
    note,
  }
}

// ---------------------------------------------------------------------------
// Transcript — NGÔN NGỮ LƯU LÀ TIẾNG ANH.
// Giao diện vẫn tiếng Việt; transcript là dữ liệu lưu, không
// phải thứ hiển thị mặc định. Bộ 10 câu là phần RÚT RA từ đây.
// ---------------------------------------------------------------------------

/** Câu hỏi bên mình, đúng một câu cho mỗi ô của bộ 10 câu. */
const ASK: Record<QuestionKey, string> = {
  'phap-nhan': 'Can you confirm the legal entity name and the tax code for the paperwork?',
  nganh: 'What does the plant actually make, and which line matters most to you?',
  'quy-mo': 'How many people are on site, and how many plants do you run?',
  'nguoi-lien-he': 'Who owns this on your side, and what is their title?',
  kenh: 'What is the best way to reach you — Zalo, email, or a direct call?',
  dau: 'Where does it hurt today? If we fix one thing this year, what is it?',
  'dang-dung': 'What are you running today — spreadsheets, an ERP, something in-house?',
  'nguoi-ky': 'Who signs the final contract, and who approves the budget?',
  tien: 'What budget range are we looking at for this year?',
  moc: 'When do you need this live?',
}

/** Câu trả lời bên khách. Lấy dữ liệu từ chính dòng lead nên hai lead khác nhau
 *  ra hai transcript khác nhau mà vẫn tất định. */
const REPLY: Record<QuestionKey, (l: FrozenLead, category: string) => string> = {
  'phap-nhan': (l) => `${l.company} JSC. The plant is in ${l.province}; I will send the tax code.`,
  nganh: (_l, c) => `${c}. One main line, plus a smaller line we started this year.`,
  'quy-mo': (l) => `About ${headcountOf(l)} people on site. One plant for now.`,
  'nguoi-lien-he': () => 'I own it. Procurement joins once we get to numbers.',
  kenh: () => 'Zalo is fastest. Email works for anything I have to forward internally.',
  dau: (_l, c) =>
    `We cannot tell where a ${c.toLowerCase()} batch actually sits until the shift ends.`,
  'dang-dung': () => 'Excel plus a very old in-house tool. Nobody trusts the numbers in it.',
  'nguoi-ky': () => 'The board signs. Finance approves anything above the yearly cap.',
  tien: () => 'We have not fixed a number. It has to clear payback inside two years.',
  moc: () => 'Before the next audit. That gives us roughly one quarter.',
}

export type TurnKind = 'gap' | 'goi' | 'chat' | 'mail'

export type TranscriptTurn = {
  no: number
  /** ISO, giờ VN — lấy đúng mốc của lần chạm trong timeline. */
  at: string
  kind: TurnKind
  /** Ai bên mình. 'Trợ lý AI' là agent 1. */
  by: string
  /** Ô nào của bộ 10 câu moi được trong lần chạm này. */
  slots: QuestionKey[]
  /** Nguyên văn, tiếng Anh. */
  lines: { speaker: 'pv' | 'kh'; text: string }[]
}

/** Lần chạm nào được tính là một turn. 'len-bac' và 'ky' là KẾT QUẢ của một lần
 *  chạm chứ không phải một cuộc nói chuyện — không đẻ turn. */
const TURN_KINDS = new Set<LeadEventKind>(['vao-so', 'cham', 'dien-o', 'giao', 'doi-cot'])

function turnKindOf(by: string): TurnKind {
  if (by === 'Trợ lý AI') return 'chat'
  if (by === MARKETING) return 'mail'
  if (by === HEAD_OF_SALES) return 'goi'
  return 'gap'
}

/** Transcript của một lead.
 *
 *  MỘT TURN = MỘT LẦN CHẠM có ghi trong timeline. Ô moi được chia theo thứ tự
 *  cho các lần chạm — ô số 1 lấy ở lần chạm đầu, ô cuối lấy ở lần gần nhất. Vì
 *  thế số turn không bao giờ vượt số mốc trong timeline, và lead chưa moi được ô
 *  nào thì KHÔNG có turn nào: gọi mà không hỏi ra gì thì không có gì để lưu. */
export function leadTranscript(lead: FrozenLead): TranscriptTurn[] {
  const keys = lead.filled
  if (keys.length === 0) return []

  const touches = lead.history.filter((e) => TURN_KINDS.has(e.kind))
  if (touches.length === 0) return []

  const category = LEAD_CATEGORIES.find((c) => c.key === lead.category)?.label ?? lead.category
  const count = Math.max(1, Math.min(touches.length, Math.ceil(keys.length / 2)))
  const per = Math.ceil(keys.length / count)

  return Array.from({ length: count }, (_, i) => {
    const slots = keys.slice(i * per, (i + 1) * per)
    const touch = touches[Math.min(i, touches.length - 1)]
    const by = touch?.by ?? MARKETING
    return {
      no: i + 1,
      at: touch?.at ?? lead.createdAt,
      kind: turnKindOf(by),
      by,
      slots,
      lines: slots.flatMap((k) => [
        { speaker: 'pv' as const, text: ASK[k] },
        { speaker: 'kh' as const, text: REPLY[k](lead, category) },
      ]),
    }
  }).filter((t) => t.slots.length > 0)
}

// ---------------------------------------------------------------------------
// Báo cáo tìm hiểu khách hàng — phần RÚT RA từ transcript, viết tiếng Việt.
// ---------------------------------------------------------------------------

/** Một dòng của báo cáo. Chỉ ô ĐÃ điền mới có dòng; ô trống nằm ở `missing…`. */
const DIGEST: Record<QuestionKey, (l: FrozenLead, category: string) => string> = {
  'phap-nhan': (l) => `${l.company} — pháp nhân đã xác minh, nhà máy đặt tại ${l.province}.`,
  nganh: (_l, c) => `Ngành ${c.toLowerCase()}; một dây chuyền chính, một dây mới mở trong năm.`,
  'quy-mo': (l) => `Khoảng ${headcountOf(l)} người tại chỗ, một nhà máy.`,
  'nguoi-lien-he': () => 'Người liên hệ tự đứng tên việc này; mua hàng vào cuộc khi bàn tới số.',
  kenh: () => 'Zalo là kênh nhanh nhất; email dùng cho thứ cần chuyển tiếp nội bộ.',
  dau: (_l, c) => `Đau chính: không biết lô ${c.toLowerCase()} nằm ở đâu cho tới khi hết ca.`,
  'dang-dung': () => 'Đang dùng Excel và một công cụ nội bộ cũ; số trong đó không ai tin.',
  'nguoi-ky': () => 'Hội đồng ký; tài chính duyệt mọi khoản vượt trần năm.',
  tien: () => 'Chưa chốt con số; điều kiện là hoàn vốn trong hai năm.',
  moc: () => 'Cần chạy trước kỳ kiểm toán tới — còn khoảng một quý.',
}

export type ResearchLine = {
  key: QuestionKey
  no: number
  label: string
  required: boolean
  body: string
}

export type LeadResearch = {
  /** Cập nhật lần thứ mấy. Mỗi turn là một lần cập nhật, không hơn không kém. */
  version: number
  updatedAt: string
  updatedBy: string
  /** Một câu mở đầu — thứ đọc trước khi bấm gọi khách. */
  headline: string
  lines: ResearchLine[]
  missingRequired: QuestionKey[]
  missingOptional: QuestionKey[]
}

/** Báo cáo tìm hiểu khách hàng ở trạng thái HIỆN TẠI.
 *
 *  Số lần cập nhật = số turn. Đây không phải cách đánh số cho đẹp: báo cáo là
 *  phần rút ra từ transcript, nên nó chỉ đổi khi có thêm một lần nói chuyện.
 *  Lead chưa có turn nào thì báo cáo ở phiên bản 0 — chưa ai tìm hiểu gì. */
export function leadResearch(lead: FrozenLead): LeadResearch {
  const turns = leadTranscript(lead)
  const last = turns[turns.length - 1]
  const category = LEAD_CATEGORIES.find((c) => c.key === lead.category)?.label ?? lead.category
  const filled = new Set(lead.filled)
  const missing = INIT_DATA_QUESTIONS.filter((q) => !filled.has(q.key))
  const shortBy = Math.max(0, REQUIRED_SLOTS - lead.requiredFilled)

  return {
    version: turns.length,
    updatedAt: last?.at ?? lead.createdAt,
    updatedBy: last?.by ?? MARKETING,
    headline:
      shortBy > 0
        ? `${lead.company} · ${category} · ${lead.province}. Còn thiếu ${shortBy} ô bắt buộc — chưa qua cổng init data.`
        : `${lead.company} · ${category} · ${lead.province}. Đủ ${REQUIRED_SLOTS} ô bắt buộc, hồ sơ chạy được vào pipeline.`,
    lines: INIT_DATA_QUESTIONS.filter((q) => filled.has(q.key)).map((q) => ({
      key: q.key,
      no: q.no,
      label: q.label,
      required: q.required,
      body: DIGEST[q.key](lead, category),
    })),
    missingRequired: missing.filter((q) => q.required).map((q) => q.key),
    missingOptional: missing.filter((q) => !q.required).map((q) => q.key),
  }
}

// ---------------------------------------------------------------------------
// Giao việc — ai nên nhận.
// ---------------------------------------------------------------------------

/** Ngành một người phụ trách, suy từ `LEAD_CATEGORIES`.
 *
 *  Vai không gắn ngành (Marketing, BD, Presales, TP Kinh doanh) trả mảng rỗng,
 *  và mảng rỗng ở đây nghĩa là "làm được mọi ngành" chứ không phải "không làm
 *  được ngành nào" — chỗ gọi phải đọc đúng nghĩa đó. */
export function domainsOf(name: string): string[] {
  return LEAD_CATEGORIES.filter((c) => c.sale === name).map((c) => c.label)
}

/** Sale phụ trách một ngành. Đây là luật chia việc mặc định của phòng
 *  (module Cấu hình · mục 5.3), không phải gợi ý. */
export function saleOfCategory(category: LeadCategory): string | undefined {
  return LEAD_CATEGORIES.find((c) => c.key === category)?.sale
}

// ---------------------------------------------------------------------------
// Mốc thời gian của một lead — nền của trục tháng · quý · năm ở module Performance.
// ---------------------------------------------------------------------------

/** Kỳ dữ liệu của kịch bản: từ ngày đầu tới đúng lát cắt đã đóng băng.
 *  Bộ chọn kỳ của màn Performance không được vượt ra ngoài hai mốc này. */
export const DAS_VINA_PERIOD = { from: dayISO(0), to: DAS_VINA_FROZEN_AT } as const

/** Bảy mốc đời của một lead, đọc từ chính `history` chứ không đoán thêm.
 *
 *  Đây là thứ cho phép cắt sổ lead theo tháng/quý/năm mà không đẻ ra con số
 *  nào: mỗi mốc là một sự kiện ĐÃ CÓ NGÀY trong kịch bản. Cộng cả kỳ thì bốn
 *  mốc `vaoSo · mql · sql · ky` ra đúng bốn bậc 100 · 44 · 30 · 6 của `FUNNEL`,
 *  còn mốc `gap` ra đúng `FIRST_MEETINGS` = 38 — một chặng nằm GIỮA MQL và cơ
 *  hội, không phải bậc thứ bảy. `scenario.test.ts` khoá cả hai đẳng thức.
 *
 *  `bdCham` là lần BD đặt tay vào lead (mốc `dien-o` do BD ghi). Nó KHÁC "lead
 *  BD đang giữ": lead lên SQL thì đổi chủ sang Sale, nhưng công trạng của BD
 *  vẫn nằm ở lần chạm đó (docs · "Hoa hồng và công trạng"). */
export type LeadMilestones = {
  /** Ngày vào sổ. Lead nào cũng có. */
  vaoSo: string
  /** Lên bậc MQL — Marketing xác minh công ty có thật. */
  mql?: string
  /** Buổi gặp đầu tiên. Trống = chưa gặp — điều kiện ở `hasFirstMeeting`. */
  gap?: string
  /** Vào sổ cơ hội, tức lên bậc SQL. */
  sql?: string
  ky?: string
  roi?: string
  bdCham?: string
}

export function leadMilestones(lead: FrozenLead): LeadMilestones {
  const at = (kind: LeadEventKind, by?: string) =>
    lead.history.find((e) => e.kind === kind && (by === undefined || e.by === by))?.at

  return {
    vaoSo: lead.createdAt,
    /* `len-bac` xuất hiện hai lần: lên MQL rồi qua cổng init data. Lấy cái ĐẦU
       tiên — cái thứ hai đã có mốc riêng là `vao-pipeline`. */
    mql: at('len-bac'),
    gap: at('gap-lan-dau'),
    sql: at('vao-pipeline'),
    ky: at('ky'),
    roi: lead.exitedAt,
    bdCham: at('dien-o', BD),
  }
}

/** Số ngày giữa hai mốc ISO. Trả `null` nếu thiếu một đầu — chặng không đo được
 *  thì nói ra, đừng trả 0 (0 nghĩa là "đo rồi, xong trong ngày"). */
export function daysBetween(from: string | undefined, to: string | undefined): number | null {
  if (!from || !to) return null
  return (Date.parse(to) - Date.parse(from)) / DAY_MS
}

// ---------------------------------------------------------------------------
// HỒ SƠ LEAD — bộ 10 câu mở ra thành TRƯỜNG THẬT
// ---------------------------------------------------------------------------
//
// `Lead` ở trên là dòng SỔ: vừa đủ để xếp hàng, đếm bậc, tô cảnh báo. Nó cố ý
// không mang nội dung — `requiredFilled: 6` nói "đã moi được sáu ô" chứ không
// nói sáu ô đó ghi gì.
//
// `LeadProfile` là chỗ chứa nội dung đó. Nguyên tắc dựng nó chỉ có một câu:
//
//     MỖI TRƯỜNG THUỘC ĐÚNG MỘT Ô CỦA BỘ 10 CÂU, HOẶC KHÔNG THUỘC Ô NÀO
//     VÀ KHI ĐÓ NÓ LÀ THỨ HỆ TỰ GHI.
//
// Nhờ vậy hồ sơ không phải "một form CRM chép của người khác": nó là bộ 10 câu
// đã chốt, mở ra thành ô nhập. Điền đầy trường là moi được ô; moi đủ sáu ô bắt
// buộc là qua cổng init data. Người dùng thấy thanh cổng nhích lên trong lúc gõ
// chứ không phải bấm một nút "đánh dấu đã moi" ở đâu đó.
//
// Ô CHƯA MOI ĐƯỢC TRẢ CHUỖI RỖNG (hoặc null với số). Đây là điểm dễ hỏng nhất
// của cả file: điền một giá trị mặc định cho đẹp form là phá đúng thứ cổng init
// data sinh ra để đo — `leadContact` phía trên đã dặn y hệt về ô số 4.
// ---------------------------------------------------------------------------

/** Số người tại chỗ của một khách.
 *
 *  Tách thành hàm vì BA chỗ đang nói về cùng con số này: câu trả lời trong
 *  transcript (`REPLY['quy-mo']`), dòng rút ra của báo cáo (`DIGEST['quy-mo']`)
 *  và trường `headcount` của hồ sơ. Ba bản chép tay sẽ lệch nhau, và lệch ở đây
 *  đọc ra thành "hệ ghi hai quy mô khác nhau cho một nhà máy".
 *
 *  DAS Vina lấy số THẬT của kịch bản (1.400 người, ghi ở `objects` · AC-0142),
 *  không lấy số suy ra — nó là dòng mồi, mọi chỗ nói về nó phải khớp nhau. */
export function headcountOf(lead: FrozenLead): number {
  if (lead.code === DAS_VINA_LEAD) return 1_400
  return 400 + (seedOf(lead.code) % 12) * 100
}

/** Bảng đồng tiền và phép quy về đồng — nay ĐỨNG Ở `@pv/contracts`.
 *
 *  Xuất lại nguyên tên ở đây vì mọi màn đang đọc chúng từ đường này, và một
 *  bảng tỉ giá không đáng để đổi mười dòng import. Vì sao nó rời khỏi fixture:
 *  kể từ `GET /sales/opportunities/scorecard`, MÁY CHỦ cũng cộng tiền — nó quy
 *  ra đồng ngay trong SQL — nên hai đầu dây phải đọc CÙNG một bảng, và bảng
 *  chung của hai đầu là hợp đồng dữ liệu, không phải fixture của một kịch bản.
 *  Câu chuyện đầy đủ ở `packages/contracts/src/sales/currency.ts`. */
export { CURRENCIES, toDong, type CurrencyCode }

/** Hồ sơ đầy đủ của một lead.
 *
 *  Bốn cụm, xếp đúng thứ tự người cầm lead cần đọc:
 *   1 · KHÁCH LÀ AI          — ô 1 · 2 · 3
 *   2 · NÓI CHUYỆN VỚI AI    — ô 4 · 5
 *   3 · VIỆC KHÁCH MUỐN GIẢI — ô 6 · 7 · 8 · 9 · 10
 *   4 · SỔ SÁCH              — hệ tự ghi, không moi từ khách
 *
 *  Cụm 4 phủ đúng tám cột của sổ lead (mã · công ty · người liên hệ · chức danh
 *  · nguồn · trạng thái · người giữ; ghim là thứ của người XEM chứ không của
 *  lead) — mở hồ sơ ra là thấy lại đủ dòng mình vừa bấm, không thiếu cột nào. */
export type LeadProfile = {
  // ── 1 · Khách là ai ──────────────────────────────────────────────────────
  /** ô 1 — tên trên giấy tờ, khác tên gọi trong sổ. */
  legalName: string
  /** ô 1 */
  taxCode: string
  /** ô 1 */
  address: string
  /** Tỉnh — hệ ghi từ lúc lead vào sổ, không phải ô moi được. */
  province: string
  /** ô 2 — ngành đã có sẵn ở dòng sổ; đây là ô CHỌN, không phải ô gõ. */
  category: LeadCategory
  /** ô 2 */
  mainProduct: string
  /** ô 3 */
  headcount: number | null
  /** ô 3 */
  plants: number | null

  // ── 2 · Nói chuyện với ai ────────────────────────────────────────────────
  /** ô 4 */
  contactName: string
  /** ô 4 */
  contactTitle: string
  /** ô 5 */
  phone: string
  /** ô 5 */
  email: string
  /** ô 5 — kênh khách gọi lại được, cùng bộ kênh với module 1. */
  channel: WaveChannel | ''

  // ── 3 · Việc khách muốn giải ─────────────────────────────────────────────
  /** ô 6 — câu quan trọng nhất của cả hồ sơ, nên là ô DÀI. */
  pain: string
  /** ô 7 */
  currentStack: string
  /** ô 8 */
  decisionMaker: string
  /** ô 8 */
  approver: string
  /** ô 9 — khoảng tiền KHÁCH nói, không phải giá mình chào. */
  budget: number | null
  /** ô 9 */
  currency: CurrencyCode
  /** ô 10 — ISO ngày. */
  deadline: string

  // ── 4 · Sổ sách ──────────────────────────────────────────────────────────
  code: string
  company: string
  tier: LeadTier
  source: string
  owner: string
  bdOwner: string
  marketingOwner: string
  createdAt: string
  stage: StageKey | ''
  dealCode: string
  contractCode: string
  exitReason: ExitReason | ''
}

/** Ô nào của bộ 10 câu do trường nào chở.
 *
 *  Đây là bảng NỐI, và nó phải nằm cạnh `LeadProfile` chứ không nằm ở tầng màn:
 *  cổng init data đọc bảng này để biết một ô đã moi được hay chưa, mà cổng là
 *  luật của phòng, không phải cách trình bày của một cái form.
 *
 *  MỘT Ô CÓ GÌ LÀ ĐÃ MOI ĐƯỢC. Ô 1 chở ba trường (tên pháp nhân · mã số thuế ·
 *  địa chỉ); xoá mã số thuế mà còn tên pháp nhân thì ô vẫn tính là có — cổng
 *  hỏi "đã biết công ty là ai chưa", không hỏi "đã điền hết ba dòng chưa". */
export const SLOT_FIELDS: Record<QuestionKey, (keyof LeadProfile)[]> = {
  'phap-nhan': ['legalName', 'taxCode', 'address'],
  nganh: ['mainProduct'],
  'quy-mo': ['headcount', 'plants'],
  'nguoi-lien-he': ['contactName', 'contactTitle'],
  kenh: ['phone', 'email', 'channel'],
  dau: ['pain'],
  'dang-dung': ['currentStack'],
  'nguoi-ky': ['decisionMaker', 'approver'],
  tien: ['budget'],
  moc: ['deadline'],
}

/** Ô nào đã moi được, đọc từ CHÍNH hồ sơ đang sửa.
 *
 *  Hàm này là thứ khiến thanh cổng nhích lên trong lúc gõ: màn không tự đếm ô,
 *  nó hỏi hàm này. Trả về cùng thứ tự với `INIT_DATA_QUESTIONS`. */
export function filledSlots(profile: LeadProfile): QuestionKey[] {
  return INIT_DATA_QUESTIONS.filter((q) =>
    SLOT_FIELDS[q.key].some((f) => {
      const v = profile[f]
      return v !== '' && v !== null && v !== undefined
    }),
  ).map((q) => q.key)
}

const MAIN_PRODUCT: Record<LeadCategory, string> = {
  chip: 'Đóng gói và kiểm tra chip bán dẫn',
  'co-khi': 'Gia công cơ khí chính xác theo bản vẽ',
  'o-to': 'Phụ tùng lắp ráp ô tô',
  duoc: 'Dược phẩm và thực phẩm chức năng',
}

/** Hồ sơ đầy đủ, dựng từ dòng sổ.
 *
 *  Tất định: cùng một mã lead luôn ra cùng một hồ sơ. Trường của ô CHƯA moi
 *  được trả rỗng — đó là dữ liệu, không phải lỗi hiển thị.
 *
 *  Nội dung tiếng Việt ở đây và bản rút ra của `DIGEST` nói cùng một chuyện: cả
 *  hai đều là phần rút ra từ transcript tiếng Anh, chỉ khác là bảng dưới cắt
 *  nhỏ ra thành từng ô để sửa được. */
export function leadProfile(lead: FrozenLead): LeadProfile {
  const i = seedOf(lead.code)
  const has = (k: QuestionKey) => lead.filled.includes(k)
  const contact = leadContact(lead)
  const origin = leadOrigin(lead)
  const marks = leadMilestones(lead)
  const anchor = lead.code === DAS_VINA_LEAD
  const category = LEAD_CATEGORIES.find((c) => c.key === lead.category)?.label ?? lead.category
  const amount = lead.dealCode
    ? OPEN_DEALS.find((d) => d.code === lead.dealCode)?.amount
    : undefined

  return {
    legalName: has('phap-nhan')
      ? anchor
        ? 'DAS Vina Co., Ltd.'
        : `Công ty Cổ phần ${lead.company}`
      : '',
    taxCode: has('phap-nhan') ? String(2_300_000_000 + i * 37) : '',
    address: has('phap-nhan') ? `Lô ${1 + (i % 9)}, Khu công nghiệp ${lead.province}` : '',
    province: lead.province,
    category: lead.category,
    mainProduct: has('nganh')
      ? anchor
        ? 'Đóng gói chip bán dẫn cho khách Hàn Quốc'
        : MAIN_PRODUCT[lead.category]
      : '',
    headcount: has('quy-mo') ? headcountOf(lead) : null,
    plants: has('quy-mo') ? 1 : null,

    contactName: contact?.name ?? '',
    contactTitle: contact?.title ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    channel: contact?.channel ?? '',

    pain: has('dau')
      ? `Không biết một lô ${category.toLowerCase()} đang nằm ở đâu cho tới lúc hết ca. Muốn nhìn được tiến độ ngay trong ca, không phải sau ca.`
      : '',
    currentStack: has('dang-dung')
      ? 'Excel và một công cụ nội bộ cũ. Số trong đó không ai tin, mỗi phòng giữ một bản riêng.'
      : '',
    decisionMaker: has('nguoi-ky')
      ? anchor
        ? 'Giám đốc bên Hàn Quốc ký cuối'
        : 'Hội đồng quản trị ký cuối'
      : '',
    approver: has('nguoi-ky')
      ? anchor
        ? 'Trên 3 tỷ phải xin công ty mẹ duyệt'
        : 'Tài chính duyệt mọi khoản vượt trần năm'
      : '',
    budget: has('tien') ? (amount ?? 250_000_000 * (2 + (i % 12))) : null,
    currency: 'VND',
    /* "Trước kỳ kiểm toán tới — còn khoảng một quý" của báo cáo, quy ra ngày.
       Rải trong khoảng 60–120 ngày để hai lead không cùng một hạn. */
    deadline: has('moc') ? dayISO(DAY_FROZEN + 60 + (i % 5) * 15).slice(0, 10) : '',

    code: lead.code,
    company: lead.company,
    tier: lead.tier,
    source: lead.source,
    owner: lead.owner ?? '',
    /* Hai vai này KHÔNG phải người giữ lead — chúng là công trạng đã ghi: BD có
       tên khi BD đã đặt tay vào (mốc `dien-o`), Marketing có tên khi lead về từ
       một nguồn có đợt chạy. Suy ra chứ không khai tay, vì hoa hồng đọc đúng
       hai mốc đó (`CREDIT_RULES`). */
    bdOwner: marks.bdCham ? BD : '',
    marketingOwner: origin.kind === 'chien-dich' || origin.kind === 'su-kien' ? MARKETING : '',
    createdAt: lead.createdAt,
    stage: lead.stage ?? '',
    dealCode: lead.dealCode ?? '',
    contractCode: lead.contractCode ?? '',
    exitReason: lead.exitReason ?? '',
  }
}

// ---------------------------------------------------------------------------
// Đổi lead thành cơ hội — trạng thái, lý do thua, và bản nháp phiếu
// ---------------------------------------------------------------------------

/** NĂM trạng thái của một cơ hội.
 *
 *  Đừng nhầm với `PIPELINE_STAGES`. Hai bảng trả lời hai câu khác nhau:
 *   · `PIPELINE_STAGES` — đơn ĐANG NẰM Ở CỘT NÀO của sổ cơ hội, và cột đó có
 *     hạn bao nhiêu ngày. Đó là thứ đo tắc nghẽn.
 *   · `OPPORTUNITY_STATES` — người bán ĐANG LÀM GÌ với đơn, kể cả hai kết cục
 *     đóng sổ (won · lost) mà cột pipeline không diễn tả được.
 *
 *  `stage` dưới đây là dây nối: chọn một trạng thái là đơn rơi vào đúng một cột.
 *  Hai kết cục đóng sổ không có cột nào — đơn ra khỏi bảng năm cột, nên `stage`
 *  của chúng là `null` chứ không phải "cột thứ sáu".
 *
 *  Thứ tự giữ đúng thứ tự đã chốt khi đặt hàng màn, không xếp lại theo nhóm. */
export const OPPORTUNITY_STATES = [
  { key: 'gui-quotation', label: 'Gửi quotation', stage: 'da-bao-gia' },
  { key: 'nego', label: 'Nego', stage: 'cho-ky' },
  { key: 'close-won', label: 'Close won', stage: null },
  { key: 'close-lost', label: 'Close lost', stage: null },
  { key: 'pending', label: 'Pending', stage: 'tim-hieu' },
] as const satisfies readonly { key: string; label: string; stage: StageKey | null }[]

export type OpportunityState = (typeof OPPORTUNITY_STATES)[number]['key']

/** Lý do thua một CƠ HỘI. Khác `EXIT_REASONS`, và khác ở chỗ quan trọng:
 *
 *   · `EXIT_REASONS` là sáu lý do một LEAD chết TRƯỚC khi thành cơ hội. Danh
 *     sách ĐÓNG, không có ô "khác": lý do thứ bảy là việc của module Cấu hình.
 *   · Bảng này là lý do một cơ hội ĐÃ BÁO GIÁ thua. Nó MỞ — có ô ghi thêm — vì
 *     lý do thua đơn là thứ học được từ thị trường, không phải thứ phòng tự quy
 *     định. Bảy dòng dưới là bảy lý do hay gặp, không phải toàn bộ. */
export const LOSS_REASONS = [
  'Giá cao hơn đối thủ',
  'Khách chọn đối thủ khác',
  'Không đủ ngân sách năm nay',
  'Dự án hoãn vô thời hạn',
  'Thiếu tính năng khách cần',
  'Thời gian triển khai không kịp',
  'Mất người ủng hộ bên trong',
] as const

/** Tệp đính kèm — POC giữ đúng tên và cỡ, không giữ nội dung. */
export type OpportunityFile = { name: string; size: number }

/** Phiếu đổi lead thành cơ hội, đúng bộ trường đã chốt. */
export type OpportunityDraft = {
  code: string
  name: string
  account: string
  /** Mã object account trong đồ thị E1, nếu lead đã có. */
  accountCode: string
  /** ISO ngày — ngày dự kiến đóng đơn. */
  closedDate: string
  state: OpportunityState
  amount: number | null
  currency: CurrencyCode
  /** id của actor, không phải tên: tên đổi được, id thì không. */
  saleOwners: string[]
  bdOwners: string[]
  description: string
  attachments: OpportunityFile[]
  /** Chỉ có nghĩa khi `state === 'close-lost'`. */
  lossReason: string
  lossNote: string
}

// ---------------------------------------------------------------------------
// SỔ CƠ HỘI — 30 dòng, SUY RA từ chính sổ lead
// ---------------------------------------------------------------------------
//
// Sổ này KHÔNG khai tay 30 dòng mới. Nó đọc lại sổ lead và lấy đúng những lead
// đã lên bậc SQL — vì "lead lên SQL" và "lead vào sổ cơ hội" là một sự kiện,
// không phải hai. Con số khớp ba chỗ và `scenario.test.ts` khoá cả ba:
//
//     LEADS.filter(tier === 'sql')  =  FUNNEL['co-hoi'].count  =  30
//     = 10 đơn đang mở (OPEN_DEALS) + 6 hợp đồng đã ký + 14 đơn đã thua
//
// Khai một mảng 30 dòng riêng ở đây là tạo bản chép thứ hai của cùng một sự
// thật: sửa một dòng lead thì sổ cơ hội trôi khỏi nó ngay, và không test nào
// bắt được vì hai mảng đều "đúng" với chính mình.
//
// `OPEN_DEALS` KHÔNG bị thay thế. Nó vẫn là bảng NGUỒN cho tiền và cột của 10
// đơn đang mở — sổ dưới đây đọc nó chứ không đoán lại.

/** Một dòng sổ cơ hội.
 *
 *  Đúng bằng phiếu đổi (`OpportunityDraft`) cộng hai thứ mà một phiếu chưa gửi
 *  thì chưa có: lead nó sinh ra từ đâu, và nó đang nằm ở cột nào. Một kiểu chứ
 *  không hai: phiếu vừa gửi ở màn hồ sơ lead phải xếp cạnh 30 dòng này trong
 *  cùng một bảng, mà hai kiểu gần giống nhau là hai chỗ để lệch trường. */
export type Opportunity = OpportunityDraft & {
  /** Lead sinh ra đơn này. Đây là dây nối module Lead ↔ module Ops. */
  leadCode: string
  /** Cột của `PIPELINE_STAGES`, hoặc `null` với hai kết cục đã đóng sổ. */
  stage: StageKey | null
}

/** Đơn ĐANG LÀM GÌ, suy từ dòng lead.
 *
 *  Đây là dây nối `PIPELINE_STAGES` (đơn nằm cột nào) sang `OPPORTUNITY_STATES`
 *  (người bán đang làm gì với nó). Hai kết cục đóng sổ thắng chỗ mọi thứ khác:
 *  một đơn đã ký thì cột nó từng đứng không còn là câu trả lời nữa.
 *
 *  Ba cột đầu (`moi` · `tim-hieu` · `da-demo`) đều ra "Pending" — không phải vì
 *  lười gộp, mà vì `OPPORTUNITY_STATES` chỉ có năm giá trị và cả ba cột đó đều
 *  là "chưa gửi giá". Cột vẫn còn nguyên ở trường `stage`, không mất chỗ nào. */
export function opportunityStateOf(lead: Lead): OpportunityState {
  if (lead.contractCode) return 'close-won'
  if (lead.exitReason) return 'close-lost'
  if (lead.stage === 'cho-ky') return 'nego'
  if (lead.stage === 'da-bao-gia') return 'gui-quotation'
  return 'pending'
}

/** Ngày đóng của một đơn, tính bằng số ngày kể từ đầu kỳ.
 *
 *  Đơn đã đóng sổ thì đó là ngày THẬT — ngày ký, hoặc ngày rơi; cả hai đã nằm
 *  sẵn trong dòng lead (`daysHere` đếm ngược từ lát cắt).
 *
 *  Đơn đang mở thì đó là ngày DỰ KIẾN, và nó suy từ chính hạn của các cột chứ
 *  không phải một hằng số "45 ngày": đơn đi hết phần hạn còn lại của cột đang
 *  đứng, rồi hết hạn của từng cột phía sau. Nghĩa của con số vì thế đọc được —
 *  "nếu đơn này chạy đúng nhịp SLA thì nó đóng ngày đó" — và đơn đang mục tự
 *  có ngày sớm hơn đơn vừa vào cột, đúng như thực tế.
 *
 *  Ngày dự kiến RƠI VÀO QUÁ KHỨ được, và không kẹp lại: một đơn mục ở cột CUỐI
 *  (Chờ ký) không còn hạn nào phía sau để bù, nên nó đáng lẽ đã đóng rồi. Kẹp
 *  ngày đó về lát cắt là xoá đúng câu đáng nói nhất của dòng. Trong kịch bản
 *  đóng băng có đúng một đơn như vậy — OP-0252, `scenario.test.ts` khoá. */
export function opportunityCloseDay(lead: FrozenLead): number {
  if (lead.contractCode || lead.exitReason) return DAY_FROZEN - lead.daysHere

  const i = PIPELINE_STAGES.findIndex((s) => s.key === lead.stage)
  if (i < 0) return DAY_FROZEN

  const left = (PIPELINE_STAGES[i]?.limitDays ?? 0) - lead.daysHere
  const ahead = PIPELINE_STAGES.slice(i + 1).reduce((sum, s) => sum + s.limitDays, 0)
  return DAY_FROZEN + left + ahead
}

/** Tiền của 10 đơn đang mở, tra bằng mã. */
const openAmount = new Map(OPEN_DEALS.map((d) => [d.code, d.amount]))

/** Mã bắt đầu cấp cho đơn CHƯA có mã trong `OPEN_DEALS`.
 *
 *  20 đơn đã đóng sổ (6 ký + 14 thua) không nằm trong bảng 10 đơn đang mở nên
 *  chưa có mã nào. Cấp từ 0201 lên: khoảng đó nằm dưới mã nhỏ nhất đang dùng
 *  (OP-0248) nên không đụng mã nào, và `nextOpportunityCode` vẫn ra OP-0305
 *  đúng như trước — thêm sổ này không được phép đổi mã của phiếu kế tiếp. */
const CLOSED_CODE_FROM = 201

function buildOpportunities(): Opportunity[] {
  const idOf = (name: string) => dasVina.actors.find((a) => a.name === name)?.id
  let minted = CLOSED_CODE_FROM

  return LEADS.filter((l) => l.tier === 'sql').map((lead) => {
    const profile = leadProfile(lead)
    const code = lead.dealCode ?? `OP-0${minted++}`
    const account = lead.dealCode
      ? dasVina.graph.story(lead.dealCode).find((o) => o.kind === 'AC')
      : undefined
    const sale = lead.owner ? idOf(lead.owner) : undefined
    const bd = profile.bdOwner ? idOf(profile.bdOwner) : undefined

    return {
      code,
      /* Cùng công thức tên với `draftOpportunity` — một đơn có sẵn trong sổ và
         một đơn vừa đổi từ lead phải đọc ra cùng một kiểu tên. Mọi lead SQL đều
         đã moi ô 2 (ô BẮT BUỘC) nên nhánh "chưa chốt phạm vi" không bao giờ
         chạy ở đây; giữ lại vì phiếu người dùng tự tạo thì có thể. */
      name: profile.mainProduct
        ? `${lead.company} · ${profile.mainProduct}`
        : `${lead.company} · chưa chốt phạm vi`,
      account: lead.company,
      accountCode: account?.code ?? '',
      leadCode: lead.code,
      /* Đơn đang mở lấy tiền ĐÃ CHÀO ở `OPEN_DEALS`; đơn đã đóng sổ chỉ còn
         khoảng tiền khách nói (ô 9) để mà lấy — `Lead.contractCode` có mã chứ
         không có tiền, và bịa một giá trị hợp đồng ở đây là bịa doanh số.
         2/30 đơn vì thế trống tiền: ô 9 là ô TUỲ CHỌN, chưa ai moi. Trống là dữ
         liệu — màn vẽ "—", không vẽ 0. */
      amount: lead.dealCode ? (openAmount.get(lead.dealCode) ?? null) : profile.budget,
      currency: profile.currency,
      closedDate: dayISO(opportunityCloseDay(lead)).slice(0, 10),
      state: opportunityStateOf(lead),
      stage: lead.stage ?? null,
      saleOwners: sale ? [sale] : [],
      bdOwners: bd ? [bd] : [],
      description: profile.pain,
      attachments: [],
      /* Lý do thua để TRỐNG có chủ đích. `EXIT_REASONS` là lý do một LEAD chết,
         `LOSS_REASONS` là lý do một ĐƠN thua — hai danh sách khác nhau, và nhét
         nhãn của bảng này vào trường của bảng kia làm bảy nút chọn không nút
         nào sáng mà người dùng tưởng đã chọn rồi. Câu thật đi vào ô ghi thêm,
         chỗ nó là chữ tự do; chọn lý do thua là việc còn phải làm. */
      lossReason: '',
      lossNote: lead.exitReason ?? '',
    }
  })
}

/** 30 cơ hội của cả kỳ 01/05 → 17/08. Không phải một trang. */
export const OPPORTUNITIES: Opportunity[] = buildOpportunities()

/** Cơ hội sinh ra từ một lead, nếu có.
 *
 *  Màn hồ sơ lead cần chiều này: `Lead.dealCode` chỉ có ở 10 đơn đang mở, nên
 *  hỏi thẳng trường đó thì 20 lead đã đóng sổ mất đường sang cơ hội của chính
 *  mình. */
export function opportunityOfLead(leadCode: string): Opportunity | undefined {
  return OPPORTUNITIES.find((o) => o.leadCode === leadCode)
}

/** Bao nhiêu lead của MỘT nguồn đã thành cơ hội — cột "→ Ops" của sổ chiến dịch.
 *
 *  Đi vòng qua `OPPORTUNITIES` chứ không đếm thẳng `tier === 'sql'` trên `LEADS`:
 *  hôm nay hai phép đếm ra cùng số, nhưng sổ cơ hội là thứ ĐỊNH NGHĨA "đã thành
 *  cơ hội", và ngày nó nhận thêm một dòng ngoài bậc SQL thì phép đếm tắt kia im
 *  lặng nói sai. Chiến dịch hỏi "tôi đẻ ra bao nhiêu cơ hội" thì phải đếm trên
 *  chính sổ cơ hội.
 *
 *  Cộng cả sáu nguồn có đợt KHÔNG ra 30: hai nguồn tự nhiên cũng đẻ cơ hội. Đó
 *  là chỗ chênh có thật, không phải lỗi — cùng lý do `leads` của kỳ là 88. */
export function opsFromSource(code: string): number {
  const bySource = new Set(LEADS.filter((l) => l.source === code).map((l) => l.code))
  return OPPORTUNITIES.filter((o) => bySource.has(o.leadCode)).length
}

/** Mã cơ hội kế tiếp — lớn nhất trong sổ cộng một.
 *
 *  Đếm từ sổ chứ không gõ hằng số: thêm một đơn vào sổ là mã kế tiếp tự đúng.
 *  Có backend thì đây là chỗ đổi thành lời gọi cấp mã.
 *
 *  `taken` là những mã đã cấp mà sổ CHƯA biết — phiếu người dùng vừa gửi trong
 *  phiên này. Không truyền nó vào thì đổi hai lead ra hai đơn TRÙNG MÃ, và hai
 *  đơn trùng mã là hai dòng sổ mà không ai phân biệt được.
 *
 *  ------------------------------------------------------------------
 *  MÃ LẠ BỊ BỎ QUA, KHÔNG ĐƯỢC PHÉP LÀM HỎNG PHÉP ĐẾM
 *  ------------------------------------------------------------------
 *  `taken` đến từ `localStorage` của người dùng (`app/desk.ts`), tức từ ngoài
 *  tiến trình — một bản lưu cũ, một lần đổi cách đặt mã, một dòng sửa tay đều
 *  cho ra chuỗi không đúng dạng `OP-NNNN`. `Number('P-01xx')` là `NaN`, và
 *  `Math.max(bất_kỳ_gì, NaN)` cũng là `NaN`: một mã hỏng duy nhất trong sổ nháp
 *  làm mọi phiếu sau đó mang mã **`OP-0NaN`**. Lọc theo hình dạng trước khi
 *  cộng, và bỏ qua chứ không ném — mã lạ là dữ liệu cũ của người dùng, không
 *  phải lỗi lập trình, còn phiếu đang mở thì vẫn phải cấp được mã. */
const OPPORTUNITY_CODE = /^OP-(\d+)$/

export function nextOpportunityCode(taken: readonly string[] = []): string {
  const top = [...OPPORTUNITIES.map((o) => o.code), ...taken].reduce((max, code) => {
    const n = OPPORTUNITY_CODE.exec(code)?.[1]
    return n === undefined ? max : Math.max(max, Number(n))
  }, 0)
  return `OP-${String(top + 1).padStart(4, '0')}`
}

/** Bản nháp mở sẵn của phiếu đổi.
 *
 *  Mở form ra là đã có gần đủ: mã hệ cấp, tên ghép từ khách và thứ đang bán,
 *  tiền lấy đúng khoảng tiền khách đã nói (ô 9), người bán là Sale phụ trách
 *  ngành. Người dùng SỬA một bản nháp chứ không GÕ một tờ giấy trắng — đó là
 *  khác biệt giữa một phiếu mất hai phút và một phiếu bị bỏ dở.
 *
 *  Ngày đóng dự kiến: 45 ngày kể từ lát cắt đóng băng. Không dùng `Date.now()`
 *  — kịch bản đóng băng thì hai lần mở form phải ra đúng một ngày.
 *
 *  `taken` đi thẳng xuống `nextOpportunityCode`: màn phải nói ra những mã đã
 *  cấp trong phiên này, nếu không hai lần đổi ra hai đơn trùng mã.
 *
 *  ------------------------------------------------------------------
 *  NHẬN HỒ SƠ, KHÔNG SINH HỒ SƠ — sửa 28/08
 *  ------------------------------------------------------------------
 *  Bản cũ nhận `Lead` rồi tự gọi `leadProfile(lead)` bên trong. Đó là hàm SINH
 *  của fixture: nó tra mã nguồn trong `SOURCES` và **ném** khi không thấy, nên
 *  mọi lead của sổ thật (`SR-…`, và cả dải nhập từ Apollo `LD-0201…`) làm vỡ
 *  màn hồ sơ ngay lúc dựng phiếu — `ConvertDialog` nằm trong cây kể cả khi
 *  chưa mở. Nó còn nặn ra người liên hệ, mã số thuế, địa chỉ từ chính mã lead.
 *
 *  Nên hồ sơ đi VÀO bằng tham số. Cùng một đường mà `nextActions` đã đi với
 *  `contact`: chỗ nào có hồ sơ thật thì đưa hồ sơ thật, không hàm sinh nào
 *  đứng giữa. `Lead` rụng khỏi chữ ký vì bốn thứ hàm này cần ở đó — tên công
 *  ty, ngành, người giữ, mã đơn — đều đã nằm sẵn trong cụm "Sổ sách" của
 *  `LeadProfile`; giữ cả hai tham số là mời hai nguồn sự thật cho một lead.
 *
 *  Đồng tiền lùi về VND khi hồ sơ chưa ghi: hợp đồng buộc tiền và đồng tiền
 *  đi cùng nhau, nên vắng đồng tiền nghĩa là chưa có khoản tiền nào cả —
 *  `amount` vẫn `null`, không con số nào bị gán nhãn sai. Đây là giá trị mở
 *  sẵn của một Ô CHỌN người dùng sắp sửa, không phải một dữ kiện khai thay. */
export function draftOpportunity(
  profile: LeadProfile,
  actors: readonly Actor[],
  taken: readonly string[] = [],
): OpportunityDraft {
  const saleName = profile.owner !== '' ? profile.owner : saleOfCategory(profile.category)
  const idOf = (name: string | undefined) => actors.find((a) => a.name === name)?.id
  const sale = idOf(saleName)
  const bd = profile.bdOwner !== '' ? idOf(profile.bdOwner) : undefined
  const account =
    profile.dealCode !== ''
      ? dasVina.graph.story(profile.dealCode).find((o) => o.kind === 'AC')
      : undefined

  return {
    code: nextOpportunityCode(taken),
    name: profile.mainProduct
      ? `${profile.company} · ${profile.mainProduct}`
      : `${profile.company} · chưa chốt phạm vi`,
    account: profile.company,
    accountCode: account?.code ?? '',
    closedDate: dayISO(DAY_FROZEN + 45).slice(0, 10),
    state: 'gui-quotation',
    amount: profile.budget,
    currency: CURRENCIES.some((c) => c.code === profile.currency) ? profile.currency : 'VND',
    saleOwners: sale ? [sale] : [],
    bdOwners: bd ? [bd] : [],
    description: profile.pain,
    attachments: [],
    lossReason: '',
    lossNote: '',
  }
}

// ---------------------------------------------------------------------------
// Định danh người trong công ty
// ---------------------------------------------------------------------------

/** Tên miền thư của Pebble Vina. Một chỗ, vì nó xuất hiện ở mọi màn có tên
 *  người bên mình. */
export const COMPANY_DOMAIN = 'pebblevina.com'

/** Mã nhân viên: tên gọi + chữ đầu của các chữ đứng trước.
 *
 *  "Đỗ Quang Huy" → `huydq`. Đây là quy ước đặt hòm thư của công ty Việt Nam,
 *  không phải một cách viết tắt tự nghĩ ra: tên gọi đứng trước vì đó là thứ
 *  người ta gọi nhau, họ và tên đệm rút thành chữ cái để phân biệt hai người
 *  trùng tên.
 *
 *  Bỏ dấu bằng `deburr` — hòm thư không mang dấu tiếng Việt. */
export function staffHandle(name: string): string {
  const parts = deburr(name).toLowerCase().split(/\s+/).filter(Boolean)
  const given = parts[parts.length - 1] ?? ''
  const initials = parts
    .slice(0, -1)
    .map((p) => p.slice(0, 1))
    .join('')
  return `${given}${initials}`
}

/** Hòm thư công ty của một người bên mình.
 *
 *  Dùng nó ở MỌI cột "ai đang giữ": tên hiển thị đọc đẹp nhưng trùng được, còn
 *  hòm thư là khoá thật của một con người trong hệ. Khi có backend thì trường
 *  này đến từ hệ nhân sự chứ không suy từ tên — đổi thân hàm, chỗ gọi giữ nguyên. */
export function staffEmail(name: string): string {
  return `${staffHandle(name)}@${COMPANY_DOMAIN}`
}
