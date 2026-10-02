import { queryOptions } from '@tanstack/react-query'
import {
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STATE_LABEL,
  OpportunityBookQuery,
  OpportunityBookResponse,
  OpportunityFacetsResponse,
  OpportunityHistogram,
  OpportunityLiveDeal,
  OpportunityProfileResponse,
  OpportunityScorecard,
  type OpportunityAct,
  type OpportunityFacetsQuery,
  type OpportunityOwner,
  type ObjectChainLink,
  type OpportunityBookRow,
  type OpportunityRow,
  type OpportunityStatus,
} from '@pv/contracts'

import { toMoneyVnd, type OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import type { RailObject } from '@pv/ui'
import { api, type ApiNeed } from '@/app/api'

/** Sổ cơ hội — module 3. Đọc từ máy chủ.
 *
 *  ------------------------------------------------------------------
 *  ĐÃ CẮT KHỎI FIXTURE — 28/08
 *  ------------------------------------------------------------------
 *  `opportunityBookQuery` không còn `load`, và theo nghi thức của
 *  `app/api/client.ts` thì đó CHÍNH LÀ lượt cắt: có `load` nghĩa là query còn
 *  đọc fixture, vắng `load` nghĩa là nó đi HTTP thật. Không có cờ nào khác để
 *  bật, không có nhánh nào để đọc.
 *
 *  Ba thứ biến mất cùng lượt cắt này, và cả ba đều là hệ quả chứ không phải
 *  dọn dẹp tuỳ hứng:
 *
 *   · `mergeOps` — sổ trên màn từng là "fixture + phiếu vừa gửi + bản sửa tại
 *     chỗ". Cả ba nguồn phụ nay đều nằm ở máy chủ: phiếu gửi đi qua
 *     `POST /sales/opportunities`, bản sửa qua `PATCH /sales/opportunities/:code`. Giữ lại phép gộp
 *     là để một dòng xuất hiện hai lần — một bản của máy chủ, một bản của desk.
 *   · `nameOfActor` — dòng sổ nay chở `owners[]` có sẵn TÊN. Tra ngược id sang
 *     tên bằng danh sách actor của fixture là đọc tên khách hàng ra từ một kịch
 *     bản đóng băng, cho dữ liệu không thuộc kịch bản đó.
 *   · `stageOfState` — ĐÃ CHẾT hẳn cùng ADR 0064. Không còn hai trục để nối:
 *     `stage` do một writer duy nhất ở máy chủ đẩy theo sự kiện thật.
 *
 *  Thứ KHÔNG biến mất: `missingOf` và `toggled`. Chúng là luật của PHIẾU, và
 *  phiếu vẫn là phiếu — người dùng vẫn điền `OpportunityDraft` ở cả popup lẫn
 *  hồ sơ, `data/ops-create.ts` dịch nó sang thân request.
 *
 *  ------------------------------------------------------------------
 *  LỌC · SẮP · PHÂN TRANG ĐỀU ĐÃ SANG MÁY CHỦ — 29/08
 *  ------------------------------------------------------------------
 *  `size=200` cứng đã đi. Nó là con số làm cho cái sổ NÓI DỐI kể từ dòng thứ
 *  201 — im lặng, với một trang trông vẫn đầy đủ — vì cả ba việc dựng trên nó
 *  (thẻ điểm đếm tại trình duyệt, ba ô lọc gom từ chính mảng đã tải, và phép
 *  cắt trang bằng `slice`) đều chỉ đúng khi màn cầm TOÀN BỘ sổ. Nay câu hỏi đi
 *  cả gói xuống `GET /sales/opportunities`, và một bộ lọc bỏ lại ở trình duyệt
 *  thì không còn lọc cái sổ nữa: nó lọc đúng cái trang máy chủ vừa gửi.
 *
 *  Ba query mọc ra từ đó, và cả ba đều là hệ quả của cùng một phép chia:
 *   · `opportunityBookQuery(query)` — trang đang xem, tham số đi vào `queryKey`;
 *   · `opportunityScorecardQuery`   — bốn con số của CẢ sổ, đếm bằng SQL;
 *   · `opportunityFacetQuery`       — filter choices and tab counts, from `/facets`.
 *
 *  Hai hàm dịch địa chỉ (`opportunityBookQueryToParams` /
 *  `parseOpportunityBookQuery`) ở ngay đây chứ không ở `app/url.ts`: file đó là
 *  của sổ lead, và một trục lọc chỉ có ở sổ này thì không có lý do gì phải đi
 *  vòng qua một module dùng chung. */

export const OPPORTUNITY_BOOK_KEY = ['sales', 'ops-book'] as const

/** Ba trục mà `OpportunityController.book` khai bằng `@Need({ …, permission:
 *  'opportunity.view', scoped: true })` — viết MỘT lần cho cả hai lượt đọc SỔ: trang
 *  đang xem và lượt đọc dựng ô lọc.
 *
 *  Lượt đọc thứ ba từng dùng chung hằng này — "lead này đã có đơn chưa" — đã
 *  rời đi, và nó rời đi vì `scoped` là thứ làm nó sai: một chốt chặn trùng đơn
 *  cắt theo phạm vi sẽ giấu đi đúng cái đơn nó cần tìm. Nay nó gọi cửa riêng,
 *  khai `@Need` riêng — xem `opportunitiesOfLeadQuery` ở cuối file.
 *
 *  `scoped` ở phía này KHÔNG tự cắt gì — trình duyệt không cầm dòng nào để mà
 *  cắt và không bao giờ được là nơi quyết định. Nó là LỜI KHAI, để hai đầu của
 *  cùng một ma trận quyền đọc ra cùng một câu; biên lai của phép cắt thật là
 *  `hidden` trên phản hồi (xem `ApiNeed` ở `app/api/client.ts`).
 *
 *  `opportunityProfileQuery` đã khai đúng trục này từ 22/09: `hidden` không có
 *  nghĩa gì với một dòng, nhưng một `need` nói khác controller thì không ai đọc
 *  lại. Lượt đọc CỐ TÌNH không có trục này còn lại là hai thẻ điểm — điểm của
 *  cả phòng, đọc docblock của chúng. */
const BOOK_NEED: ApiNeed = { branch: 'Sales', permission: 'opportunity.view', scoped: true }

/** Mọi tên trường `OpportunityBookQuery` nhận, đọc thẳng từ chính schema chứ
 *  không chép tay: ngày hợp đồng mọc thêm một trục lọc, hai hàm dịch bên dưới
 *  đi theo mà không ai phải nhớ sửa. Cùng nước đi `app/url.ts` đã làm cho sổ
 *  lead, và cùng lý do — một danh sách tên viết tay là chỗ đầu tiên hai đầu
 *  lệch nhau. */
const OPPORTUNITY_BOOK_QUERY_KEYS = Object.keys(
  OpportunityBookQuery.shape,
) as (keyof OpportunityBookQuery)[]

/** Câu hỏi sổ khi CHƯA ai chạm vào bộ lọc.
 *
 *  Dựng bằng `.parse` chứ không `.safeParse`: một object rỗng mà hỏng ở đây
 *  nghĩa là hợp đồng vừa mọc thêm một trường bắt buộc không có mặc định — thứ
 *  phải đổ ngay lúc nạp module, không phải lặng lẽ rơi về một giá trị bịa.
 *
 *  Xuất ra vì màn cần đúng bộ mặc định mà `opportunityBookQueryToParams` sẽ BỎ
 *  khỏi địa chỉ: "bỏ hết bộ lọc" phải đặt mọi trục về đúng giá trị bị bỏ đó, và
 *  gõ lại chúng lần thứ hai trong `pages/opportunities.tsx` là cách một bộ lọc
 *  đã xoá vẫn để lại `?state=nego` trên thanh địa chỉ. */
export const DEFAULT_OPPORTUNITY_BOOK_QUERY: OpportunityBookQuery = OpportunityBookQuery.parse({})

/** `OpportunityBookQuery` → tham số URL, BỎ mọi trường còn bằng mặc định.
 *
 *  Màn ghi địa chỉ bằng CHÍNH hàm này, nên câu hỏi gửi máy chủ và câu hỏi nằm
 *  trên thanh địa chỉ không thể lệch nhau — một link gửi cho đồng nghiệp mở ra
 *  đúng cái sổ người gửi đang nhìn. Phép bỏ mặc định là phần bắt buộc chứ không
 *  phải làm đẹp: không bỏ thì vừa mở màn đã thấy
 *  `?page=1&size=50&sort=createdAt&dir=desc` — bốn tham số không ai chọn, và là
 *  bốn thứ người dùng sẽ chép nguyên vào link chia sẻ. */
export function opportunityBookQueryToParams(query: OpportunityBookQuery): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of OPPORTUNITY_BOOK_QUERY_KEYS) {
    const value = query[key]
    if (value === undefined) continue
    if (value === DEFAULT_OPPORTUNITY_BOOK_QUERY[key]) continue
    params.set(key, String(value))
  }
  return params
}

