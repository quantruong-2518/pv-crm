import { useEffect, useMemo, useState } from 'react'
import { Ban, FileCheck, Inbox, Target, TriangleAlert, Wallet } from '@pv/ui'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  DataTable,
  EmptyState,
  GlassCard,
  Kicker,
  SearchField,
  Select,
  Skeleton,
  ScreenHeader,
  ScreenLayout,
  ScreenScoreGrid,
  ScreenToolbar,
  StatCard,
  billions,
  cn,
  percent,
  type TableSort,
} from '@pv/ui'
import {
  OpportunitySortKey,
  OWNER_NONE,
  type OpportunityBookQuery,
  type OpportunityOwner,
  type OpportunityRow,
  type OpportunityState,
} from '@pv/contracts'
import { OPPORTUNITY_STATES } from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { toast } from '@/app/toast'
import { isApiError, userMessage } from '@/app/api'
import { pageIndexFromQueryPage, queryPageFromPageIndex } from '@/app/url'
import { dm } from '@/lib/date'
import {
  bdOwnersOf,
  DEFAULT_OPPORTUNITY_BOOK_QUERY,
  dongOf,
  isLateClose,
  isRottingOp,
  namesOf,
  opportunityBookQuery,
  opportunityBookQueryToParams,
  opportunityFacetQuery,
  opportunityScorecardQuery,
  parseOpportunityBookQuery,
  saleOwnersOf,
  STATE_TONE,
} from '@/data/opportunities'
import { OP_SPEC } from '@/data/intake'
import { useOpportunityImport } from '@/data/opportunity-import'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { Pager, PersonCell } from '@/components/table-bits'
import { STAGE_LABEL, STATE_LABEL } from '@/components/ops-fields'

