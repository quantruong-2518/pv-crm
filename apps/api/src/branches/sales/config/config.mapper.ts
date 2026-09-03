import type { ConfigBundle, ConfigEntry, ConfigUsage } from '@pv/contracts'
import type { UsageTally } from './config.repository'
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
/** The three flat columns of the merged tally query -> the `ConfigUsage` shape.
 *
 *  All six tally tables are built EMPTY first, for the same reason `toBundle`
 *  builds six empty lists: `CHANNEL` has no branch in the SQL and must come out
 *  as `{}` rather than absent. The two scalars default to `0` because
 *  `count(*)` over an empty table still returns one `0` row — the default here
 *  only covers the query changing shape.
 *
 *  An unknown `bucket` is dropped SILENTLY: this is a mapper, not a gate. The
 *  contract stands immediately behind it at `service.bundle()`, and
 *  `ConfigBundle.parse` is where a wrong shape is supposed to blow up. */
export function toUsage(tallies: UsageTally[]): ConfigUsage {
  const usage: ConfigUsage = {
    STAGE: {},
    TIER: {},
    CATEGORY: {},
    EXIT_REASON: {},
    CHANNEL: {},
    SOURCE: {},
    PRODUCT: {},
    LOSS_REASON: {},
    slots: {},
    roles: {},
    signedDeals: 0,
    earlyStageLeads: 0,
  }

  for (const { bucket, key, n } of tallies) {
    if (bucket === 'signedDeals') usage.signedDeals = n
    else if (bucket === 'earlyStageLeads') usage.earlyStageLeads = n
    else if (bucket in usage)
      (usage[bucket as keyof ConfigUsage] as Record<string, number>)[key] = n
  }

  return usage
}

export function toBundle(rows: ConfigRowDb[], usage: ConfigUsage): ConfigBundle {
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
    PRODUCT: [],
    LOSS_REASON: [],
    usage,
  }
  for (const row of rows) bundle[row.list].push(toContract(row))
  return bundle
}
