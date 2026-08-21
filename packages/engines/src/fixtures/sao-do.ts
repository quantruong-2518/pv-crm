import { loadScenario, type Scenario } from './scenario'

/** KỊCH BẢN 1 · Đơn hàng Sao Đỏ — khách ĐÃ MUA. Dùng cho màn One 01–05.
 *
 *  Đóng băng tại 10/08 · 07:58.
 *  Hai lát cắt ngoại lệ: màn ký hợp đồng ở 21/07 · 16:20 (nguồn gốc của
 *  SO-0891), và thẻ chạm khách ở 10/08 · 09:38.
 *
 *  Đầu mối bên Sao Đỏ chỉ có MỘT người: Nguyễn Văn Đạt · Phó giám đốc kỹ thuật.
 *  Không bịa thêm người, không bịa thêm số. */
export const SAO_DO_FROZEN_AT = '2026-08-10T07:58:00+07:00'
export const SAO_DO_SIGNED_AT = '2026-07-21T16:20:00+07:00'
export const SAO_DO_CALL_CARD_AT = '2026-08-10T09:38:00+07:00'

const scenario: Scenario = {
  id: 'sao-do',
  name: 'Đơn hàng Sao Đỏ',
  frozenAt: SAO_DO_FROZEN_AT,

  objects: [
    {
      code: 'LD-0334',
      kind: 'LD',
      branch: 'Sales',
      label: 'Sao Đỏ — đầu mối 8/7',
      state: 'đã chuyển',
    },
    { code: 'BG-0512', kind: 'BG', branch: 'Sales', label: 'Báo giá gia hạn', state: 'im 6 ngày' },
    {
      code: 'HĐ-2607',
      kind: 'HĐ',
      branch: 'Sales',
      label: 'Hợp đồng Sao Đỏ',
      owner: 'Đỗ Quang Huy',
      state: 'đã ký',
      amount: 1_840_000_000,
    },
    {
      code: 'SO-0891',
      kind: 'SO',
      branch: 'Supply',
      label: 'Đơn bán Sao Đỏ',
      state: 'trễ 2 ngày',
      amount: 1_840_000_000,
    },
    { code: 'WO-1180', kind: 'WO', branch: 'Factory', label: 'Lệnh sản xuất', state: '68%' },
    {
      code: 'PR-0231',
      kind: 'PR',
      branch: 'Factory',
      label: 'Yêu cầu mua thép Ø40',
      state: 'đã duyệt',
    },
    {
      code: 'PO-0455',
      kind: 'PO',
      branch: 'Supply',
      label: 'Nam Việt Steel · 500 kg thép Ø40 · kho K1-A2',
      state: 'chờ duyệt',
      amount: 128_500_000,
    },
    { code: 'L-2608-042', kind: 'L', branch: 'Supply', label: 'Lô nhập kho', state: 'chưa về' },
    {
      code: 'CNC-03',
      kind: 'CNC',
      branch: 'Factory',
      label: 'Máy CNC-03 · xưởng X1',
      state: 'lỗi E-214',
    },
    {
      code: 'BT-0310',
      kind: 'BT',
      branch: 'Factory',
      label: 'Lệnh bảo trì CNC-03',
      owner: 'Hải',
      state: 'chưa nhận',
    },
  ],

  // Chuỗi chính là thứ ContextRail vẽ ra:
  // HĐ-2607 → SO-0891 → WO-1180 → PO-0455 → L-2608-042
  edges: [
    { from: 'LD-0334', to: 'HĐ-2607', kind: 'sinh-ra' },
    { from: 'HĐ-2607', to: 'SO-0891', kind: 'sinh-ra' },
    { from: 'SO-0891', to: 'WO-1180', kind: 'sinh-ra' },
    { from: 'WO-1180', to: 'PR-0231', kind: 'sinh-ra' },
    { from: 'WO-1180', to: 'PO-0455', kind: 'chờ' },
    { from: 'PO-0455', to: 'L-2608-042', kind: 'sinh-ra' },
    { from: 'CNC-03', to: 'BT-0310', kind: 'sinh-ra' },
  ],

  actors: [
    {
      id: 'u-thang',
      name: 'Nguyễn Văn Thắng',
      role: 'Giám đốc',
      branches: ['One', 'Sales', 'Supply', 'Factory', 'Finance'],
    },
    {
      id: 'u-ha',
      name: 'Trần Thu Hà',
      role: 'Trưởng phòng Kinh doanh',
      branches: ['One', 'Sales'],
    },
    {
      id: 'u-huy',
      name: 'Đỗ Quang Huy',
      role: 'Sale · ngành chip',
      branches: ['One', 'Sales'],
      ownOnly: true,
    },
  ],
}