/** Địa chỉ → `OpportunityBookQuery`, kiểm bằng chính schema của hợp đồng.
 *
 *  KHÔNG BAO GIỜ ném. Người ta sửa tay được thanh địa chỉ (`?state=nope`,
 *  `?page=abc`), và một màn trắng vì một ký tự thừa thì tệ hơn mọi cách hỏng
 *  khác. Rơi về mặc định là rơi CẢ câu hỏi chứ không từng trường một:
 *  `OpportunityBookQuery` mới là thứ định nghĩa tổ hợp nào hợp lệ, và nhặt lại
 *  "mấy trường còn tốt" từ một lượt parse hỏng là chép tay lại đúng phán đoán
 *  mà zod vừa làm hộ. */
export function parseOpportunityBookQuery(params: URLSearchParams): OpportunityBookQuery {
  const raw: Record<string, string> = {}
  for (const key of OPPORTUNITY_BOOK_QUERY_KEYS) {
    const value = params.get(key)
    if (value !== null) raw[key] = value
  }
  const parsed = OpportunityBookQuery.safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_OPPORTUNITY_BOOK_QUERY
}

/** Sổ, MỘT trang một lần — `{ rows, total, hidden }`, hình của `paged()`.
 *
 *  Nhận THAM SỐ chứ không còn là một giá trị đứng sẵn: một cái sổ đã lọc, sắp
 *  và phân trang ở máy chủ không còn là một giá trị mà là một HÀM của bộ lọc,
 *  và `queryKey` phải chở đúng tham số đó — nếu không TanStack trả cache của bộ
 *  lọc trước cho bộ lọc sau.
 *
 *  Khoá vẫn NỐI DÀI `OPPORTUNITY_BOOK_KEY` chứ không đứng riêng: ba cửa ghi ở
 *  `data/opportunities-write.ts` và lượt nạp tệp ở `data/opportunity-import.ts`
 *  vô hiệu hoá theo tiền tố `['sales','ops-book']`, nên mọi trang đang nằm
 *  trong cache cùng chạy lại sau một lượt ghi, không cần ai nhớ thêm một dòng.
 *
 *  `signal` nối vào `AbortSignal` của TanStack: gõ nhanh trên ô tìm thì trang
 *  đang bay bị huỷ, thay vì về sau và ghi đè trang mới. */
