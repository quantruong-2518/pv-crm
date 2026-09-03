import { queryOptions } from '@tanstack/react-query'
import {
  OpportunityBookQuery,
  OpportunityBookResponse,
  OpportunityHistogram,
  OpportunityScorecard,
  type OpportunityLiveDeal,
  type OpportunityOwner,
  type OpportunityRow,
  type OpportunityState,
} from '@pv/contracts'
import { PIPELINE_STAGES, toDong, type OpportunityDraft } from '@pv/engines/fixtures/das-vina'
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
 *   · `stageOfState` — chuyển sang `@pv/contracts`, nơi máy chủ cũng đọc nó.
 *     Một bảng nối, hai đầu dây.
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
 *   · `opportunityFacetQuery`       — ba ô lọc, đọc riêng một lượt (đọc docblock
 *     của nó trước khi bắt chước: đó là chắp vá, không phải giải pháp).
 *
 *  Hai hàm dịch địa chỉ (`opportunityBookQueryToParams` /
 *  `parseOpportunityBookQuery`) ở ngay đây chứ không ở `app/url.ts`: file đó là
 *  của sổ lead, và một trục lọc chỉ có ở sổ này thì không có lý do gì phải đi
 *  vòng qua một module dùng chung. */

export const OPPORTUNITY_BOOK_KEY = ['sales', 'ops-book'] as const

/** Ba trục mà `OpportunityController.book` khai bằng `@Need({ …, permission:
 *  'cơ-hội.xem', scoped: true })` — viết MỘT lần cho cả hai lượt đọc SỔ: trang
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
 *  Lượt đọc còn thiếu trục này giờ chỉ còn `opportunityProfileQuery`, và đó là
 *  một sự lệch có ý thức chứ không phải quên: cửa `GET /sales/opportunities/:code`
 *  trả MỘT dòng, không phải một sổ, nên `hidden` không có nghĩa gì ở đó — sửa
 *  nó là việc khác. */
const BOOK_NEED: ApiNeed = { branch: 'Sales', permission: 'cơ-hội.xem', scoped: true }

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
      need: { branch: 'Sales', permission: 'cơ-hội.xem' },
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
      need: { branch: 'Sales', permission: 'cơ-hội.xem' },
      schema: OpportunityHistogram,
      signal,
    }),
  staleTime: 60 * 1000,
})

/** Trần `size` của hợp đồng (`PageQuery.size.max(200)`). Đây là con số làm cho
 *  `opportunityFacetQuery` bên dưới có HẠN SỬ DỤNG, nên nó phải đọc được thành
 *  số chứ không nấp trong một chuỗi. */
export const FACET_SIZE = 200

/** CHẮP VÁ — không phải một giải pháp. Đọc hết trước khi dùng lại kiểu này.
 *
 *  Ba ô lọc "Sale owner", "BD owner" và "Account" là danh sách CHỌN, nên chúng
 *  cần mọi giá trị có trong SỔ, không phải mọi giá trị có trên TRANG đang mở.
 *  Khi sổ còn nằm cả trong bộ nhớ thì gom từ `book` trả lời đúng; từ lúc máy
 *  chủ chỉ gửi mười dòng một trang thì đúng phép gom đó trả về những người xuất
 *  hiện trên mười dòng ấy, và bộ lọc HỎNG THẦM LẶNG — nó tự giấu mất lựa chọn,
 *  người dùng không tìm thấy đồng nghiệp hay công ty mà họ biết chắc là có
 *  trong sổ, và không có gì trên màn nói cho họ biết vì sao.
 *
 *  Không có endpoint nào trả facet, nên đây là một lần gọi thứ hai vào chính
 *  `GET /sales/opportunities` với `size=200`, cache theo tiền tố của sổ, chỉ để
 *  dựng ba danh sách chọn. Sổ lead đã gặp và đã giải đúng cách này
 *  (`leadFacetQuery`, `data/leads.ts`); chỗ này chép nước đi đó, kể cả phần nợ.
 *
 *  **Nó gãy khi sổ vượt 200 đơn.** Ở đơn thứ 201, trang đầu vẫn đúng còn ba ô
 *  lọc lặng lẽ thiếu giá trị — cùng một kiểu hỏng, chỉ chậm hơn. `size` không
 *  nâng lên được: 200 là trần của `PageQuery` (`FACET_SIZE`), và nâng trần chỉ
 *  dời ngày gãy chứ không bỏ nó.
 *
 *  Cách sửa THẬT là một endpoint facet — `GET /sales/opportunities/facets` trả
 *  danh sách người và account đã DISTINCT ở SQL, kèm số dòng mỗi giá trị. Một
 *  câu `SELECT DISTINCT` trên cột đã có index, thay cho việc kéo cả sổ về trình
 *  duyệt để làm đúng việc đó bằng JavaScript.
 *
 *  Lượt đọc này CÓ `scoped`, và điều đó đúng chứ không mâu thuẫn với thẻ điểm:
 *  ô lọc là để lọc CÁI SỔ người dùng nhìn thấy, nên nó không được liệt kê một
 *  người mà lọc theo họ thì ra không dòng nào. */
