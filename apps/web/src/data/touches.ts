import { queryOptions } from '@tanstack/react-query'
import type { FlowVectorStep } from '@pv/ui'
import type { LeadEvent } from '@pv/engines/fixtures/das-vina'
import type { TouchRow, TouchTimelineResponse } from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import { ROLE_LABEL } from '@/data/users'
import { dm, dmy } from '@/lib/date'

/** Dòng thời gian của một mã — hai cửa, một phép dịch.
 *
 *      GET /sales/leads/:code/touches   quyền `lead.view`    · scoped
 *      GET /sales/opportunities/:code/touches     quyền `opportunity.view`  · scoped
 *
 *  Đây là thứ thay hai hằng số `NO_TOUCHES`/`NO_TRANSCRIPT` ở
 *  `data/lead-profile.ts:300`. Docblock của chúng đã hẹn sẵn đường này: "khi
 *  endpoint về, `GET /sales/leads/:code/touches` thay đúng hai giá trị đó và
 *  không gì khác, nên thay đổi nằm gọn trong một file". File này là chỗ đó.
 *
 *  ------------------------------------------------------------------
 *  HAI QUERY CHỨ KHÔNG MỘT, VÀ HAI DÒNG THỜI GIAN KHÔNG TRỘN
 *  ------------------------------------------------------------------
 *  Quyết định #5 của `docs/ban-giao-co-hoi.md`, đã gật: hồ sơ ĐƠN đọc lần chạm
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
 *  Ghi chú cũ ở chỗ này nói `opportunityBookQuery` cũng thiếu trục đó — KHÔNG
 *  còn đúng từ 29/08: sổ cơ hội nay hiện con số `hidden`, mà `hidden` chính là
 *  thứ trục phạm vi cắt ra, nên hai đầu buộc phải đọc ra cùng một câu.
 *  `opportunityProfileQuery` thì vẫn để thiếu, và có lý do riêng ghi tại chỗ:
 *  một lượt đọc MỘT dòng không có gì để `hidden` nói. */

const LEAD_TOUCH_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.view', scoped: true }
const OPS_TOUCH_NEED: ApiNeed = { branch: 'Sales', permission: 'opportunity.view', scoped: true }

/** `TouchRow[]` → `LeadEvent[]`.
 *
 *  Đổi tên trường, không phải một bảng tra — và đó là chủ ý từ đầu chứ không
 *  phải may: `TouchKind` ở `@pv/contracts` được đặt TRÙNG đúng mười giá trị của
 *  `LeadEventKind` trong fixture (`vao-so` · `cham` · `dien-o` · `giao` ·
 *  `len-bac` · `gap-lan-dau` · `vao-pipeline` · `doi-cot` · `ky` ·
 *  `ra-khoi-luong`). Một bảng tra ở đây sẽ là chỗ thứ hai phải nhớ mỗi lần enum
 *  mọc thêm một giá trị, và là chỗ lặng lẽ nuốt giá trị mới nào chưa kịp khai.
 *
 *  Bốn trường được lấy, phần còn lại của `TouchRow` cố ý bỏ:
 *
 *   · `subjectCode`/`subjectKind` — đã biết, vì chính lời gọi chọn chúng;
 *   · `toTier` — bậc SAU bước này. Màn Hiệu suất đếm bằng nó; thẻ hoạt động thì
 *     không, vì câu tiếng Việt ở `note` do máy chủ viết đã chở sẵn bậc. Bày
 *     thêm một nhãn bậc cạnh câu đã nói điều đó là in hai lần một sự thật;
 *   · `actorId` — `by` là ẢNH CHỤP tên lúc ghi, và thẻ chỉ in tên. Cầm thêm id
 *     là mở đường cho ai đó join lại `actor` để "lấy tên mới hơn", đúng thứ
 *     docblock của `TouchRow.by` cấm.
 *
 *  Máy chủ đã sắp xếp; hàm này KHÔNG sắp lại. Sắp lần hai ở đây thì ngày máy
 *  chủ đổi thứ tự, màn vẫn hiện thứ tự cũ và không ai biết chỗ nào quyết định. */
