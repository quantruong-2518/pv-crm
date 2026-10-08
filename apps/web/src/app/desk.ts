import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Opportunity } from '@pv/engines/fixtures/das-vina'

/** Bàn làm việc của một người trên sổ lead — mọi thứ người dùng GÕ
 *  VÀO một hồ sơ lead mà chưa có bảng nào giữ (ghi chú).
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO NẰM Ở ĐÂY CHỨ KHÔNG NẰM TRONG MÀN
 *  ------------------------------------------------------------------
 *  Những thứ này sống lâu hơn một lần mở màn và đi qua NHIỀU màn: ghi chú ở
 *  bảng thì màn chi tiết phải thấy, và ngược lại. Bộ lọc và trang thì ngược lại —
 *  chúng chết cùng lần mở màn nên vẫn nằm trong `useState` của màn (xem
 *  `app/auth/session.ts`).
 *
 *  Pins left for the server on 08/10 (`data/pins.ts`); see `legacyPinsOf` below.
 *
 *  **Giao lead KHÔNG còn ở đây.** Nó là một phép ghi thật lên `lead.owner_id`
 *  (`data/lead-owner.ts`), không phải một đề nghị nằm trong trình duyệt — lý do
 *  đầy đủ ở khối ghi chú ngay dưới docblock này.
 *
 *  ------------------------------------------------------------------
 *  `deals` ĐÃ RỜI HÌNH — VÀ BẢN LƯU CŨ CÒN MANG NÓ (29/08)
 *  ------------------------------------------------------------------
 *  `deals`/`convert`/`undoConvert` từng là chống đỡ duy nhất cho "lead này đổi
 *  thành cơ hội chưa". Câu đó nay hỏi máy chủ — `opportunitiesOfLeadQuery` ở `data/opportunities.ts`
 *  gọi `GET /sales/opportunities/live-deal` — nên ba thứ trên đã ra khỏi store. Chống đỡ
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
 *  phải đi qua một `migrate` — mà một `migrate` viết sai sẽ thổi bay cả ghim
 *  cũ chưa kịp chuyển và ghi chú của người dùng, thứ chưa có endpoint nào để dựng lại.
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

/* `nextSteps` and `todos` (with its `seq` counter) left on 28/09: the next step
   moved to the server (`data/next-step.ts`) and nothing wrote a todo any more.
   Their keys stay orphaned in old saves exactly like `deals`/`assigns` above. */

type DeskState = {
  /** mã lead → next action đã bấm trong phiên này.
   *
   *  Giữ ở đây chứ không trong màn vì cùng một việc bấm ở bảng phải hiện "đã đề
   *  nghị" khi mở màn chi tiết, và ngược lại. Bấm một nút rồi thấy nó còn nguyên
   *  ở màn kia là cách chắc chắn để người dùng bấm hai lần. */
  acted: Record<string, string[]>

  /** lead code → the one free-text note about it. Plain text since 17/09; an
   *  older copy may still hold `RichText` HTML, which `plainNote` converts.
   *
   *  The one FREE box of the profile, deliberately outside the ten questions:
   *  those ten are what the system measures, this is what only the holder knows.
   *
   *  STILL IN THE BROWSER, AND THE DEBT GREW — the one the next step paid off
   *  by moving to the server: open the lead on another machine and this is
   *  simply not there. The new layout gives it a tab of its own beside server
   *  data, which makes it easier to mistake for a record and worse to lose. It
   *  moves the day a table holds it; until then the box says so out loud. */
  notes: Record<string, string>

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

  act: (code: string, actionKey: string) => void
  setNote: (code: string, html: string) => void
  patchOp: (code: string, patch: Partial<Opportunity>) => void
  resetOp: (code: string) => void
  /** Dọn sạch — dùng ở test. */
  reset: () => void
}

/** Mảng rỗng DÙNG CHUNG. Trả `[]` mới mỗi lần trong selector của zustand làm
 *  React coi snapshot đổi liên tục và cảnh báo vòng lặp render. */
const NONE: string[] = []

export const useLeadDesk = create<DeskState>()(
  persist(
    (set) => ({
      acted: {},
      notes: {},
      ops: {},

      act: (code, actionKey) =>
        set((s) => {
          const done = s.acted[code] ?? NONE
          if (done.includes(actionKey)) return s
          return { acted: { ...s.acted, [code]: [...done, actionKey] } }
        }),

      setNote: (code, html) => set((s) => ({ notes: { ...s.notes, [code]: html } })),

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
          acted: {},
          notes: {},
          ops: {},
        }),
    }),
    { name: 'pv-lead-desk' },
  ),
)

/** Old saves still carry `pins` (actorId → lead codes), orphaned the way `deals`
 *  is above. Read once by `data/pins.ts` to move them to the server, then the
 *  codes sent are dropped from the actor's entry; the emptied key itself stays, as harmless as `deals`. */
type LegacyPins = { pins?: Record<string, string[]> }

export function legacyPinsOf(actorId: string): string[] {
  return (useLeadDesk.getState() as LegacyPins).pins?.[actorId] ?? NONE
}

export function dropLegacyPins(actorId: string, sent: readonly string[]): void {
  useLeadDesk.setState((s) => {
    const { [actorId]: mine = NONE, ...rest } = (s as LegacyPins).pins ?? {}
    const left = mine.filter((code) => !sent.includes(code))
    return { ...s, pins: left.length ? { ...rest, [actorId]: left } : rest } as DeskState
  })
}
