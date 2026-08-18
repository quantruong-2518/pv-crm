import { systemClock, type Clock, type ObjectRef } from './types'

/** E4 · Thông báo đa kênh.
 *
 *  Giữ: quy tắc sự kiện → điều kiện → kênh (Zalo OA · Telegram · Email ·
 *  trong app), lịch gửi, chống trùng.
 *
 *  **Nhánh phát sự kiện, không tự gọi Zalo API.** Đây là lý do `emit` là hàm
 *  duy nhất nhánh được gọi — không có `sendZalo()` nào lộ ra ngoài. Màn 05
 *  (Thông báo & kênh) cần đúng một dòng `blocked-duplicate` trong nhật ký gửi
 *  (AGENTS.md §7); dòng đó sinh ra ở đây chứ không phải mock trên màn. */

export type Channel = 'zalo-oa' | 'telegram' | 'email' | 'in-app'

export type NotificationRule = {
  id: string
  /** Tên sự kiện nhánh phát, ví dụ 'đơn-trễ-hạn'. */
  event: string
  /** Điều kiện lọc. Bỏ trống = mọi sự kiện cùng tên. */
  when?: (payload: EventPayload) => boolean
  channel: Channel
  /** Mô tả nhịp gửi cho bảng quy tắc trên màn, ví dụ 'ngay' | '08:00 hằng ngày'. */
  timing: string
  /** Vai nhận. */
  role: string
  to: string
}

export type EventPayload = {
  name: string
  at: string
  ref?: ObjectRef
  data?: Record<string, unknown>
}

export type DeliveryState = 'sent' | 'blocked-duplicate'

export type Delivery = {
  at: string
  ruleId: string
  channel: Channel
  to: string
  event: string
  code?: string
  state: DeliveryState
}

export interface NotificationBus {
  /** Cửa duy nhất của nhánh. Trả về nhật ký gửi để màn hiện được ngay. */
  emit(event: EventPayload): Delivery[]
  rules(): NotificationRule[]
  deliveries(): Delivery[]
}

export function createNotificationBus(
  rules: NotificationRule[],
  opts: { clock?: Clock; dedupeWindowMs?: number } = {},
): NotificationBus {
  const clock = opts.clock ?? systemClock
  // Mặc định 15 phút: cùng một quy tắc, cùng người nhận, cùng object thì lần
  // thứ hai trong cửa sổ này bị chặn thay vì gửi trùng.
  const windowMs = opts.dedupeWindowMs ?? 15 * 60 * 1000
  const log: Delivery[] = []

  return {
    emit(event) {
      const at = event.at || clock()
      const matched = rules.filter((r) => r.event === event.name && (r.when?.(event) ?? true))

      const produced = matched.map<Delivery>((rule) => {
        const prior = log.find(
          (d) =>
            d.ruleId === rule.id &&
            d.to === rule.to &&
            d.code === event.ref?.code &&
            d.state === 'sent' &&
            Date.parse(at) - Date.parse(d.at) < windowMs,
        )
        return {
          at,
          ruleId: rule.id,
          channel: rule.channel,
          to: rule.to,
          event: event.name,
          code: event.ref?.code,
          state: prior ? 'blocked-duplicate' : 'sent',
        }
      })

      log.push(...produced)
      return produced
    },

    rules: () => [...rules],
    deliveries: () => [...log],
  }
}