export const opportunityFacetQuery = queryOptions({
  queryKey: [...OPPORTUNITY_BOOK_KEY, 'facets'] as const,
  queryFn: ({ signal }) =>
    api.read<OpportunityBookResponse>(`/sales/opportunities?size=${FACET_SIZE}`, {
      need: BOOK_NEED,
      signal,
    }),
})

export const opportunityProfileQuery = (code: string) =>
  queryOptions({
    queryKey: ['sales', 'ops', code] as const,
    queryFn: () =>
      api.read<OpportunityRow>(`/sales/opportunities/${code}`, {
        need: { branch: 'Sales', permission: 'cơ-hội.xem' },
      }),
  })

/** Đơn CÒN SỐNG của một lead — `GET /sales/opportunities/live-deal?leadCode=…`.
 *
 *  ------------------------------------------------------------------
 *  QUERY NÀY TỒN TẠI ĐỂ GIẾT MỘT LỖI CỤ THỂ
 *  ------------------------------------------------------------------
 *  Hồ sơ lead phải trả lời "khách này đã được đổi thành cơ hội chưa" TRƯỚC khi
 *  bày cái nút đổi. Có một thời nó trả lời bằng `opportunityOfLead()` — một
 *  phép tra trong mảng fixture đóng băng — nên mọi lead tạo sau lát cắt đó luôn
 *  nhận `undefined`, nút vẫn sáng, và bấm thêm lần nữa là mở đơn thứ hai cho
 *  cùng một khách. Đó chính là con số không có thật mà `desk.deals` được đẻ ra
 *  để chặn, chặn bằng localStorage — đổi máy là hết.
 *
 *  ------------------------------------------------------------------
 *  BỎ CỬA SỔ VÌ CỬA SỔ CẮT THEO PHẠM VI — 29/08
 *  ------------------------------------------------------------------
 *  Bản trước hỏi câu này bằng chính cửa sổ, `GET /sales/opportunities?leadCode=…`
 *  với `BOOK_NEED` (`scoped: true`), và nó thủng với MỌI Sale `ownOnly`: Sale A
 *  đổi LD-0042 thành OP-5001; Sale B mở LD-0042, máy chủ cắt mất OP-5001 vì đơn
 *  không đứng tên B, `rows` về rỗng, và màn đọc rỗng thành "chưa ai đổi". Nút
 *  sáng, cửa `POST` chỉ đòi `cơ-hội.sửa` và không kiểm trùng — đúng con lỗi mà
 *  đoạn trên nói query này sinh ra để giết, quay lại bằng đường khác.
 *
 *  Cửa mới bỏ trục phạm vi có chủ ý và trả đúng một mã đơn để bù lại (đọc
 *  `OpportunityLiveDeal` ở `@pv/contracts` trước khi mở rộng nó — hình hẹp đó
 *  LÀ cái giá của việc bỏ trục phạm vi, không phải chỗ trống chưa ai điền).
 *  Vì thế lượt đọc này KHÔNG dùng `BOOK_NEED`: nó khai đúng `@Need` của cửa nó
 *  gọi, và cửa đó không `scoped`.
 *
 *  ------------------------------------------------------------------
 *  "CÒN SỐNG", KHÔNG PHẢI "TỪNG TỒN TẠI"
 *  ------------------------------------------------------------------
 *  Máy chủ chỉ trả đơn chưa thua và chưa ký. Trước đây màn chặn theo bất kỳ đơn
 *  nào từng tồn tại, nên một lead có đúng một đơn đã thua quý I thì quý III
 *  khách quay lại vẫn thấy nút "Cơ hội OP-5001" thay cho nút đổi — vĩnh viễn —
 *  trong khi cửa nạp tệp lại nhận đúng dòng đó vì nó chỉ soi đơn còn sống. Hai
 *  cửa của một sổ nay trả lời bằng cùng một vị từ.
 *
 *  `select` gói lại thành MẢNG, và đó là chủ ý chứ không phải di sản: người gọi
 *  hỏi "có đơn nào chưa" rồi lấy `[0]?.code`, mà một lead giữ được nhiều đơn —
 *  ngày cửa này trả về cả danh sách thì chỗ gọi không phải đổi một dòng. Mảng
 *  RỖNG là câu trả lời "chưa có", và nó khác `undefined` (chưa đọc xong) đúng ở
 *  chỗ màn cần: rỗng thì mời đổi, `undefined` thì tắt nút và nói đang kiểm tra.
 *
 *  Khoá NỐI DÀI `OPPORTUNITY_BOOK_KEY` chứ không đứng riêng, và đó là phần làm
 *  cho nút tự lật: `usePromoteLead` vô hiệu hoá `['sales','ops-book']` sau khi
 *  máy chủ nhận phiếu, mà TanStack vô hiệu hoá theo TIỀN TỐ — nên lượt đọc này
 *  chạy lại ngay trong cùng nhịp, không cần ai nhớ thêm một dòng invalidate. */
