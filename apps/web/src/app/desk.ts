import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Opportunity } from '@pv/engines/fixtures/das-vina'

/** Bàn làm việc của một người trên sổ lead — ghim, và mọi thứ người dùng GÕ
 *  VÀO một hồ sơ lead (bản sửa hồ sơ, ghi chú, bước tiếp theo).
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO NẰM Ở ĐÂY CHỨ KHÔNG NẰM TRONG MÀN
 *  ------------------------------------------------------------------
 *  Những thứ này sống lâu hơn một lần mở màn và đi qua NHIỀU màn: ghim ở bảng
 *  thì màn chi tiết phải thấy, và ngược lại. Bộ lọc và trang thì ngược lại —
 *  chúng chết cùng lần mở màn nên vẫn nằm trong `useState` của màn (xem
 *  `app/auth/session.ts`).
 *
 *  **Ghim theo NGƯỜI, không theo sổ.** `pins` khoá bằng `actorId`: hai người
 *  cùng mở sổ thấy hai bộ ghim khác nhau. Ghim chung là ghim của người bấm cuối
 *  cùng — vô dụng với mọi người còn lại.
 *
 *  **Giao lead KHÔNG còn ở đây.** Nó là một phép ghi thật lên `lead.owner_id`
 *  (`data/lead-owner.ts`), không phải một đề nghị nằm trong trình duyệt — lý do
 *  đầy đủ ở khối ghi chú ngay dưới `LeadTodo`.
 *
 *  ------------------------------------------------------------------
 *  `deals` ĐÃ RỜI HÌNH — VÀ BẢN LƯU CŨ CÒN MANG NÓ (29/08)
 *  ------------------------------------------------------------------
 *  `deals`/`convert`/`undoConvert` từng là chống đỡ duy nhất cho "lead này đổi
 *  thành cơ hội chưa". Câu đó nay hỏi máy chủ — `opportunitiesOfLeadQuery` ở `data/opportunities.ts`
 *  gọi `GET /sales/opportunities?leadCode=…` — nên ba thứ trên đã ra khỏi store. Chống đỡ
 *  cũ vốn đã chết trước đó: `convert` không còn ai gọi từ lượt cắt sổ cơ hội
 *  sang máy chủ, nên `deals` luôn rỗng dù nút vẫn hỏi nó.
 *
 *  Store này persist xuống localStorage và **không có `version`/`migrate`**.
 *  Nên nói thẳng cái giá: máy nào đã từng chạy bản cũ vẫn còn khoá `deals` nằm
 *  trong `pv-lead-desk`, và `persist` mặc định GỘP NÔNG bản đã lưu lên state
 *  khởi tạo — khoá đó sẽ sống lại ở runtime như một thuộc tính mồ côi, không có
 *  trong `DeskState`, không ai đọc, và `reset()` cũng không xoá vì nó không còn
 *  trong danh sách khoá được đặt lại.
 *
 *  Chấp nhận được, và không phải vì lười: nó không đổi hành vi (không nhánh nào
 *  đọc nó nữa), không lớn (một object rỗng ở gần như mọi máy, vì `convert` đã
 *  ngừng ghi từ trước), và đánh số `version: 1` để dọn nó thì mọi bản lưu cũ
 *  phải đi qua một `migrate` — mà một `migrate` viết sai sẽ thổi bay cả ghim,
 *  ghi chú và việc tự ghi của người dùng, thứ chưa có endpoint nào để dựng lại.
 *  Ngày store này thật sự cần đổi hình dữ liệu (không phải bỏ bớt một khoá chết)
 *  thì `version`+`migrate` vào cùng lượt đó, và dọn luôn khoá này. */