/** Module 3 · Sổ cơ hội — `GET /sales/opportunities`.
 *
 *  ------------------------------------------------------------------
 *  CÙNG HÌNH VỚI SỔ LEAD, CÓ CHỦ Ý
 *  ------------------------------------------------------------------
 *  Ba khối, đúng thứ tự mắt cần, y hệt `pages/leads.tsx`:
 *   1 · thẻ điểm — bốn con số của cả sổ, đọc trong một nhịp mắt;
 *   2 · một hàng lọc — ô tìm + bốn select;
 *   3 · sổ — bảng phân trang trên `.glass-b` (luật 8).
 *
 *  Người dùng đi từ sổ lead sang sổ này mỗi ngày. Hai cái sổ của cùng một phòng
 *  mà bố cục khác nhau thì mỗi lần chuyển màn là một lần phải học lại chỗ đứng
 *  của ô tìm. `Pager` và `PersonCell` vì thế dùng CHUNG
 *  (`components/table-bits.tsx`) chứ không chép sang.
 *
 *  Khác sổ lead đúng một chỗ và khác có lý do: **không có cột Ghim.** Ghim là
 *  thứ của người ĐANG ĐỌC sổ lead, giữ theo `actorId` ở `app/desk.ts`; đẻ thêm
 *  một bộ ghim thứ hai cho sổ cơ hội trước khi có ai hỏi là thêm trạng thái mà
 *  không thêm câu trả lời nào.
 *
 *  ------------------------------------------------------------------
 *  NỢ LUẬT 10 — ContextRail, ghi ra chứ không im lặng
 *  ------------------------------------------------------------------
 *  Luật 10 đòi rail trên mọi màn, và màn này KHÔNG có. Đây là NỢ có ý thức chứ
 *  không phải quên, và lý do đúng bằng lý do đã ghi ở `pages/leads.tsx`: một sổ
 *  không có object nào ĐANG MỞ. Rail dựng từ một dòng mồi cứng là treo bốn chip
 *  mã lên đầu một trang mười dòng, nói về một đơn người dùng không hề chọn —
 *  tệ hơn không có rail, vì nó trông như một chuỗi thật.
 *
 *  Trả nợ khi nào rail dựng được từ DÒNG ĐANG ĐƯỢC CHỌN — không sớm hơn. Nợ
 *  của `pages/opportunity-detail.tsx` thì khác và nặng hơn; đọc ở đó.
 *
 *  ------------------------------------------------------------------
 *  ĐÃ CẮT SANG MÁY CHỦ — 28/08. BA THỨ ĐI THEO.
 *  ------------------------------------------------------------------
 *  Sổ đọc thẳng `GET /sales/opportunities`. Ba thứ của bản fixture biến mất, và không cái
 *  nào là dọn dẹp tuỳ hứng:
 *
 *   · **Nạp cơ hội từ tệp.** `ImportZone` ở màn này từng ghi vào `useIntakeDesk`,
 *     một sổ chỉ sống trong trình duyệt. Trên một cái bảng nay là dữ liệu thật,
 *     những dòng đó đọc y hệt dòng máy chủ nhưng không ai khác thấy, không nằm
 *     trong thẻ điểm của người bên cạnh, và biến mất khi đổi máy. Nút đã QUAY
 *     LẠI (29/08) đúng cái ngày `POST /sales/opportunities/import[/preview]` lên: nay nó
 *     ghi thẳng lên máy chủ qua `data/opportunity-import.ts`, và `rowsToOps` của
 *     `data/intake.ts` không còn người gọi — bộ kiểm của máy chủ thay nó.
 *   · **Hòm thư suy từ tên** (`staffEmail`). Dòng sổ nay chở `owners[]` có sẵn
 *     TÊN thật; cột người in tên, không in một địa chỉ ghép theo quy ước.
 *   · **Gộp ba nguồn** (`mergeOps`). Phiếu vừa gửi và bản sửa tại chỗ đều đã đi
 *     qua máy chủ, nên sổ chỉ còn một nguồn.
 *
 *  ------------------------------------------------------------------
 *  LỌC · SẮP · PHÂN TRANG ĐỀU Ở MÁY CHỦ — 29/08, VÀ BỘ LỌC NẰM TRÊN ĐỊA CHỈ
 *  ------------------------------------------------------------------
 *  Bản trước kéo `size=200` rồi lọc, sắp và cắt trang trong trình duyệt. Cách
 *  đó đúng cho tới đơn thứ 201 và im lặng sai sau đó, với một trang trông vẫn
 *  đầy đủ. Nay cả câu hỏi đi xuống `GET /sales/opportunities`, và ba thứ của
 *  bản cũ đi theo nó:
 *
 *   · **`SORTERS`** — bốn hàm so ở màn. Máy chủ sắp rồi; sắp lần thứ hai ở đây
 *     là dựng một chỗ thứ hai quyết định thứ tự, và hai chỗ đó lệch nhau đúng
 *     ngày sổ dài hơn một trang (màn chỉ sắp được mười dòng nó đang cầm).
 *   · **Đếm thẻ điểm tại trình duyệt** — `ScoreCards` nay đọc
 *     `GET /sales/opportunities/scorecard`.
 *   · **Ba ô lọc gom từ trang đang xem** — chúng nay dựng từ `opportunityFacetQuery`,
 *     một lượt đọc riêng. Lý do đầy đủ ở docblock của query đó; tóm tắt: một
 *     trang mười dòng chỉ biết mười người, nên bộ lọc sẽ tự giấu mất lựa chọn.
 *
 *  Và bộ lọc chuyển lên **ĐỊA CHỈ** (`useSearchParams` + hai hàm dịch ở
 *  `data/opportunities.ts`), không còn nằm trong `useState`. Đó không phải tiện
 *  nghi: mở một dòng rồi bấm Back phải quay về đúng cái sổ vừa rời, và một link
 *  gửi cho đồng nghiệp phải mở ra đúng cái sổ người gửi đang nhìn — cả hai đều
 *  không làm được khi bộ lọc chỉ sống trong bộ nhớ của một tab.
 *
 *  ------------------------------------------------------------------
 *  TÁM CỘT
 *  ------------------------------------------------------------------
 *  Mã · Ops name · Account · Amount · Close date · State · Sale owner ·
 *  BD owner. Đúng bộ đã đặt, thêm cột Mã ở đầu — sổ lead cũng mở đầu bằng mã,
 *  và mã là thứ người ta đọc cho nhau qua điện thoại.
 *
 *  Ba cột có tín hiệu phụ ngoài chữ:
 *   · **Amount** — canh phải và chữ mono, vì cột tiền để SO CHIỀU DỌC. Đơn chưa
 *     moi được ô 9 vẽ "—", không vẽ 0.
 *   · **Close date** — ngày dự kiến đã trôi qua thì tô cảnh báo. Đơn chưa đặt
 *     ngày đóng vẽ "—": không có hạn thì không có gì để quá.
 *   · **State** — màu nói "đơn còn sống không", chữ nói "đang ở bậc nào";
 *     `title` chở tên cột pipeline cho ba trạng thái đang chạy.
 *
 *  Vào được màn này là vai có nhánh Sales — cửa ở `app/guard.tsx`, không kiểm
 *  lại ở đây. Trục phạm vi thì máy chủ cắt, và `hidden` là con số nó trả về. */

/** Số dòng bảng này vẽ. Màn áp đè lên `size` của hợp đồng (mặc định 50 cho mọi
 *  sổ) chứ không ghi nó lên địa chỉ — một link chia sẻ không nên mang theo một
 *  con số không ai chọn. */
const PAGE_SIZE = 10

/** Bề rộng tối thiểu của bảng — thứ làm cho `overflow-x-auto` bọc ngoài có
 *  việc để làm. Không có nó thì con của khối cuộn không bao giờ rộng hơn chính
 *  khối cuộn, nên thanh cuộn ngang KHÔNG BAO GIỜ hiện và tám track `fr` bị bóp
 *  thay vì cuộn: ở 1024px cột "Mã" còn ~73px trong khi một `<Chip>` mã đơn cần
 *  ~90px, ở 390px nó còn ~21px. Cùng con số với sổ lead vì cùng tám cột và hai
 *  sổ phải bắt đầu cuộn ở cùng một bề rộng màn hình. */
const TABLE_MIN_WIDTH = 'min-w-[1180px]'

