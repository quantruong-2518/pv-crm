import { queryOptions } from '@tanstack/react-query'
import type { FlowVectorStep } from '@pv/ui'
import type { LeadEvent } from '@pv/engines/fixtures/das-vina'
import { TouchTimelineResponse, type TouchKind, type TouchRow } from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import { ROLE_LABEL } from '@/data/users'
import { dm, dmy } from '@/lib/date'

/** Dòng thời gian của một mã — hai cửa, một phép dịch.
 *
 *      GET /sales/leads/:code/touches   quyền `lead.view`    · scoped
 *      GET /sales/opportunities/:code/touches     quyền `opportunity.view`  · scoped
 *
 *  ------------------------------------------------------------------
 *  HAI QUERY CHỨ KHÔNG MỘT, VÀ HAI DÒNG THỜI GIAN KHÔNG TRỘN
 *  ------------------------------------------------------------------
 *  Quyết định #5 của `docs/decisions/0018-opportunity-module-decisions.md`, đã gật: hồ sơ ĐƠN đọc lần chạm
 *  của đơn, hồ sơ LEAD đọc lần chạm của lead. Chúng không phải hai mảnh của
 *  một chuỗi để nối lại: `sales.touch` khoá bằng cặp `subject_code` +
 *  `subject_kind`, và một đơn có đời riêng — nó sinh ra SAU khi lead đã đi
 *  được một đoạn, rồi đổi cột, rồi được ký. Trộn hai chuỗi thì "đơn này đã đi
 *  qua những gì" trả lời lẫn cả những việc xảy ra trước khi đơn tồn tại.
 *
 *  Hai `queryKey` khác nhau cũng vì thế, và cả hai đều mang mã trong khoá —
 *  cùng bẫy mà `leadProfileQuery` đã tránh: một khoá quên mã sẽ đưa dòng thời
 *  gian của đơn vừa xem cho đơn mở kế tiếp.
 *
 *  ------------------------------------------------------------------
 *  `scoped: true` KHAI Ở CẢ HAI
 *  ------------------------------------------------------------------
 *  Hai route này khai `@Need({ …, scoped: true })` ở máy chủ
 *  (`opportunity.controller.ts`, `lead.controller.ts`), nên trục thứ ba phải
 *  có mặt ở đây.
 *
 *  Every opportunity read declares it too — the book, the profile and these
 *  touches — because each controller `@Need` is scoped. */

const LEAD_TOUCH_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.view', scoped: true }

/** `TouchRow[]` → `LeadEvent[]`.
 *
 *  Đổi tên trường, không phải một bảng tra — và đó là chủ ý từ đầu chứ không
 *  phải may: `TouchKind` ở `@pv/contracts` chứa đủ mười giá trị của
 *  `LeadEventKind` trong fixture, cộng `reopened` mà fixture không có — nên
 *  `TouchEvent` lấy `kind` từ contract chứ không từ fixture. Một bảng tra ở đây sẽ là chỗ thứ hai phải nhớ mỗi lần enum
 *  mọc thêm một giá trị, và là chỗ lặng lẽ nuốt giá trị mới nào chưa kịp khai.
 *
 *  Bốn trường được lấy, phần còn lại của `TouchRow` cố ý bỏ:
 *
 *   · `subjectCode`/`subjectKind` — đã biết, vì chính lời gọi chọn chúng;
 *   · `toTier` — only legacy `verified` rows carry it (ADR 0063), and no screen
 *     reads a tier off a touch any more;
 *   · `actorId` — `by` là ẢNH CHỤP tên lúc ghi, và thẻ chỉ in tên. Cầm thêm id
 *     là mở đường cho ai đó join lại `actor` để "lấy tên mới hơn", đúng thứ
 *     docblock của `TouchRow.by` cấm.
 *
 *  Máy chủ đã sắp xếp; hàm này KHÔNG sắp lại. Sắp lần hai ở đây thì ngày máy
 *  chủ đổi thứ tự, màn vẫn hiện thứ tự cũ và không ai biết chỗ nào quyết định. */
export function eventsOf(rows: readonly TouchRow[]): TouchEvent[] {
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    kind: r.kind,
    by: r.by,
    note: r.note,
  }))
}

/** One timeline milestone, CARRYING the row it was read off.
 *
 *  `id` arrived on 14/09, and it is what joins two halves of one truth: a
 *  `FlowVector` face carries a `touchId`, while `ActivityCard` keyed its rows
 *  by position in the array — so there was nothing to scroll to and pressing a
 *  face went nowhere. Keyed by the row id, the two blocks speak one language,
 *  and a milestone keeps its identity when the list is filtered or reordered.
 *
 *  An intersection with the fixture's `LeadEvent` rather than a replacement:
 *  the activity card still draws an event generated from the frozen scenario,
 *  it just cannot be jumped to — which is the truth about those. */