/* `assigns`/`assign`/`clearAssign` ĐÃ RỜI HÌNH (29/08) — cùng đường `deals` đã
   đi và vì cùng một lý do, chỉ nặng hơn một bậc.
   Ba thứ đó giữ "đề nghị giao việc": một danh sách người cộng một câu việc,
   nằm trong localStorage của đúng một trình duyệt, kèm dòng chữ "chờ trưởng
   phòng gật" mà không màn nào gật được. Người được giao mở máy của họ lên thì
   không có gì, và `lead.owner_id` đứng nguyên — tức sổ, ô lọc theo người, trục
   phạm vi của E2 và `CREDIT_RULES` đều trả lời như chưa ai giao gì.
   Giao lead nay là `PATCH /sales/leads/:code/owner` (`data/lead-owner.ts`), ghi
   thẳng vào cột. Cái mất theo là khái niệm "một việc, nhiều người": không có
   bảng nào chở nó, nên nó không được giả vờ tồn tại ở đây nữa.
   Khoá `assigns` trong bản lưu cũ vẫn mồ côi lại như `deals` — cùng lý lẽ đã
   ghi ngay bên trên, dọn cả hai trong lượt `version`+`migrate` đầu tiên. */

/** Một việc NGƯỜI DÙNG tự ghi trên hồ sơ lead.
 *
 *  Khác `NextAction` ở `data/leads.ts` một bậc quan trọng: `NextAction` là việc
 *  hệ SUY RA từ trạng thái lead (thiếu ô thì đi moi ô, quá hạn thì báo tắc) —
 *  nó đúng nhưng chung chung. Dòng này là việc người cầm lead tự hẹn với mình:
 *  "gọi lại sau khi khách họp xong thứ Năm". Hệ không đoán được câu đó.
 *
 *  Hai thứ sống cạnh nhau chứ không thay nhau: khối next action trên màn bày
 *  gợi ý của hệ ở trên, việc tự ghi ở dưới, và bấm một gợi ý là nó rơi xuống
 *  thành một dòng tự ghi có thể hẹn ngày. */
export type LeadTodo = {
  id: string
  text: string
  /** ISO ngày. Rỗng = chưa hẹn ngày — hợp lệ, đừng ép chọn. */
  due: string
  /** actorId người nhận. Rỗng = chính mình. */
  who: string
  done: boolean
}