/** Giá trị "không lọc trục này" của bốn ô Select. `<select>` gốc chỉ chở được
 *  chuỗi, nên trạng thái "mọi giá trị" phải có một chuỗi đại diện; trên dây thì
 *  nó là `undefined`, và phép dịch giữa hai bên nằm ở đúng bốn chỗ gọi
 *  `onChange` bên dưới. */
const ANY = 'all'

/** Ô tìm nhỏ giọt lên địa chỉ sau chừng này. Gõ tới đâu thấy tới đó là việc của
 *  `useState`; ghi mỗi phím lên địa chỉ thì nút Back thành nút xoá từng chữ. */
const SEARCH_DELAY_MS = 300

const NO_BD_TITLE = 'Chưa ghi BD mở cửa — công trạng mở cửa chưa ai nhận'
const NO_SALE_TITLE = 'Chưa có Sale đứng đơn'

/** Panel nạp tệp KHÔNG chống trùng trong trình duyệt — tập rỗng là một quyết
 *  định, không phải một chỗ chưa nối.
 *
 *  Máy chủ chống trùng theo MÃ LEAD (`lead:<mã>` — "khách này đã có đơn đang mở
 *  chưa"), và trình duyệt không biết mã đó: nó chỉ cầm một ô "Account" chưa được
 *  dịch sang hồ sơ nào. Một tập khoá dựng phía trình duyệt vì thế trả lời một
 *  câu khác (`ten:công-ty|tỉnh`) và sẽ báo sạch trong khi máy chủ vẫn từ chối —
 *  tệ hơn nữa là nó loại dòng TRƯỚC khi máy chủ được nhìn, mà bốn con số panel
 *  vẽ lại là số của máy chủ. Một cửa chống trùng, và đó là cửa biết mã lead. */
const NO_LOCAL_KEYS: ReadonlySet<string> = new Set()

