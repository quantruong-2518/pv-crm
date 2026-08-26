import { SetMetadata } from '@nestjs/common'
import type { AccessNeed } from '@pv/engines'

export const NEED_KEY = 'pv:need'
export const PUBLIC_KEY = 'pv:public'

/** Quyền mà một endpoint đòi.
 *
 *  Hình này là hình `apps/web/src/data/*.ts` đang dùng, từng chữ một:
 *
 *      // apps/web/src/data/leads.ts
 *      api.read('/sales/leads', { need: { branch: 'Sales', permission: 'lead.xem' } })
 *
 *      // apps/api — cùng một câu, phía bên kia dây
 *      @Need({ branch: 'Sales', permission: 'lead.xem' })
 *
 *  Hai đầu khai giống nhau vì hai đầu hỏi CÙNG MỘT E2. Đó là toàn bộ ý nghĩa
 *  của "một ma trận quyền, kiểm hai lần".
 *
 *  `scoped: true` bật trục 3 (chỉ thấy dòng đứng tên mình). Nó KHÔNG nằm trong
 *  `AccessNeed` của engine vì engine bật trục đó bằng sự có mặt của `ref` — mà
 *  `ref` chỉ có sau khi đã nạp dòng dữ liệu, tức sau guard. Cờ này là cách
 *  endpoint nói trước "tôi có dữ liệu theo dòng", để repository lọc bằng
 *  `owner_id` ngay trong SQL thay vì nạp cả sổ rồi mới cắt. */
export type RouteNeed = AccessNeed & { scoped?: boolean }

export const Need = (need: RouteNeed) => SetMetadata(NEED_KEY, need)

/** Endpoint KHÔNG cần phiên và không cần quyền.
 *
 *  Phải khai tường minh, vì `AccessGuard` hỏng theo hướng ĐÓNG: endpoint không
 *  có `@Need` cũng không có `@Public` thì bị từ chối, và `RouteAudit` chặn
 *  ngay lúc khởi động. Danh sách đúng của nó rất ngắn — luồng đăng nhập và
 *  `/healthz`. Nếu thấy mình sắp thêm cái thứ ba, dừng lại và hỏi. */
export const Public = () => SetMetadata(PUBLIC_KEY, true)
