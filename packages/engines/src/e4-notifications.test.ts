import { describe, expect, it } from 'vitest'
import { createNotificationBus, type NotificationRule } from './e4-notifications'
import type { ObjectRef } from './types'

const SO: ObjectRef = { code: 'SO-0891', kind: 'SO', branch: 'Supply', label: 'Đơn bán Sao Đỏ' }

const rules: NotificationRule[] = [
  {
    id: 'R-01',
    event: 'đơn-trễ-hạn',
    channel: 'zalo-oa',
    timing: 'ngay',
    role: 'Giám đốc',
    to: 'Nguyễn Văn Thắng',
  },
  {
    id: 'R-02',
    event: 'đơn-trễ-hạn',
    when: (e) => (e.data?.days as number) > 3,
    channel: 'email',
    timing: '08:00 hằng ngày',
    role: 'TP Mua hàng',
    to: 'Trần Thu Hà',
  },
]

describe('E4 · thông báo đa kênh', () => {
  it('nhánh chỉ phát sự kiện — kênh do quy tắc quyết, không do nhánh chọn', () => {
    const bus = createNotificationBus(rules)
    const out = bus.emit({
      name: 'đơn-trễ-hạn',
      at: '2026-08-10T07:58:00+07:00',
      ref: SO,
      data: { days: 2 },
    })

    expect(out).toHaveLength(1) // R-02 không khớp điều kiện days > 3
    expect(out[0]?.channel).toBe('zalo-oa')
  })

  it('gửi trùng trong cửa sổ chống trùng thì bị chặn, và LƯU LẠI dòng bị chặn', () => {
    // Màn 05 cần đúng một dòng "Blocked (duplicate)" trong nhật ký gửi
    // (docs/luat-thiet-ke.md §7). Dòng đó sinh ra ở đây, không phải mock trên màn.
    const bus = createNotificationBus(rules)
    bus.emit({ name: 'đơn-trễ-hạn', at: '2026-08-10T07:58:00+07:00', ref: SO })
    const again = bus.emit({ name: 'đơn-trễ-hạn', at: '2026-08-10T08:04:00+07:00', ref: SO })

    expect(again[0]?.state).toBe('blocked-duplicate')
    expect(bus.deliveries().filter((d) => d.state === 'blocked-duplicate')).toHaveLength(1)
    expect(bus.deliveries()).toHaveLength(2)
  })

  it('ngoài cửa sổ chống trùng thì gửi lại bình thường', () => {
    const bus = createNotificationBus(rules, { dedupeWindowMs: 60_000 })
    bus.emit({ name: 'đơn-trễ-hạn', at: '2026-08-10T07:58:00+07:00', ref: SO })
    const later = bus.emit({ name: 'đơn-trễ-hạn', at: '2026-08-10T08:30:00+07:00', ref: SO })

    expect(later[0]?.state).toBe('sent')
  })

  it('object khác thì không tính là trùng', () => {
    const bus = createNotificationBus(rules)
    bus.emit({ name: 'đơn-trễ-hạn', at: '2026-08-10T07:58:00+07:00', ref: SO })
    const other = bus.emit({
      name: 'đơn-trễ-hạn',
      at: '2026-08-10T07:59:00+07:00',
      ref: { ...SO, code: 'SO-0892' },
    })

    expect(other[0]?.state).toBe('sent')
  })
})
