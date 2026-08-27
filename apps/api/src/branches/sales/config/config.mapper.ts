import type { ConfigBundle, ConfigEntry } from '@pv/contracts'
import type { ConfigRowDb } from './config.schema'

/** Hàng trong bảng ↔ dòng trong hợp đồng. Chỗ DUY NHẤT biết cả hai hình.
 *
 *  Tường minh chứ không trả thẳng hàng Drizzle ra ngoài — cùng lý do đã ghi ở
 *  `lead.mapper.ts`: thêm một cột vào bảng thì cột đó lộ ra API mà không ai
 *  quyết định, đổi tên một cột thì hợp đồng vỡ lặng lẽ. Ở đây `tsc` bắt cả hai.
 *
 *  CHÚ Ý `limitDays`: kiểm bằng `=== null`, KHÔNG bằng tính đúng-sai của giá
 *  trị. `0` là một hạn hợp lệ ("cột này phải qua trong ngày") và nó rơi mất nếu
 *  viết `row.limitDays ? … : {}`. Ba trường tuỳ chọn còn lại là chuỗi, mà chuỗi
 *  rỗng đã bị `CHECK config_name_not_blank` và tầng chuẩn hoá chặn từ trước, nên
 *  chúng dùng phép kiểm gọn được. */
export function toContract(row: ConfigRowDb): ConfigEntry {
  return {
    id: row.id,
    list: row.list,
    name: row.name,
    ord: row.ord,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    ...(row.limitDays === null ? {} : { limitDays: row.limitDays }),
    ...(row.ownerId ? { ownerId: row.ownerId } : {}),
    ...(row.kind ? { kind: row.kind } : {}),
  }
}

/** Một mảng hàng đã sắp thứ tự → sáu danh mục.
 *
 *  Dựng sẵn sáu ô RỖNG trước khi đổ dữ liệu vào: danh mục chưa có dòng nào vẫn
 *  phải trả về `[]`, không phải vắng mặt. Màn phân biệt được "chưa ai nhập gì"
 *  với "trường này không tồn tại" chỉ khi máy chủ phân biệt trước. */
export function toBundle(rows: ConfigRowDb[]): ConfigBundle {
  /* Viết thẳng sáu khoá chứ không dựng bằng `Object.fromEntries(...)` rồi ép
     kiểu: phép ép đó nói dối `tsc`. Thêm danh mục thứ bảy vào hợp đồng mà quên
     chỗ này thì bản viết thẳng đỏ ngay lúc biên dịch, còn bản ép kiểu trả về
     `undefined` rồi nổ lúc chạy, ở dòng `push`. */
  const bundle: ConfigBundle = {
    STAGE: [],
    TIER: [],
    CATEGORY: [],
    EXIT_REASON: [],
    CHANNEL: [],
    SOURCE: [],
  }
  for (const row of rows) bundle[row.list].push(toContract(row))
  return bundle
}
