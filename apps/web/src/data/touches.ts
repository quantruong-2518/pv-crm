import { queryOptions } from '@tanstack/react-query'
import type { LeadEvent } from '@pv/engines/fixtures/das-vina'
import type { TouchRow, TouchTimelineResponse } from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'

/** Dòng thời gian của một mã — hai cửa, một phép dịch.
 *
 *      GET /sales/leads/:code/touches   quyền `lead.xem`    · scoped
 *      GET /sales/opportunities/:code/touches     quyền `cơ-hội.xem`  · scoped
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

const LEAD_TOUCH_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.xem', scoped: true }
const OPS_TOUCH_NEED: ApiNeed = { branch: 'Sales', permission: 'cơ-hội.xem', scoped: true }

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
 *   · `id` — `ActivityCard` khoá dòng bằng `at`, không bằng id;
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
export function eventsOf(rows: readonly TouchRow[]): LeadEvent[] {
  return rows.map((r) => ({ at: r.at, kind: r.kind, by: r.by, note: r.note }))
}

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
