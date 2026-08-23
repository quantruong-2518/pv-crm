import { create } from 'zustand'
import type { ToastItem, ToastTone } from '@pv/ui'

/** Hàng thông báo của cả app.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO KHÔNG `persist`, KHÁC `desk.ts`
 *  ------------------------------------------------------------------
 *  `app/desk.ts` giữ thứ người dùng GÕ VÀO nên phải sống qua lần tải lại trang.
 *  Toast thì ngược lại: nó là câu trả lời cho một việc vừa chạy xong trong
 *  chính phiên này. Một toast "412 lead đã vào sổ" hiện lại sau khi F5 là một
 *  câu nói dối — việc đó xong từ hôm qua, và nút "Xem" của nó trỏ vào một bộ
 *  lọc không còn tồn tại.
 *
 *  ------------------------------------------------------------------
 *  TRẦN BA TẤM
 *  ------------------------------------------------------------------
 *  Quá ba tấm thì tấm cũ nhất rơi ra. Không có trần thì một vòng lặp hỏng đẻ ra
 *  bốn chục tấm phủ kín màn, và người dùng không còn chỗ nào bấm để thoát.
 *  Tấm mới xuống DƯỚI CÙNG: hàng mọc lên trên như mọi hàng thông báo khác, nên
 *  mắt bắt tấm mới ở chỗ gần với chỗ vừa bấm nút.
 *
 *  Việc gọi ở đây là việc đã CHẠY XONG. Đang chạy thì đó là thanh tiến độ ở chỗ
 *  người dùng bấm nút, không phải toast — luật đầy đủ ở docblock của `ToastHost`. */

/** Trần số tấm cùng lúc trên màn. */
const MAX_ITEMS = 3

type ToastState = {
  items: ToastItem[]
  /** Bộ đếm sinh id. Đếm chứ không `Date.now()`: hai toast bắn trong cùng một
   *  mili giây sẽ trùng id, và React thì dựng lại nhầm tấm. Cùng lý do với
   *  `seq` của `desk.ts`. */
  seq: number
  push: (toast: Omit<ToastItem, 'id'>) => void
  dismiss: (id: string) => void
  clear: () => void
}

export const useToasts = create<ToastState>()((set) => ({
  items: [],
  seq: 0,

  push: (toast) =>
    set((s) => {
      const id = `toast-${s.seq + 1}`
      const next = [...s.items, { ...toast, id }]
      return { seq: s.seq + 1, items: next.slice(-MAX_ITEMS) }
    }),

  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),

  clear: () => set({ items: [] }),
}))

/** Bắn một toast từ ngoài React — hàm thường, không phải hook.
 *
 *  Có mặt vì phần lớn chỗ gọi là một handler đã chạy xong việc (`onDone` của
 *  luồng nạp tệp), không phải thân một component. Bắt mọi chỗ đó phải gọi
 *  `useToasts()` trước là bắt chúng thành component. */
export function toast(title: string, opts?: Omit<ToastItem, 'id' | 'title'>): void {
  useToasts.getState().push({ title, ...opts })
}

/** Bốn lối tắt cho bốn tone — chỗ gọi đọc ra nghĩa ngay tại dòng gọi. */
export const toastOf = (tone: ToastTone) => (title: string, detail?: string) =>
  useToasts.getState().push({ title, detail, tone })

export const toastDone = toastOf('success')
export const toastFail = toastOf('danger')