export const opportunityBookQuery = (query: OpportunityBookQuery) =>
  queryOptions({
    queryKey: [...OPPORTUNITY_BOOK_KEY, 'page', query] as const,
    queryFn: ({ signal }) =>
      api.read<OpportunityBookResponse>(
        `/sales/opportunities?${opportunityBookQueryToParams(query)}`,
        { need: BOOK_NEED, schema: OpportunityBookResponse, signal },
      ),
  })

/** Thẻ điểm cả sổ — `GET /sales/opportunities/scorecard`, đếm bằng SQL.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG `scoped`, VÀ ĐÓ LÀ CHỦ Ý — MÀN PHẢI NÓI RA
 *  ------------------------------------------------------------------
 *  Chép đúng `@Need` của `OpportunityController.scorecard`, cửa duy nhất của sổ
 *  cơ hội không bật trục phạm vi: đây là điểm của CẢ PHÒNG. Cắt nó theo đơn ai
 *  đang giữ thì mỗi người mở màn đọc một con số khác nhau dưới cùng một dòng
 *  chữ, và không con số nào trong số đó là con số đang được hỏi.
 *
 *  Hệ quả phải nói ra chứ không được giấu: với một vai chỉ thấy đơn của mình,
 *  `total` ở đây KHÁC `total` của sổ ngay bên dưới. Hai con số trả lời hai câu
 *  khác nhau — "cả sổ có bao nhiêu đơn" và "bạn nhìn thấy bao nhiêu" — nên chữ
 *  trên `Kicker` của `ScoreCards` phải nói rõ vế thứ nhất.
 *
 *  Khoá NỐI DÀI `OPPORTUNITY_BOOK_KEY`: một lượt promote hay một lô nạp tệp làm
 *  sai cả bốn con số này, và cả ba cửa ghi đều đã vô hiệu hoá theo tiền tố đó.
 *  Đứng riêng thì thẻ điểm treo số cũ cho tới lần gắn màn sau — đúng món nợ mà
 *  `leadScorecardQuery` đang mang.
 *
 *  `staleTime` một phút: bốn con số của cả sổ không đổi giữa hai cú bấm, còn
 *  màn này thì gắn/gỡ mỗi lần người dùng đi ra rồi quay lại từ hồ sơ cơ hội. */
