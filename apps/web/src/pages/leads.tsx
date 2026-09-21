import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Plus } from '@pv/ui'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  Checkbox,
  Icon,
  ScreenLayout,
  SearchField,
  SegmentedControl,
  Select,
} from '@pv/ui'
import {
  LEAD_OPEN_STATES,
  LeadState,
  SOURCE_KIND_LABEL,
  type ConfigEntry,
  type LeadBookQuery,
  type LeadMotion,
  type LeadRow,
  type LeadSourceKind,
  type LeadStateFilter,
} from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { pinsOf, useLeadDesk } from '@/app/desk'
import { useCan, useSession } from '@/app/auth'
import {
  DEFAULT_LEAD_BOOK_QUERY,
  leadBookQueryToParams,
  pageIndexFromQueryPage,
  parseLeadBookQuery,
  queryPageFromPageIndex,
} from '@/app/url'
import { leadBookQuery, leadFacetQuery, leadFacetsQuery } from '@/data/leads'
import { LEAD_STATE_FACE, isOpenState } from '@/data/lead-state'
import { salesCatalogQuery } from '@/data/sales-config'
import { useMotionLabel } from '@/data/sales-motions'
import { toast } from '@/app/toast'
import { isApiError, userMessage } from '@/app/api'
import { useDirectory } from '@/data/directory'
import { LEAD_SPEC, originTally, withPeople } from '@/data/intake'
import { useLeadImport } from '@/data/lead-import'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { OriginPicker, type OriginChoice } from '@/components/lead-origin-pickers'
import { MasMailModal } from '@/components/mas-mail-modal'
import { BookCount, BookPage, type BookTable } from '@/components/book-page'
import { BookSelectionBar, FilterMenu, SelectionCell, TableFooter } from '@/components/table-bits'
import {
  CompanyCell,
  LeadPicCell,
  PinCell,
  ScoreStrip,
  SourceCell,
  StatusCell,
} from './leads-parts'

/** Module 2 · Sổ lead — a list, not a workbench: a row opens `/sales/leads/:code`.
 *
 *  The layout every book follows lives in `components/book-page.tsx`; this file
 *  only hands it content. Cells and blocks live in `leads-parts.tsx`.
 *
 *  The book is server-side: `GET /sales/leads` returns one filtered, sorted page
 *  plus `total`, and every filter lives in the URL (`app/url.ts`) so F5, shared
 *  links and the back button keep it. Tab counts come from `facets.byState`.
 *  The pinned tab is the exception: pins are per person (`app/desk.ts`), so it
 *  lists them out of `leadFacetQuery`, whose limits are written there.
 *
 *  No ContextRail (law 10 debt): a chain built from a hard-coded anchor would
 *  describe a lead nobody picked. It returns once it can follow the chosen row. */

/** Số dòng một trang. Máy chủ cắt trang, nhưng con số vẫn do màn quyết —
 *  `size` đi kèm mọi lời gọi. */
const PAGE_SIZE = 10

/** "Any source" for the Nguồn select. On the wire that is an ABSENT field, but a
 *  native `<select>` carries strings only, so it needs a stand-in value. */
const ANY = 'all'

/** Tiền tố đánh dấu một giá trị ô lọc Nguồn là `sourceKind` chứ không phải id
 *  chiến dịch — xem docblock `sourceFilterOptions` cho lý do một ô cần phân biệt hai
 *  loại giá trị. An toàn vì hai bảng mã không bao giờ đụng nhau: id chiến dịch
 *  luôn có tiền tố `SR-` (`ConfigCode`, sáu prefix theo danh mục), `LeadSourceKind`
 *  luôn viết hoa không dấu gạch (`MANUAL`/`IMPORT`/`APOLLO`/`LANDING_PAGE`). */
const KIND_PREFIX = 'kind:'

