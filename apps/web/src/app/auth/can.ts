import type { AccessNeed, Permission, Verdict } from '@pv/engines'
import { access, useSession } from './session'

/** Hỏi quyền từ trong một màn — cho NÚT, không phải cho cả màn.
 *
 *  Cả màn thì `RequireAccess` ở `guard.tsx` lo. Ở đây là câu hỏi nhỏ hơn và hay
 *  hơn nhiều lần: "người này có được bấm cái nút này không".
 *
 *  ------------------------------------------------------------------
 *  ẨN NÚT KHÔNG PHẢI LÀ PHÂN QUYỀN
 *  ------------------------------------------------------------------
 *  Mọi thứ ở file này chỉ làm giao diện trung thực — nó không chặn được ai.
 *  Hàng rào thật nằm ở `app/api/client.ts` (`requireAccess`), nơi mọi đường dữ
 *  liệu đi qua. Hai chỗ cùng hỏi một hàm E2 nên chúng không nói ngược nhau; bỏ
 *  chỗ này thì giao diện hứa hão, bỏ chỗ kia thì hệ thủng. */

/** Kết luận đầy đủ, kèm lý do — dùng khi cần nói với người dùng vì sao. */
export function useAccess(need: AccessNeed): Verdict {
  const actor = useSession((s) => s.actor)
  return access.check(actor, need)
}

/** Câu hỏi có/không cho một quyền thuần vai. Đây là thứ 90% chỗ gọi cần. */
export function useCan(permission: Permission): boolean {
  const actor = useSession((s) => s.actor)
  return access.allows(actor, permission)
}