export const opportunityScorecardQuery = queryOptions({
  queryKey: [...OPPORTUNITY_BOOK_KEY, 'scorecard'] as const,
  queryFn: ({ signal }) =>
    api.read<OpportunityScorecard>('/sales/opportunities/scorecard', {
      need: { branch: 'Sales', permission: 'opportunity.view' },
      schema: OpportunityScorecard,
      signal,
    }),
  staleTime: 60 * 1000,
})

/** The same open pipeline as the scorecard, split across the columns it stands in.
 *
 *  The scorecard answers "how much is open"; this answers "standing where, and
 *  how much of it has gone stale". Two calls rather than one because the Ops
 *  book only needs the first — folding them together would make that book pull
 *  down a chart it never draws.
 *
 *  Unscoped, copying both scorecards: this is the shape of the whole desk, not
 *  of any one person's. */
export const opportunityHistogramQuery = queryOptions({
  queryKey: [...OPPORTUNITY_BOOK_KEY, 'histogram'] as const,
  queryFn: ({ signal }) =>
    api.read<OpportunityHistogram>('/sales/opportunities/histogram', {
      need: { branch: 'Sales', permission: 'opportunity.view' },
      schema: OpportunityHistogram,
      signal,
    }),
  staleTime: 60 * 1000,
})

/** The book's filters minus `state` and paging — what `/facets` takes. Built
 *  by dropping keys, not by `.parse`: `Bool` parses the wire's `'true'`, not
 *  the `true` a parsed query already holds. */
export function facetsQueryOf(query: OpportunityBookQuery): OpportunityFacetsQuery {
  const { state: _state, page: _page, size: _size, sort: _sort, dir: _dir, ...rest } = query
  return rest
}

/** `GET /sales/opportunities/facets` — the filter choices and the per-state tab
 *  counts, DISTINCT and counted in SQL. Scoped like the book, so a select never
 *  lists a person whose filter would return no visible row. */
export const opportunityFacetQuery = (query: OpportunityFacetsQuery) =>
  queryOptions({
    queryKey: [...OPPORTUNITY_BOOK_KEY, 'facets', query] as const,
    queryFn: ({ signal }) =>
      api.read<OpportunityFacetsResponse>(
        `/sales/opportunities/facets?${opportunityBookQueryToParams({
          ...DEFAULT_OPPORTUNITY_BOOK_QUERY,
          ...query,
        })}`,
        { need: BOOK_NEED, schema: OpportunityFacetsResponse, signal },
      ),
  })

