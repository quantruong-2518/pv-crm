/** @pv/contracts — hợp đồng dữ liệu giữa app web và máy chủ.
 *
 *  zod là NGUỒN KIỂU DUY NHẤT (quyết định #4, `docs/ban-giao-backend.md`):
 *  kiểu TypeScript suy ra bằng `z.infer`, không có bản mô hình thứ hai. Cùng
 *  một schema làm ba việc — kiểm dữ liệu vào ở máy chủ, cho kiểu handler, và
 *  sinh tài liệu OpenAPI.
 *
 *  Gói này KHÔNG biết React, KHÔNG biết Nest, KHÔNG biết Drizzle. Nó chỉ mô tả
 *  hình dữ liệu đi qua dây — đó là điều kiện để cả hai đầu cùng đọc được nó. */

export * from './primitives'
export * from './problem'
export * from './pagination'
export * from './sales'