export function eventsOf(rows: readonly TouchRow[]): TouchEvent[] {
  return rows.map((r) => ({ id: r.id, at: r.at, kind: r.kind, by: r.by, note: r.note }))
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
export type TouchEvent = LeadEvent & { id: string }

/** `TouchRow[]` → the chain of PEOPLE who have held it, for `FlowVector` (M-16).
 *
 *  Only two kinds carry a holder, and both state it in COLUMNS rather than in
 *  the sentence: `vao-so` carries `to` for a lead that entered the book already
 *  assigned, `giao` carries `from` and/or `to` on every hand-over. The server
 *  answers newest-first, so this walks backwards to build time order.
 *
 *  A `giao` row with NEITHER end is skipped, and that is the one careful line
 *  here: those are rows written before migration `0033`, when both ends lived
 *  only in the Vietnamese sentence in `note`. A release into the common pool
 *  has `from` and no `to`, and `touch_hand_over_sides` forbids a `giao` row
 *  that names neither end — so the two cases cannot be confused. Digging names
 *  back out of an old row's prose would invent history, so it is not done.
 *
 *  Dates are FORMATTED here: `@pv/ui` holds no locale and no clock. */
export function stepsOf(rows: readonly TouchRow[]): FlowVectorStep[] {
  const steps: FlowVectorStep[] = []

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (!row) continue
    if (row.kind !== 'giao' && row.kind !== 'vao-so') continue

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
    } else if (row.kind === 'giao' && row.from) {
      steps.push({ kind: 'pool', touchId: row.id, at: dm(row.at), atFull: dmy(row.at) })
    }
  }

  return steps
}

/** No holder has ever been recorded for this lead.
 *
 *  A module-level frozen value rather than `[]` in the screen, for the reason
 *  `NO_TOUCHES` is one: a fresh `[]` on every render gives `FlowVector` a new
 *  array identity each time and makes its memo work for nothing. It also says
 *  WHICH empty this is — nobody has held the lead, as opposed to the query not
 *  having answered. */
export const NO_STEPS: readonly FlowVectorStep[] = []

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
        signal,
      }),
    select: (d: TouchTimelineResponse) => eventsOf(d.rows),
  })

/** Lần chạm của một ĐƠN. Cùng hình, khác quyền và khác đường — xem docblock
 *  đầu file về việc vì sao không gộp làm một query có tham số `kind`. */
export const opportunityTouchesQuery = (code: string) =>
  queryOptions({
    queryKey: ['sales', 'ops-touches', code] as const,
    queryFn: ({ signal }) =>
      api.read<TouchTimelineResponse>(`/sales/opportunities/${encodeURIComponent(code)}/touches`, {
        need: OPS_TOUCH_NEED,
        signal,
      }),
    select: (d: TouchTimelineResponse) => eventsOf(d.rows),
  })

/** The holder chain of one DEAL — §6·B of `docs/tam-nhin-pipeline-toan-he.md`
 *  said the vector belongs on both profiles, and until 14/09 only the lead had
 *  it.
 *
 *  THE SAME `queryKey` as `opportunityTouchesQuery`, exactly as the two lead
 *  queries share theirs: one fetch, two questions, `select` belonging to the
 *  observer rather than to the cache. A key of its own would load the same list
 *  twice and let the two copies drift apart by a few seconds.
 *
 *  `stepsOf` needs no variant for this: it reads `giao` and `vao-so` rows and
 *  never asks what the subject is. A deal that has never changed hands answers
 *  an empty chain, and `FlowVector` draws nothing at all — which is the honest
 *  picture of a deal one person has carried the whole way. */
export const opportunityVectorQuery = (code: string) =>
  queryOptions({
    queryKey: ['sales', 'ops-touches', code] as const,
    queryFn: ({ signal }) =>
      api.read<TouchTimelineResponse>(`/sales/opportunities/${encodeURIComponent(code)}/touches`, {
        need: OPS_TOUCH_NEED,
        signal,
      }),
    select: (d: TouchTimelineResponse) => stepsOf(d.rows),
  })