/** One deal, plus WHERE IT STANDS.
 *
 *  `scoped: true` because `GET /:code` declares it (ADR 0064 §5). It cuts
 *  nothing in the browser — one row has no `hidden` to report — but a `need`
 *  that disagrees with its controller is the line nobody re-reads.
 *
 *  `OpportunityProfileResponse` rather than `OpportunityRow`: this door carries
 *  `position` — the phase, who is being waited on, and how many days of the
 *  column's limit are left or gone. The book does not, and deliberately: a
 *  position costs the ladder and the open approvals read beside the row, which
 *  is worth it once and not once per page of a book. */
export const opportunityProfileQuery = (code: string) =>
  queryOptions({
    queryKey: ['sales', 'ops', code] as const,
    queryFn: ({ signal }) =>
      api.read<OpportunityProfileResponse>(`/sales/opportunities/${code}`, {
        need: { branch: 'Sales', permission: 'opportunity.view', scoped: true },
        schema: OpportunityProfileResponse,
        signal,
      }),
  })

/** Open deals of one lead — `GET /sales/opportunities/live-deal?leadCode=…`.
 *
 *  Asked of this door, not the book: the book's page of rows cannot say how
 *  many deals it cut, and the page would read an empty list as "none open".
 *  The server cuts `codes` by scope and counts the rest in `hidden`.
 *
 *  A lead may hold several open deals, so the answer is information, never a
 *  gate. `codes: []` is "none open"; `undefined` is "not read yet" — keep them
 *  apart. `hidden` rides along unselected: a colleague's deal the reader may
 *  not open still counts toward "how many", even without a code to show.
 *
 *  The key extends `OPPORTUNITY_BOOK_KEY` so `usePromoteLead`'s prefix
 *  invalidation refreshes this read in the same beat. */
export const opportunitiesOfLeadQuery = (leadCode: string) =>
  queryOptions({
    queryKey: [...OPPORTUNITY_BOOK_KEY, 'of-lead', leadCode] as const,
    queryFn: ({ signal }) =>
      api.read<OpportunityLiveDeal>(
        `/sales/opportunities/live-deal?leadCode=${encodeURIComponent(leadCode)}`,
        {
          need: { branch: 'Sales', permission: 'opportunity.view', scoped: true },
          schema: OpportunityLiveDeal,
          signal,
        },
      ),
  })

// ---------------------------------------------------------------------------
// Đọc một dòng sổ
// ---------------------------------------------------------------------------

/** Hai vai, tách ra khỏi một danh sách người.
 *
 *  Máy chủ trả MỘT mảng `owners` có `role`, không trả hai mảng: một danh sách
 *  người kèm vai là hình của bảng nối, và dây thì đi theo hình của dữ liệu.
 *  Màn cần hai danh sách vì nó bày ra hai hàng avatar, nên phép tách nằm ở
 *  đây — một chỗ, không phải mỗi màn một lần. */
export const ownersOf = (op: OpportunityRow, role: OpportunityOwner['role']) =>
  op.owners.filter((o) => o.role === role)

export const saleOwnersOf = (op: OpportunityRow) => ownersOf(op, 'SALE')
export const bdOwnersOf = (op: OpportunityRow) => ownersOf(op, 'BD')

export const namesOf = (owners: OpportunityOwner[]) => owners.map((o) => o.name)
export const idsOf = (owners: OpportunityOwner[]) => owners.map((o) => o.id)

