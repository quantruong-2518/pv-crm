import { loadScenario, type Scenario } from './scenario'

/** KỊCH BẢN 2 · DAS Vina — khách CHƯA MUA. Dùng cho màn Sales 06–12 và mọi màn
 *  nói về *trước khi có hợp đồng*. Đóng băng tại 17/08 · 09:10.
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
// Dùng cho mọi màn cần nhiều đơn cùng lúc (Sales 08).
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
// Phễu 01/05 → 17/08 (cũng thuộc kịch bản 2) — dùng cho Sales 10.
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
