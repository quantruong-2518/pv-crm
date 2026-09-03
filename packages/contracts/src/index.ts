/** @pv/contracts — hợp đồng dữ liệu giữa app web và máy chủ.
 *
 *  zod là NGUỒN KIỂU DUY NHẤT (quyết định #4, `docs/ban-giao-backend.md`):
 *  kiểu TypeScript suy ra bằng `z.infer`, không có bản mô hình thứ hai. Cùng
 *  một schema làm ba việc — kiểm dữ liệu vào ở máy chủ, cho kiểu handler, và
 *  sinh tài liệu OpenAPI.
 *
 *  Gói này KHÔNG biết React, KHÔNG biết Nest, KHÔNG biết Drizzle. Nó chỉ mô tả
 *  hình dữ liệu đi qua dây — đó là điều kiện để cả hai đầu cùng đọc được nó. */

/** The schema TYPE, re-exported so the web app can hold one without depending
 *  on zod itself.
 *
 *  `apps/web` deliberately does not list zod: a screen that can import zod is a
 *  screen that can declare its own shape for a wire the server already
 *  describes, and then there are two answers to what a row looks like. What the
 *  web genuinely needs is the ability to PASS one of these schemas to
 *  `api.read` for validation at the boundary — a reference, never an author. */
export type { ZodType } from 'zod'

export * from './primitives'
export * from './problem'
export * from './auth'
export * from './pagination'
export * from './sales'