/** Tiền của một đơn, quy về ĐỒNG. `null` khi đơn chưa moi được ô 9, và `null`
 *  không phải 0.
 *
 *  Xuống đây từ `pages/opportunities.tsx` cùng lượt cắt 29/08, và phần lý do đi
 *  cùng nó thì ngắn: hai người gọi cũ là bảng `SORTERS` và phép cộng của thẻ
 *  điểm, cả hai nay đều ở máy chủ. Người gọi còn lại là cột Amount, thứ vẫn
 *  phải in `billions()` cho một đơn chào bằng USD — nên phép quy đổi vẫn cần,
 *  nó chỉ không còn là việc của tầng màn. Cùng bảng tỉ giá mà máy chủ sắp và
 *  cộng bằng (`@pv/contracts` · `./currency`): hai con số của một pipeline mà
 *  ra từ hai bảng tỉ giá là đúng thứ lệch không ai để ý. */
export const amountVndOf = (op: OpportunityRow) =>
  op.amount === null || op.currency === null ? null : toMoneyVnd(op.amount, op.currency)

/** Đơn đang MỤC — đã đứng trong cột lâu hơn hạn của cột.
 *
 *  ------------------------------------------------------------------
 *  MỘT CÂU HỎI, MỘT CHỖ TRẢ LỜI — 14/09
 *  ------------------------------------------------------------------
 *  Bản cũ tự áp hạn ở đây, tra một `Map` dựng từ `PIPELINE_STAGES` — hằng số
 *  của fixture đóng băng — trong khi hồ sơ đơn cách đó một cú bấm đã đọc hạn
 *  thật từ `config_entry`. Hai câu trả lời cho một câu hỏi về CÙNG một dòng,
 *  và bản cấu hình mới là bản đúng: sửa hạn cột ở màn Cấu hình rồi gật, sổ vẫn
 *  tô vàng theo số cũ mãi mãi.
 *
 *  Nay `overdueBy` về sẵn trong `position` của từng dòng sổ, tính bởi
 *  `pipelinePosition` ở `@pv/engines` trên đúng thang chặng máy chủ vừa đọc.
 *  Hàm này còn lại một phép đọc dấu, và giữ lại vì nó ĐẶT TÊN cho phép đọc đó:
 *  `overdueBy > 0` rải khắp bốn màn là bốn chỗ để ai đó viết `>= 0`.
 *
 *  `null` có hai nghĩa và cả hai ra `false`: cột chưa ai đặt hạn, hoặc dòng
 *  không có mốc vào cột. "Không nói được gì về trễ" khác "không trễ", nhưng cả
 *  hai đều KHÔNG phải "đang mục" — nhuộm vàng một dòng vì thiếu cấu hình là
 *  đổ lỗi cho người bán vì một ô trống của người khác. */
export function isRottingOp(op: Pick<OpportunityBookRow, 'position'>): boolean {
  const overdueBy = op.position?.overdueBy ?? null
  return overdueBy !== null && overdueBy > 0
}

/** The word a column clock wears once it ran over. */
export const OVERDUE_WORD = 'quá hạn'

/** A column's clock: days here against the column's limit, and whether it ran
 *  over. ONE formatter for the book, the bar's hint, the profile and the
 *  journey drawer. `limit` is null when nobody timed the column; `short` drops
 *  that sentence for a narrow cell, `label` adds the overdue word. `overdue` is
 *  the server's verdict where the caller has one (`isRottingOp`); the default
 *  re-derives it and stays only for the journey drawer's rung. */
export type StageClock = {
  days: number
  limit: number | null
  overdue: boolean
  tone: 'warning' | 'muted'
  text: string
  short: string
  label: string
}

export function formatStageClock(
  days: number,
  limit: number | null,
  overdue = limit !== null && days > limit,
): StageClock {
  const short = limit === null ? `${days} ngày` : `${days}/${limit} ngày`
  const text = limit === null ? `${days} ngày · chưa đặt hạn` : short
  return {
    days,
    limit,
    overdue,
    tone: overdue ? 'warning' : 'muted',
    text,
    short,
    label: overdue ? `${text} · ${OVERDUE_WORD}` : text,
  }
}

/** `null` when the deal stands in no column. */
export function stageClockOf(
  op: Pick<OpportunityBookRow, 'stage' | 'daysInStage' | 'position'>,
): StageClock | null {
  if (op.stage === null || op.daysInStage === null) return null
  return formatStageClock(op.daysInStage, op.position?.limitDays ?? null, isRottingOp(op))
}