/** Chờ bao lâu sau phím cuối rồi mới ghi ô tìm lên địa chỉ.
 *
 *  Ô tìm nay là một trục LỌC CỦA MÁY CHỦ, nên mỗi lần ghi là một vòng mạng và
 *  một mục cache mới. Ghi thẳng từng phím thì gõ "Coreline" là tám lần gọi cho
 *  một câu hỏi. Chữ trong ô vẫn đổi ngay từng phím — chỉ có địa chỉ là đợi. */
const SEARCH_DELAY_MS = 300

/** The state tabs (ADR 0058). `open` is the default because the book is a work
 *  list; a dropped or archived lead is still one tab away, since that is where
 *  "why did we lose it" is answered. Each key is a `LeadStateFilter` value, so
 *  it goes onto the URL and the wire unchanged.
 *
 *  Narrowing to ONE open state (every `assigned` lead, say) is the state select
 *  in the filter menu, not a sixth to ninth tab: a row of nine tabs has no
 *  first tab on a tablet. */
type StateTab = 'open' | 'converted' | 'disqualified' | 'archived' | 'all'

const STATE_TABS: { key: StateTab; label: string }[] = [
  { key: 'open', label: 'Đang chạy' },
  { key: 'converted', label: LEAD_STATE_FACE.converted.label },
  { key: 'disqualified', label: LEAD_STATE_FACE.disqualified.label },
  { key: 'archived', label: LEAD_STATE_FACE.archived.label },
  { key: 'all', label: 'Tất cả' },
]

/** The pinned tab's value — not a `LeadStateFilter`, so it never reaches the URL. */
const PINNED = 'pinned'

/** Mảng rỗng dùng chung — một `?? []` viết thẳng trong thân component đẻ ra
 *  một mảng MỚI mỗi lượt vẽ, và mọi `useMemo` phụ thuộc vào nó mất tác dụng. */
const NO_SOURCES: ConfigEntry[] = []

/** Panel nạp tệp KHÔNG chống trùng trong trình duyệt nữa — tập rỗng là một
 *  quyết định, không phải một chỗ chưa nối.
 *
 *  Hai bên chống trùng bằng hai khoá khác nhau và trả lời hai câu khác nhau:
 *  panel khoá theo `mst:` rồi `ten:company|tỉnh` ("có phải cùng một CÔNG TY"),
 *  máy chủ khoá theo `email:lower(email)` trong các lead chưa rơi ("có phải
 *  cùng một LEAD ĐANG SỐNG"). Giữ cả hai thì một dòng bị trình duyệt loại
 *  không bao giờ tới được máy chủ, mà bốn con số panel vẽ lại là số của máy
 *  chủ — bảng kết quả sẽ báo "0 dòng trùng" cho một lô vừa bị loại ba dòng.
 *  Một cửa chống trùng, và đó là cửa có index đứng sau.
 *
 *  Cả ba sổ nay đi đường này: cơ hội qua `/sales/opportunities/import`, và sổ
 *  người nhận của hai màn Nguồn dẫn qua chính hai cửa trên (31/08). `leadBookKeys`
 *  không còn chỗ gọi nào — nó ở lại `data/intake.ts` cho tới lượt dọn. */
const NO_LOCAL_KEYS: ReadonlySet<string> = new Set()
const NO_SELECTED_CODES: ReadonlySet<string> = new Set()

