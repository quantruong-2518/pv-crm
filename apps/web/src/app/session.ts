import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
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

const KEY = 'pv-session'

/** Ô "Nhớ tôi" quyết định phiên nằm ở KHO NÀO, không phải nằm bao lâu.
 *
 *  Tick  → `localStorage`, sống qua lần đóng trình duyệt.
 *  Không → `sessionStorage`, chết cùng tab. Đây mới là thứ người dùng thật sự
 *          xin khi họ bỏ trống ô đó trên máy phòng họp.
 *
 *  Đọc thì ưu tiên `sessionStorage`: người vừa đăng nhập không-nhớ trên máy đã
 *  từng có phiên nhớ phải thấy phiên MỚI, không phải phiên cũ còn sót. Ghi thì
 *  xoá kho kia trước — hai kho cùng giữ phiên là hai câu trả lời khác nhau cho
 *  câu hỏi "ai đang đăng nhập", và lần sau F5 sẽ bốc trúng cái sai. */
const rememberAware: PersistStorage<SessionState> = {
  getItem: (name) => {
    const raw = sessionStorage.getItem(name) ?? localStorage.getItem(name)
    if (!raw) return null
    try {
      return JSON.parse(raw) as StorageValue<SessionState>
    } catch {
      /* Dữ liệu cũ hoặc hỏng tay: coi như chưa đăng nhập còn hơn là ném lỗi
         ngay lúc app khởi động, vì lúc đó chưa có màn nào để hiện lỗi. */
      return null
    }
  },
  setItem: (name, value) => {
    const keep = value.state.remember ? localStorage : sessionStorage
    const drop = value.state.remember ? sessionStorage : localStorage
    drop.removeItem(name)
    keep.setItem(name, JSON.stringify(value))
  },
  removeItem: (name) => {
    sessionStorage.removeItem(name)
    localStorage.removeItem(name)
  },
}

/** E2 · một bản duy nhất cho cả app. Mọi lần chặn đường đều ghi vết ở đây —
 *  "nhánh không tự kiểm quyền" — luật engine. */
export const access = createAccessControl()

type SessionState = {
  actor: Actor | null
  /** Ô "Nhớ tôi" của lần đăng nhập gần nhất — xem `rememberAware` ở trên. */
  remember: boolean
  signIn: (actor: Actor, opts?: { remember?: boolean }) => void
  signOut: () => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      actor: null,
      remember: false,
      signIn: (actor, opts) => {
        access.log({ actorId: actor.id, action: 'xem', note: 'đăng nhập' })
        set({ actor, remember: opts?.remember ?? false })
      },
      /* Đăng xuất phải dọn CẢ HAI kho, không chỉ kho đang dùng — `removeItem`
         của `rememberAware` lo việc đó. Giữ `remember` lại để lần đăng nhập sau
         ô còn nhớ lựa chọn cũ. */
      signOut: () => set({ actor: null }),
    }),
    {
      name: KEY,
      storage: rememberAware,
      partialize: (s) => ({ actor: s.actor, remember: s.remember }) as SessionState,
    },
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
