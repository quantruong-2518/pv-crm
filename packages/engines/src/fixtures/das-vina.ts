import { loadScenario, type Scenario } from './scenario'

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

  actors: [
    {
      id: 'u-ha',
      name: 'Trần Thu Hà',
      role: 'Trưởng phòng Kinh doanh',
      branches: ['One', 'Sales'],
    },
    { id: 'u-chau', name: 'Vũ Minh Châu', role: 'Marketing', branches: ['One', 'Sales'] },
    { id: 'u-nam', name: 'Lê Hoàng Nam', role: 'BD', branches: ['One', 'Sales'] },
    {
      id: 'u-huy',
      name: 'Đỗ Quang Huy',
      role: 'Sale · chip',
      branches: ['One', 'Sales'],
      ownOnly: true,
    },
    {
      id: 'u-binh',
      name: 'Đặng Thanh Bình',
      role: 'Sale · cơ khí, ô tô',
      branches: ['One', 'Sales'],
      ownOnly: true,
    },
    {
      id: 'u-linh',
      name: 'Nguyễn Khánh Linh',
      role: 'Sale · dược',
      branches: ['One', 'Sales'],
      ownOnly: true,
    },
    { id: 'u-anh', name: 'Phạm Diệu Anh', role: 'Presales', branches: ['One', 'Sales'] },
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
 *  Sửa được ở module 5 · Cấu hình (mục 5.2), không sửa ở tầng màn. */
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
// bậc `co-hoi` là SQL — xem docs/kien-truc-san-pham.md, module 2 Lead.
// ---------------------------------------------------------------------------

export const FUNNEL = [
  { key: 'dau-moi', label: 'Đầu mối', count: 100 },
  { key: 'cong-ty-that', label: 'Công ty thật', count: 44 },
  { key: 'co-hoi', label: 'Cơ hội', count: 30 },
  { key: 'bao-gia', label: 'Báo giá', count: 19 },
  { key: 'cho-ky', label: 'Chờ ký', count: 11 },
  { key: 'hop-dong', label: 'Hợp đồng', count: 6 },
] as const

/** SÁU lý do ra khỏi luồng. Không có lý do thứ bảy, không có ô "khác".
 *  Sửa được ở module 5 · Cấu hình (mục 5.4) — nhưng vẫn là danh sách ĐÓNG.
 *
 *  SỬA 19/08 · tổng 94 → 52. Bản cũ ghi "tổng đúng bằng 100 đầu mối trừ 6 hợp
 *  đồng", tức quên mất 10 đơn ĐANG MỞ của `OPEN_DEALS` và 32 lead còn sống ở
 *  hai bậc đầu — chúng chưa rơi mà cũng chưa ký. Phép cân đúng:
 *
 *      100 đầu mối = 6 đã ký + 42 đang chạy + 52 đã ra khỏi luồng
 *
 *  Thứ tự sáu lý do giữ nguyên (docs/kien-truc-san-pham.md · "Phép cân của sổ lead"). */
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
// (docs/kien-truc-san-pham.md · "Hoa hồng và công trạng").
// ---------------------------------------------------------------------------

/** Hoa hồng chỉ chia được khi có đơn ký. Đơn đổi tay giữa hai Sale thì chia lại
 *  phần chốt theo số lần chạm; phần của BD không đụng tới. */
export const COMMISSION_SPLIT = { moCua: 30, chot: 60, diCungDemo: 10 } as const

/** Công trạng ghi ở MỌI lần chạm, kể cả khi chưa có đơn — mỗi vai đo bằng đúng
 *  thứ vai đó làm. Sửa được ở module 5 · Cấu hình (mục 5.6). */
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
// Sổ lead — module 2 (docs/kien-truc-san-pham.md · "Năm module Pebble Sales").
// ---------------------------------------------------------------------------

/** Bốn ngành của phòng, lấy đúng từ vai đã chốt của ba Sale ở `actors`:
 *  Huy chip · Bình cơ khí + ô tô · Linh dược. Không có ngành thứ năm.
 *  Sửa được ở module 5 · Cấu hình (mục 5.3). */
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
 *  Ô nào bắt buộc là CẤU HÌNH (module 5 · mục 5.1), bảng này là mặc định. */
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
// Sửa được ở module 5 · Cấu hình (mục 5.6, cùng chỗ với CREDIT_RULES).
// ---------------------------------------------------------------------------

/** BA LỚP KPI của tài liệu (§2 · "Tách 3 lớp KPI thay vì 1 lớp").
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
        snapshot: true,
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
        monthlyTarget: 0.75,
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
  { key: 'mkt-bd', label: 'Marketing → BD', note: 'lead vào sổ → BD chạm lần đầu', targetDays: 5 },
  { key: 'bd-sale', label: 'BD → Sale', note: 'lên MQL → vào sổ cơ hội', targetDays: 6 },
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
  /** Chi phí đã tiêu, đồng. Dùng cho công trạng Marketing (giá mỗi lead tốt). */
  cost: number
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
    waves: [
      {
        no: 1,
        label: 'Mở màn — thư giới thiệu',
        channel: 'email',
        day: 11,
        sent: 1_200,
        opened: 384,
        replied: 41,
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
    waves: [
      {
        no: 1,
        label: 'Bài dài — vì sao nhà máy chip cần MES',
        channel: 'linkedin',
        day: 33,
        sent: 8_400,
        opened: 512,
        replied: 63,
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
    waves: [
      {
        no: 1,
        label: 'Hỏi thăm — có gì đổi không',
        channel: 'email',
        day: 19,
        sent: 310,
        opened: 118,
        replied: 17,
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
    waves: [],
  },
]

const sourceByCode = new Map(SOURCES.map((s) => [s.code, s]))

// ---------------------------------------------------------------------------
// 100 dòng sổ lead. Đây là toàn bộ kỳ 01/05 → 17/08, không phải một trang.
// ---------------------------------------------------------------------------

export type LeadEventKind =
  | 'vao-so'
  | 'cham'
  | 'dien-o'
  | 'giao'
  | 'len-bac'
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

/** Dựng timeline của một lead từ chính các trường của nó — không bịa thêm mốc
 *  nào ngoài những gì dòng đã nói. Cùng một dòng luôn ra cùng một chuỗi. */
function buildHistory(lead: Omit<Lead, 'history'>, bornDay: number): LeadEvent[] {
  const src = sourceByCode.get(lead.source)
  const out: LeadEvent[] = []
  const push = (day: number, kind: LeadEventKind, by: string, note: string) =>
    out.push({ at: dayISO(Math.min(day, DAY_FROZEN)), kind, by, note })

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

function buildBook(): Lead[] {
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

    return { ...base, history: buildHistory(base, Math.max(bornDay, 0)) }
  })
}

/** 100 dòng — đúng bậc `dau-moi` của phễu. Không phải một trang, là cả kỳ. */
export const LEADS: Lead[] = buildBook()

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

/** Số của một nguồn nhìn từ sổ lead — đây là cách module 1 đo bằng LEAD, không
 *  đo bằng lượt xem. "Lead tốt" = lead đã qua cổng init data. */
export function sourceStats(code: string) {
  const src = sourceByCode.get(code)
  const mine = LEADS.filter((l) => l.source === code)
  const good = mine.filter((l) => l.requiredFilled >= REQUIRED_SLOTS)
  const signed = mine.filter((l) => l.contractCode)
  const cost = src?.cost ?? 0

  return {
    source: src,
    leads: mine.length,
    good: good.length,
    signed: signed.length,
    running: mine.filter(isRunning).length,
    cost,
    /** Giá mỗi lead tốt, đồng. 0 lead tốt thì trả `null` — không chia cho 0. */
    costPerGood: good.length > 0 ? Math.round(cost / good.length) : null,
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
export function leadContact(lead: Lead): LeadContact | null {
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
export function leadOrigin(lead: Lead): LeadOrigin {
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
// Transcript — NGÔN NGỮ LƯU LÀ TIẾNG ANH (docs/kien-truc-san-pham.md ·
// "Transcript"). Giao diện vẫn tiếng Việt; transcript là dữ liệu lưu, không
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
const REPLY: Record<QuestionKey, (l: Lead, category: string) => string> = {
  'phap-nhan': (l) => `${l.company} JSC. The plant is in ${l.province}; I will send the tax code.`,
  nganh: (_l, c) => `${c}. One main line, plus a smaller line we started this year.`,
  'quy-mo': (l) => `About ${400 + (seedOf(l.code) % 12) * 100} people on site. One plant for now.`,
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
export function leadTranscript(lead: Lead): TranscriptTurn[] {
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
const DIGEST: Record<QuestionKey, (l: Lead, category: string) => string> = {
  'phap-nhan': (l) => `${l.company} — pháp nhân đã xác minh, nhà máy đặt tại ${l.province}.`,
  nganh: (_l, c) => `Ngành ${c.toLowerCase()}; một dây chuyền chính, một dây mới mở trong năm.`,
  'quy-mo': (l) => `Khoảng ${400 + (seedOf(l.code) % 12) * 100} người tại chỗ, một nhà máy.`,
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
export function leadResearch(lead: Lead): LeadResearch {
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
 *  (module 5 · mục 5.3), không phải gợi ý. */
export function saleOfCategory(category: LeadCategory): string | undefined {
  return LEAD_CATEGORIES.find((c) => c.key === category)?.sale
}

// ---------------------------------------------------------------------------
// Mốc thời gian của một lead — nền của trục tháng · quý · năm ở module 3.
// ---------------------------------------------------------------------------

/** Kỳ dữ liệu của kịch bản: từ ngày đầu tới đúng lát cắt đã đóng băng.
 *  Bộ chọn kỳ của màn Performance không được vượt ra ngoài hai mốc này. */
export const DAS_VINA_PERIOD = { from: dayISO(0), to: DAS_VINA_FROZEN_AT } as const

/** Năm mốc đời của một lead, đọc từ chính `history` chứ không đoán thêm.
 *
 *  Đây là thứ cho phép cắt sổ lead theo tháng/quý/năm mà không đẻ ra con số
 *  nào: mỗi mốc là một sự kiện ĐÃ CÓ NGÀY trong kịch bản. Cộng cả kỳ thì bốn
 *  mốc `vaoSo · mql · sql · ky` ra đúng bốn bậc 100 · 44 · 30 · 6 của `FUNNEL`
 *  — `scenario.test.ts` khoá đẳng thức đó.
 *
 *  `bdCham` là lần BD đặt tay vào lead (mốc `dien-o` do BD ghi). Nó KHÁC "lead
 *  BD đang giữ": lead lên SQL thì đổi chủ sang Sale, nhưng công trạng của BD
 *  vẫn nằm ở lần chạm đó (docs · "Hoa hồng và công trạng"). */
export type LeadMilestones = {
  /** Ngày vào sổ. Lead nào cũng có. */
  vaoSo: string
  /** Lên bậc MQL — Marketing xác minh công ty có thật. */
  mql?: string
  /** Vào sổ cơ hội, tức lên bậc SQL. */
  sql?: string
  ky?: string
  roi?: string
  bdCham?: string
}

export function leadMilestones(lead: Lead): LeadMilestones {
  const at = (kind: LeadEventKind, by?: string) =>
    lead.history.find((e) => e.kind === kind && (by === undefined || e.by === by))?.at

  return {
    vaoSo: lead.createdAt,
    /* `len-bac` xuất hiện hai lần: lên MQL rồi qua cổng init data. Lấy cái ĐẦU
       tiên — cái thứ hai đã có mốc riêng là `vao-pipeline`. */
    mql: at('len-bac'),
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
