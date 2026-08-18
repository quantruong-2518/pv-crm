import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createAccessControl, type Actor, type Branch } from '@pv/engines'

/** Phiên đăng nhập — zustand.
 *
 *  Chỉ giữ thứ **toàn app** cần: ai đang xem. Bộ lọc của một màn, dòng đang
 *  chọn, ô đang gõ… không vào đây — state cục bộ của màn thì để trong màn, đẩy
 *  hết lên store chỉ làm màn khó đọc và khó bỏ.
 *
 *  Store KHÔNG biết kịch bản nào: nó nhận một `Actor` rồi giữ. Danh sách người
 *  đăng nhập được là việc của màn chọn vai (`pages/sign-in.tsx`) — nhờ vậy
 *  luật "không trộn hai kịch bản trên một màn" không bị store phá từ bên dưới.
 *
 *  `persist` để F5 không văng ra màn đăng nhập. Đây là POC nên chỉ có
 *  localStorage; khi có backend thật thì thay bằng token và phiên máy chủ,
 *  phần còn lại của app không phải sửa. */

/** E2 · một bản duy nhất cho cả app. Mọi lần chặn đường đều ghi vết ở đây —
 *  "nhánh không tự kiểm quyền" (docs/kien-truc-san-pham.md · luật engine). */
export const access = createAccessControl()

type SessionState = {
  actor: Actor | null
  signIn: (actor: Actor) => void
  signOut: () => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      actor: null,
      signIn: (actor) => {
        access.log({ actorId: actor.id, action: 'xem', note: 'đăng nhập' })
        set({ actor })
      },
      signOut: () => set({ actor: null }),
    }),
    { name: 'pv-session' },
  ),
)

/** Vào được nhánh này không.
 *
 *  Đây là cổng LICENSE, không phải cổng dữ liệu: nó trả lời "công ty có mua
 *  nhánh này và người này có được vào không". Việc lọc từng dòng dữ liệu vẫn là
 *  của E2 (`access.visible`) ở trong màn, và hai thứ đó không thay nhau được. */
export function canEnter(actor: Actor | null, branch: Branch | null): boolean {
  if (!actor) return false
  if (!branch) return true
  return actor.branches.includes(branch)
}
