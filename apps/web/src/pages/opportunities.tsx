import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Ban, FileCheck, Plus, Target, Wallet } from '@pv/ui'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Checkbox,
  Chip,
  Icon,
  Kicker,
  SearchField,
  SegmentedControl,
  Select,
  ScreenLayout,
  StageTrack,
  StatStrip,
  billions,
  cn,
  percent,
  type StatStripItem,
  type TableSort,
} from '@pv/ui'
import {
  OpportunitySortKey,
  OWNER_NONE,
  type OpportunityBookQuery,
  type OpportunityOwner,
  type OpportunityBookRow,
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
  amountVndOf,
  isLateClose,
  isRottingOp,
  namesOf,
  opportunityBookQuery,
  opportunityBookQueryToParams,
  opportunityFacetQuery,
  opportunityScorecardQuery,
  parseOpportunityBookQuery,
  saleOwnersOf,
  stageTrackOf,
  STATE_TONE,
} from '@/data/opportunities'
import { OP_SPEC } from '@/data/intake'
import { useOpportunityImport } from '@/data/opportunity-import'
import { leadFacetQuery } from '@/data/leads'
import { type MasRecipient } from '@/data/mas-mail-draft'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { MasMailModal } from '@/components/mas-mail-modal'
import { BookCount, BookPage } from '@/components/book-page'
import { OpportunityCreateDialog } from '@/components/opportunity-create-dialog'
import {
  BookSelectionBar,
  FilterMenu,
  PersonCell,
  SelectionCell,
  TableFooter,
} from '@/components/table-bits'
import { STAGE_LABEL, STATE_LABEL } from '@/components/ops-fields'

/** Module 3 · Sổ cơ hội — `GET /sales/opportunities`.
 *
 *  ------------------------------------------------------------------
 *  HÌNH SỔ NẰM Ở `BookPage`, CÙNG HÌNH VỚI SỔ LEAD
 *  ------------------------------------------------------------------
 *  Màn chỉ đưa NỘI DUNG cho `components/book-page.tsx`: thẻ điểm, hàng tab, ô
 *  tìm, nút lọc, cột và chân trang. Hình thì một chỗ quyết.
 *
 *  Hàng lọc rời và `Pager` đứng ngoài thẻ đã ĐI (17/09). Chúng là chỗ hai sổ
 *  của cùng một phòng trôi khỏi nhau: người dùng đi từ sổ lead sang sổ này mỗi
 *  ngày, và mỗi lần chuyển màn là một lần phải tìm lại ô tìm bằng mắt. Ô lọc
 *  trạng thái thành TAB vì đó là trục người ta đổi liên tục (A-19), ba ô còn
 *  lại lui vào `FilterMenu`. `FilterMenu`, `TableFooter` và `PersonCell` dùng
 *  CHUNG (`components/table-bits.tsx`) chứ không chép sang.
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

/** Bề rộng tối thiểu của bảng — thứ làm cho khối cuộn của `BookPage` có việc
 *  để làm. Không có nó thì con của khối cuộn không bao giờ rộng hơn chính
 *  khối cuộn, nên thanh cuộn ngang KHÔNG BAO GIỜ hiện và tám track `fr` bị bóp
 *  thay vì cuộn: ở 1024px cột "Mã" còn ~73px trong khi một `<Chip>` mã đơn cần
 *  ~90px, ở 390px nó còn ~21px. +32px so với bản không có cột chọn dòng, đúng
 *  bề rộng cố định của cột checkbox đứng đầu bảng. */
const TABLE_MIN_WIDTH = 'min-w-[1212px]'

/** Giá trị "không lọc trục này" của bốn ô Select. `<select>` gốc chỉ chở được
 *  chuỗi, nên trạng thái "mọi giá trị" phải có một chuỗi đại diện; trên dây thì
 *  nó là `undefined`, và phép dịch giữa hai bên nằm ở đúng bốn chỗ gọi
 *  `onChange` bên dưới. */
const ANY = 'all'

/** The book's tab row — the `state` axis, the one people flip back and forth all
 *  day, so it lies open (A-19) instead of hiding inside a select.
 *
 *  The all-states tab stands FIRST because it is the tab the screen opens on
 *  when nothing
 *  is filtered, and the lead book likewise opens on its own first tab — two
 *  books of one department have to open in the same place. The array lives
 *  outside the component because `useQueries` below reads its length: rebuilding
 *  it each render would still be the same length, but nobody should have to
 *  check that. */