/* `en-CA` formats as YYYY-MM-DD; the zone is the server's day boundary, so a
   UTC slice cannot print yesterday before 07:00. */
const VN_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

/** Today as a Vietnam calendar day — the day every `Day` on the wire is in. */
export const vnToday = () => VN_DAY.format(Date.now())

const DAY_MS = 24 * 60 * 60 * 1000

/** Today / yesterday / N days ago, counted in Vietnam calendar days.
 *  Wording only: whether that is stale is the row's `activityFreshness`. */
export function activityAgo(at: string): string {
  const days = Math.round(
    (Date.parse(vnToday()) - Date.parse(VN_DAY.format(new Date(at)))) / DAY_MS,
  )
  if (days <= 0) return 'Hôm nay'
  return days === 1 ? 'Hôm qua' : `${days} ngày trước`
}

/** An open deal whose expected close day is already behind it. No expected
 *  day is never late: there is nothing to overrun. */
export function isLateClose(op: OpportunityRow): boolean {
  return op.stage !== null && op.expectedClose !== null && op.expectedClose < vnToday()
}

// ---------------------------------------------------------------------------
// Luật của phiếu
// ---------------------------------------------------------------------------

/** Còn thiếu gì để phiếu này gửi được — MỘT bản kiểm, dùng ở cả hai chỗ.
 *
 *  Trả về danh sách CHỮ chứ không trả `boolean`: thiếu gì thì nói ra thiếu gì.
 *  Một nút mờ không lý do là một ngõ cụt — người dùng không biết phải sửa ô nào
 *  để nó sáng lại.
 *
 *  Đây là bản của MÀN, và nó cố tình soi cùng những điều kiện mà
 *  `OpportunityCreate`/`OpportunityUpdate` soi ở máy chủ. Hai bản không phải
 *  thừa: bản này bật/tắt một cái nút trước khi có request nào, bản kia là hàng
 *  rào thật cho mọi cửa gọi. Bản này lệch thì người dùng thấy một nút sáng rồi
 *  ăn 400; bản kia lệch thì dữ liệu sai vào bảng. */
export function missingOf(draft: OpportunityDraft): string[] {
  const missing: string[] = []
  if (draft.name.trim() === '') missing.push('tên cơ hội')
  if (draft.closedDate === '') missing.push('ngày chốt dự kiến')
  if (draft.amount === null || draft.amount === 0) missing.push('giá trị đơn')
  return missing
}

/** Bật/tắt một người trong một danh sách — cùng phép cho cả hai ô chủ sở hữu. */
export const toggled = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

// ---------------------------------------------------------------------------
// Cách một dòng sổ ra mặt
// ---------------------------------------------------------------------------

/** The tone of each read state — three values, three tones. Exported for the
 *  journey screen too, so a deal wears one colour everywhere.
 *
 *  The table lives in the app, not the contract: "what colour is won" is how
 *  the sales desk presents, not the shape of the data (same split as
 *  `ORIGIN_FACE` in `data/leads.ts`). The four COLUMNS of an open deal wear one
 *  tone: colour answers "is it still on the board", the text answers "which
 *  column". `lost` stays grey rather than `danger`: a stop is a recorded
 *  outcome, and the lead it came from may be nurtured again (ADR 0069 §3). */
export const STATE_TONE: Record<OpportunityStatus, 'success' | 'running' | 'draft'> = {
  open: 'running',
  lost: 'draft',
  won: 'success',
}

/** Ink for the `draft` tone `lost` wears, born as a law 13 rescue when `Badge`'s
 *  `draft` ink measured 4.41:1 dark and 3.81:1 light. That ink is now
 *  `--muted-foreground` and measures 6.3:1 dark and 5.4:1 light, so this only
 *  darkens a pill that already clears 4.5. Same mechanism as `CLOSE_BADGE` in
 *  `components/workstream-bits.tsx`. */
