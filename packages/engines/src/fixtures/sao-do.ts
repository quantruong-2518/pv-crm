import { loadScenario, type Scenario } from './scenario'

/** KỊCH BẢN 1 · Đơn hàng Sao Đỏ — khách ĐÃ MUA. Dùng cho màn One 01–05.
 *
 *  Đóng băng tại 10/08 · 07:58 (CLAUDE.md · "Kịch bản dữ liệu").
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
      label: 'Đơn mua thép Ø40',
      state: 'chờ duyệt',
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
