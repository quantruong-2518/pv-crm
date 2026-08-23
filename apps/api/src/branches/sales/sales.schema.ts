import { pgSchema } from 'drizzle-orm/pg-core'

/** Schema Postgres của nhánh Sales.
 *
 *  Một nhánh một schema — đây là nửa "ở tầng dữ liệu" của luật ranh giới nhánh
 *  (nửa còn lại là `no-restricted-imports` ở tầng code). Bảng của Sales không
 *  bao giờ `JOIN` sang bảng của Supply/Factory/Finance; đọc chéo nhánh đi qua
 *  interface công khai của module, để ngày tách service chỉ phải đổi phần
 *  triển khai chứ không phải viết lại câu truy vấn. */
export const sales = pgSchema('sales')
