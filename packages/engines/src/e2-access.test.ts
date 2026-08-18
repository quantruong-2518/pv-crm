import { describe, expect, it } from 'vitest'
import { createAccessControl } from './e2-access'
import type { Actor, ObjectRef } from './types'

const ha: Actor = {
  id: 'u-ha',
  name: 'Trần Thu Hà',
  role: 'TP Kinh doanh',
  branches: ['One', 'Sales'],
}
const huy: Actor = {
  id: 'u-huy',
  name: 'Đỗ Quang Huy',
  role: 'Sale',
  branches: ['One', 'Sales'],
  ownOnly: true,
}

const items: { ref: ObjectRef }[] = [
  {
    ref: { code: 'OP-0288', kind: 'OP', branch: 'Sales', label: 'DAS Vina', owner: 'Đỗ Quang Huy' },
  },
  {
    ref: {
      code: 'OP-0295',
      kind: 'OP',
      branch: 'Sales',
      label: 'Minh Long',
      owner: 'Nguyễn Khánh Linh',
    },
  },
  { ref: { code: 'WO-1180', kind: 'WO', branch: 'Factory', label: 'Lệnh sản xuất' } },
]

describe('E2 · quyền & ghi vết', () => {
  it('trả về SỐ dòng bị ẩn, không chỉ danh sách đã lọc', () => {
    // Màn Tìm toàn cục bắt buộc có hàng "Bị ẩn theo quyền của bạn"
    // (docs/luat-thiet-ke.md §7 · màn 03). Con số đó phải do E2 đưa ra — nếu `visible` chỉ
    // trả danh sách, màn sẽ không có cách nào biết đã giấu bao nhiêu.
    const { visible, hidden } = createAccessControl().visible(huy, items)
    expect(visible.map((i) => i.ref.code)).toEqual(['OP-0288'])
    expect(hidden).toBe(2)
  })

  it('cùng danh sách, người khác vai thì thấy khác', () => {
    const e2 = createAccessControl()
    expect(e2.visible(ha, items).hidden).toBe(1) // Hà không có nhánh Factory
    expect(e2.visible(huy, items).hidden).toBe(2) // Huy chỉ thấy đơn mình giữ
  })

  it('ghi vết MỌI lần AI đọc, không phải chỉ hành động của người', () => {
    const e2 = createAccessControl({ clock: () => '2026-08-17T09:10:00+07:00' })
    const read = e2.aiRead(
      huy,
      items.map((i) => i.ref),
    )

    expect(read.map((r) => r.code)).toEqual(['OP-0288'])

    const trail = e2.trail()
    expect(trail).toHaveLength(1)
    expect(trail[0]).toMatchObject({
      action: 'ai-đọc',
      actorId: 'u-huy',
      code: 'OP-0288',
      at: '2026-08-17T09:10:00+07:00',
    })
  })

  it('AI bị chặn đúng bằng quyền của người đang dùng, không có cửa sau', () => {
    const e2 = createAccessControl()
    const read = e2.aiRead(
      huy,
      items.map((i) => i.ref),
    )
    expect(read.find((r) => r.code === 'WO-1180')).toBeUndefined()
  })
})
