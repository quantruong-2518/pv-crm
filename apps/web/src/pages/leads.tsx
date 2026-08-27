import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, FileCheck, Inbox, PenLine, Pin, Target, Users } from 'lucide-react'
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
  Icon,
  Kicker,
  MetaPill,
  SearchField,
  Select,
  Skeleton,
  StatCard,
  cn,
  percent,
} from '@pv/ui'
import {
  DAS_VINA_FROZEN_AT,
  dayISO,
  FIRST_MEETINGS,
  FUNNEL,
  LEAD_CATEGORIES,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
} from '@pv/engines/fixtures/das-vina'
import {
  campaignLabel,
  OWNER_NONE,
  sourceKindLabel,
  type ConfigEntry,
  type LeadBookQuery,
  type LeadRow,
  type LeadSource,
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
import { dm } from '@/lib/date'
import { EXIT_REASON_LABEL, leadBookQuery, leadFacetQuery } from '@/data/leads'
import { salesCatalogQuery } from '@/data/sales-config'
import { toast } from '@/app/toast'
import { LEAD_SPEC } from '@/data/intake'
import { useLeadImport } from '@/data/lead-import'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { LeadCreateDialog } from '@/components/lead-create-dialog'
import { Pager, PersonCell, PicCell } from '@/components/table-bits'

/** Module 2 · Sổ lead.
 *
 *  ------------------------------------------------------------------
 *  MÀN NÀY LÀ MỘT DANH SÁCH, KHÔNG PHẢI MỘT BÀN LÀM VIỆC
 *  ------------------------------------------------------------------
 *  Bản trước nhét cả hồ sơ lead vào panel bên phải: bảng co còn 60% chiều rộng,
 *  panel phải cuộn ba màn hình mới hết, và cùng một lead thao tác được ở hai
 *  chỗ. Chốt lại: **danh sách ở đây, hồ sơ ở `/sales/leads/:code`.** Bấm một
 *  dòng là sang trang — dòng nổi lên và đổi con trỏ để nói ra điều đó.
 *
 *  Ba khối, đúng thứ tự mắt cần:
 *   1 · thẻ điểm — bốn con số của cả kỳ, đọc trong một nhịp mắt;
 *   2 · một hàng lọc — ô tìm + bốn select, không còn ba chục nút pill;
 *   3 · sổ — ghim của tôi tách lên trên, rồi bảng phân trang.
 *
 *  ------------------------------------------------------------------
 *  GỠ 22/08 — MỘT MÀN TRẢ LỜI MỘT CÂU
 *  ------------------------------------------------------------------
 *  Hai thứ đã gỡ khỏi đầu màn:
 *   · **hai tab "Sổ lead" / "Việc của tôi"**. Sổ trả lời "phòng đang có gì",
 *     bàn việc cá nhân trả lời "tôi phải làm gì". Hai câu khác nhau thì là hai
 *     màn, không phải hai tab nấp sau tiêu đề của sổ. `MyWork` xoá khỏi màn,
 *     nhưng phần dựng việc (`myWork`, `WORK_COLUMNS` ở `data/leads.ts`) GIỮ
 *     NGUYÊN — màn việc dựng lại được mà không phải viết lại từ đầu.
 *   · **ContextRail**. Luật 10 đòi rail trên mọi màn, nên đây là NỢ LUẬT có ý
 *     thức chứ không phải quên: chuỗi ở màn này dựng từ một dòng mồi CỨNG
 *     (`ANCHOR_CODE`), nên bốn chip mã treo trên đầu một danh sách 100 dòng nói
 *     về một lead mà người dùng không hề chọn. Rail quay lại khi nào nó dựng
 *     được từ dòng đang được chọn — không sớm hơn.
 *   · **khối tiêu đề "Sổ lead" + dòng kỳ** — gỡ TẠM THỜI, khác hai thứ trên.
 *     Kỳ và số dòng cả kỳ vẫn còn nguyên trên phễu ngay bên dưới
 *     (`Phễu 01/05 → 17/08`), nên đầu màn đang lặp lại chính nó. Hệ quả phải
 *     biết: màn HẾT `<h2>` — trình đọc màn hình không còn tên cho vùng nội
 *     dung, và tên màn chỉ còn nằm ở nav tầng 2. Trả lại khối này (hoặc một
 *     tiêu đề gọn hơn) trước khi màn ra khỏi POC.
 *
 *  ------------------------------------------------------------------
 *  TÁM CỘT — chốt 22/08, tên cột sửa lần 2
 *  ------------------------------------------------------------------
 *  Ghim · Mã · **Account** · Người liên hệ · Chức danh · Nguồn · Trạng thái ·
 *  **Lead PIC**. Sổ đổi trục: từ "lead đi tới đâu trong phễu" sang "ai đang nói
 *  chuyện với ai" — hai cột NGƯỜI (bên khách và bên mình) thay bốn cột đo tiến
 *  độ. Gỡ theo: Bậc · Ô bắt buộc · Đang ở (số ngày) · Đang làm (nhóm avatar).
 *  Sắp xếp vì thế chỉ còn cột Account: hai khoá `slots` và `days` mất cột để bấm.
 *
 *  Ba cột đổi cách vẽ cùng lúc, và ba cái đổi cùng một hướng — **bỏ chữ thừa,
 *  giữ tín hiệu**:
 *
 *   · **Account** (trước là "Công ty") — bỏ tam giác cảnh báo SLA. Cột tên khách
 *     không phải chỗ báo động; tín hiệu đó chuyển sang màu vàng của pill trạng
 *     thái, tức là chuyển vào đúng cột nói về trạng thái.
 *   · **Nguồn** — bỏ mã, còn một hình. `SK-0103` là sáu ký tự không ai đọc ra
 *     nghĩa khi lướt bảng; cái hình trả lời xong câu "về bằng đường nào". Cột
 *     rút từ `1fr` xuống 64px, chỗ dôi ra chia cho hai cột bên phải.
 *     — CẬP NHẬT 27/08: một icon không phân biệt nổi hai chiến dịch khác hẳn
 *     nhau (cùng `kind`, chỉ bốn giá trị). Cột đổi sang pill icon + TÊN RÚT
 *     GỌN của `config_entry.name` (cắt ở dấu `—`/`·` đầu tiên), tên đầy đủ
 *     nằm ở `title`.
 *     — CẬP NHẬT LẦN 2 (chủ dự án xem xong): bỏ hẳn icon trong pill — tên chữ
 *     giờ đã là tín hiệu chính, icon chỉ chiếm chỗ (`Database` cho "mua dữ
 *     liệu" từng bị đọc sai nghĩa). Loại `mua-du-lieu` tô pill tone `warning`
 *     (vàng) thay vì `muted`, theo đúng `kind` chứ không theo `id` — xem lý do
 *     ở `SourceMark`. Rộng thu 160px → 140px vì hết icon thì chữ cần ít chỗ
 *     hơn — xem `SourceMark`.
 *   · **Lead PIC** (trước là "Người giữ") — in hòm thư công ty chứ không in
 *     tên. Tên trùng được, hòm thư thì không, và mọi hệ khác (thư, lịch, bảng
 *     hoa hồng) đều khoá theo nó. Hòm thư ĐỌC TỪ dòng sổ (`ownerEmail`), không
 *     suy từ tên nữa: suy ra là đoán, và một cái đoán ở đây là một lá thư gửi
 *     tới địa chỉ không tồn tại.
 *
 *  Nhãn hai cột người lấy từ chính fixture chứ không dịch lại: câu số 4 của init
 *  data tên là "Người liên hệ và chức danh" (`INIT_DATA_QUESTIONS`).
 *
 *  58/119 dòng CHƯA có chức danh — ô số 4 chưa moi được. Hai cột người vẽ
 *  "—" cho chúng và nói lý do ở `title`. Điền một cái tên cho đủ ô là phá đúng
 *  thứ cổng init data sinh ra để đo.
 *
 *  Hàng lọc: ô tìm · Trạng thái · Nguồn · Lead PIC · Account — tên ô lọc đi
 *  theo tên cột, vì một trường mà hai chỗ gọi hai tên là chỗ để hiểu nhầm. Bỏ:
 *  Bậc · Ngành · Quá SLA.
 *
 *  Sổ phân trang, không cuộn vô tận — và từ 27/08 nó là sổ THẬT của máy chủ,
 *  không còn là 100 dòng đóng băng. Thẻ điểm phía trên vẫn là số của kỳ đóng
 *  băng (xem mục ngay dưới), nên hai khối trên cùng một màn đang đếm hai sổ
 *  khác nhau cho tới khi có endpoint trả thẻ điểm.
 *
 *  Vào được màn này là vai có nhánh Sales — cửa ở `app/auth/guard.tsx`, không
 *  kiểm lại ở đây. Trục PHẠM VI thì máy chủ cắt: một Sale `ownOnly` chỉ nhận
 *  dòng mình giữ, và số dòng bị cắt về trong `hidden`.
 *
 *  Ba mảnh `Pager` · `PicCell` · `PersonCell` đã chuyển sang
 *  `components/table-bits.tsx` (23/08) — sổ cơ hội của module Ops cần đúng ba thứ
 *  đó, và hai cái sổ của cùng một phòng phải phân trang giống nhau.
 *
 *  ------------------------------------------------------------------
 *  SỔ ĐÃ CẮT SANG MÁY CHỦ — LỌC · SẮP · PHÂN TRANG KHÔNG CÒN Ở ĐÂY
 *  ------------------------------------------------------------------
 *  `GET /sales/leads` trả về đúng một trang đã lọc, đã sắp, kèm `total`. Bốn
 *  đoạn đã XOÁ khỏi màn, không phải vô hiệu hoá: `book.filter(...)`, phép sắp
 *  theo `company` ở trình duyệt (máy chủ còn nối thêm `code` làm khoá phá hoà,
 *  thứ bản cũ không có nên một dòng lọt được vào cả hai trang), phép cắt trang
 *  bằng `slice`, và phép gộp dòng nạp từ tệp — đợt 3 ghi thẳng lên máy chủ,
 *  giữ phép gộp lại là hiện đôi dòng.
 *
 *  Bộ lọc sống trên ĐỊA CHỈ, không trong `useState`. Một bộ lọc chỉ nằm trong
 *  state React thì F5 mất sạch, link không gửi được cho ai, và nút back không
 *  còn nghĩa gì — ba thứ đó không phải tiện nghi, chúng là cách người ta thật
 *  sự dùng một cái sổ. Dịch hai chiều nằm ở `app/url.ts`, màn chỉ nối dây.
 *
 *  Ba thứ VẪN đọc fixture, và mỗi thứ có lý do riêng: thẻ điểm (`FUNNEL`,
 *  `FIRST_MEETINGS`) là số CẢ KỲ, cố tình không đổi theo bộ lọc và không
 *  endpoint nào trả nó; nhãn của bậc, ngành và lý do rơi vì `LeadRow` còn chở
 *  khoá chữ thường cũ chứ chưa phải ID cấu hình (nợ đã ghi ở
 *  `docs/tich-hop-be.md`). Chỉ NGUỒN đã nối được vào sổ nguồn thật.
 *
 *  Ghim và đề nghị giao việc sống lâu hơn một lần mở màn và đi qua cả màn chi
 *  tiết — chúng nằm ở `app/desk.ts`. */

/** Số dòng một trang. Máy chủ cắt trang, nhưng con số vẫn do màn quyết —
 *  `size` đi kèm mọi lời gọi. */
const PAGE_SIZE = 10

/** Giá trị "không lọc trục này" của ba ô Select. Trên dây thì "không lọc" là
 *  trường VẮNG MẶT, nhưng `<select>` gốc chỉ mang được chuỗi nên vẫn cần một
 *  giá trị để đại diện. Đổi qua đổi lại đúng ở hai chỗ: `?? ANY` lúc đọc,
 *  `=== ANY ? undefined` lúc ghi. */
const ANY = 'all'

/** Chờ bao lâu sau phím cuối rồi mới ghi ô tìm lên địa chỉ.
 *
 *  Ô tìm nay là một trục LỌC CỦA MÁY CHỦ, nên mỗi lần ghi là một vòng mạng và
 *  một mục cache mới. Ghi thẳng từng phím thì gõ "Coreline" là tám lần gọi cho
 *  một câu hỏi. Chữ trong ô vẫn đổi ngay từng phím — chỉ có địa chỉ là đợi. */
const SEARCH_DELAY_MS = 300

const NO_CONTACT = 'Chưa có người liên hệ — ô số 4 của init data chưa moi được'

const NO_TITLE = 'Chưa có chức danh — ô số 4 của init data chưa moi được'

const NO_OWNER_TITLE = 'Còn ở kho chung, chưa ai nhận'

/* Mốc kỳ suy từ fixture, không gõ vào JSX. `dayISO(0)` là ngày đầu kỳ. */
const PERIOD_FROM = dm(dayISO(0))
const PERIOD_TO = dm(DAS_VINA_FROZEN_AT)

/** Bốn trạng thái của một dòng trong sổ. "Đang chạy" là mặc định — lead đã rơi
 *  vẫn tra được, vì đó là nơi câu trả lời "vì sao mất" nằm.
 *
 *  Bốn khoá là bốn giá trị của `LeadStatus` trong hợp đồng, không phải một bản
 *  liệt kê thứ hai: chúng đi thẳng lên địa chỉ rồi lên dây. */
const STATUSES: { key: LeadStatus; label: string }[] = [
  { key: 'running', label: 'Đang chạy' },
  { key: 'signed', label: 'Đã ký' },
  { key: 'exited', label: 'Đã rơi' },
  { key: 'all', label: 'Cả kỳ' },
]

const CATEGORY_LABEL = new Map(LEAD_CATEGORIES.map((c) => [c.key, c.label]))
const STAGE_LABEL = new Map(PIPELINE_STAGES.map((s) => [s.key, s.label]))
const STAGE_LIMIT = new Map(PIPELINE_STAGES.map((s) => [s.key, s.limitDays]))

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
 *  Hai sổ kia (người nhận, cơ hội) KHÔNG có endpoint nào, nên chúng vẫn tự
 *  chống trùng bằng `leadBookKeys` — cùng một panel, hai cách dùng. */
const NO_LOCAL_KEYS: ReadonlySet<string> = new Set()

/** Quá hạn cột. Bản cũ gọi `isOverSla` của fixture, thứ đòi nguyên một `Lead`;
 *  dòng sổ nay là `LeadRow` và chỉ chở hai ô cần thiết. Hạn vẫn đọc từ
 *  `PIPELINE_STAGES` — mục 5.2 của module Cấu hình, không chế ở đây. */
function overSla(lead: LeadRow): boolean {
  if (!lead.stage) return false
  return lead.daysHere > (STAGE_LIMIT.get(lead.stage) ?? Infinity)
}

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

  const { data: bookPage, isPending } = useQuery(leadBookQuery(query))
  const rows = bookPage?.rows ?? []
  const total = bookPage?.total ?? 0

  /* Sổ ĐẦY ĐỦ, gọi riêng một lần và cache dài. Đây là chỗ CHẮP VÁ — cả lý do
     lẫn ngày nó gãy nằm trong docblock của `leadFacetQuery`, đọc ở đó trước
     khi bắt chước cách này. Ba chỗ dưới đây cần một câu trả lời về CẢ SỔ mà
     một trang mười dòng không trả lời được: hai ô lọc người/công ty, dải ghim,
     và khoá chống trùng của panel nạp. */
  const { data: facets } = useQuery(leadFacetQuery)
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

  /* Hai danh sách lọc dựng TỪ CẢ SỔ chứ không khai tay: thêm một Sale hay một
     công ty là ô lọc tự có, không ai phải nhớ sửa thêm chỗ này.

     Giá trị là `ownerId`, NHÃN là tên. Đây là chỗ nợ số 2 được trả ở phía màn:
     lọc theo tên thì hai người trùng tên là một bộ lọc, và ngày công ty tuyển
     người thứ hai tên "Nguyễn Văn Nam" thì hai sổ dính vào nhau mà không ai
     biết. Máy chủ cũng so bằng `owner_id`, nên hai đầu nói cùng một thứ. */
  const owners = useMemo(() => {
    const byId = new Map<string, string>()
    for (const l of wholeBook) {
      if (l.ownerId) byId.set(l.ownerId, l.ownerName ?? l.ownerId)
    }
    return [...byId]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [wholeBook])

  const accounts = useMemo(
    () => [...new Set(wholeBook.map((l) => l.company))].sort((a, b) => a.localeCompare(b, 'vi')),
    [wholeBook],
  )

  /* Ô tìm đọc `text` chứ không đọc `query.q`: nút "Bỏ hết bộ lọc" phải hiện ra
     ngay từ phím đầu tiên, không đợi hết nhịp chờ 300ms. */
  const dirty =
    text.trim() !== '' ||
    query.campaign !== undefined ||
    query.owner !== undefined ||
    query.account !== undefined ||
    query.status !== DEFAULT_LEAD_BOOK_QUERY.status

  const clearFilters = () =>
    patch({
      q: undefined,
      campaign: undefined,
      owner: undefined,
      account: undefined,
      status: DEFAULT_LEAD_BOOK_QUERY.status,
    })

  /* Cửa gõ tay. Trạng thái CHẾT theo màn (mở/đóng một dialog), nên nó nằm ở
     `useState` của màn chứ không ở `app/` — cùng luật với số trang và bộ lọc. */
  const [typing, setTyping] = useState(false)

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
    const { report } = run

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

  return (
    <AppShell {...chrome.shell}>
      <div className="flex flex-col gap-4 lg:gap-6">
        {/* Tiêu đề trả lại (nợ ghi ở docblock đầu file: màn đang HẾT `<h2>`) và
            cùng lúc là chỗ đứng của nút nạp — một hàng, hai việc. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">Sổ lead</h2>
          {/* Hai cửa ghi của sổ, cạnh nhau: một dòng gõ tay, cả một tệp nạp
              vào. Cùng cỡ, cùng dáng — chúng là hai đường vào một chỗ, không
              phải một nút chính và một nút phụ. */}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="md" variant="ghost" onClick={() => setTyping(true)}>
              <Icon icon={PenLine} size={16} />
              Gõ tay
            </Button>
            <ImportZone
              spec={LEAD_SPEC}
              existingKeys={NO_LOCAL_KEYS}
              buttonLabel="Nạp lead"
              onCommit={commitLeads}
              onSeeResult={clearFilters}
            />
          </div>
        </div>

        <ScoreCards />

        {/* Một hàng lọc. Ô tìm nở hết chỗ còn lại, bốn select cùng cao 40px
            đứng cạnh nó — không còn ba dòng nút pill để mắt phải quét. */}
        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            size="topbar"
            placeholder="Tìm theo tên công ty hoặc mã lead…"
            value={text}
            onChange={setText}
            className="min-w-[240px] flex-1"
          />
          <Select
            label="Trạng thái"
            value={query.status}
            neutralValue={DEFAULT_LEAD_BOOK_QUERY.status}
            onChange={(v) => patch({ status: v as LeadStatus })}
            options={STATUSES.map((s) => ({ value: s.key, label: s.label }))}
          />
          <Select
            label="Nguồn"
            value={query.campaign ?? ANY}
            onChange={(v) => patch({ campaign: v === ANY ? undefined : v })}
            /* Tên chiến dịch dài tới 40 ký tự và `<select>` gốc nở theo option
               dài nhất — không kẹp thì một ô lọc nuốt nửa hàng. */
            className="max-w-[240px]"
            options={[
              { value: ANY, label: 'Mọi nguồn' },
              /* `value` là mã, `label` là TÊN — và chỉ tên. Bản trước in
                 `${entry.id} · ${entry.name}`, tức dán 'SR-09' vào trước mỗi
                 dòng của một ô chọn mà người dùng đọc bằng tên. Mã vẫn là thứ
                 đi vào câu hỏi gửi máy chủ, nó chỉ không cần đi vào mắt ai. */
              ...sourceOptions.map((entry) => ({
                value: entry.id,
                label: entry.name,
              })),
            ]}
          />
          <Select
            label="Lead PIC"
            value={query.owner ?? ANY}
            onChange={(v) => patch({ owner: v === ANY ? undefined : v })}
            className="max-w-[200px]"
            options={[
              { value: ANY, label: 'Mọi người' },
              /* 52/119 dòng chưa ai nhận. Không có mục này thì cách duy nhất
                 tìm ra chúng là đọc hết sổ bằng mắt. `OWNER_NONE` là cách viết
                 của nó TRÊN DÂY (`@pv/contracts`), không phải một cờ riêng của
                 màn: máy chủ đọc đúng chuỗi này thành `owner_id IS NULL`. */
              { value: OWNER_NONE, label: 'Chưa ai nhận' },
              ...owners.map((o) => ({ value: o.id, label: o.name })),
            ]}
          />
          <Select
            label="Account"
            value={query.account ?? ANY}
            onChange={(v) => patch({ account: v === ANY ? undefined : v })}
            className="max-w-[220px]"
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
        </div>

        {pinned.length > 0 && (
          <PinnedStrip
            leads={pinned}
            onOpen={open}
            onUnpin={(code) => me && togglePin(me.id, code)}
          />
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-[11.5px]">
            {/* `total` của máy chủ, không phải `rows.length`: một trang mười
                dòng không biết sổ có bao nhiêu dòng khớp. */}
            <span className="tnum font-num">{total}</span> dòng khớp bộ lọc
          </span>
          {total > PAGE_SIZE && (
            <Pager
              page={pageIndex}
              pageCount={pageCount}
              onPage={(i) =>
                setParams(leadBookQueryToParams({ ...urlQuery, page: queryPageFromPageIndex(i) }))
              }
            />
          )}
        </div>

        {/* Bảng LUÔN nằm trên glass-b — luật 8. */}
        <GlassCard variant="b" className="p-4 lg:p-5">
          {isPending ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              message="Không có lead nào khớp bộ lọc đang chọn."
              action={{ label: 'Bỏ hết bộ lọc', onClick: clearFilters }}
              className="py-12"
            />
          ) : (
            <DataTable
              /* Mũi tên chỉ sáng khi sổ ĐANG sắp theo cột này. Thứ tự mặc định
                 là `createdAt desc` — mới nhất trước — và đó không phải cột nào
                 trên bảng, nên lúc đó không cột nào có mũi tên. */
              sort={query.sort === 'company' ? { key: 'company', dir: query.dir } : undefined}
              onSort={(key) => {
                /* Account là cột duy nhất có khoá sắp xếp (`sortKey` bên dưới).
                   Khoá nào không nằm trong `LeadSortKey` sẽ chết ở cổng zod của
                   máy chủ, nên chặn ngay ở đây thay vì gửi đi một 400. */
                if (key !== 'company') return
                patch(
                  query.sort === 'company'
                    ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
                    : { sort: 'company', dir: 'asc' },
                )
              }}
              columns={[
                { header: 'Ghim', width: '52px' },
                { header: 'Mã', width: '0.85fr' },
                { header: 'Account', width: '1.6fr', sortKey: 'company' },
                { header: 'Người liên hệ', width: '1.2fr' },
                { header: 'Chức danh', width: '1.3fr' },
                /* 160px → 140px: bỏ icon (27/08 lần 2) trả lại ~22px (icon 14px +
                   gap 8px của MetaPill) cho bảy cột kia — pill giờ chỉ còn
                   padding (16px) + chữ. Vẫn đủ cho tên rút gọn dài nhất
                   THƯỜNG GẶP ("Khách cũ giới thiệu", ~116px chữ ở IBM Plex Sans
                   11px, ước theo tỉ lệ đo Arial rồi hiệu chỉnh về mốc 154px đã
                   đo tay bản có icon — 132px pill + ~8px đệm). Tên rút gọn hiếm
                   hoi còn dài hơn thế ("Triển lãm công nghiệp hỗ trợ", ~177px
                   chữ) tự cắt bằng CSS truncate như cũ — xem `SourceMark`. */
                { header: 'Nguồn', width: '140px' },
                { header: 'Trạng thái', width: '1.5fr' },
                { header: 'Lead PIC', width: '1.5fr' },
              ]}
              rows={rows.map((l) => ({
                id: l.code,
                onOpen: () => open(l.code),
                cells: [
                  <PinCell
                    key="p"
                    on={pins.includes(l.code)}
                    company={l.company}
                    onToggle={() => me && togglePin(me.id, l.code)}
                  />,
                  <Chip key="c">{l.code}</Chip>,
                  <span key="n" className="block truncate" title={l.company}>
                    {l.company}
                  </span>,
                  /* Hai cột người đọc thẳng từ dòng sổ. Bản cũ dựng chúng bằng
                     `leadContact(l)`, một hàm sinh của fixture — nó cho ra một
                     cái tên cho mọi mã lead, kể cả mã mà bảng thật để trống. */
                  <PersonCell key="ct" value={l.contactName} missing={NO_CONTACT} />,
                  <PersonCell key="ti" value={l.contactTitle} missing={NO_TITLE} />,
                  <SourceMark key="s" source={l.source} />,
                  <StatusCell key="w" lead={l} />,
                  <PicCell
                    key="o"
                    email={l.ownerEmail}
                    name={l.ownerName}
                    empty={NO_OWNER_TITLE}
                  />,
                ],
              }))}
            />
          )}
        </GlassCard>

        {total > PAGE_SIZE && (
          <div className="flex justify-end">
            <Pager
              page={pageIndex}
              pageCount={pageCount}
              onPage={(i) =>
                setParams(leadBookQueryToParams({ ...urlQuery, page: queryPageFromPageIndex(i) }))
              }
            />
          </div>
        )}
        {/* Sổ tự làm mới sau khi tạo: `useCreateLead` invalidate tiền tố
            `['sales','lead-book']`, tiền tố của CẢ trang đang vẽ lẫn
            `leadFacetQuery` — nên lead mới có mặt trong bảng và trong hai ô lọc
            người/công ty cùng một lúc. Dialog tự đóng khi 201 về. */}
        <LeadCreateDialog open={typing} onClose={() => setTyping(false)} />
      </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------

/** Thẻ điểm cả kỳ — BỐN con số, không còn phễu sáu bậc.
 *
 *  Phễu cũ trả lời "tắc ở bậc nào". Nhưng câu người mở sổ hỏi TRƯỚC là "một
 *  trăm đầu mối ra được bao nhiêu deal", và câu đó phải đọc được trong một nhịp
 *  mắt chứ không phải trừ hai số cạnh nhau. Bốn ô ở đây là bốn con số trên CÙNG
 *  một mẫu số — 100 đầu mối cả kỳ.
 *
 *  Gỡ theo phễu: bấm một bậc để lọc, và ba pill cân sổ (đã ký · đang chạy · đã
 *  rơi). Không mất chức năng nào — hai ô Select "Trạng thái" và "Bậc" ở hàng lọc
 *  ngay dưới lọc y hệt.
 *
 *  Số đọc từ `FUNNEL` chứ KHÔNG từ `book` đã lọc: thẻ điểm là điểm của CẢ KỲ.
 *  Điểm mà đổi theo bộ lọc thì nó không còn là điểm — dòng "42 dòng khớp bộ lọc"
 *  ngay dưới bảng mới là chỗ trả lời cho bộ lọc.
 *
 *  Ô "First meeting / lead" có số thật từ 22/08: `FIRST_MEETINGS` = 38, nằm
 *  trong fixture chứ không gõ ở đây. Nó ĐẾM RA từ 100 dòng sổ chứ không khai
 *  tay — `hasFirstMeeting`: lead đã lên MQL và đã có kênh gọi lại được (ô số 5
 *  của init data). Và nó KHÔNG phải bậc thứ bảy của phễu: 38 nằm giữa 44 công ty
 *  thật và 30 cơ hội, `scenario.test.ts` khoá đúng chỗ đó. */
type FunnelKey = (typeof FUNNEL)[number]['key']

const funnelCount = (key: FunnelKey) => FUNNEL.find((s) => s.key === key)?.count ?? 0

function ScoreCards() {
  const total = funnelCount('dau-moi')
  const ops = funnelCount('co-hoi')
  const deals = funnelCount('hop-dong')

  /* Mẫu số 0 thì không có tỉ lệ nào để nói — trả "—", không trả "0%". */
  const per = (n: number) => (total === 0 ? '—' : percent(n / total))

  return (
    <div className="flex flex-col gap-3">
      <Kicker>
        Thẻ điểm {PERIOD_FROM} → {PERIOD_TO}
      </Kicker>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          size="compact"
          icon={Users}
          value={String(total)}
          label="Tổng số lead"
          hint={`đầu mối vào sổ cả kỳ ${PERIOD_FROM} → ${PERIOD_TO}`}
        />
        <StatCard
          size="compact"
          icon={CalendarCheck}
          value={per(FIRST_MEETINGS)}
          label="First meeting / lead"
          hint={`${FIRST_MEETINGS} buổi gặp đầu tiên trên ${total} đầu mối`}
        />
        <StatCard
          size="compact"
          icon={Target}
          value={per(ops)}
          label="Ops / lead"
          hint={`${ops} cơ hội trên ${total} đầu mối`}
        />
        <StatCard
          size="compact"
          icon={FileCheck}
          value={per(deals)}
          label="Deal / lead"
          hint={`${deals} hợp đồng đã ký trên ${total} đầu mối`}
        />
      </div>

      <p className="text-muted-foreground text-[11px] leading-[1.5]">
        Ba tỉ lệ đều LUỸ KẾ cả kỳ: lead đã lên SQL vẫn được tính ở mọi bậc nó đi qua. Ô lọc
        &quot;Bậc&quot; đếm bậc lead ĐANG đứng, nên hai chỗ ra số khác nhau — đúng như vậy, không
        phải lệch số.
      </p>
    </div>
  )
}

/** Shorten a source's full name to its lead-in clause, for the pill in the
 *  Nguồn column. `config_entry.name` reads like "Apollo — danh sách mua" or
 *  "Hội thảo · Số hoá nhà máy đóng gói": everything before the first `—` or
 *  `·` is the short handle a person actually says out loud, the rest is a
 *  free-text description. A name with no separator (e.g. "BD tự mở") has
 *  nothing to cut, so it passes through unchanged.
 *
 *  Cuts at the separator's character position, not at a fixed string length
 *  — slicing by length instead would risk landing mid-diacritic on Vietnamese
 *  text. A short name still too long for the pill is left to CSS `truncate`
 *  (see `SourceMark`), never hand-truncated with a manual "…". */
const SOURCE_NAME_SEPARATOR = /[—·]/

function shortSourceName(name: string): string {
  const cut = name.search(SOURCE_NAME_SEPARATOR)
  return cut === -1 ? name : name.slice(0, cut).trimEnd()
}

/** Nguồn của một lead — pill TÊN RÚT GỌN (không icon), tên đầy đủ nằm ở `title`.
 *
 *  Mã nguồn đã bỏ 22/08 vì `SK-0103` là sáu ký tự không ai đọc ra nghĩa khi
 *  lướt bảng — quyết định đó vẫn đúng, mã không quay lại. Nhưng thay mã bằng
 *  một hình duy nhất hoá ra đổi một vấn đề đọc-không-ra thành một vấn đề khác:
 *  `kind` chỉ có bốn giá trị, nên hai chiến dịch khác hẳn nhau (vd. "Apollo"
 *  và "Chuỗi email") vẽ ra CÙNG một icon. Bản 27/08 thêm lại chữ — không phải
 *  mã, mà TÊN, rút gọn bằng `shortSourceName` — nên "về bằng đường nào" giờ
 *  đọc thẳng ra được, không phải suy từ hình.
 *
 *  — CẬP NHẬT LẦN 2 (chủ dự án xem xong): icon `Database` gán cho "mua dữ
 *  liệu" bị đọc sai nghĩa, và giờ tên chữ đã là tín hiệu chính nên icon chỉ
 *  chiếm chỗ — bỏ hẳn, cho cả bốn `kind`. `SOURCE_KIND_FACE` (bảng icon theo
 *  `kind`) không còn ai đọc nữa sau đó — grep xác nhận không màn nào khác đọc
 *  nó — nên cả bảng đã XOÁ khỏi `data/leads.ts`, không chỉ trường `icon`.
 *
 *  ------------------------------------------------------------------
 *  VÀNG CHO DỮ LIỆU MUA — VÀ VÌ SAO CÂU `if` CŨ KHÔNG BAO GIỜ ĐÚNG
 *  ------------------------------------------------------------------
 *  Danh sách mua đáng chú ý hơn nguồn tự sinh/tự mở — dữ liệu mua cần người
 *  kiểm chất lượng, nên tô vàng (`tone="warning"` có sẵn của `MetaPill`) để
 *  mắt bắt được ngay khi lướt bảng. Phần đó vẫn đúng.
 *
 *  Câu `if` thì không. Bản trước so `entry.kind === 'mua-du-lieu'`, mà `kind`
 *  của một dòng SỔ NGUỒN chỉ nhận `chien-dich · su-kien · tu-nhien` — nhánh
 *  vàng là code chết kể từ dòng đầu tiên nó được viết, và không có gì bắt
 *  được: cả hai vế đều là `string`, nên `tsc` cũng im. Nay nó so
 *  `source.kind === 'APOLLO'`, một giá trị có thật của enum `LeadSourceKind`,
 *  và `Record<…>` trên enum ấy ở `@pv/contracts` khiến lần đổi từ vựng sau
 *  thành lỗi biên dịch chứ không thành một pill lặng lẽ hết vàng.
 *
 *  KHÔNG dùng `tone="accent"` — luật 3 dành nền azure cho AI/nút chính/trạng
 *  thái active, không cho một pill lặp trên mọi dòng.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG CÒN PHÉP TRA NÀO Ở ĐÂY
 *  ------------------------------------------------------------------
 *  Bản trước cầm một mã trần rồi tự tra tên trong `GET /sales/config`, nên nó
 *  phải nhận cả một `Map` làm prop và phải có nhánh "tra không ra". Máy chủ
 *  nay gửi `source.campaignName` ngay cạnh `campaignId` (cùng lối
 *  `ownerId`/`ownerName` đã đi), nên component chỉ còn đọc thứ nó được đưa.
 *  Mất theo phép tra là mất luôn cả một lớp lỗi — không còn chỗ nào để trượt,
 *  và mã `SR-…` không còn đường nào ra tới mắt người dùng. */
function SourceMark({ source }: { source: LeadSource }) {
  /* Chiến dịch trước, loại xuất xứ sau. Một ô bảng in được ĐÚNG MỘT thứ, và
     giữa hai nửa thì tên chiến dịch là nửa phân biệt được hai dòng cạnh nhau —
     "Apollo" đúng cho một phần năm cuốn sổ, còn "Chuỗi email — nhà máy điện tử
     Bắc Ninh" chỉ đúng cho hai mươi hai dòng. Nửa còn lại không mất: nó nằm
     trong `title`, và nó là thứ quyết định màu pill ngay dưới đây. */
  const kind = sourceKindLabel(source)
  const text = source.campaignName ? shortSourceName(source.campaignName) : kind
  /* `campaignLabel` chứ không phải `campaignName`: ô bảng chỉ đủ chỗ cho một
     thứ, nhưng cái hover thì đủ chỗ cho cả ba trạng thái — và trạng thái đáng
     nói nhất là "có mã mà tra không ra", thứ mà một pill in tên loại xuất xứ
     sẽ che mất hoàn toàn. */
  const title = `${campaignLabel(source)} · ${kind}`

  /* Vàng cho dữ liệu MUA. Bản trước so `entry.kind === 'mua-du-lieu'`, một giá
     trị `kind` của sổ nguồn không bao giờ nhận — nhánh chết từ lúc viết. Đây là
     cùng ý định ấy hỏi đúng chỗ: `APOLLO` là một giá trị có thật của
     `LeadSourceKind`, và "dòng này mua về" là thứ đáng cho một người lướt sổ
     thấy trước khi họ gọi điện. */
  const tone = source.kind === 'APOLLO' ? 'warning' : 'muted'

  return (
    <span className="block min-w-0" title={title} aria-label={title}>
      <MetaPill tone={tone} className="flex min-w-0 max-w-full">
        <span className="min-w-0 truncate">{text}</span>
      </MetaPill>
    </span>
  )
}

/** Cột "Trạng thái" — một PILL, và màu của pill là câu trả lời thứ hai.
 *
 *  ------------------------------------------------------------------
 *  NĂM MÀU, THEO LOẠI TRẠNG THÁI CHỨ KHÔNG THEO CỘT PIPELINE
 *  ------------------------------------------------------------------
 *  Bảng token có đúng năm tone semantic, và năm loại trạng thái của một dòng sổ
 *  khớp vào đó không dư không thiếu:
 *
 *    xanh lá  · đã ký          — hết đường, kết cục tốt
 *    đỏ       · đã rơi         — hết đường, kết cục xấu
 *    vàng     · quá hạn cột    — đang chạy nhưng CẦN NGƯỜI ĐỘNG VÀO
 *    azure    · đang trong cột — đang chạy, còn trong hạn
 *    xám      · chưa vào sổ    — chưa bắt đầu
 *
 *  Không tô năm màu khác nhau cho năm CỘT pipeline: bảng brand không có năm màu
 *  trung tính để làm việc đó, và bịa hex mới là phá luật 1. Quan trọng hơn: màu
 *  nên nói "dòng này có cần tôi không", chứ không nói lại đúng chữ đã in trong
 *  chính cái pill.
 *
 *  Màu vàng ở đây thay hẳn tam giác cảnh báo đã gỡ khỏi cột Account: cùng một
 *  tín hiệu, nhưng đứng ở cột nói về trạng thái thay vì cột nói về tên khách. */
function StatusCell({ lead }: { lead: LeadRow }) {
  /* "Đã ký" KHÔNG kèm mã hợp đồng nữa, và mã đó không đi tìm lại được: lead →
     hợp đồng nay là 1-n, cột `lead.contract_code` đã biến mất, và `signed` là
     một `EXISTS(contract)` chứ không phải một mã. Một lead ký hai đơn thì không
     mã nào vừa — in một trong hai là nói dối về cái còn lại. */
  if (lead.signed) return <Badge tone="success">Đã ký</Badge>

  if (lead.exitReason) {
    /* Máy chủ trả KHOÁ ASCII ('khong-goi-duoc'), fixture giữ NHÃN tiếng Việt.
       Bảng tra ở `data/leads.ts`, cùng chỗ với lời giải thích vì sao nó tồn tại. */
    const why = EXIT_REASON_LABEL[lead.exitReason] ?? lead.exitReason
    return (
      <Badge tone="danger" className="max-w-full" title={`Đã rơi · ${why}`}>
        <span className="min-w-0 truncate">Đã rơi · {why}</span>
      </Badge>
    )
  }

  if (!lead.stage) return <Badge tone="draft">Chưa vào sổ cơ hội</Badge>

  const over = overSla(lead)
  return (
    <Badge
      tone={over ? 'warning' : 'running'}
      title={over ? `Quá hạn cột · nằm đây ${lead.daysHere} ngày` : undefined}
    >
      {STAGE_LABEL.get(lead.stage) ?? lead.stage}
      {over && ` · quá hạn`}
    </Badge>
  )
}

/** Ghim một dòng. Ghim theo NGƯỜI — hai người cùng mở sổ thấy hai bộ ghim khác
 *  nhau (`app/desk.ts`). Nút nằm trong một dòng bấm được nên phải chặn click nổi
 *  bọt, nếu không ghim xong là sang luôn trang chi tiết. */
function PinCell({
  on,
  company,
  onToggle,
}: {
  on: boolean
  company: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Bỏ ghim ${company}` : `Ghim ${company}`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={cn(
        'motion-std flex size-8 items-center justify-center rounded-md',
        on ? 'text-accent-foreground bg-primary/24' : 'text-muted-foreground hover:bg-white/9',
      )}
    >
      <Icon icon={Pin} size={16} />
    </button>
  )
}

/** Ghim của tôi — tách hẳn khỏi bảng.
 *
 *  Để lẫn trong bảng thì ghim vô nghĩa: dòng ghim vẫn nằm ở trang 4 sau khi lọc.
 *  Tách lên trên là cách duy nhất khiến nó luôn ở trong tầm mắt. */
function PinnedStrip({
  leads,
  onOpen,
  onUnpin,
}: {
  leads: LeadRow[]
  onOpen: (code: string) => void
  onUnpin: (code: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <Kicker>Ghim của tôi · {leads.length}</Kicker>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {leads.map((l) => (
          <GlassCard key={l.code} className="flex items-start gap-3 p-3">
            <button
              type="button"
              onClick={() => onOpen(l.code)}
              className="motion-std flex min-w-0 flex-1 flex-col gap-1 text-left"
            >
              <span className="truncate text-[12.5px] font-semibold">{l.company}</span>
              <span className="text-muted-foreground truncate text-[11px]">
                <span className="font-mono">{l.code}</span> ·{' '}
                {l.category ? (CATEGORY_LABEL.get(l.category) ?? l.category) : '—'} ·{' '}
                {l.requiredFilled}/{REQUIRED_SLOTS} ô
              </span>
            </button>
            <PinCell on company={l.company} onToggle={() => onUnpin(l.code)} />
          </GlassCard>
        ))}
      </div>
    </div>
  )
}

export default LeadsPage