export const opportunitiesOfLeadQuery = (leadCode: string) =>
  queryOptions({
    queryKey: [...OPPORTUNITY_BOOK_KEY, 'of-lead', leadCode] as const,
    queryFn: ({ signal }) =>
      api.read<OpportunityLiveDeal>(
        `/sales/opportunities/live-deal?leadCode=${encodeURIComponent(leadCode)}`,
        {
          need: { branch: 'Sales', permission: 'cơ-hội.xem' },
          signal,
        },
      ),
    select: (d: OpportunityLiveDeal) => (d.code === null ? [] : [{ code: d.code }]),
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
export const dongOf = (op: OpportunityRow) =>
  op.amount === null || op.currency === null ? null : toDong(op.amount, op.currency)

/** Hạn của mỗi cột, tra theo khoá. */
const STAGE_LIMIT = new Map(PIPELINE_STAGES.map((s) => [s.key, s.limitDays]))

/** Đơn đang MỤC — nằm trong cột lâu hơn hạn của cột.
 *
 *  Máy chủ gửi SỐ NGÀY, màn áp HẠN. Chia thế vì hai vế có hai đời sống khác
 *  nhau: số ngày là một phép trừ trên `stage_since`, chỉ database biết; còn hạn
 *  mỗi cột là dòng cấu hình của phòng kinh doanh, thứ người ta sửa được và màn
 *  đã cầm sẵn.
 *
 *  `daysInStage === null` = đơn đã ra khỏi năm cột, và đơn đã đóng sổ thì không
 *  còn cột nào để mà mục. Đây cũng là chỗ bản cũ hay sai: kiểm `stage` trước
 *  rồi mới tra, nếu không thì một đơn vừa chuyển sang Close won vẫn bị tô vàng
 *  "mục" vì mã của nó còn trong bảng đơn đang mở. */
export function isRottingOp(op: OpportunityRow): boolean {
  if (op.daysInStage === null || op.stage === null) return false
  return op.daysInStage > (STAGE_LIMIT.get(op.stage) ?? Infinity)
}

/** The five columns plus where this deal stands, shaped for `StageTrack`.
 *  `null` means the deal stands in no column (signed or lost) and there is no
 *  bar to draw at all.
 *
 *  ONE function for both callers — the book grid and the deal profile. Two
 *  screens each building their own step array is two screens painting the same
 *  deal differently the day somebody adds a column on the Settings screen; the
 *  same reason `STAGE_LIMIT` above exists only once.
 *
 *  The hint hangs on the STANDING column only, and it carries what a rotting
 *  deal needs: days here against the column's limit. `isRottingOp` deliberately
 *  does NOT recolour the bar — the rot warning already has its place (an amber
 *  badge in the book, a line on the profile), and a bar saying both position
 *  and health says neither legibly. */
export function stageTrackOf(
  op: Pick<OpportunityRow, 'stage' | 'daysInStage'>,
): { steps: { key: string; label: string; hint?: string }[]; current: number } | null {
  const stage = op.stage
  if (stage === null) return null

  const current = PIPELINE_STAGES.findIndex((s) => s.key === stage)
  /* A column the server returned that the constant does not know: the deal
     stands somewhere this screen cannot draw. Return `null` so the caller falls
     back to its badge, rather than painting five grey segments — that bar reads
     as "this deal has not moved anywhere", which is a false sentence. */
  if (current === -1) return null

  return {
    current,
    steps: PIPELINE_STAGES.map((s, i) => ({
      key: s.key,
      label: s.label,
      ...(i === current && op.daysInStage !== null
        ? { hint: `${op.daysInStage} ngày · hạn ${s.limitDays}` }
        : {}),
    })),
  }
}

/** Hôm nay, dạng ISO ngày. Sổ nay là dữ liệu SỐNG nên mốc so sánh là hôm nay,
 *  không còn là lát cắt đóng băng của kịch bản. */
const today = () => new Date().toISOString().slice(0, 10)

/** Đơn đang mở mà ngày đóng dự kiến đã trôi qua — "đáng lẽ đóng rồi".
 *
 *  Đơn chưa đặt ngày đóng thì KHÔNG trễ: không có hạn thì không có gì để quá.
 *  Hai chục dòng của sổ đóng băng rơi vào đúng nhánh đó. */
export function isLateClose(op: OpportunityRow): boolean {
  return op.stage !== null && op.expectedClose !== null && op.expectedClose <= today()
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
  if (draft.closedDate === '') missing.push('ngày đóng dự kiến')
  if (draft.amount === null || draft.amount === 0) missing.push('giá trị đơn')
  if (draft.saleOwners.length === 0) missing.push('ít nhất một Sale đứng đơn')
  if (draft.state === 'close-lost' && draft.lossReason === '' && draft.lossNote.trim() === '') {
    missing.push('lý do thua')
  }
  return missing
}

/** Bật/tắt một người trong một danh sách — cùng phép cho cả hai ô chủ sở hữu. */
export const toggled = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

// ---------------------------------------------------------------------------
// Cách một dòng sổ ra mặt
// ---------------------------------------------------------------------------

/** Màu của trạng thái — năm trạng thái, năm tone, không trùng nhau.
 *
 *  Bảng nằm ở tầng app chứ không ở hợp đồng: "close-won màu gì" là cách trình
 *  bày của phòng kinh doanh, không phải hình của dữ liệu (cùng cách chia với
 *  `ORIGIN_FACE` ở `data/leads.ts`).
 *
 *  Ba trạng thái đang chạy KHÔNG tô ba màu khác nhau: bảng token có năm tone
 *  semantic, và tô hết cho ba bậc của cùng một việc thì màu chỉ còn nói lại
 *  đúng chữ đã in trong chính cái pill. Màu ở đây trả lời "đơn này còn sống
 *  không", chữ trả lời "đang ở bậc nào". */
export const STATE_TONE: Record<OpportunityState, 'success' | 'danger' | 'running' | 'draft'> = {
  'close-won': 'success',
  'close-lost': 'danger',
  nego: 'running',
  'gui-quotation': 'running',
  pending: 'draft',
}
