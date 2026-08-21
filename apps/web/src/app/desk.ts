import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Bàn làm việc của một người trên sổ lead — ghim và đề nghị giao việc.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO NẰM Ở ĐÂY CHỨ KHÔNG NẰM TRONG MÀN
 *  ------------------------------------------------------------------
 *  Hai thứ này sống lâu hơn một lần mở màn và đi qua NHIỀU màn: ghim ở bảng thì
 *  màn chi tiết phải thấy, giao việc ở màn chi tiết thì tab "Việc của tôi" ở
 *  bảng phải thấy. Bộ lọc và trang thì ngược lại — chúng chết cùng lần mở màn
 *  nên vẫn nằm trong `useState` của màn (xem `app/session.ts`).
 *
 *  **Ghim theo NGƯỜI, không theo sổ.** `pins` khoá bằng `actorId`: hai người
 *  cùng mở sổ thấy hai bộ ghim khác nhau. Ghim chung là ghim của người bấm cuối
 *  cùng — vô dụng với mọi người còn lại.
 *
 *  **Giao việc là ĐỀ NGHỊ, không phải lệnh.** Người gật vẫn là TP Kinh doanh.
 *  Store này giữ đề nghị để màn hiện
 *  đúng trạng thái "đã đề nghị"; khi E3 nối vào thì chỗ này đổi thành phiếu
 *  duyệt thật và màn không phải sửa.
 *
 *  **Giao việc KHÔNG đổi người giữ lead.** Chủ lead là `Lead.owner` trong sổ và
 *  chỉ đổi qua đề nghị đổi tay — vì `COMMISSION_SPLIT` chia lại phần chốt theo
 *  đó. Trộn hai thứ vào một nút là cách nhanh nhất để hoa hồng tính sai. */

export type LeadAssignment = {
  /** Ai được giao. Nhiều người cùng một việc là chuyện thường: một người gọi,
   *  một người dựng số, một người đi cùng demo. */
  actorIds: string[]
  /** Việc gì — lấy từ danh sách next action của chính lead đó, không gõ tay. */
  task: string
}

type DeskState = {
  /** actorId → mã lead đã ghim. */
  pins: Record<string, string[]>
  /** mã lead → đề nghị giao việc đang treo. */
  assigns: Record<string, LeadAssignment>
  /** mã lead → next action đã bấm trong phiên này.
   *
   *  Giữ ở đây chứ không trong màn vì cùng một việc bấm ở bảng phải hiện "đã đề
   *  nghị" khi mở màn chi tiết, và ngược lại. Bấm một nút rồi thấy nó còn nguyên
   *  ở màn kia là cách chắc chắn để người dùng bấm hai lần. */
  acted: Record<string, string[]>
  togglePin: (actorId: string, code: string) => void
  assign: (code: string, actorIds: string[], task: string) => void
  clearAssign: (code: string) => void
  act: (code: string, actionKey: string) => void
  /** Dọn sạch — dùng ở test và ở nút "bỏ hết ghim". */
  reset: () => void
}

/** Mảng rỗng DÙNG CHUNG. Trả `[]` mới mỗi lần trong selector của zustand làm
 *  React coi snapshot đổi liên tục và cảnh báo vòng lặp render. */
const NONE: string[] = []

export const useLeadDesk = create<DeskState>()(
  persist(
    (set) => ({
      pins: {},
      assigns: {},
      acted: {},

      togglePin: (actorId, code) =>
        set((s) => {
          const mine = s.pins[actorId] ?? NONE
          const next = mine.includes(code) ? mine.filter((c) => c !== code) : [...mine, code]
          return { pins: { ...s.pins, [actorId]: next } }
        }),

      assign: (code, actorIds, task) =>
        set((s) => ({ assigns: { ...s.assigns, [code]: { actorIds, task } } })),

      clearAssign: (code) =>
        set((s) => {
          const next = { ...s.assigns }
          delete next[code]
          return { assigns: next }
        }),

      act: (code, actionKey) =>
        set((s) => {
          const done = s.acted[code] ?? NONE
          if (done.includes(actionKey)) return s
          return { acted: { ...s.acted, [code]: [...done, actionKey] } }
        }),

      reset: () => set({ pins: {}, assigns: {}, acted: {} }),
    }),
    { name: 'pv-lead-desk' },
  ),
)

/** Lead một người đã ghim. Tách ra thành hàm để mọi màn đọc cùng một cách và
 *  cùng nhận lại mảng rỗng dùng chung. */
export function pinsOf(state: DeskState, actorId: string | undefined): string[] {
  if (!actorId) return NONE
  return state.pins[actorId] ?? NONE
}
