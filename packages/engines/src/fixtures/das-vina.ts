import { loadScenario, type Scenario } from './scenario'

/** KỊCH BẢN 2 · DAS Vina — khách CHƯA MUA. Dùng cho cả bốn module Sales và mọi
 *  màn nói về *trước khi có hợp đồng*. Đóng băng tại 17/08 · 09:10.
 *
 *  Nhà máy đóng gói chip · Bắc Ninh · 1.400 người.
 *  AC-0142 → CT-0391 Kim Dae-ho (giám đốc nhà máy) → OP-0288 (bán Factory MES +
 *  One Plus) → BG-1077 · 4,2 tỷ/năm. Giám đốc bên Hàn Quốc ký cuối; trên 3 tỷ
 *  phải xin công ty mẹ. */
export const DAS_VINA_FROZEN_AT = '2026-08-17T09:10:00+07:00'

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

// ---------------------------------------------------------------------------
// Sổ 10 cơ hội đang mở — thuộc kịch bản 2, chốt 17/08.
// Dùng cho mọi màn cần nhiều đơn cùng lúc (module 2 Lead · module 3 Performance).
// Tổng 18,5 tỷ/năm · Huy 4 đơn · Bình 3 · Linh 3.
// ---------------------------------------------------------------------------

/** Năm cột của sổ. Số kèm theo là HẠN của cột, tính bằng ngày —
 *  quá hạn thì đơn tô cảnh báo. Không có cột thứ sáu. */
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

/** SÁU lý do ra khỏi luồng. Không có lý do thứ bảy, không có ô "khác"
 *  (docs/luat-thiet-ke.md). Tổng đúng bằng 100 đầu mối trừ 6 hợp đồng. */
export const EXIT_REASONS = [
  { label: 'Không gọi được ai', count: 38 },
  { label: 'Không phải khách của mình', count: 18 },
  { label: 'Năm nay không có tiền', count: 14 },
  { label: 'Người liên hệ nghỉ việc', count: 11 },
  { label: 'Khách chọn bên khác', count: 8 },
  { label: 'Im sau báo giá', count: 5 },
] as const

// ---------------------------------------------------------------------------
// Hoa hồng một đơn (docs/luat-thiet-ke.md). Đơn đổi tay giữa hai Sale thì chia lại phần
// chốt theo số lần chạm; phần của BD không đụng tới.
// ---------------------------------------------------------------------------
export const COMMISSION_SPLIT = { moCua: 30, chot: 60, diCungDemo: 10 } as const

// ---------------------------------------------------------------------------
// Sổ lead — module 2 (docs/kien-truc-san-pham.md · "Bốn module Pebble Sales").
//
// `LEADS` CỐ Ý ĐỂ RỖNG: khung màn dựng trước, dữ liệu mock đổ vào sau khi chốt.
// Mọi thứ khác trong khối này không phải số mới — nó là FUNNEL và bảng vai đã
// chốt, nhìn dưới góc một sổ lead.
// ---------------------------------------------------------------------------

/** Bốn ngành của phòng, lấy đúng từ vai đã chốt của ba Sale ở `actors`:
 *  Huy chip · Bình cơ khí + ô tô · Linh dược. Không có ngành thứ năm. */
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

/** Bộ 10 câu. Đủ 10/10 mới thành init data — điều kiện DUY NHẤT để dắt lead
 *  thành cơ hội thật, và là cổng của bậc SQL (docs/kien-truc-san-pham.md). */
export const INIT_DATA_SLOTS = 10

export type ExitReason = (typeof EXIT_REASONS)[number]['label']

export type Lead = {
  code: string
  company: string
  province: string
  category: LeadCategory
  tier: LeadTier
  /** Số ô của bộ 10 câu đã điền. Bậc `sql` bắt buộc bằng `INIT_DATA_SLOTS`. */
  answered: number
  /** Ai đang giữ. Bỏ trống = còn ở kho chung, chưa ai nhận. */
  owner?: string
  /** Bậc SQL thì đã vào sổ cơ hội, nằm ở một cột của `PIPELINE_STAGES`. */
  stage?: StageKey
  /** Số ngày nằm ở chỗ hiện tại. */
  daysHere: number
  /** Có giá trị = đã ra khỏi luồng. Phải là một trong SÁU lý do EXIT_REASONS. */
  exitReason?: ExitReason
}

/** CỐ Ý RỖNG — xem ghi chú đầu khối.
 *
 *  Lúc đổ dữ liệu vào: số dòng phải cân với `FUNNEL` (100 đầu mối, 44 từ MQL
 *  trở lên, 30 từ SQL trở lên) và với `EXIT_REASONS` (94 dòng có `exitReason`).
 *  `scenario.test.ts` đã có sẵn phép cân đối 94 + 6 = 100 để bắt lệch. */
export const LEADS: Lead[] = []

/** Quá SLA = nằm ở cột hiện tại lâu hơn hạn của cột.
 *
 *  CHỈ bậc SQL mới có hạn, vì hạn nằm ở `PIPELINE_STAGES` mà đầu mối và MQL
 *  thì chưa vào pipeline. Ngưỡng cho hai bậc đó chưa ai đặt — nợ treo, ghi ở
 *  docs/kien-truc-san-pham.md · "Nợ đang treo". Đừng tự chế ngưỡng ở tầng màn. */
export function isOverSla(lead: Lead): boolean {
  if (!lead.stage) return false
  return lead.daysHere > (stageLimit.get(lead.stage) ?? Infinity)
}

/** Cổng MQL → SQL của hành động giao/nhận lead.
 *
 *  Chưa đủ 10/10 ô thì không được nhận vào pipeline, và agent 2 không chạy —
 *  dựng phiếu tiếp cận trên dữ liệu thiếu sẽ ra lời khuyên sai. Trả luôn câu
 *  từ chối để màn hiện đúng chữ, không tự chế. */
export function canPromoteToSql(lead: Lead): { ok: boolean; reason?: string } {
  if (lead.tier === 'sql') return { ok: false, reason: 'Lead đã ở bậc SQL' }
  if (lead.answered < INIT_DATA_SLOTS) {
    return { ok: false, reason: `Còn thiếu ${INIT_DATA_SLOTS - lead.answered} ô của bộ 10 câu` }
  }
  return { ok: true }
}