const STATE_TABS: { value: string; label: string }[] = [
  { value: ANY, label: 'Tất cả' },
  ...OPPORTUNITY_STATES.map((state) => ({ value: state.key as string, label: state.label })),
]

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
const NO_SELECTED_CODES: ReadonlySet<string> = new Set()

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

  /* `leadFacetQuery`'s own capped-book debt, reused rather than duplicated: a
     recipient's name and address live on the LEAD row, and an opportunity only
     carries the `leadCode` that points at one. */
  const { data: leadFacets } = useQuery(leadFacetQuery)
  const wholeLeadBook = useMemo(() => leadFacets?.rows ?? [], [leadFacets])
  const opportunityLeadCodes = useMemo(() => new Set(wholeBook.map((o) => o.leadCode)), [wholeBook])
  const recipients: MasRecipient[] = useMemo(
    () =>
      wholeLeadBook
        .filter((lead) => opportunityLeadCodes.has(lead.code))
        .map((lead) => ({
          code: lead.code,
          company: lead.company,
          contactName: lead.contactName,
          contactTitle: lead.contactTitle,
          email: lead.email,
        })),
    [wholeLeadBook, opportunityLeadCodes],
  )

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

     Kẹp `pageIndex` ở trên mới chỉ chữa cái chân trang; câu hỏi gửi máy chủ vẫn
     mang `page` cũ, nên `OFFSET` vẫn vượt sổ và trang về rỗng. Và rỗng ở đây
     đọc ra một câu SAI hẳn: `total` nhỏ hơn một trang nên không chân trang nào
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

  /* Một chỗ duy nhất đổi số trang của `TableFooter` (đếm từ 0) sang số trang
     của hợp đồng (đếm từ 1) — hai đầu cầu ở `app/url.ts`, cùng cầu sổ lead đi. */
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

  /* One `size=1` read per tab, the move the lead book already makes: `total` is
     the count under the OTHER filters in force, and no other endpoint answers
     that question. */
  const tabCounts = useQueries({
    queries: STATE_TABS.map((tab) =>
      opportunityBookQuery({
        ...urlQuery,
        state: tab.value === ANY ? undefined : (tab.value as OpportunityState),
        page: DEFAULT_OPPORTUNITY_BOOK_QUERY.page,
        size: 1,
      }),
    ),
  })
  const tabs = STATE_TABS.map((tab, i) => ({ ...tab, count: tabCounts[i]?.data?.total }))

  /* The number printed on the filter button. State is NOT counted here: it is
     already visible on the tab row, and counting it twice says one thing twice. */
  const activeFilters = [query.sale, query.bd, query.account].filter(
    (value) => value !== undefined,
  ).length

  /* Mũi tên chỉ sáng khi sổ ĐANG sắp theo cột này. Thứ tự mặc định là
     `createdAt desc` — mới nhất trước — và `createdAt` không phải cột nào trên
     bảng, nên lúc đó không cột nào có mũi tên. */
  const tableSort: TableSort | undefined =
    query.sort === DEFAULT_OPPORTUNITY_BOOK_QUERY.sort
      ? undefined
      : { key: query.sort, dir: query.dir }

  const [creating, setCreating] = useState(false)

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

  /* Row selection + bulk mail — the lead book's own shape (`pages/leads.tsx`),
     copied so the two books keep reading as one product. Selection outlives
     paging: codes live on the screen, not in this page's ten rows. */
  const [composing, setComposing] = useState(false)
  const [selectedCodes, setSelectedCodes] = useState<ReadonlySet<string>>(NO_SELECTED_CODES)
  const dragIntent = useRef<'select' | 'deselect' | null>(null)
  const suppressClick = useRef<string | null>(null)

  const selectedOps = useMemo(
    () => wholeBook.filter((o) => selectedCodes.has(o.code)),
    [wholeBook, selectedCodes],
  )
  const selectedLeadCodes = useMemo(
    () => [...new Set(selectedOps.map((o) => o.leadCode))],
    [selectedOps],
  )
  const selectedEmailCount = recipients.filter(
    (r) => selectedLeadCodes.includes(r.code) && Boolean(r.email),
  ).length
  const pageSelected = rows.filter((o) => selectedCodes.has(o.code)).length
  const allPageSelected = rows.length > 0 && pageSelected === rows.length

  const setCodeSelected = (code: string, on: boolean) => {
    setSelectedCodes((current) => {
      const next = new Set(current)
      if (on) next.add(code)
      else next.delete(code)
      return next
    })
  }

  const beginDrag = (code: string, event: ReactPointerEvent<HTMLElement>) => {
    /* Touch keeps its native scroll and toggles through the click that follows;
       mouse and pen press a checkbox and paint across rows. */
    if (event.pointerType === 'touch' || event.button !== 0) return
    event.preventDefault()
    const intent = selectedCodes.has(code) ? 'deselect' : 'select'
    dragIntent.current = intent
    suppressClick.current = code
    setCodeSelected(code, intent === 'select')
  }

  const paintSelection = (code: string, event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch' || event.buttons !== 1 || dragIntent.current === null) return
    setCodeSelected(code, dragIntent.current === 'select')
  }

  const selectPage = (on: boolean) => {
    setSelectedCodes((current) => {
      const next = new Set(current)
      for (const o of rows) {
        if (on) next.add(o.code)
        else next.delete(o.code)
      }
      return next
    })
  }

  const clearSelection = () => {
    setSelectedCodes(NO_SELECTED_CODES)
    dragIntent.current = null
    suppressClick.current = null
  }

  useEffect(() => {
    const finish = () => {
      dragIntent.current = null
      /* The press's own `click` fires right after `pointerup`; clearing on the
         next macrotask keeps it from undoing what the press just painted. */
      window.setTimeout(() => {
        suppressClick.current = null
      }, 0)
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [])

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        {/* Hai cửa ghi của sổ, cạnh nhau — cùng hình với sổ lead
            (`pages/leads.tsx`), nên nút nạp của hai sổ đứng cùng một chỗ.

            Nút "Tạo cơ hội" KHÔNG mở một phiếu trắng, và câu "đơn sinh ra từ
            hồ sơ một lead" mà chỗ này từng ghi vẫn đúng nguyên: nó mở một ô
            chọn lead trước, rồi giao cho ĐÚNG `ConvertDialog` mà hồ sơ lead
            vẫn dùng. Thứ đổi là chỗ ĐỨNG để bắt đầu, không phải luật — ai đang
            đọc sổ cơ hội không phải đi vòng qua sổ lead để mở một đơn. */}
        <BookPage
          title="Sổ cơ hội"
          actions={
            <>
              <ImportZone
                spec={OP_SPEC}
                existingKeys={NO_LOCAL_KEYS}
                buttonLabel="Nạp cơ hội từ tệp"
                onCommit={commitOps}
                onSeeResult={clearFilters}
              />
              {/* Không mở một phiếu trắng: nó mở một ô chọn lead trước, rồi giao
                  cho ĐÚNG `ConvertDialog` mà hồ sơ lead vẫn dùng — đơn vẫn sinh
                  ra từ một lead, chỉ khác chỗ đứng để bắt đầu. */}
              <Button size="md" onClick={() => setCreating(true)} className="max-sm:flex-1">
                <Icon icon={Plus} size={16} />
                Tạo cơ hội
              </Button>
            </>
          }
          score={<ScoreCards />}
          tabs={
            <SegmentedControl
              label="Trạng thái đơn"
              hideLabel
              tone="quiet"
              value={query.state ?? ANY}
              options={tabs}
              onChange={(value) =>
                patch({ state: value === ANY ? undefined : (value as OpportunityState) })
              }
            />
          }
          count={<BookCount total={total} noun="cơ hội" hidden={hidden} />}
          tools={
            <>
              <SearchField
                placeholder="Tìm theo tên cơ hội, mã hoặc account…"
                value={text}
                onChange={setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              <FilterMenu label="Bộ lọc sổ cơ hội" active={activeFilters}>
                <Select
                  label="Sale đứng đơn"
                  value={query.sale ?? ANY}
                  onChange={(value) => patch({ sale: value === ANY ? undefined : value })}
                  /* A native select grows to its longest option, and account
                     names run long — clamp it to the panel. */
                  className="w-full max-w-none"
                  options={[{ value: ANY, label: 'Mọi Sale' }, ...saleOptions]}
                />
                <Select
                  label="BD mở cửa"
                  value={query.bd ?? ANY}
                  onChange={(value) => patch({ bd: value === ANY ? undefined : value })}
                  className="w-full max-w-none"
                  options={[
                    { value: ANY, label: 'Mọi BD' },
                    /* Không có mục này thì cách duy nhất tìm ra đơn chưa ghi công
                       trạng mở cửa là đọc hết sổ bằng mắt. Hằng `NO_BD` tự chế của
                       màn đã đi: nó chỉ có nghĩa với chính màn này, mà bên lọc bây
                       giờ là máy chủ. `OWNER_NONE` là cách viết của "chưa ai" TRÊN
                       DÂY (`@pv/contracts`) — hai đầu đọc đúng một chuỗi. */
                    { value: OWNER_NONE, label: 'Chưa ghi BD' },
                    ...bdOptions,
                  ]}
                />
                <Select
                  label="Account"
                  value={query.account ?? ANY}
                  onChange={(value) => patch({ account: value === ANY ? undefined : value })}
                  className="w-full max-w-none"
                  options={[
                    { value: ANY, label: 'Mọi account' },
                    ...accounts.map((a) => ({ value: a, label: a })),
                  ]}
                />
                {dirty && (
                  <Button size="md" variant="ghost" onClick={clearFilters}>
                    Bỏ hết bộ lọc
                  </Button>
                )}
              </FilterMenu>
            </>
          }
          pending={isPending}
          failure={
            bookError
              ? {
                  message: `Không lấy được sổ cơ hội. ${
                    isApiError(bookError) ? userMessage(bookError) : 'Vui lòng thử lại.'
                  }`,
                  onRetry: () => void refetchBook(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  /* Hai câu khác nhau, và `dirty` là thứ phân biệt chúng — không
                     phải một phép đếm sổ: màn chỉ cầm một trang, nên "sổ rỗng" là
                     thứ nó không tự kiểm được. */
                  message: dirty
                    ? 'Không có cơ hội nào khớp bộ lọc đang chọn.'
                    : 'Sổ cơ hội chưa có đơn nào. Đổi một lead thành cơ hội từ hồ sơ lead.',
                  action: dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: clearFilters }
                    : { label: 'Về sổ lead', onClick: () => navigate('/sales/leads') },
                }
              : undefined
          }
          table={{
            minWidth: TABLE_MIN_WIDTH,
            sort: tableSort,
            onSort: (key) => {
              /* Bốn cột có `sortKey` bên dưới đều là khoá máy chủ nhận. Khoá nào
                 không nằm trong `OpportunitySortKey` sẽ chết ở cổng zod của máy
                 chủ, nên chặn ngay ở đây thay vì gửi đi một 400. */
              const parsed = OpportunitySortKey.safeParse(key)
              if (!parsed.success) return
              patch(
                query.sort === parsed.data
                  ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
                  : { sort: parsed.data, dir: 'asc' },
              )
            },
            columns: [
              {
                header: (
                  <Checkbox
                    checked={allPageSelected}
                    indeterminate={pageSelected > 0 && !allPageSelected}
                    onChange={selectPage}
                    label={<span className="sr-only">Chọn cả trang</span>}
                    className="w-full justify-center gap-0 p-0"
                  />
                ),
                width: '32px',
              },
              /* `Mã` và `Trạng thái` không có `sortKey`: máy chủ không nhận hai
                 khoá đó (`OpportunitySortKey`), và một mũi tên bấm được mà
                 không sắp được gì là một lời hứa suông. */
              { header: 'Mã', width: '0.8fr' },
              { header: 'Tên cơ hội', width: '2.3fr', sortKey: 'name' },
              { header: 'Account', width: '1.6fr', sortKey: 'account' },
              { header: 'Giá trị', width: '0.8fr', align: 'right', sortKey: 'amount' },
              { header: 'Ngày chốt', width: '0.8fr', sortKey: 'expectedClose' },
              /* 1.5fr, not the 1.2fr it was: this cell stacks a badge over a
                 flow bar. Five segments in a narrow cell shrink into five ticks
                 that no longer read as a position. */
              { header: 'Trạng thái', width: '1.5fr' },
              { header: 'Sale', width: '1fr' },
              { header: 'BD', width: '1fr' },
            ],
            rows: rows.map((o) => ({
              id: o.code,
              state: selectedCodes.has(o.code) ? ('selected' as const) : undefined,
              onOpen: () => open(o.code),
              onPointerEnter: (event: ReactPointerEvent<HTMLDivElement>) =>
                paintSelection(o.code, event),
              cells: [
                <SelectionCell
                  key="select"
                  checked={selectedCodes.has(o.code)}
                  label={o.name}
                  onPress={(event) => beginDrag(o.code, event)}
                  onChange={(on) => suppressClick.current !== o.code && setCodeSelected(o.code, on)}
                />,
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
                <PersonCell key="so" value={firstName(saleOwnersOf(o))} missing={NO_SALE_TITLE} />,
                <PersonCell key="bo" value={firstName(bdOwnersOf(o))} missing={NO_BD_TITLE} />,
              ],
            })),
          }}
          footer={
            <TableFooter page={pageIndex} pageSize={PAGE_SIZE} total={total} onPage={goPage} />
          }
        />

        {/* Written, then STRAIGHT to the new deal's profile rather than back to
            the book. Staying leaves the user in front of a table whose filters
            may hide the very row they just made, and the code the server minted
            on save — the one thing the form refuses to guess in advance — would
            still be nowhere on screen. */}
        <OpportunityCreateDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(row) => open(row.code)}
        />

        {selectedCodes.size > 0 && <div aria-hidden className="h-24" />}
        <MasMailModal
          open={composing}
          onClose={() => setComposing(false)}
          leads={recipients}
          initialLeadCodes={selectedLeadCodes}
          defaultLabel="Gửi email · Sổ cơ hội"
          onQueued={() => {
            setComposing(false)
            clearSelection()
          }}
        />
        {selectedCodes.size > 0 && (
          <BookSelectionBar
            count={selectedCodes.size}
            noun="cơ hội"
            meta={`${selectedEmailCount} địa chỉ email`}
            onClear={clearSelection}
            onSend={() => setComposing(true)}
          />
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

  const items: StatStripItem[] = [
    {
      icon: Target,
      label: 'Tổng số cơ hội',
      value: String(total),
      /* An empty book is worth flagging — same warning threshold as the
         open-pipeline and win-rate cards below. The lost-rate card never gets
         this tone: zero lost deals is good news, not something to warn about. */
      tone: total === 0 ? 'warning' : 'default',
      context: 'đơn đang có trong sổ',
    },
    {
      icon: Wallet,
      label: 'Đang mở',
      value: billions(openAmount),
      tone: openAmount === 0 ? 'warning' : 'default',
      /* Máy chủ cộng bằng ĐỒNG và bỏ qua đơn chưa có tiền — rồi báo lại số đơn
         đã bỏ, vì cộng `null` thành 0 là nói dối về một con số chưa ai moi
         được, còn im lặng bỏ đi thì pipeline đọc ra nhỏ hơn thật mà không có gì
         trên màn nói vì sao. */
      context:
        openBlank === 0
          ? `${openCount} đơn còn trong năm cột`
          : `${openCount} đơn còn trong năm cột · ${openBlank} đơn chưa có tiền, không cộng vào`,
    },
    {
      icon: FileCheck,
      label: 'Close won',
      value: per(won),
      tone: total > 0 && won === 0 ? 'warning' : 'default',
      context: `${won} đơn đã ký trên ${total} cơ hội`,
    },
    {
      icon: Ban,
      label: 'Close lost',
      value: per(lost),
      context: `${lost} đơn đã thua trên ${total} cơ hội`,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <Kicker>Thẻ điểm cả sổ · không theo phạm vi của bạn</Kicker>

      <StatStrip label="Thẻ điểm sổ cơ hội" items={items} />

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
  const amountVnd = amountVndOf(op)
  if (op.amount === null || amountVnd === null) {
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
      {billions(amountVnd)}
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

/** The state cell — a PILL, and under it the flow the deal is walking.
 *
 *  The pill's colour says whether the deal is still alive (green signed · red
 *  lost · azure running · grey no quote sent yet), its text says which state.
 *
 *  ------------------------------------------------------------------
 *  THE PIPELINE COLUMN COMES OUT OF THE TOOLTIP — REVERSED 03/09
 *  ------------------------------------------------------------------
 *  It used to live in `title`, and the argument then was "three sentences in
 *  one table cell and none of them get read". That holds for three LINES OF
 *  TEXT and fails for what stands here now: `StageTrack` is not a sentence to
 *  read, it is a shape to glance at — five segments, three colours, no words.
 *  Someone scanning the whole page sees at once which deals are near a contract
 *  and which are still sitting in the first column, which a tooltip can never
 *  do: it shows for ONE row, and only after the reader already knows which row
 *  is worth hovering.
 *
 *  `title` stays and still carries its full sentence: it is the only place that
 *  names the DAY COUNT and the fact that the deal is past its column limit —
 *  the bar deliberately carries neither (see `stageTrackOf`). A closed deal has
 *  no bar, and the pill alone is the right answer for a deal standing in no
 *  column. */
function StateCell({ op }: { op: OpportunityBookRow }) {
  const rotting = isRottingOp(op)
  const stage = op.stage ? STAGE_LABEL.get(op.stage) : null
  const track = stageTrackOf(op)

  return (
    <div className="flex min-w-0 flex-col gap-1">
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

      {track && <StageTrack steps={track.steps} current={track.current} />}
    </div>
  )
}

export default OpportunitiesPage