export const saoDo = loadScenario(scenario)

// ---------------------------------------------------------------------------
// Phần dưới đây cứu ra từ AGENTS.md §6 ("Dữ liệu demo — đóng băng tại 10 Aug,
// 07:58") trước khi project/ bị xoá. Để ở đây thay vì trong tài liệu vì đây là
// thứ màn thật sẽ đọc, và vì có test khoá thì không ai sửa lệch được.
// KHÔNG BỊA SỐ MỚI: mọi seed/mock dùng đúng bộ này.
// ---------------------------------------------------------------------------

/** Công ty dùng hệ, và người đang nhìn màn. */
export const SAO_DO_TENANT = {
  company: 'Thắng Lợi Engineering',
  user: 'Nguyễn Văn Thắng',
  role: 'Giám đốc',
} as const

/** Khách hàng của câu chuyện. Đầu mối bên khách chỉ có MỘT người. */
export const SAO_DO_CUSTOMER = {
  name: 'Sao Đỏ Engineering',
  contact: 'Nguyễn Văn Đạt',
  contactRole: 'Phó giám đốc kỹ thuật',
  openDeals: 2,
  overdue: 0,
  documents: 14,
} as const

export type Kpi = {
  key: string
  label: string
  /** Tiền tính bằng đồng; tỉ lệ tính bằng phần thập phân (0.86 = 86%). */
  value: number
  deltaPct?: number
  target?: number
  invoices?: number
}

/** Bốn KPI của Trang chủ. Trường bỏ trống nghĩa là KPI đó không có mục đó. */
export const SAO_DO_KPI: Kpi[] = [
  { key: 'doanh-thu', label: 'Doanh thu tháng 8', value: 4_200_000_000, deltaPct: 0.12 },
  { key: 'dung-han', label: 'Giao đúng hạn', value: 0.86, target: 0.9 },
  { key: 'qua-han', label: 'Công nợ quá hạn', value: 890_000_000, invoices: 2 },
  { key: 'oee', label: 'Hiệu suất thiết bị · xưởng X1', value: 0.914 },
]

/** Ba báo giá vật tư cho PO-0455. Nam Việt Steel là bên được chọn. */
export const SAO_DO_QUOTES = [
  { vendor: 'Nam Việt Steel', amount: 128_500_000, leadTimeDays: 2, chosen: true },
  { vendor: 'Hưng Long', amount: 131_200_000, leadTimeDays: 1, chosen: false },
  { vendor: 'Toàn Phát', amount: 127_900_000, leadTimeDays: 5, chosen: false },
] as const

/** Công nợ quá hạn — cộng lại đúng 890 tr của KPI thứ ba. */
export const SAO_DO_RECEIVABLES = [
  { customer: 'Minh Quang', amount: 520_000_000, overdueDays: 12 },
  { customer: 'Trường Thịnh', amount: 370_000_000, overdueDays: 0 },
] as const

/** Người bên Thắng Lợi xuất hiện trên màn One 01–05. */
export const SAO_DO_PEOPLE = [
  { name: 'Lê Minh Đức', role: 'Trưởng phòng Kế hoạch' },
  { name: 'Trần Thu Hà', role: 'Trưởng phòng Kinh doanh' },
  { name: 'Phạm Thị Mai', role: 'Kế toán trưởng' },
  { name: 'Nguyễn Văn Tú', role: 'Nhân viên' },
  { name: 'Vũ Văn Nam', role: 'Nhân viên' },
] as const

/** Mốc thời gian của ngày 10/08 — thứ tự sự kiện trên năm màn One. */
export const SAO_DO_TIMELINE = [
  { at: '07:58', what: 'Morning brief' },
  { at: '08:03', what: 'Trợ lý AI đề xuất' },
  { at: '08:21', what: 'CNC-03 dừng' },
  { at: '08:40', what: 'Duyệt bước 1' },
  { at: '09:12', what: 'Đã duyệt' },
  { at: '09:40', what: 'Tìm toàn cục' },
  { at: '16:30', what: 'Sửa quy tắc thông báo' },
] as const