type DeskState = {
  /** actorId → mã lead đã ghim. */
  pins: Record<string, string[]>
  /** mã lead → next action đã bấm trong phiên này.
   *
   *  Giữ ở đây chứ không trong màn vì cùng một việc bấm ở bảng phải hiện "đã đề
   *  nghị" khi mở màn chi tiết, và ngược lại. Bấm một nút rồi thấy nó còn nguyên
   *  ở màn kia là cách chắc chắn để người dùng bấm hai lần. */
  acted: Record<string, string[]>

  /** mã lead → thông tin quan trọng, HTML của RichText.
   *
   *  Đây là ô TỰ DO duy nhất của hồ sơ và nó cố ý tách khỏi bộ 10 câu: mười ô
   *  kia là thứ hệ đo được, ô này là thứ chỉ người cầm lead biết. Trộn hai loại
   *  vào một chỗ thì hoặc cổng đếm nhầm, hoặc người ta ngại gõ vì sợ ảnh hưởng
   *  tới cổng. */
  notes: Record<string, string>

  /** mã lead → việc tự ghi. */
  todos: Record<string, LeadTodo[]>

  /** mã lead → một đề xuất ngắn về bước nên làm tiếp theo.
   *
   *  Đây là định hướng hiện tại, không phải danh sách công việc hay một lần
   *  phân công. Mỗi lead chỉ giữ một câu để người mở hồ sơ biết ngay nên tiếp
   *  tục từ đâu; lần lưu sau thay thế lần trước. */
  nextSteps: Record<string, string>

  /** MÃ CƠ HỘI → những trường hồ sơ ĐÃ SỬA so với dòng dựng từ fixture.
   *
   *  Giữ PATCH chứ không giữ cả dòng: bản gốc vẫn dựng lại được từ
   *  `OPPORTUNITIES`, còn có patch thì màn nói được "ba ô đã sửa, hoàn tác
   *  được".
   *
   *  Kho `profiles` của lead từng nằm ngay trên đây và đã bị gỡ 30/08, khi
   *  `PATCH /sales/leads/:code` ra đời: một lớp đè tại máy nằm trên một hồ sơ
   *  máy chủ ghi được là một lớp che mất chính giá trị vừa ghi. Sổ cơ hội chưa
   *  có cửa ghi nào nên nó còn ở đây — và đó cũng là hạn dùng của nó.
   *
   *  Khoá bằng MÃ CƠ HỘI chứ không mã lead: một phiếu người dùng tự tạo cũng là
   *  một dòng sổ cơ hội sửa được, mà nó chưa chắc đã có lead nào đứng sau. */
  ops: Record<string, Partial<Opportunity>>

  /** Bộ đếm sinh id cho việc tự ghi. Đếm chứ không `Date.now()`: cùng một chuỗi
   *  thao tác phải ra cùng một chuỗi id, nếu không test không khoá được gì. */
  seq: number

  togglePin: (actorId: string, code: string) => void
  act: (code: string, actionKey: string) => void
  setNote: (code: string, html: string) => void
  setNextStep: (code: string, text: string) => void
  addTodo: (code: string, todo: Omit<LeadTodo, 'id' | 'done'>) => void
  toggleTodo: (code: string, id: string) => void
  removeTodo: (code: string, id: string) => void
  patchOp: (code: string, patch: Partial<Opportunity>) => void
  resetOp: (code: string) => void
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
      acted: {},
      notes: {},
      todos: {},
      nextSteps: {},
      ops: {},
      seq: 0,

      togglePin: (actorId, code) =>
        set((s) => {
          const mine = s.pins[actorId] ?? NONE
          const next = mine.includes(code) ? mine.filter((c) => c !== code) : [...mine, code]
          return { pins: { ...s.pins, [actorId]: next } }
        }),

      act: (code, actionKey) =>
        set((s) => {
          const done = s.acted[code] ?? NONE
          if (done.includes(actionKey)) return s
          return { acted: { ...s.acted, [code]: [...done, actionKey] } }
        }),

      setNote: (code, html) => set((s) => ({ notes: { ...s.notes, [code]: html } })),

      setNextStep: (code, text) => set((s) => ({ nextSteps: { ...s.nextSteps, [code]: text } })),

      addTodo: (code, todo) =>
        set((s) => {
          const id = `todo-${s.seq + 1}`
          const rows = s.todos[code] ?? []
          return {
            seq: s.seq + 1,
            todos: { ...s.todos, [code]: [...rows, { ...todo, id, done: false }] },
          }
        }),

      toggleTodo: (code, id) =>
        set((s) => ({
          todos: {
            ...s.todos,
            [code]: (s.todos[code] ?? []).map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
          },
        })),

      removeTodo: (code, id) =>
        set((s) => ({
          todos: { ...s.todos, [code]: (s.todos[code] ?? []).filter((t) => t.id !== id) },
        })),

      patchOp: (code, patch) =>
        set((s) => ({ ops: { ...s.ops, [code]: { ...s.ops[code], ...patch } } })),

      resetOp: (code) =>
        set((s) => {
          const next = { ...s.ops }
          delete next[code]
          return { ops: next }
        }),

      reset: () =>
        set({
          pins: {},
          acted: {},
          notes: {},
          todos: {},
          nextSteps: {},
          ops: {},
          seq: 0,
        }),
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

/** Mảng rỗng dùng chung, cùng lý do với `NONE`. */
const NO_TODOS: LeadTodo[] = []

/** Việc tự ghi trên một lead. */
export function todosOf(state: DeskState, code: string): LeadTodo[] {
  return state.todos[code] ?? NO_TODOS
}