/** Which touch row a vector face last pointed at.
 *
 *  `seq` is what makes a REPEAT press count: pressing the same face twice is a
 *  real request — the screen may be on another tab by then — but a bare id
 *  would be an unchanged state and React would skip the effects entirely.
 *
 *  A screen concern, not a wire one, so it lives here rather than in
 *  `@pv/contracts`: `seq` exists to make React notice, and nothing sends it. */
export type TouchFocus = { id: string; seq: number }

export type TouchEvent = Omit<LeadEvent, 'kind'> & { id: string; kind: TouchKind }

/** `TouchRow[]` → the chain of PEOPLE who have held it, for `FlowVector` (M-16).
 *
 *  Only two kinds carry a holder, and both state it in COLUMNS rather than in
 *  the sentence: `created` carries `to` for a lead that entered the book already
 *  assigned, `handed-over` carries `from` and/or `to` on every hand-over. The server
 *  answers newest-first, so this walks backwards to build time order.
 *
 *  A `handed-over` row with NEITHER end is skipped, and that is the one careful line
 *  here: those are rows written before migration `0033`, when both ends lived
 *  only in the Vietnamese sentence in `note`. A release into the common pool
 *  has `from` and no `to`, and `touch_hand_over_sides` forbids a `handed-over` row
 *  that names neither end — so the two cases cannot be confused. Digging names
 *  back out of an old row's prose would invent history, so it is not done.
 *
 *  Dates are FORMATTED here: `@pv/ui` holds no locale and no clock. */
export function stepsOf(rows: readonly TouchRow[]): FlowVectorStep[] {
  const steps: FlowVectorStep[] = []

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (!row) continue
    if (row.kind !== 'handed-over' && row.kind !== 'created') continue

    if (row.to) {
      steps.push({
        kind: 'held',
        touchId: row.id,
        holder: row.to.name,
        actorId: row.to.actorId,
        at: dm(row.at),
        atFull: dmy(row.at),
        /* The role AS IT WAS, straight off the row — `to_role` is frozen at
           write time (`0039`). Absent on rows written before that column, and
           on rows the bulk importer wrote, so the step prints a name with no
           role rather than borrowing the one the person holds today. */
        ...(row.to.role ? { role: ROLE_LABEL[row.to.role] } : {}),
      })
    } else if (row.kind === 'handed-over' && row.from) {
      steps.push({ kind: 'pool', touchId: row.id, at: dm(row.at), atFull: dmy(row.at) })
    }
  }

  return steps
}

/** The holder chain of one LEAD.
 *
 *  THE SAME `queryKey` as `leadTouchesQuery`, deliberately. Two parts of the
 *  screen ask two questions of one timeline, and `select` belongs to the
 *  observer rather than to the cache — so a single fetch feeds both the
 *  activity card and the vector. A key of its own would load the same list
 *  twice and let the two copies drift apart by a few seconds. */
export const leadVectorQuery = (code: string) =>
  queryOptions({
    queryKey: ['sales', 'lead-touches', code] as const,
    queryFn: ({ signal }) =>
      api.read<TouchTimelineResponse>(`/sales/leads/${encodeURIComponent(code)}/touches`, {
        need: LEAD_TOUCH_NEED,
        schema: TouchTimelineResponse,
        signal,
      }),
    select: (d: TouchTimelineResponse) => stepsOf(d.rows),
  })

/** Lần chạm của một LEAD. `select` dịch ngay trong query, nên component nhận
 *  thẳng `LeadEvent[]` và không phải nhớ gọi `eventsOf` — TanStack còn giữ hộ
 *  kết quả đã dịch giữa các lần render, nên memo của `ActivityCard` không phải
 *  làm lại vì một mảng mới có cùng nội dung. */
export const leadTouchesQuery = (code: string) =>
  queryOptions({
    queryKey: ['sales', 'lead-touches', code] as const,
    queryFn: ({ signal }) =>
      api.read<TouchTimelineResponse>(`/sales/leads/${encodeURIComponent(code)}/touches`, {
        need: LEAD_TOUCH_NEED,
        schema: TouchTimelineResponse,
        signal,
      }),
    select: (d: TouchTimelineResponse) => eventsOf(d.rows),
  })
