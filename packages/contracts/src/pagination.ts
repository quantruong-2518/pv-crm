import { z } from 'zod'

/** Phân trang — hình DUY NHẤT cho mọi sổ.
 *
 *  `coerce` vì query string luôn là chuỗi: `?page=2` tới tay handler là `'2'`.
 *  Ép ở tầng hợp đồng chứ không ép ở từng controller — ép ở controller thì
 *  controller thứ tư sẽ quên. */
export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(50),
})

export type PageQuery = z.infer<typeof PageQuery>

/** Vỏ của một trang.
 *
 *  `hidden` KHÔNG phải trường trang trí: đó là số dòng E2 cắt đi vì quyền.
 *  Luật 7 của `docs/luat-thiet-ke.md` bắt màn hiện "Bị ẩn theo quyền của bạn",
 *  và con số đó phải do máy chủ trả — màn không tự đếm được thứ nó không nhận. */
export const paged = <T extends z.ZodTypeAny>(row: T) =>
  z.object({
    rows: z.array(row),
    total: z.number().int().nonnegative(),
    hidden: z.number().int().nonnegative(),
  })