export function LeadsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  /* Hides rather than greys out — same call the create route's own gate makes
     (`routes.tsx`, `permission: 'lead.edit'`), so the button and the fence
     never disagree. Precedent: `campaigns.tsx`'s `canWrite`. */
  const canWrite = useCan('lead.edit')

  /* ĐỊA CHỈ là nguồn sự thật của bộ lọc — dịch hai chiều ở `app/url.ts`.
     `size` thì màn áp đè: `PAGE_SIZE` là số dòng bảng này vẽ, còn mặc định của
     hợp đồng là 50 cho mọi sổ. Áp đè ở đây chứ không ghi lên địa chỉ, để một
     link chia sẻ không mang theo một con số không ai chọn. */
  const urlQuery = useMemo(() => parseLeadBookQuery(params), [params])
  const query = useMemo<LeadBookQuery>(() => ({ ...urlQuery, size: PAGE_SIZE }), [urlQuery])

  /* `error` đọc ra, KHÔNG bỏ.
     Bỏ nó đi thì một máy chủ chết hiện ra thành "Không có lead nào khớp bộ lọc
     đang chọn" kèm nút "Bỏ hết bộ lọc", console sạch trơn: người dùng đi sửa
     bộ lọc cho một sự cố hạ tầng, và chỉ dừng lại khi đã bỏ hết bộ lọc mà sổ
     vẫn trống. "Không có dòng nào" và "không hỏi được" là hai câu khác nhau và
     dẫn tới hai việc khác nhau — xem nhánh `bookError` ở chỗ vẽ bảng. */
  const {
    data: bookPage,
    isPending,
    error: bookError,
    refetch: refetchBook,
  } = useQuery(leadBookQuery(query))
  const rows = bookPage?.rows ?? []
  const total = bookPage?.total ?? 0

  /* The WHOLE book, read once — a patch whose limits are in `leadFacetQuery`'s
     docblock. The pinned tab and the mail modal need rows beyond this page. */
  const {
    data: facets,
    isPending: facetsPending,
    error: facetsError,
    refetch: refetchFacets,
  } = useQuery(leadFacetQuery)
  const wholeBook = useMemo(() => facets?.rows ?? [], [facets])

  /* Sổ nguồn THẬT — chỉ danh mục `SOURCE`. Năm danh mục kia (bậc · hạng ·
     ngành · lý do rơi · kênh) chưa nối được: `LeadRow` còn chở khoá chữ thường
     cũ chứ chưa phải ID cấu hình, nên nhãn của chúng vẫn đọc từ fixture. */
  const { data: catalog } = useQuery(salesCatalogQuery)
  const sourceCatalog = catalog?.SOURCE ?? NO_SOURCES

  /* Bảng tra mã → tên ĐÃ BỎ. Nó tồn tại vì dòng sổ chỉ chở một mã trần và màn
     phải tự đi tìm tên; nay `source.campaignName` về cùng dòng, nên không còn
     gì để tra. Cũng mất theo là cả một lớp lỗi: một nguồn vừa bị tắt không còn
     làm ô Nguồn của lead cũ thành "không rõ", vì tên nó đã ở trên dây rồi. */

  /* Ô CHỌN thì ngược lại — chỉ dòng còn bật. Đây là toàn bộ hình thức "xoá" mà
     danh mục có (`config.ts`, luật 3): tắt một nguồn nghĩa là không ai gắn nó
     cho lead mới nữa, nên nó cũng không được đứng trong ô lọc. */
  const sourceOptions = useMemo(
    () => sourceCatalog.filter((entry) => entry.active),
    [sourceCatalog],
  )

  /* Cùng danh mục, khác câu hỏi — nên khác danh sách. Ô lọc hỏi "xem nguồn
     nào", ô này hỏi "gán nguồn nào cho cả lô vừa nạp", và câu trả lời hợp lệ
     cho câu thứ hai gồm cả "không gán": một tệp mang về từ hội chợ không thuộc
     chiến dịch nào.

     Mục rỗng đứng ĐẦU vì `ImportZone` lấy option đầu làm giá trị mở panel, và
     `neutralValue=""` của ô chọn khớp đúng nó — lô không bấm gì thì
     `campaign_id` nhận NULL. Mặc định vào nguồn đầu danh sách thì mọi lô quên
     bấm đều bị gán vào một chiến dịch không liên quan, và không ai thấy cho
     tới lúc đọc báo cáo theo nguồn. */
  const importSourceOptions = useMemo(
    () => [
      { value: '', label: '— chưa gán nguồn —' },
      ...sourceOptions.map((entry) => ({ value: entry.id, label: entry.name })),
    ],
    [sourceOptions],
  )

  const me = useSession((s) => s.actor)
  const pins = useLeadDesk((s) => pinsOf(s, me?.id))
  const togglePin = useLeadDesk((s) => s.togglePin)

  const open = (code: string) => navigate(`/sales/leads/${code}`)

  /* Ghi một phần bộ lọc lên địa chỉ. Đổi bộ lọc thì LUÔN về trang đầu — đứng ở
     trang 7 rồi đổi trạng thái thì máy chủ trả một trang rỗng, và người dùng
     đọc nó thành "không có kết quả". */
  const patch = (next: Partial<LeadBookQuery>) =>
    setParams(leadBookQueryToParams({ ...urlQuery, ...next, page: DEFAULT_LEAD_BOOK_QUERY.page }))

  /* Ô tìm giữ chữ trong state để gõ tới đâu thấy tới đó, rồi mới nhỏ giọt lên
     địa chỉ (`SEARCH_DELAY_MS`). `replace` chứ không đẩy thêm mục lịch sử: một
     câu tìm tám ký tự mà đẩy tám mục thì nút back thành nút xoá từng chữ. */
  const [text, setText] = useState(urlQuery.q ?? '')

  /* Địa chỉ đổi từ BÊN NGOÀI — nút back, F5, một link ai đó gửi tới — thì ô tìm
     phải đi theo, nếu không chữ trong ô nói một đằng còn bảng lọc một nẻo. */
  useEffect(() => setText(urlQuery.q ?? ''), [urlQuery.q])

  useEffect(() => {
    const wanted = text.trim() === '' ? undefined : text.trim()
    if (wanted === urlQuery.q) return
    const timer = setTimeout(
      () =>
        setParams(
          leadBookQueryToParams({ ...urlQuery, q: wanted, page: DEFAULT_LEAD_BOOK_QUERY.page }),
          { replace: true },
        ),
      SEARCH_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [text, urlQuery, setParams])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageIndex = Math.min(pageIndexFromQueryPage(query.page), pageCount - 1)

  const pinned = useMemo(
    () =>
      pins
        .map((code) => wholeBook.find((l) => l.code === code))
        .filter((l): l is LeadRow => Boolean(l)),
    [pins, wholeBook],
  )

  const [pinnedView, setPinnedView] = useState(false)
  const shown = pinnedView ? pinned : rows

  /* One read answers every tab — `byState` under the current search and source
     filter; `open` and `all` are sums the screen takes — and feeds the
     no-campaign half of the source select (`sourceKinds`). See `LeadFacets`. */
  const { data: counts } = useQuery(leadFacetsQuery(urlQuery))
  const byState = counts?.byState
  const sumOf = (states: readonly LeadState[]) =>
    byState && states.reduce((sum, state) => sum + (byState[state] ?? 0), 0)
  const countOf = (key: StateTab) =>
    key === 'open'
      ? sumOf(LEAD_OPEN_STATES)
      : key === 'all'
        ? sumOf(LeadState.options)
        : byState?.[key]
  const tabs = [
    ...STATE_TABS.map((t) => ({ value: t.key, label: t.label, count: countOf(t.key) })),
    { value: PINNED, label: 'Đã ghim', count: pinned.length },
  ]
  /* One open state picked in the filter menu still lights the `open` tab. */
  const oneOpenState = isOpenState(query.state)
  const tabValue = oneOpenState ? 'open' : query.state
  const onTab = (value: string) => {
    setPinnedView(value === PINNED)
    if (value !== PINNED) patch({ state: value as LeadStateFilter })
  }

  /* The state select: every open state, or one of them. */
  const stateFilterOptions = [
    { value: 'open', label: 'Mọi trạng thái đang chạy' },
    ...LEAD_OPEN_STATES.map((state) => ({
      value: state,
      label:
        byState === undefined
          ? LEAD_STATE_FACE[state].label
          : `${LEAD_STATE_FACE[state].label} · ${byState[state] ?? 0}`,
    })),
  ]

  /* Một ô, hai trục hợp đồng (`campaign` và `sourceKind`) — xem docblock
     `sourceKind` trong `LeadBookQuery` cho lý do hai trục không gộp làm một
     tham số. `value` mã hoá bằng tiền tố `KIND_PREFIX` để `<Select>` phân biệt
     được "SR-09" (một id chiến dịch) với "LANDING_PAGE" (một kind) mà không
     cần đi tra lại — hai bảng mã không bao giờ đụng nhau (chiến dịch luôn có
     tiền tố `SR-`, kind luôn viết hoa không dấu gạch), nên ghép an toàn. */
  const sourceFilterOptions = useMemo(
    () => [
      ...sourceOptions.map((entry) => ({ value: entry.id, label: entry.name })),
      ...(counts?.sourceKinds ?? []).map((kind) => ({
        value: `${KIND_PREFIX}${kind}`,
        label: SOURCE_KIND_LABEL[kind],
      })),
    ],
    [sourceOptions, counts],
  )

  const sourceFilterValue = query.sourceKind
    ? `${KIND_PREFIX}${query.sourceKind}`
    : (query.campaign ?? ANY)

  const patchSourceFilter = (value: string) => {
    if (value === ANY) return patch({ campaign: undefined, sourceKind: undefined })
    if (value.startsWith(KIND_PREFIX)) {
      return patch({
        sourceKind: value.slice(KIND_PREFIX.length) as LeadSourceKind,
        campaign: undefined,
      })
    }
    return patch({ campaign: value, sourceKind: undefined })
  }

  /* Ô tìm đọc `text` chứ không đọc `query.q`: nút "Bỏ hết bộ lọc" phải hiện ra
     ngay từ phím đầu tiên, không đợi hết nhịp chờ 300ms. */
  const dirty =
    text.trim() !== '' ||
    query.campaign !== undefined ||
    query.sourceKind !== undefined ||
    query.motion !== undefined ||
    query.origin !== undefined ||
    query.state !== DEFAULT_LEAD_BOOK_QUERY.state

  const clearFilters = () =>
    patch({
      q: undefined,
      campaign: undefined,
      sourceKind: undefined,
      motion: undefined,
      origin: undefined,
      state: DEFAULT_LEAD_BOOK_QUERY.state,
    })

  /* Level 1 and 2 of the origin, each its own contract axis. Options come from
     the facets, so a filter never offers a value no lead carries. */
  const motionLabel = useMotionLabel()
  const motionFilterOptions = [
    { value: ANY, label: 'Mọi phương án' },
    ...(counts?.motions ?? []).map((m) => ({ value: m, label: motionLabel(m) })),
  ]
  const originFilterOptions = [
    { value: ANY, label: 'Mọi nguồn' },
    ...(counts?.origins ?? []).map((o) => ({ value: o.id, label: o.name })),
  ]

  /* Phiếu MAS sống trọn trong Modal: nội dung, lịch và người nhận cùng một chỗ.
     Sổ không đổi cột hay chèn thêm section khi soạn mail. */
  const [composing, setComposing] = useState(false)

  /* The selection outlives paging: the codes live on the screen, not in the ten
     rows of this page. The mail modal takes them as a seed and still lets the
     user add and remove. */
  const [selectedCodes, setSelectedCodes] = useState<ReadonlySet<string>>(NO_SELECTED_CODES)
  const dragIntent = useRef<'select' | 'deselect' | null>(null)
  const suppressClick = useRef<string | null>(null)

  const selectedLeads = useMemo(
    () => wholeBook.filter((lead) => selectedCodes.has(lead.code)),
    [wholeBook, selectedCodes],
  )
  const selectedCodeList = useMemo(() => [...selectedCodes], [selectedCodes])
  const selectedEmailCount = selectedLeads.filter((lead) => Boolean(lead.email)).length
  const pageSelected = shown.filter((lead) => selectedCodes.has(lead.code)).length
  const allPageSelected = shown.length > 0 && pageSelected === shown.length

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
      for (const lead of shown) {
        if (on) next.add(lead.code)
        else next.delete(lead.code)
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

  /* Bản vẽ nạp tệp + sổ người của máy chủ. Ô "Lead PIC" là danh sách đóng, và
     danh sách đó là những người ĐANG làm ở đây — không phải bảy cái tên từng
     nằm trong fixture. */
  const staff = useDirectory()
  const leadSpec = useMemo(() => withPeople(LEAD_SPEC, staff), [staff])

  const loadFile = useLeadImport()

  /* Lô nạp GHI THẲNG lên máy chủ — hai cửa, đúng vai từng cửa, cả hai nằm ở
     `data/lead-import.ts`. Kho `intake-desk` không còn nhận lô của sổ lead:
     dòng đã nằm trên máy chủ rồi, giữ thêm một bản cục bộ là mỗi dòng nạp hiện
     hai lần mà không có gì nói cho người xem biết vì sao. Hai sổ kia còn dùng
     kho đó, nên `app/intake-desk.ts` vẫn đứng nguyên.

     Trả BÁO CÁO CỦA MÁY CHỦ về cho panel: bốn con số ở bước 3 phải là số của
     bên đã ghi thật — xem docblock `onCommit` ở `components/import-zone.tsx`.
     Hàm này không bao giờ ném, vì `runLeadImport` đã đổi mọi lời từ chối thành
     một báo cáo nói đúng những gì đã vào sổ. */
  /* Origin for the whole batch — drawn inside the import panel, held here
     because the commit below is where it goes onto the wire. */
  const [importOrigin, setImportOrigin] = useState<OriginChoice | null>(null)

  const commitLeads = async ({
    rows,
    motion,
    fileName,
    scope,
  }: ImportCommit & { scope?: string }) => {
    const origin = importOrigin
      ? importOrigin.id
        ? { id: importOrigin.id }
        : { name: importOrigin.name }
      : undefined
    const run = await loadFile({ rows, motion, fileName, source: scope, origin })
    /* The codes ride ALONG with the report rather than inside it, because
       `runLeadImport` has to answer for the preview-only path too — where rows
       survived and nothing was written. Joining them here is what lets step 3
       print the lead code beside each row it actually created; an empty list
       stays absent, and the panel then draws no code column at all. */
    const report = { ...run.report, ...(run.codes.length > 0 ? { codes: run.codes } : {}) }

    toast(run.failure ?? `${report.rows.length} lead đã vào sổ`, {
      tone: run.failure ? 'danger' : 'success',
      detail: [
        report.duplicates > 0 && `${report.duplicates} dòng trùng sổ, bỏ qua`,
        report.dupInFile > 0 && `${report.dupInFile} dòng trùng nhau trong tệp`,
        report.errors.length > 0 && `${report.errors.length} dòng không nạp được`,
        report.origins && originTally(report.origins),
      ]
        .filter(Boolean)
        .join(' · '),
    })

    return report
  }

  const onPage = (i: number) =>
    setParams(leadBookQueryToParams({ ...urlQuery, page: queryPageFromPageIndex(i) }))

  /* The pinned list does not read the URL, so it gets no sort control at all. */
  const sortable = !pinnedView

  const table: BookTable = {
    minWidth: 'min-w-[880px]',
    /* The arrow lights only while the book sorts by this column; the default
       order (`createdAt desc`) is no column on the table. */
    sort: sortable && query.sort === 'company' ? { key: 'company', dir: query.dir } : undefined,
    onSort: sortable
      ? (key) => {
          /* The only sortable column; any other key would die at the server's
             zod gate as a 400. */
          if (key !== 'company') return
          patch(
            query.sort === 'company'
              ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
              : { sort: 'company', dir: 'asc' },
          )
        }
      : undefined,
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
      { header: 'Công ty · Người liên hệ', width: 'minmax(0,2.2fr)', sortKey: 'company' },
      { header: 'Nguồn', width: 'minmax(0,1.3fr)' },
      { header: 'Trạng thái', width: 'minmax(0,1.2fr)' },
      { header: 'Lead PIC', width: 'minmax(0,1.1fr)' },
      { header: <span className="sr-only">Ghim</span>, width: '48px' },
    ],
    rows: shown.map((l) => ({
      id: l.code,
      state: selectedCodes.has(l.code) ? ('selected' as const) : undefined,
      onOpen: () => open(l.code),
      onPointerEnter: (event: ReactPointerEvent<HTMLDivElement>) => paintSelection(l.code, event),
      cells: [
        <SelectionCell
          key="select"
          checked={selectedCodes.has(l.code)}
          label={l.company}
          onPress={(event) => beginDrag(l.code, event)}
          onChange={(on) => suppressClick.current !== l.code && setCodeSelected(l.code, on)}
        />,
        <CompanyCell key="c" lead={l} />,
        <SourceCell key="s" lead={l} />,
        <StatusCell key="w" lead={l} />,
        <LeadPicCell key="o" lead={l} />,
        <PinCell
          key="p"
          on={pins.includes(l.code)}
          company={l.company}
          onToggle={() => me && togglePin(me.id, l.code)}
        />,
      ],
    })),
  }

  /* Two bodies, one card: the pinned tab answers out of `leadFacetQuery`, the
     book out of `leadBookQuery`, so every draw state picks its own source. */
  const pending = pinnedView ? facetsPending : isPending

  /* A failed read says so and offers a retry, not "clear filters": the filters
     are not what broke. `userMessage` keeps the server's own words. */
  const failure = pinnedView
    ? facetsError
      ? {
          message: `Không lấy được danh sách ghim. ${
            isApiError(facetsError) ? userMessage(facetsError) : 'Vui lòng thử lại.'
          }`,
          onRetry: () => void refetchFacets(),
        }
      : undefined
    : bookError
      ? {
          message: `Không lấy được sổ lead. ${
            isApiError(bookError) ? userMessage(bookError) : 'Vui lòng thử lại.'
          }`,
          onRetry: () => void refetchBook(),
        }
      : undefined

  const empty = pinnedView
    ? pinned.length === 0
      ? {
          message: 'Chưa ghim lead nào. Bấm biểu tượng ghim ở cuối một dòng để giữ nó ở đây.',
          action: { label: 'Về sổ lead', onClick: () => setPinnedView(false) },
        }
      : undefined
    : rows.length === 0
      ? {
          message: 'Không có lead nào khớp bộ lọc đang chọn.',
          action: { label: 'Bỏ hết bộ lọc', onClick: clearFilters },
        }
      : undefined

  const sourceFiltered = query.campaign !== undefined || query.sourceKind !== undefined

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Sổ lead"
          actions={
            <>
              <ImportZone
                spec={leadSpec}
                existingKeys={NO_LOCAL_KEYS}
                scopeOptions={importSourceOptions}
                batchExtra={
                  <OriginPicker
                    label="Nguồn lead cho cả lô — dùng cho dòng để trống cột Nguồn lead"
                    value={importOrigin}
                    onChange={setImportOrigin}
                    onClear={() => setImportOrigin(null)}
                  />
                }
                buttonLabel="Nhập từ file"
                onCommit={commitLeads}
                onSeeResult={() => {
                  setPinnedView(false)
                  clearFilters()
                }}
              />
              {/* Typing a lead by hand is a PAGE now (`/sales/leads/new`), not a
                  drawer: it asks the very questions the lead profile asks, so it
                  uses that same form — see `pages/lead-new.tsx`. */}
              {canWrite && (
                <Button
                  size="md"
                  onClick={() => navigate('/sales/leads/new')}
                  className="max-sm:flex-1"
                >
                  <Icon icon={Plus} size={16} />
                  Tạo lead
                </Button>
              )}
            </>
          }
          score={<ScoreStrip />}
          tabs={
            <SegmentedControl
              label="Nhóm lead"
              hideLabel
              tone="quiet"
              value={pinnedView ? PINNED : tabValue}
              options={tabs}
              onChange={onTab}
            />
          }
          count={<BookCount total={pinnedView ? pinned.length : total} noun="lead" />}
          tools={
            !pinnedView && (
              <>
                <SearchField
                  placeholder="Tìm theo tên công ty hoặc mã lead…"
                  value={text}
                  onChange={setText}
                  className="min-w-0 flex-1 sm:max-w-[320px]"
                />
                <FilterMenu
                  label="Bộ lọc sổ lead"
                  active={
                    (sourceFiltered ? 1 : 0) +
                    (oneOpenState ? 1 : 0) +
                    (query.motion ? 1 : 0) +
                    (query.origin ? 1 : 0)
                  }
                >
                  {tabValue === 'open' && (
                    <Select
                      label="Trạng thái"
                      value={query.state}
                      onChange={(value) => patch({ state: value as LeadStateFilter })}
                      className="w-full max-w-none"
                      options={stateFilterOptions}
                    />
                  )}
                  <Select
                    label="Phương án tiếp cận"
                    value={query.motion ?? ANY}
                    onChange={(v) => patch({ motion: v === ANY ? undefined : (v as LeadMotion) })}
                    className="w-full max-w-none"
                    options={motionFilterOptions}
                  />
                  <Select
                    label="Nguồn"
                    value={query.origin ?? ANY}
                    onChange={(v) => patch({ origin: v === ANY ? undefined : v })}
                    className="w-full max-w-none"
                    options={originFilterOptions}
                  />
                  <Select
                    label="Chiến dịch hoặc cửa vào"
                    value={sourceFilterValue}
                    onChange={patchSourceFilter}
                    /* Campaign names run to 40 characters and a native select
                       grows to its longest option — clamp it to the panel. */
                    className="w-full max-w-none"
                    options={[
                      { value: ANY, label: 'Mọi chiến dịch và cửa vào' },
                      ...sourceFilterOptions,
                    ]}
                  />
                  {dirty && (
                    <Button size="md" variant="ghost" onClick={clearFilters}>
                      Bỏ hết bộ lọc
                    </Button>
                  )}
                </FilterMenu>
              </>
            )
          }
          pending={pending}
          failure={failure}
          empty={empty}
          table={table}
          footer={
            pinnedView ? (
              /* The pinned list is one page by definition — it is as long as the
                 person's own pins, so there is nothing to page through. */
              <TableFooter
                page={0}
                pageSize={pinned.length}
                total={pinned.length}
                onPage={onPage}
              />
            ) : (
              <TableFooter page={pageIndex} pageSize={PAGE_SIZE} total={total} onPage={onPage} />
            )
          }
        />

        {selectedCodes.size > 0 && <div aria-hidden className="h-24" />}
        <MasMailModal
          open={composing}
          onClose={() => setComposing(false)}
          leads={wholeBook}
          initialLeadCodes={selectedCodeList}
          defaultLabel="Gửi email · Sổ lead"
          onQueued={() => {
            setComposing(false)
            clearSelection()
          }}
        />
        {selectedCodes.size > 0 && (
          <BookSelectionBar
            count={selectedCodes.size}
            noun="lead"
            meta={`${selectedEmailCount} địa chỉ email`}
            onClear={clearSelection}
            onSend={() => setComposing(true)}
          />
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default LeadsPage
