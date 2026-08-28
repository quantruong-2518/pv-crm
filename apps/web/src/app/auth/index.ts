/** Luồng auth của PV One — cửa chính của zone.
 *
 *  | File           | Giữ cái gì                                              |
 *  |----------------|---------------------------------------------------------|
 *  | `session.ts`   | máy trạng thái phiên, vé (bản sao cửa sổ máy chủ), kho   |
 *  | `lifecycle.ts` | đồng hồ hết hạn · bắt hoạt động · đồng bộ đa tab         |
 *  | `renew.ts`     | gia hạn vé, chống bay đàn                               |
 *  | `guard.tsx`    | hai cổng: `RequireAccess` cho MÀN, `Can` cho NÚT        |
 *  | `can.ts`       | hook hỏi quyền trong màn (`useCan`, `useAccess`)         |
 *  | `expiry.tsx`   | dải báo sắp hết phiên · lớp khoá đăng nhập lại tại chỗ   |
 *
 *  Màn và tầng api import từ đây, không với vào từng file — cùng luật với biên
 *  giới package trong CLAUDE.md, áp cho một zone bên trong app. */

export {
  access,
  sessionSnapshot,
  useSession,
  ticketDeath,
  ticketOf,
  SESSION_LIMITS,
  type AuthStatus,
  type ExpiryReason,
  type Ticket,
} from './session'
export { startAuthLifecycle, useExpiryWarning } from './lifecycle'
export { renewSession, sessionIsLive } from './renew'
export { Can, RequireAccess } from './guard'
export { useAccess, useCan } from './can'
