import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Inbox, Pin, Plus, TriangleAlert } from '@pv/ui'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  ScreenHeader,
  ScreenLayout,
  SearchField,
  SegmentedControl,
  Select,
  Skeleton,
} from '@pv/ui'
import { DAS_VINA_FROZEN_AT, dayISO } from '@pv/engines/fixtures/das-vina'
import {
  SOURCE_KIND_LABEL,
  type ConfigEntry,
  type LeadBookQuery,
  type LeadRow,
  type LeadSourceKind,
  type LeadStatus,
} from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { pinsOf, useLeadDesk } from '@/app/desk'
import { useSession } from '@/app/auth'
import {
  DEFAULT_LEAD_BOOK_QUERY,
  leadBookQueryToParams,
  pageIndexFromQueryPage,
  parseLeadBookQuery,
  queryPageFromPageIndex,
} from '@/app/url'
import { dm, dmy } from '@/lib/date'
import {
  leadBookQuery,
  leadFacetQuery,
  leadSourceKindFacetQuery,
  NO_OWNER_TITLE,
} from '@/data/leads'
import { salesCatalogQuery } from '@/data/sales-config'
import { toast } from '@/app/toast'
import { isApiError, userMessage } from '@/app/api'
import { useDirectory } from '@/data/directory'
import { LEAD_SPEC, withPeople } from '@/data/intake'
import { useLeadImport } from '@/data/lead-import'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { LeadCreateDialog } from '@/components/lead-create-dialog'
import { MasMailModal } from '@/components/mas-mail-modal'
import { PicCell, TableFooter } from '@/components/table-bits'
import {
  CompanyCell,
  FilterMenu,
  LeadSelectionBar,
  PeriodLabel,
  PinCell,
  ScoreStrip,
  SelectionCell,
  SourceCell,
  StatusCell,
} from './leads-parts'

/** Module 2 · Sổ lead — a list, not a workbench: a row opens `/sales/leads/:code`.
 *
 *  The layout every book follows: a one-line header (uppercase title ·
 *  actions), one score strip, then one list card holding tabs · search · filter,
 *  the table and its page footer. Cells and blocks live in `leads-parts.tsx`.
 *
 *  The book is server-side: `GET /sales/leads` returns one filtered, sorted page
 *  plus `total`, and every filter lives in the URL (`app/url.ts`) so F5, shared
 *  links and the back button keep it. Tab counts are that query at `size=1`.
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

/* Mốc kỳ suy từ fixture, không gõ vào JSX. `dayISO(0)` là ngày đầu kỳ. */
const PERIOD_FROM = dm(dayISO(0))

/** Bốn trạng thái của một dòng trong sổ. "Chưa chốt" là mặc định — lead đã rơi
 *  vẫn tra được, vì đó là nơi câu trả lời "vì sao mất" nằm.
 *
 *  Bốn khoá là bốn giá trị của `LeadStatus` trong hợp đồng, không phải một bản
 *  liệt kê thứ hai: chúng đi thẳng lên địa chỉ rồi lên dây.
 *
 *  ------------------------------------------------------------------
 *  NHÃN CỦA `running` ĐỔI TỪ "Đang chạy" (29/08) — CỘT VÀ Ô LỌC PHẢI NÓI CÙNG MỘT CHUYỆN
 *  ------------------------------------------------------------------
 *  `running` = chưa ký, chưa rơi (`statusFilter` ở `lead.repository.ts`) — và
 *  55/65 dòng khớp điều kiện đó chưa hề có `stage`, nên cột Trạng thái của
 *  chúng vẽ "Chưa xử lý" (`StatusCell`), không phải bất cứ thứ gì đọc ra như
 *  "đang chạy". Một người lọc "Đang chạy" rồi thấy phần lớn dòng ghi "Chưa xử
 *  lý" đọc như hai câu trả lời cho hai câu hỏi khác nhau.
 *
 *  "Chưa chốt" fits both things the status column draws in this bucket — an
 *  untouched row and a pipeline stage — since neither has reached an ending.
 *
 *  `lead-detail.tsx#StatusBadge` in CÙNG nhãn này cho cùng bucket — hai màn của
 *  một dòng dữ liệu không được gọi nó bằng hai tên. */
const STATUSES: { key: LeadStatus; label: string }[] = [
  { key: 'running', label: 'Chưa chốt' },
  { key: 'signed', label: 'Đã ký' },
  { key: 'exited', label: 'Đã rơi' },
  { key: 'all', label: 'Tất cả' },
]