export function OpportunitiesPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  /* ĐỊA CHỈ là nguồn sự thật của bộ lọc — dịch hai chiều ở `data/opportunities.ts`.
     `size` thì màn áp đè: `PAGE_SIZE` là số dòng bảng này vẽ, còn mặc định của
     hợp đồng là 50 cho mọi sổ. Áp đè ở đây chứ không ghi lên địa chỉ, để một
     link chia sẻ không mang theo một con số không ai chọn. */
  const urlQuery = useMemo(() => parseOpportunityBookQuery(params), [params])
  const query = useMemo<OpportunityBookQuery>(() => ({ ...urlQuery, size: PAGE_SIZE }), [urlQuery])

  /* `error` đọc ra, KHÔNG bỏ. Bỏ nó đi thì một máy chủ chết hiện ra thành
     "Không có cơ hội nào khớp bộ lọc đang chọn" kèm nút "Bỏ hết bộ lọc":
     người dùng đi sửa bộ lọc cho một sự cố hạ tầng, và chỉ dừng lại khi đã bỏ
     hết bộ lọc mà sổ vẫn trống. "Không có dòng nào" và "không hỏi được" là hai
     câu khác nhau, dẫn tới hai việc khác nhau — xem nhánh `bookError` ở chỗ vẽ
     bảng. */
  const {
    data,
    isPending,
    error: bookError,
    refetch: refetchBook,
  } = useQuery(opportunityBookQuery(query))

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const hidden = data?.hidden ?? 0

  /* Sổ ĐẦY ĐỦ, gọi riêng một lần. Đây là chỗ CHẮP VÁ — cả lý do lẫn ngày nó gãy
     nằm trong docblock của `opportunityFacetQuery`, đọc ở đó trước khi bắt
     chước cách này. Ba ô lọc người/công ty cần một câu trả lời về CẢ SỔ mà một
     trang mười dòng không trả lời được. */
  const { data: facets } = useQuery(opportunityFacetQuery)
  const wholeBook = useMemo(() => facets?.rows ?? [], [facets])

  const open = (code: string) => navigate(`/sales/opportunities/${code}`)

  /* Ghi một phần bộ lọc lên địa chỉ. Đổi bộ lọc thì LUÔN về trang đầu — đứng ở
     trang 3 rồi đổi trạng thái thì máy chủ trả một trang rỗng, và người dùng
     đọc nó thành "không có kết quả". */
  const patch = (next: Partial<OpportunityBookQuery>) =>
    setParams(
      opportunityBookQueryToParams({
        ...urlQuery,
        ...next,
        page: DEFAULT_OPPORTUNITY_BOOK_QUERY.page,
      }),
    )

  /* Ô tìm giữ chữ trong state để gõ tới đâu thấy tới đó, rồi mới nhỏ giọt lên
     địa chỉ (`SEARCH_DELAY_MS`). `replace` chứ không đẩy thêm mục lịch sử: một
     câu tìm tám ký tự mà đẩy tám mục thì nút Back thành nút xoá từng chữ. */
  const [text, setText] = useState(urlQuery.q ?? '')

  /* Địa chỉ đổi từ BÊN NGOÀI — nút Back, F5, một link ai đó gửi tới — thì ô tìm
     phải đi theo, nếu không chữ trong ô nói một đằng còn bảng lọc một nẻo. */
  useEffect(() => setText(urlQuery.q ?? ''), [urlQuery.q])

  useEffect(() => {
    const wanted = text.trim() === '' ? undefined : text.trim()
    if (wanted === urlQuery.q) return
    const timer = setTimeout(
      () =>
        setParams(
          opportunityBookQueryToParams({
            ...urlQuery,
            q: wanted,
            page: DEFAULT_OPPORTUNITY_BOOK_QUERY.page,
          }),
          { replace: true },
        ),
      SEARCH_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [text, urlQuery, setParams])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageIndex = Math.min(pageIndexFromQueryPage(query.page), pageCount - 1)

  /* Trang ngoài tầm thì SỬA ĐỊA CHỈ, không chỉ kẹp con số đem đi vẽ.

     Kẹp `pageIndex` ở trên mới chỉ chữa cái `Pager`; câu hỏi gửi máy chủ vẫn
     mang `page` cũ, nên `OFFSET` vẫn vượt sổ và trang về rỗng. Và rỗng ở đây
     đọc ra một câu SAI hẳn: `total` nhỏ hơn một trang nên không `Pager` nào
     được vẽ, bộ lọc thì chưa ai chạm nên màn rơi vào nhánh "Sổ cơ hội chưa có
     đơn nào" kèm đúng một nút "Về sổ lead" — người dùng có tám đơn trong sổ mà
     không nút nào trên màn đưa họ về được trang 1.

     Xảy ra thật với một link ai đó gửi (`?page=3`) sau khi sổ co lại, hoặc khi
     trục phạm vi cắt sổ của người mở link ngắn hơn sổ của người gửi.

     `replace` chứ không đẩy mục lịch sử: người dùng không tự đi tới trang này,
     nên nút Back phải lùi về chỗ họ thật sự đến từ đó. Chờ `data` về mới sửa —
     `total` lúc chưa có dữ liệu là 0, sửa sớm là đá mọi người về trang 1 ngay
     giữa lượt đọc đầu tiên. */
  useEffect(() => {
    if (!data) return
    if (pageIndexFromQueryPage(query.page) <= pageCount - 1) return
    setParams(
      opportunityBookQueryToParams({
        ...urlQuery,
        page: DEFAULT_OPPORTUNITY_BOOK_QUERY.page,
      }),
      { replace: true },
    )
  }, [data, query.page, pageCount, urlQuery, setParams])

  /* Một chỗ duy nhất đổi số trang của `Pager` (đếm từ 0) sang số trang của hợp
     đồng (đếm từ 1) — hai đầu cầu nằm ở `app/url.ts`, cùng cầu sổ lead đi. */
  const goPage = (index: number) =>
    setParams(opportunityBookQueryToParams({ ...urlQuery, page: queryPageFromPageIndex(index) }))

  /* Ba danh sách lọc dựng TỪ CẢ SỔ chứ không khai tay: thêm một Sale hay một
     công ty vào dữ liệu là ô lọc tự có, không ai phải nhớ sửa thêm chỗ này. */
  const saleOptions = useMemo(() => peopleOptions(wholeBook, saleOwnersOf), [wholeBook])
  const bdOptions = useMemo(() => peopleOptions(wholeBook, bdOwnersOf), [wholeBook])
  const accounts = useMemo(
    () => [...new Set(wholeBook.map((o) => o.account))].sort((a, b) => a.localeCompare(b, 'vi')),
    [wholeBook],
  )

  /* Ô tìm đọc `text` chứ không đọc `query.q`: nút "Bỏ hết bộ lọc" phải hiện ra
     ngay từ phím đầu tiên, không đợi hết nhịp chờ 300ms. */
  const dirty =
    text.trim() !== '' ||
    query.state !== undefined ||
    query.sale !== undefined ||
    query.bd !== undefined ||
    query.account !== undefined

  const clearFilters = () =>
    patch({ q: undefined, state: undefined, sale: undefined, bd: undefined, account: undefined })

  /* Mũi tên chỉ sáng khi sổ ĐANG sắp theo cột này. Thứ tự mặc định là
     `createdAt desc` — mới nhất trước — và `createdAt` không phải cột nào trên
     bảng, nên lúc đó không cột nào có mũi tên. */
  const tableSort: TableSort | undefined =
    query.sort === DEFAULT_OPPORTUNITY_BOOK_QUERY.sort
      ? undefined
      : { key: query.sort, dir: query.dir }

  const loadFile = useOpportunityImport()

  /* Lô nạp GHI THẲNG lên máy chủ — hai cửa, `preview` rồi `import`, cả hai nằm
     ở `data/opportunity-import.ts`. Kho `intake-desk` không nhận lô của sổ này
     nữa: dòng đã nằm trên máy chủ rồi, giữ thêm một bản cục bộ là mỗi đơn nạp
     hiện hai lần mà không có gì nói cho người xem biết vì sao.

     Trả BÁO CÁO CỦA MÁY CHỦ về cho panel: bốn con số ở bước 3 phải là số của
     bên đã ghi thật — xem docblock `onCommit` ở `components/import-zone.tsx`.
     Hàm này không bao giờ ném, vì `runOpportunityImport` đã đổi mọi lời từ chối
     thành một báo cáo nói đúng những gì đã vào sổ.

     `motion` của `ImportCommit` rơi ở đây và rơi có chủ ý: đơn không có cột thế,
     và `OP_SPEC` cũng không còn hỏi. */
  const commitOps = async ({ rows, fileName }: ImportCommit & { scope?: string }) => {
    const run = await loadFile({ rows, fileName })
    const { report } = run

    toast(run.failure ?? `${report.rows.length} cơ hội đã vào sổ`, {
      tone: run.failure ? 'danger' : 'success',
      detail: [
        report.duplicates > 0 && `${report.duplicates} khách đã có đơn đang mở, bỏ qua`,
        report.dupInFile > 0 && `${report.dupInFile} dòng trùng nhau trong tệp`,
        report.errors.length > 0 && `${report.errors.length} dòng không nạp được`,
      ]
        .filter(Boolean)
        .join(' · '),
    })

    return report
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        {/* Một hàng, hai việc: tiêu đề sổ và cửa nạp cả một tệp. Cùng hình với
            sổ lead (`pages/leads.tsx`) — hai sổ của cùng một phòng thì nút nạp
            phải đứng cùng một chỗ. Không có nút "Tạo cơ hội" cạnh nó: đơn sinh
            ra từ hồ sơ một lead, không từ một phiếu trắng ở đây. */}
        <ScreenHeader
          title="Sổ cơ hội"
          actions={
            <ImportZone
              spec={OP_SPEC}
              existingKeys={NO_LOCAL_KEYS}
              buttonLabel="Nạp cơ hội từ tệp"
              onCommit={commitOps}
              onSeeResult={clearFilters}
            />
          }
        />

        <ScoreCards />

        {/* Một hàng lọc, dùng ĐÚNG chuỗi lưới của sổ lead. Hai sổ của cùng một
            phòng phải xuống dòng ở cùng một chỗ trên cùng một bề rộng màn hình
            — lệch một breakpoint là mỗi lần chuyển màn người dùng lại phải tìm
            lại ô tìm bằng mắt. */}
        <ScreenToolbar
          label="Bộ lọc sổ cơ hội"
          className="grid gap-3 p-4 md:grid-cols-2 xl:grid xl:grid-cols-3 xl:items-center min-[1440px]:grid-cols-[minmax(280px,1.6fr)_repeat(4,minmax(150px,1fr))_auto]"
        >
          <SearchField
            size="topbar"
            placeholder="Tìm theo tên cơ hội, mã hoặc account…"
            value={text}
            onChange={setText}
            className="w-full md:col-span-2 xl:col-span-1"
          />
          <Select
            label="Trạng thái"
            value={query.state ?? ANY}
            onChange={(v) => patch({ state: v === ANY ? undefined : (v as OpportunityState) })}
            className="w-full max-w-none"
            options={[
              { value: ANY, label: 'Mọi trạng thái' },
              ...OPPORTUNITY_STATES.map((s) => ({ value: s.key, label: s.label })),
            ]}
          />
          <Select
            label="Sale đứng đơn"
            value={query.sale ?? ANY}
            onChange={(v) => patch({ sale: v === ANY ? undefined : v })}
            className="w-full max-w-none"
            options={[{ value: ANY, label: 'Mọi Sale' }, ...saleOptions]}
          />
          <Select
            label="BD mở cửa"
            value={query.bd ?? ANY}
            onChange={(v) => patch({ bd: v === ANY ? undefined : v })}
            className="w-full max-w-none"
            options={[
              { value: ANY, label: 'Mọi BD' },
              /* Không có mục này thì cách duy nhất tìm ra đơn chưa ghi công
                 trạng mở cửa là đọc hết sổ bằng mắt. Hằng `NO_BD` tự chế của màn
                 đã đi: nó chỉ có nghĩa với chính màn này, mà bên lọc bây giờ là
                 máy chủ. `OWNER_NONE` là cách viết của "chưa ai" TRÊN DÂY
                 (`@pv/contracts`) — hai đầu đọc đúng một chuỗi. */
              { value: OWNER_NONE, label: 'Chưa ghi BD' },
              ...bdOptions,
            ]}
          />
          <Select
            label="Account"
            value={query.account ?? ANY}
            onChange={(v) => patch({ account: v === ANY ? undefined : v })}
            className="w-full max-w-none"
            options={[
              { value: ANY, label: 'Mọi account' },
              ...accounts.map((a) => ({ value: a, label: a })),
            ]}
          />
          {dirty && (
            <Button size="md" variant="ghost" onClick={clearFilters} className="w-full xl:w-auto">
              Bỏ hết bộ lọc
            </Button>
          )}
        </ScreenToolbar>

        {/* Bảng LUÔN nằm trên glass-b — luật 8. Dòng đếm và `Pager` nằm TRONG
            thẻ, làm hàng đầu: chúng nói về đúng cái bảng ngay dưới chúng, nên
            đứng ngoài thẻ là để chúng trôi lơ lửng giữa hai khối. Sổ lead đã
            đứng như vậy; đây là chỗ hai màn từng lệch nhau. */}
        <GlassCard variant="b" className="overflow-hidden">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-5">
            <span className="text-muted-foreground text-[11.5px]">
              {/* `total` của MÁY CHỦ, không phải `rows.length`: một trang mười
                  dòng không biết sổ có bao nhiêu dòng khớp bộ lọc. */}
              {/* Cỡ chữ của con số lấy ĐÚNG bản của sổ lead: hai sổ đặt dòng
                  đếm ở cùng chỗ thì con số cũng phải cùng cỡ, không thì mắt
                  đọc ra hai mức quan trọng khác nhau cho cùng một câu trả lời. */}
              <span className="tnum text-foreground font-num text-[15px] font-semibold">
                {total}
              </span>{' '}
              dòng khớp bộ lọc
              {/* Luật 7 — con số này cũng do máy chủ đếm, vì màn không đếm được
                  thứ nó không nhận. Chỉ hiện khi thật sự có dòng bị cắt. */}
              {hidden > 0 && (
                <>
                  {' · '}
                  <span className="text-warning">
                    <span className="tnum font-num">{hidden}</span> bị ẩn theo quyền của bạn
                  </span>
                </>
              )}
            </span>
            {total > PAGE_SIZE && <Pager page={pageIndex} pageCount={pageCount} onPage={goPage} />}
          </div>

          <div aria-hidden className="bg-white/6 h-px" />

          <div className="overflow-x-auto p-4 pt-3 lg:p-5 lg:pt-4">
            {isPending ? (
              /* `h-12` là ĐÚNG chiều cao dòng `DataTable` vẽ. Lệch một bậc là
                 mỗi dòng nhảy 4px đúng lúc dữ liệu về — một cú giật mà người
                 dùng đọc thành "màn vẽ lại", không phải "dữ liệu đã tới". */
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : bookError ? (
              /* Hỏi không được thì nói là hỏi không được. Nút mời THỬ LẠI chứ
                 không mời bỏ bộ lọc: bộ lọc không phải thứ đang hỏng, và một nút
                 sửa nhầm chỗ tốn của người dùng nhiều thời gian hơn là không có
                 nút nào. `userMessage` trả câu máy chủ tự viết khi có, nên "mất
                 mạng" và "phiên hết hạn" đọc ra khác nhau. */
              <EmptyState
                icon={TriangleAlert}
                message={`Không lấy được sổ cơ hội. ${
                  isApiError(bookError) ? userMessage(bookError) : 'Vui lòng thử lại.'
                }`}
                action={{ label: 'Thử lại', onClick: () => void refetchBook() }}
                className="py-12"
              />
            ) : rows.length === 0 ? (
              /* Hai câu khác nhau, và `dirty` là thứ phân biệt chúng — không
                 phải một phép đếm sổ. Màn nay chỉ cầm một trang, nên "sổ rỗng"
                 là thứ nó không tự kiểm được; nhưng "chưa ai chạm vào bộ lọc mà
                 trang đầu vẫn trống" thì đúng bằng câu đó. */
              <EmptyState
                icon={Inbox}
                message={
                  dirty
                    ? 'Không có cơ hội nào khớp bộ lọc đang chọn.'
                    : 'Sổ cơ hội chưa có đơn nào. Đổi một lead thành cơ hội từ hồ sơ lead.'
                }
                action={
                  dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: clearFilters }
                    : { label: 'Về sổ lead', onClick: () => navigate('/sales/leads') }
                }
                className="py-12"
              />
            ) : (
              <DataTable
                className={TABLE_MIN_WIDTH}
                sort={tableSort}
                onSort={(key) => {
                  /* Bốn cột có `sortKey` bên dưới đều là khoá máy chủ nhận. Khoá
                     nào không nằm trong `OpportunitySortKey` sẽ chết ở cổng zod
                     của máy chủ, nên chặn ngay ở đây thay vì gửi đi một 400 —
                     cùng nước đi sổ lead làm với `LeadSortKey`. */
                  const parsed = OpportunitySortKey.safeParse(key)
                  if (!parsed.success) return
                  patch(
                    query.sort === parsed.data
                      ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
                      : { sort: parsed.data, dir: 'asc' },
                  )
                }}
                columns={[
                  /* `Mã` và `State` không có `sortKey`: máy chủ không nhận hai
                     khoá đó (`OpportunitySortKey`), và một mũi tên bấm được mà
                     không sắp được gì là một lời hứa suông. */
                  { header: 'Mã', width: '0.85fr' },
                  { header: 'Ops name', width: '2fr', sortKey: 'name' },
                  { header: 'Account', width: '1.4fr', sortKey: 'account' },
                  { header: 'Amount', width: '1fr', align: 'right', sortKey: 'amount' },
                  { header: 'Close date', width: '0.9fr', sortKey: 'expectedClose' },
                  { header: 'State', width: '1.2fr' },
                  { header: 'Sale owner', width: '1.3fr' },
                  { header: 'BD owner', width: '1.3fr' },
                ]}
                rows={rows.map((o) => ({
                  id: o.code,
                  onOpen: () => open(o.code),
                  cells: [
                    <Chip key="c">{o.code}</Chip>,
                    <span key="n" className="block truncate" title={o.name}>
                      {o.name}
                    </span>,
                    <span key="a" className="block truncate" title={o.account}>
                      {o.account}
                    </span>,
                    <AmountCell key="m" op={o} />,
                    <CloseCell key="d" op={o} />,
                    <StateCell key="s" op={o} />,
                    <PersonCell
                      key="so"
                      value={firstName(saleOwnersOf(o))}
                      missing={NO_SALE_TITLE}
                    />,
                    <PersonCell key="bo" value={firstName(bdOwnersOf(o))} missing={NO_BD_TITLE} />,
                  ],
                }))}
              />
            )}
          </div>
        </GlassCard>

        {total > PAGE_SIZE && (
          <div className="flex justify-end">
            <Pager page={pageIndex} pageCount={pageCount} onPage={goPage} />
          </div>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------

/** Mục chọn người cho một ô lọc, gom từ CẢ SỔ (`opportunityFacetQuery`).
 *
 *  Khoá theo `id` nhưng nhãn là TÊN mà máy chủ đã gửi kèm. Bản cũ tra ngược id
 *  sang tên bằng danh sách actor của fixture — với dữ liệu thật thì đó là đọc
 *  tên người ra từ một kịch bản không chứa họ.
 *
 *  Xếp theo TÊN chứ không theo thứ tự gặp: thứ tự gặp là thứ tự dòng máy chủ
 *  trả về, tức nó đổi mỗi lần ai đó tạo một đơn — một ô chọn mà mục nhảy chỗ
 *  giữa hai lần mở là một ô chọn phải đọc lại từ đầu mỗi lần. */
function peopleOptions(
  book: OpportunityRow[],
  pick: (o: OpportunityRow) => { id: string; name: string }[],
) {
  const seen = new Map<string, string>()
  for (const op of book) for (const p of pick(op)) seen.set(p.id, p.name)
  return [...seen]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'))
}

/** Người đầu tiên của một danh sách, hoặc `undefined` nếu rỗng.
 *
 *  Hai cột người in MỘT tên, không in cả nhóm: một ô bảng rộng 1.3fr chở được
 *  đúng một cái tên, và ba cái chồng nhau thì không đọc được cái nào. Cả danh
 *  sách vẫn có ở hồ sơ cơ hội, chỗ có chỗ để bày nó. */
const firstName = (owners: OpportunityOwner[]) => namesOf(owners)[0]

/** Thẻ điểm cả sổ — BỐN con số trên cùng một mẫu số.
 *
 *  Số đọc từ MÁY CHỦ (`GET /sales/opportunities/scorecard`), không đếm lại trên
 *  trang đang xem: thẻ điểm là điểm của cả sổ, mà màn chỉ cầm mười dòng. Điểm
 *  mà đổi theo bộ lọc thì nó không còn là điểm — dòng "12 dòng khớp bộ lọc"
 *  ngay dưới mới là chỗ trả lời cho bộ lọc.
 *
 *  ------------------------------------------------------------------
 *  BỐN CON SỐ NÀY KHÔNG THEO PHẠM VI CỦA BẠN — VÀ `Kicker` PHẢI NÓI RA
 *  ------------------------------------------------------------------
 *  Cửa thẻ điểm KHÔNG bật trục phạm vi (chép đúng quyết định của
 *  `GET /sales/leads/scorecard`): điểm là điểm của cả phòng, cắt nó theo đơn ai
 *  đang giữ thì mỗi người đọc một con số khác nhau dưới cùng một dòng chữ.
 *
 *  Hệ quả có thật, và nó nhìn thấy được trên chính màn này: với một vai chỉ
 *  thấy đơn của mình, `total` ở đây KHÁC con số "dòng khớp bộ lọc" của cái sổ
 *  ngay bên dưới. Hai con số ấy không cãi nhau — chúng trả lời hai câu khác
 *  nhau ("cả sổ có bao nhiêu đơn" và "bạn nhìn thấy bao nhiêu") — nhưng người
 *  đọc chỉ biết thế nếu có ai nói. Đó là việc của chữ trên `Kicker`, và đó là
 *  lý do nó không còn dừng ở "Thẻ điểm cả sổ". Đừng rút gọn lại: sửa máy chủ
 *  cho hai số bằng nhau là bỏ mất câu hỏi thứ nhất, giấu chênh lệch đi là để
 *  người dùng tự phát hiện ra nó vào một ngày xấu trời. */
function ScoreCards() {
  const { data } = useQuery(opportunityScorecardQuery)

  const total = data?.total ?? 0
  const openCount = data?.open ?? 0
  const openAmount = data?.openAmountVnd ?? 0
  const openBlank = data?.openBlank ?? 0
  const won = data?.won ?? 0
  const lost = data?.lost ?? 0

  /* Mẫu số 0 thì không có tỉ lệ nào để nói — trả "—", không trả "0%". */
  const per = (n: number) => (total === 0 ? '—' : percent(n / total))

  return (
    <div className="flex flex-col gap-3">
      <Kicker>Thẻ điểm cả sổ · không theo phạm vi của bạn</Kicker>

      <ScreenScoreGrid>
        <StatCard
          size="compact"
          icon={Target}
          value={String(total)}
          label="Tổng số cơ hội"
          hint="đơn đang có trong sổ"
        />
        <StatCard
          size="compact"
          icon={Wallet}
          value={billions(openAmount)}
          label="Đang mở"
          /* Máy chủ cộng bằng ĐỒNG và bỏ qua đơn chưa có tiền — rồi báo lại số
             đơn đã bỏ, vì cộng `null` thành 0 là nói dối về một con số chưa ai
             moi được, còn im lặng bỏ đi thì pipeline đọc ra nhỏ hơn thật mà
             không có gì trên màn nói vì sao. */
          hint={
            openBlank === 0
              ? `${openCount} đơn còn trong năm cột`
              : `${openCount} đơn còn trong năm cột · ${openBlank} đơn chưa có tiền, không cộng vào`
          }
        />
        <StatCard
          size="compact"
          icon={FileCheck}
          value={per(won)}
          label="Close won"
          hint={`${won} đơn đã ký trên ${total} cơ hội`}
        />
        <StatCard
          size="compact"
          icon={Ban}
          value={per(lost)}
          label="Close lost"
          hint={`${lost} đơn đã thua trên ${total} cơ hội`}
        />
      </ScreenScoreGrid>

      <p className="text-muted-foreground text-[11px] leading-[1.5]">
        Mỗi cơ hội mọc ra từ một lead đã lên bậc SQL — cùng một sự kiện, không phải hai sổ. Phần còn
        lại của phễu nằm ở Sổ lead.
      </p>
    </div>
  )
}

/** Cột tiền — canh phải, mono, quy ra đồng.
 *
 *  Canh phải vì cột tiền để SO CHIỀU DỌC: hàng nghìn phải thẳng hàng nghìn.
 *  Ngoại tệ in kèm số gốc ở `title` — sổ cộng bằng đồng, nhưng đơn thì chào
 *  bằng đồng tiền của nó. */
function AmountCell({ op }: { op: OpportunityRow }) {
  const inDong = dongOf(op)
  if (op.amount === null || inDong === null) {
    return (
      <span className="text-muted-foreground" title="Chưa moi được ô 9 — khoảng tiền khách nói">
        —
      </span>
    )
  }
  return (
    <span
      className="tnum block truncate font-mono text-[11.5px]"
      title={
        op.currency === 'VND'
          ? undefined
          : `${op.amount.toLocaleString('vi-VN')} ${op.currency} quy ra đồng`
      }
    >
      {billions(inDong)}
    </span>
  )
}

/** Cột ngày đóng. Đơn đã đóng sổ in ngày THẬT; đơn đang mở in ngày DỰ KIẾN, và
 *  ngày dự kiến đã trôi qua thì tô cảnh báo — nó nói "đáng lẽ đóng rồi". */
function CloseCell({ op }: { op: OpportunityRow }) {
  if (op.expectedClose === null) {
    return (
      <span className="text-muted-foreground" title="Chưa đặt ngày đóng dự kiến">
        —
      </span>
    )
  }

  const late = isLateClose(op)
  const closed = op.stage === null

  return (
    <span
      className={cn(late && 'text-warning')}
      title={
        closed
          ? 'Ngày đóng thật'
          : late
            ? 'Ngày dự kiến đã trôi qua — đơn này đáng lẽ đóng rồi'
            : 'Ngày dự kiến'
      }
    >
      <span className="tnum font-num">{dm(op.expectedClose)}</span>
    </span>
  )
}

/** Cột trạng thái — một PILL, và màu của pill là câu trả lời thứ hai.
 *
 *  Màu nói "đơn này còn sống không" (xanh đã ký · đỏ đã thua · azure đang chạy
 *  · xám chưa gửi giá), chữ nói "đang ở bậc nào". Cột pipeline đi vào `title`
 *  chứ không ra mặt: nó là câu trả lời thứ ba, và ba câu trong một ô bảng thì
 *  không câu nào đọc được. */
function StateCell({ op }: { op: OpportunityRow }) {
  const rotting = isRottingOp(op)
  const stage = op.stage ? STAGE_LABEL.get(op.stage) : null

  return (
    <Badge
      tone={rotting ? 'warning' : STATE_TONE[op.state]}
      className="max-w-full"
      title={
        stage
          ? rotting
            ? `Cột "${stage}" · ${op.daysInStage} ngày, đã quá hạn cột`
            : `Cột "${stage}" · ${op.daysInStage} ngày`
          : 'Đã đóng sổ — đơn ra khỏi năm cột'
      }
    >
      <span className="min-w-0 truncate">
        {STATE_LABEL.get(op.state)}
        {rotting && ' · mục'}
      </span>
    </Badge>
  )
}

export default OpportunitiesPage