export const BADGE_INK = 'text-foreground'

/** What a row's pill SAYS: the COLUMN while the deal is on the board, the read
 *  STATE once it has left — stopped, or a signed contract.
 *
 *  One function for the book cell and the deal's own sticky bar alike: two
 *  screens deciding this separately are two screens calling one deal by two
 *  names. The words come from `@pv/contracts`, which the server prints from too,
 *  so there is no second copy of the vocabulary at the screen layer. */
export const standingLabel = (op: Pick<OpportunityRow, 'state' | 'stage'>): string =>
  op.state === 'open' && op.stage !== null
    ? OPPORTUNITY_STAGE_LABEL[op.stage]
    : OPPORTUNITY_STATE_LABEL[op.state]

/** The two fact doors of a deal (ADR 0072), judged per reader by the server. */
export type EventKind = 'activity' | 'quotation'

/** What recording a fact does now. `atAssigned`: a quotation skips `engaged`
 *  (the screen confirms first) and a first activity enters it. `nextRound` is
 *  the quotation's n-th send — on a won deal, a new round. */
export type EventOffer = { nextRound: number; atAssigned: boolean }

/** The offer, or `null` when the server's verdict (`acts`) refuses the door. */
export function eventOfferOf(
  op: Pick<OpportunityProfileResponse, 'acts' | 'stage' | 'quotationRounds'>,
  kind: EventKind,
): EventOffer | null {
  if (!op.acts[kind].ok) return null
  return { nextRound: op.quotationRounds + 1, atAssigned: op.stage === 'assigned' }
}

/** The server's sentence for a refused door, or `null` when it is open. */
export const refusalOf = (act: OpportunityAct): string | null => (act.ok ? null : act.reason)

/** The object chain as ContextRail wants it — chips, with a way to open each.
 *
 *  ------------------------------------------------------------------
 *  ONE HELPER FOR BOTH PROFILES, AND THE ROUTE COMES FROM `kind`
 *  ------------------------------------------------------------------
 *  Rule 10 makes `E1.story()` the only legal input to the rail, and the server
 *  already walked it — so this does not build a chain, it dresses one. What it
 *  adds is the two things the wire cannot carry: which chip is the record
 *  currently open (`source`), and where each chip goes.
 *
 *  The destination is read off `kind` rather than off the code's prefix. A
 *  prefix test is the same lookup written in a way that breaks quietly the day
 *  a kind is added — and `ObjectKind` already exists to answer this.
 *
 *  A kind with no screen gets NO `onOpen`, so the chip draws but does not
 *  pretend to be a door. Today that is every kind outside Sales — scope
 *  reopened to blocks 4 and 5 on 16/09
 *  (`docs/decisions/0054-reopen-scope-to-full-customer-journey.md`),
 *  so this list grows as those screens land — plus `BG`, whose screen is the
 *  one still missing from the Sales chain. */
const CHAIN_ROUTE: Record<string, string> = {
  WS: '/sales/workstreams',
  LD: '/sales/leads',
  OP: '/sales/opportunities',
  /* The contract kind is deliberately absent while Sales module 4 is parked
     (`app/parked.ts`): the chip still draws it, but it is no longer a door to
     a screen whose route now redirects home. */
  AC: '/sales/accounts',
  CT: '/sales/contacts',
}

/** Undefined when the kind has no screen yet. */
export const chainPath = (kind: string, code: string): string | undefined => {
  const base = CHAIN_ROUTE[kind]
  return base && `${base}/${encodeURIComponent(code)}`
}

export function railOf(
  chain: readonly ObjectChainLink[],
  openCode: string,
  go: (path: string) => void,
): RailObject[] {
  return chain.map((link) => {
    const path = chainPath(link.kind, link.code)

    return {
      code: link.code,
      /* `source` is ContextRail's word for "this is the one you are looking
         at" — it paints the accent chip. Not "where the chain started". */
      source: link.code === openCode,
      ...(path && link.code !== openCode ? { onOpen: () => go(path) } : {}),
    }
  })
}