/** The pinned tab's value — not a `LeadStatus`, so it never reaches the URL. */
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

  /* One `size=1` read per tab: `total` is the count under the current search
     and source filter, and nothing else on the server answers that. */
  const tabCounts = useQueries({
    queries: STATUSES.map((s) =>
      leadBookQuery({ ...urlQuery, status: s.key, page: DEFAULT_LEAD_BOOK_QUERY.page, size: 1 }),
    ),
  })
  const tabs = [
    ...STATUSES.map((s, i) => ({ value: s.key, label: s.label, count: tabCounts[i]?.data?.total })),
    { value: PINNED, label: 'Đã ghim', count: pinned.length },
  ]
  const onTab = (value: string) => {
    setPinnedView(value === PINNED)
    if (value !== PINNED) patch({ status: value as LeadStatus })
  }

  /* Nửa "không chiến dịch" của ô lọc Nguồn — `GET /sales/leads/facets`, real
     `sourceKind` nào đang đứng không kèm chiến dịch trong sổ. Đọc docblock
     `LeadFacets` (`@pv/contracts`) trước khi đụng vào chỗ này: nửa "có chiến
     dịch" đã có nguồn thật rồi (`sourceOptions` ở trên, từ `GET /sales/config`)
     — cái CÒN THIẾU trước bản sửa này là nửa kia, và thiếu nó nghĩa là một
     lead `LANDING_PAGE` không chiến dịch (cột Nguồn in "Web landing") không có
     lấy MỘT lựa chọn trong ô lọc trỏ được tới nó. */
  const { data: sourceKindFacets } = useQuery(leadSourceKindFacetQuery)

  /* Một ô, hai trục hợp đồng (`campaign` và `sourceKind`) — xem docblock
     `sourceKind` trong `LeadBookQuery` cho lý do hai trục không gộp làm một
     tham số. `value` mã hoá bằng tiền tố `KIND_PREFIX` để `<Select>` phân biệt
     được "SR-09" (một id chiến dịch) với "LANDING_PAGE" (một kind) mà không
     cần đi tra lại — hai bảng mã không bao giờ đụng nhau (chiến dịch luôn có
     tiền tố `SR-`, kind luôn viết hoa không dấu gạch), nên ghép an toàn. */
  const sourceFilterOptions = useMemo(
    () => [
      ...sourceOptions.map((entry) => ({ value: entry.id, label: entry.name })),
      ...(sourceKindFacets?.sourceKinds ?? []).map((kind) => ({
        value: `${KIND_PREFIX}${kind}`,
        label: SOURCE_KIND_LABEL[kind],
      })),
    ],
    [sourceOptions, sourceKindFacets],
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
    query.status !== DEFAULT_LEAD_BOOK_QUERY.status

  const clearFilters = () =>
    patch({
      q: undefined,
      campaign: undefined,
      sourceKind: undefined,
      status: DEFAULT_LEAD_BOOK_QUERY.status,
    })

  /* Cửa gõ tay. Trạng thái CHẾT theo màn (mở/đóng một dialog), nên nó nằm ở
     `useState` của màn chứ không ở `app/` — cùng luật với số trang và bộ lọc. */
  const [typing, setTyping] = useState(false)

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
  const commitLeads = async ({
    rows,
    motion,
    fileName,
    scope,
  }: ImportCommit & { scope?: string }) => {
    const run = await loadFile({ rows, motion, fileName, source: scope })
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
      ]
        .filter(Boolean)
        .join(' · '),
    })

    return report
  }

  const onPage = (i: number) =>
    setParams(leadBookQueryToParams({ ...urlQuery, page: queryPageFromPageIndex(i) }))

  const table = (list: LeadRow[], sortable: boolean) => (
    <DataTable
      flush
      className="min-w-[880px]"
      /* The arrow lights only while the book sorts by this column; the default
         order (`createdAt desc`) is no column on the table. */
      sort={sortable && query.sort === 'company' ? { key: 'company', dir: query.dir } : undefined}
      onSort={
        sortable
          ? (key) => {
              /* The only sortable column; any other key would die at the server's
                 zod gate as a 400. The pinned list does not read the URL, so it
                 gets no sort control at all. */
              if (key !== 'company') return
              patch(
                query.sort === 'company'
                  ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
                  : { sort: 'company', dir: 'asc' },
              )
            }
          : undefined
      }
      columns={[
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
      ]}
      rows={list.map((l) => ({
        id: l.code,
        state: selectedCodes.has(l.code) ? ('selected' as const) : undefined,
        onOpen: () => open(l.code),
        onPointerEnter: (event: ReactPointerEvent<HTMLDivElement>) => paintSelection(l.code, event),
        cells: [
          <SelectionCell
            key="select"
            checked={selectedCodes.has(l.code)}
            company={l.company}
            onPress={(event) => beginDrag(l.code, event)}
            onChange={(on) => suppressClick.current !== l.code && setCodeSelected(l.code, on)}
          />,
          <CompanyCell key="c" lead={l} />,
          <SourceCell key="s" lead={l} />,
          <StatusCell key="w" lead={l} />,
          <PicCell key="o" avatar email={l.ownerEmail} name={l.ownerName} empty={NO_OWNER_TITLE} />,
          <PinCell
            key="p"
            on={pins.includes(l.code)}
            company={l.company}
            onToggle={() => me && togglePin(me.id, l.code)}
          />,
        ],
      }))}
    />
  )

  const body = pinnedView ? (
    facetsPending ? (
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    ) : facetsError ? (
      <EmptyState
        icon={TriangleAlert}
        message={`Không lấy được danh sách ghim. ${
          isApiError(facetsError) ? userMessage(facetsError) : 'Vui lòng thử lại.'
        }`}
        action={{ label: 'Thử lại', onClick: () => void refetchFacets() }}
        className="py-12"
      />
    ) : pinned.length === 0 ? (
      <EmptyState
        icon={Pin}
        message="Chưa ghim lead nào. Bấm biểu tượng ghim ở cuối một dòng để giữ nó ở đây."
        action={{ label: 'Về sổ lead', onClick: () => setPinnedView(false) }}
        className="py-12"
      />
    ) : (
      table(pinned, false)
    )
  ) : isPending ? (
    <div className="flex flex-col gap-3 p-5">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  ) : bookError ? (
    /* A failed read says so and offers a retry, not "clear filters": the
       filters are not what broke. `userMessage` keeps the server's own words. */
    <EmptyState
      icon={TriangleAlert}
      message={`Không lấy được sổ lead. ${
        isApiError(bookError) ? userMessage(bookError) : 'Vui lòng thử lại.'
      }`}
      action={{ label: 'Thử lại', onClick: () => void refetchBook() }}
      className="py-12"
    />
  ) : rows.length === 0 ? (
    <EmptyState
      icon={Inbox}
      message="Không có lead nào khớp bộ lọc đang chọn."
      action={{ label: 'Bỏ hết bộ lọc', onClick: clearFilters }}
      className="py-12"
    />
  ) : (
    table(rows, true)
  )

  const sourceFiltered = query.campaign !== undefined || query.sourceKind !== undefined

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          /* CSS uppercase, not typed capitals: screen readers still read the words. */
          title={<span className="uppercase">Sổ lead</span>}
          actions={
            <>
              <PeriodLabel from={PERIOD_FROM} to={dmy(DAS_VINA_FROZEN_AT)} />
              <ImportZone
                spec={leadSpec}
                existingKeys={NO_LOCAL_KEYS}
                scopeOptions={importSourceOptions}
                buttonLabel="Nhập từ file"
                onCommit={commitLeads}
                onSeeResult={() => {
                  setPinnedView(false)
                  clearFilters()
                }}
              />
              <Button size="md" onClick={() => setTyping(true)} className="max-sm:flex-1">
                <Icon icon={Plus} size={16} />
                Tạo lead
              </Button>
            </>
          }
        />

        <ScoreStrip />

        {/* Tables always sit on glass-b — law 8. */}
        {/* No `overflow-hidden`: the filter popover must hang past the card's edge. */}
        <GlassCard variant="b" aria-label="Sổ lead">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <SegmentedControl
                label="Nhóm lead"
                hideLabel
                tone="quiet"
                value={pinnedView ? PINNED : query.status}
                options={tabs}
                onChange={onTab}
              />
              <span className="text-muted-foreground text-[11.5px]">
                <span className="tnum text-foreground font-semibold">
                  {pinnedView ? pinned.length : total}
                </span>{' '}
                lead
              </span>
            </div>
            {!pinnedView && (
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <SearchField
                  placeholder="Tìm theo tên công ty hoặc mã lead…"
                  value={text}
                  onChange={setText}
                  className="min-w-0 flex-1 sm:max-w-[320px]"
                />
                <FilterMenu active={sourceFiltered ? 1 : 0}>
                  <Select
                    label="Nguồn"
                    value={sourceFilterValue}
                    onChange={patchSourceFilter}
                    /* Campaign names run to 40 characters and a native select
                       grows to its longest option — clamp it to the panel. */
                    className="w-full max-w-none"
                    options={[{ value: ANY, label: 'Mọi nguồn' }, ...sourceFilterOptions]}
                  />
                  {dirty && (
                    <Button size="md" variant="ghost" onClick={clearFilters}>
                      Bỏ hết bộ lọc
                    </Button>
                  )}
                </FilterMenu>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">{body}</div>

          {pinnedView
            ? !facetsPending &&
              pinned.length > 0 && (
                <TableFooter
                  page={0}
                  pageSize={pinned.length}
                  total={pinned.length}
                  onPage={onPage}
                />
              )
            : !isPending &&
              !bookError &&
              total > 0 && (
                <TableFooter page={pageIndex} pageSize={PAGE_SIZE} total={total} onPage={onPage} />
              )}
        </GlassCard>

        {selectedCodes.size > 0 && <div aria-hidden className="h-24" />}
        {/* The book refreshes itself after a create: `useCreateLead` invalidates
            the `['sales','lead-book']` prefix, and the dialog closes on 201. */}
        <LeadCreateDialog open={typing} onClose={() => setTyping(false)} />
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
          <LeadSelectionBar
            leads={selectedCodes.size}
            emails={selectedEmailCount}
            onClear={clearSelection}
            onSend={() => setComposing(true)}
          />
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default LeadsPage
