import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  Database,
  FileSpreadsheet,
  Filter,
  Inbox,
  Layers,
  Plus,
  ShieldCheck,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AiAction,
  AppShell,
  Badge,
  Button,
  Checkbox,
  Chip,
  ColumnMap,
  ContextRail,
  DataTable,
  Drawer,
  Dropzone,
  EmptyState,
  GlassCard,
  Icon,
  Input,
  InsetPanel,
  LoadingBlock,
  MetaPill,
  PageHeader,
  SectionTitle,
  SegmentedControl,
  Select,
  StatCard,
  StepStrip,
  buttonVariants,
  cn,
  dong,
  millions,
  percent,
} from '@pv/ui'
import {
  DAS_VINA_FROZEN_AT,
  DAS_VINA_LEAD,
  HEAD_OF_SALES,
  LEADS,
  MARKETING,
  PROSPECT_BATCHES,
  SOURCES,
  dasVina,
  type ProspectFilter,
} from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { useSession } from '@/app/session'
import { dm, dmy } from '@/lib/date'
import {
  DEDUPE_KEYS,
  DELIMITER_LABEL,
  IMPORT_APPROVER,
  IMPORT_DISCLAIMER,
  IMPORT_GATE,
  LEGAL_BASIS_LABEL,
  OVERWRITE_RULE,
  REJECT_REASON_LABEL,
  ROW_STATE_LABEL,
  SAMPLE_FILE_NAME,
  SAMPLE_ROW_COUNT,
  SKIP_TARGET,
  SUPPLIER_KIND_LABEL,
  batchHasPersonalData,
  batchRows,
  batchTotals,
  checkFileSize,
  columnTargets,
  confirmErrors,
  costNeedsApproval,
  mappingErrors,
  readTable,
  reviewRows,
  sampleCsvFile,
  sampleWarning,
  suggestMapping,
  type BatchRow,
  type Cells,
  type ColumnMapping,
  type ProspectField,
  type Review,
  type ReviewRow,
  type Table,
} from '@/data/prospects'
import { salesConfigQuery } from '@/data/sales-config'
import { PERIOD, grouped } from './campaign-model'

/** Module 1 · Chiến dịch & Sự kiện — KHO DANH SÁCH và luồng NHẬP một lô.
 *
 *  Màn này trả câu hỏi đứng TRƯỚC câu hỏi của sổ nguồn: 5.753 dòng danh sách đã
 *  đi vào hệ bằng đường nào, tốn bao nhiêu, và bao nhiêu dòng trong đó cuối cùng
 *  thành một dòng sổ. Chủ màn là vai **Marketing**; người gật mọi yêu cầu duyệt
 *  của luồng nhập vẫn là TP Kinh doanh.
 *
 *  VÌ SAO NÓ THUỘC MODULE 1, KHÔNG THUỘC MODULE 2 (docs · §6.7):
 *  câu hỏi chốt của module 1 là "khách ở đâu ra", và khán giả của một đợt gửi là
 *  khái niệm của module 1. Prospect KHÔNG phải một dòng lead, nên nó không được
 *  có mặt trong Sổ lead, kể cả dưới dạng một tab — cùng một dòng mà thao tác
 *  được ở hai màn thì không màn nào là nơi đúng để tra (tiền lệ 19/08).
 *
 *  MỘT MÀN, HAI CHẾ ĐỘ — cùng hình với `campaigns.tsx`:
 *   · `kho`  — bảng tám lô của kỳ + tổng của cả kho. Bấm một dòng mở thẻ chi tiết.
 *   · `nhap` — năm bước trong MỘT màn, một dải bước ở đầu. KHÔNG phải năm route:
 *     F5 giữa chừng mất bản nháp, và một luồng nhập dở dang không đáng giữ ở URL.
 *
 *  BA LUẬT màn này không được phá:
 *   · **Nhập lô không sinh lead nào.** Lead sinh khi bên kia trả lời. Vì thế màn
 *     không có nút nào tạo lead, và số 0 ở cột "Lead" của một lô là kết quả THẬT.
 *   · **Luật 9** — khối đề nghị khớp cột có "Căn cứ:", có nút, và nói thẳng hệ quả
 *     của việc chưa bấm. Bảng khớp cột mở ra ở trạng thái CHƯA ánh xạ gì.
 *   · **Đi lùi luôn được, đi tới phải qua cửa.** Dải bước chỉ cho bấm về bước đã
 *     qua; cửa của từng bước là việc của màn.
 *
 *  MÀN KHÔNG TỰ CỘNG SỐ NGHIỆP VỤ. Mọi tổng, mọi tỉ lệ, mọi luật đọc file nằm ở
 *  `data/prospects.ts`; danh mục nhà cung cấp (mục 5.8) đến từ `data/sales-config.ts`.
 *  Ở đây chỉ còn hai phép biến hình dữ liệu, cả hai đều không phải phép tính
 *  nghiệp vụ: ghép cột file theo bộ ánh xạ (`cellsOf`) và cấp mã lô kế tiếp
 *  (`nextCode`).
 *
 *  Nối E2/E3 khi có backend: nhập một lô chỉ ghi vết E2 (`'sửa'`, mã lô); phải
 *  qua E3 khi lô có dòng ghi đè lead đang có chủ, hoặc TIỀN MUA DÒNG của lô chạm
 *  ngưỡng của phòng. Bản POC dựng đúng hai nhánh đó trên màn nhưng không gọi engine.
 *
 *  MỌI NHÃN TIỀN Ở ĐÂY KHAI PHẠM VI (quyết định 20/08): màn này chỉ nói "tiền mua
 *  dòng" — thứ trả cho chỗ bán danh sách. "Chi dữ liệu của nguồn" là một thước
 *  khác, mẫu số khác, và nó sống ở HỒ SƠ NGUỒN (`/sales/campaigns/:code`, khối
 *  "Tiền đi đâu") — không phải màn Kế hoạch, màn ấy không vẽ số đó. Hai số KHÔNG
 *  được đặt cạnh nhau như hai cách đọc của cùng một thứ, nên màn này không hiện
 *  số kia; nó chỉ chỉ đúng địa chỉ cho người đi tìm.
 *
 *  MÀN KHÔNG CÒN NÓI "TIỀN CỦA LÔ NẰM TRONG TIỀN CỦA NGUỒN" (bỏ 21/08). Câu ấy
 *  đứng ở ba chỗ và không con số nào trên hệ chứng minh được nó: bảng "Tiền đi
 *  đâu" của một nguồn không có dòng nào mang tên lô, và dòng "Dữ liệu" của bốn
 *  nguồn lô nuôi cộng lại được 4,58 triệu — chưa bằng tiền của riêng lô DS-0101.
 *  Mô hình vẫn giữ nguyên (tiền lô nằm trong 300 triệu của kỳ, và fixture có
 *  phép cân `cost` lô ≤ `cost` nguồn), nhưng MÀN thì chỉ khai thứ nó chỉ ra
 *  được. Muốn nói lại câu đó thì phải có dòng chi mang tên lô — đụng fixture đã
 *  khoá, nên nó là một câu hỏi để người đặt số trả lời.
 *
 *  Ô "Tiền mua dòng mỗi lead" trả câu TP Kinh doanh hỏi đầu tiên — 31 triệu ra
 *  bao nhiêu lead. Phép chia sống ở engine (`costOfPaidBatchLead`), và cả tử lẫn
 *  mẫu CHỈ đứng trên lô mất tiền: bốn lô 0 đồng có lead thật, thả vào mẫu số là
 *  lấy lead miễn phí trợ giá cho dòng đã mua. Bỏ ngoài phép chia thì được, giấu
 *  thì không — nên câu ngay dưới hàng ô nói ra cả số lô lẫn số lead bị để ngoài.
 *
 *  GHI ĐÈ CHỌN TỪNG DÒNG. Cột "Xin đè" của bảng "đã có trong sổ lead" chỉ mọc ô
 *  tick ở dòng CÓ CHỦ; dòng ở kho chung không có ô nào để đè và dòng đã ký thì
 *  không vào kho, nên chúng nhận dấu "—". Tick vào tick ra đều được cho tới nút
 *  cuối của bước 5 — bấm ô tick không gửi gì đi, yêu cầu duyệt sinh ở nút ấy.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */

/** Năm bước, đúng thứ tự của đặc tả. Nhãn ngắn để dải bước không xuống hàng trên
 *  tablet; câu tóm tắt thứ người dùng đã chọn đi vào `hint`, dựng ở màn. */
const STEP_LABELS = [
  'Chọn nguồn',
  'Tải mẫu · Upload',
  'Khớp cột',
  'Soát & khử trùng',
  'Xác nhận nhập',
] as const

/** Mỏ neo ContextRail (luật 10): đơn của chính DAS Vina. Kho danh sách là chỗ
 *  dòng ấy bắt đầu, nên chuỗi object của nó là chuỗi đúng để chỉ vào. Chip không
 *  bấm được — chưa có màn hồ sơ object để mở. */
const RAIL_ANCHOR = LEADS.find((l) => l.code === DAS_VINA_LEAD)?.dealCode ?? ''

const SUPPLIER_KIND_OPTIONS = Object.entries(SUPPLIER_KIND_LABEL).map(([value, label]) => ({
  value,
  label,
}))

const LEGAL_BASIS_OPTIONS = Object.entries(LEGAL_BASIS_LABEL).map(([value, label]) => ({
  value,
  label,
}))

/** "Dùng lô này cho" — chỉ đọc MÃ và TÊN của nguồn, không đọc con số nào: số của
 *  một nguồn là việc của màn Chiến dịch. Ô trống là câu trả lời hợp lệ.
 *
 *  GT (khách cũ giới thiệu) bị lọc ra: một lô danh sách không nuôi được đường
 *  giới thiệu — người ta giới thiệu nhau, không ai mua danh sách để làm việc đó.
 *  TM ở lại vì đó đúng là đường lô gọi tay (`calledBy`), có thật trong kịch bản. */
const SOURCE_OPTIONS = [
  { value: '', label: 'Chưa gắn vào nguồn nào' },
  ...SOURCES.filter((s) => s.kind !== 'tu-nhien' || s.code === 'TM').map((s) => ({
    value: s.code,
    label: `${s.code} · ${s.label}`,
  })),
]

/** Bộ lọc đã dùng của từng lô, tra theo mã. Đọc thẳng từ kịch bản đóng băng:
 *  `BatchRow` cố ý không mang trường này vì bảng kho không có cột cho nó — nó chỉ
 *  hiện trong thẻ chi tiết, nơi có chỗ cho cặp nhãn–giá trị đầy đủ. */
const FILTERS_OF = new Map<string, ProspectFilter[]>(
  PROSPECT_BATCHES.map((b) => [b.code, b.filters]),
)

/** Mã lô kế tiếp, hệ cấp. Suy từ mã lớn nhất đang có chứ không gõ "DS-0109" vào
 *  màn — thêm một lô vào kịch bản thì mã tự đi theo. */
function nextCode(rows: BatchRow[]): string {
  const max = rows.reduce((n, r) => Math.max(n, Number(r.code.replace(/\D/g, '')) || 0), 0)
  return `DS-${String(max + 1).padStart(4, '0')}`
}

/** Một dòng file SAU bước khớp cột. Cột không ánh xạ hoặc chọn "Bỏ qua" thì
 *  KHÔNG có mặt — để trống khác bỏ qua đã được chặn ở cửa bước 3. */
function cellsOf(table: Table, mapping: ColumnMapping): Cells[] {
  return table.body.map((line) => {
    const cells: Cells = {}
    table.header.forEach((name, i) => {
      const target = mapping[name]
      if (!target || target === SKIP_TARGET) return
      cells[target as ProspectField] = line[i] ?? ''
    })
    return cells
  })
}

/** Nhãn của một ô nhập. Dấu sao `aria-hidden` — "ô này bắt buộc" nói bằng
 *  `aria-required` trên chính ô nhập, không nhét vào tên ô.
 *
 *  Chữ phụ ở đây dùng `text-glass-foreground` chứ không `text-muted-foreground`:
 *  các ô này nằm trong `InsetPanel` (`--surface-inset`) lồng trong `.glass-a`,
 *  tức HAI lớp trắng chồng nhau, và trên nền đó
 *  `--muted-foreground` chỉ đo được ~3,98:1 — dưới ngưỡng 4,5:1 của luật 13.
 *  `--glass-foreground` trên cùng nền đo được ~5,3:1. */
function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-2">
        <span className="text-glass-foreground text-[11px]">
          {label}
          {required ? (
            <span className="text-warning" aria-hidden="true">
              {' '}
              *
            </span>
          ) : null}
        </span>
        {children}
      </label>
      {hint ? (
        <span className="text-glass-foreground text-[12.5px] leading-[1.6]">{hint}</span>
      ) : null}
    </div>
  )
}

/** Một bảng gập được của bước soát. Hai luật của khối này:
 *
 *   · **Bảng RỖNG không bao giờ câm** — nó nói ra vì sao nó rỗng, vì "không dòng
 *     nào trùng" là một kết quả, không phải một chỗ chưa dựng.
 *   · **`count = null` KHÁC `count = 0`.** `null` nghĩa là phép đo KHÔNG CHẠY, và
 *     lúc đó ô đếm hiện "—" chứ không hiện số 0: một vòng khử trùng chưa chạy mà
 *     in "0" là bịa ra một kết quả. Khi chưa đo được thì panel MỞ SẴN — câu thú
 *     nhận phải nằm ở chỗ đọc được mà không phải bấm.
 *
 *  Đây cũng là tấm kính DUY NHẤT của khối (luật 12): mọi bảng bên trong đi trần,
 *  không tự vẽ mặt kính lần hai. Hai `.glass-b` chồng nhau là một lớp nền thứ năm. */
function Foldable({
  title,
  count,
  empty,
  children,
}: {
  title: string
  count: number | null
  empty: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(count === null || count > 0)

  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <button
        type="button"
        onClick={() => setOpen((on) => !on)}
        aria-expanded={open}
        className="motion-std flex min-h-12 items-center justify-between gap-3 rounded-md text-left"
      >
        <span className="flex items-center gap-2 text-[12.5px] font-semibold">
          <Icon icon={open ? ChevronDown : ChevronRight} size={16} />
          {title}
        </span>
        <span className="tnum font-num text-[12.5px]">{count === null ? '—' : grouped(count)}</span>
      </button>

      {open ? (
        count !== null && count > 0 ? (
          children
        ) : (
          <p className="text-glass-foreground text-[12.5px] leading-[1.6]">{empty}</p>
        )
      ) : null}
    </GlassCard>
  )
}

/** Màu trạng thái của một lô — MỘT bảng cho cả bảng kho lẫn thẻ chi tiết, vì
 *  hai chỗ tô hai màu cho cùng một lô là hai chỗ nói hai chuyện. Năm trạng thái
 *  không đổ về hai màu: "Bị bác" và "Chờ duyệt" trái ngược nhau, chúng không
 *  được dùng chung một tone. */
function toneOfState(state: BatchRow['state']): 'success' | 'warning' | 'danger' | 'draft' {
  if (state === 'da-nhap') return 'success'
  if (state === 'cho-duyet') return 'warning'
  if (state === 'tu-choi') return 'danger'
  return 'draft'
}

/** Nhãn nhóm của một dòng đã có trong sổ. `ROW_STATE_LABEL` gọi cả hai ngả của
 *  `da-co-chu` bằng một tên, mà hai ngả ấy dẫn tới hai kết cục trái nhau — nên
 *  chỗ này nói thêm nửa câu. `canSend` là thứ phân biệt: lead ở kho chung vẫn
 *  vào khán giả được, lead có chủ thì không. */
function groupLabel(r: ReviewRow): string {
  if (r.state !== 'da-co-chu') return ROW_STATE_LABEL[r.state]
  return r.book?.canSend ? 'Kho chung · điền ô trống' : 'Đang có chủ · không gửi'
}

/** Cố tình không làm — SÁU thứ bị bỏ có chủ ý, kèm lý do. Khối ở lại TRÊN MÀN
 *  (không lui vào comment) vì phần lớn là câu người xem hỏi ngay trong buổi demo:
 *  "sao không nhận Excel", "lead đâu", "sao không xem được từng dòng của lô".
 *
 *  Cỡ chữ đi theo đúng bản của module (`campaign-parts.tsx`): tiêu đề khối và
 *  tiêu đề mục cùng 13px. Hai bản rời của một khối mà lệch nhau cỡ chữ thì trông
 *  như hai khối khác loại. */
function NotDoing({ validRows }: { validRows: number }) {
  const items = [
    {
      title: 'Không đọc thẳng .xlsx',
      body: 'Đường thoát là tab "Dán trực tiếp" — chép từ Excel ra là hệ đọc bằng dấu tab. Thư viện đọc xlsx nặng thật, để giai đoạn hai.',
    },
    {
      title: 'Không bày từng dòng của tám lô đã nhập',
      /* Số đọc từ kho, không gõ vào màn: đổi `rowsValid` trong fixture mà câu
         này gõ cứng thì nó lặng lẽ nói sai. */
      body: `Kịch bản đóng băng không chép ${grouped(validRows)} dòng, chỉ chép số tổng của từng lô. Bảng dòng chỉ có ở lô đang nhập, nơi dòng thật vừa được đọc từ file.`,
    },
    {
      title: 'Không khử trùng chéo với tám lô cũ',
      body: 'Vì không có dòng của lô cũ để đối chiếu, bảng "Trùng với lô đã có" hiện dấu gạch chứ không hiện số 0 — vòng đó chưa chạy, không phải đã chạy và không thấy gì. Khử trùng chéo lô là bắt buộc, nó chờ kho dòng thật.',
    },
    {
      title: 'Không nhớ bộ khớp cột theo nhà cung cấp',
      body: 'Danh mục 5.8.1 chưa có chỗ giữ bộ khớp, nên mỗi lô khớp lại từ đầu — kể cả khi nhà đó luôn xuất đúng một bộ cột. Đây là mục đáng giá nhất còn nợ của 5.8.',
    },
    {
      title: 'Không có vân file cho tám lô cũ',
      body: 'Chưa ai ký tên tám file gốc, nên cửa "file này đã nhập rồi" chưa có ca demo. Luật vẫn có sẵn cho lô mới.',
    },
    {
      title: 'Không có màn yêu cầu của chủ thể dữ liệu',
      body: `Rút lại là vĩnh viễn và phải làm thật, không làm một nửa. Kỳ này chỉ có hạn lưu ${IMPORT_GATE.retentionDays} ngày và cột đánh dấu dữ liệu cá nhân.`,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[13px] font-semibold">Cố tình không làm</h3>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((it) => (
          <li key={it.title} className="flex flex-col gap-1">
            <b className="text-[13px] font-semibold">{it.title}</b>
            <span className="text-muted-foreground text-[12.5px] leading-[1.6]">{it.body}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ProspectListsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm lô danh sách, nhà cung cấp…' })
  const navigate = useNavigate()
  const me = useSession((s) => s.actor?.name ?? MARKETING)

  const { data: config } = useQuery(salesConfigQuery)

  const rows = useMemo(() => batchRows(), [])
  const totals = useMemo(() => batchTotals(), [])
  const code = useMemo(() => nextCode(rows), [rows])

  const [mode, setMode] = useState<'kho' | 'nhap'>('kho')

  /* `?lo=DS-0103` — đường DUY NHẤT để trỏ một lô cho người khác xem, và là thứ
     làm chip mã lô ở hồ sơ lead giữ đúng lời hứa nhãn nó mang: bấm vào mã lô thì
     mở đúng lô đó, không đổ người dùng vào bảng tám dòng để tự dò. Chỉ đọc lúc
     dựng — sau đó ngăn kéo do màn giữ, không ghi ngược vào đường dẫn. */
  const [params] = useSearchParams()
  const [openCode, setOpenCode] = useState<string | null>(() => params.get('lo'))
  const [step, setStep] = useState(0)

  /* Bước 1 · chọn nguồn */
  const [supplier, setSupplier] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('mua')
  const [newBasis, setNewBasis] = useState('cong-khai-phap-nhan')

  /* Bước 2 · tải mẫu · upload */
  const [tab, setTab] = useState<'file' | 'dan'>('file')
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [text, setText] = useState('')
  const [reading, setReading] = useState(false)
  const [fileError, setFileError] = useState('')
  const [headerRowIndex, setHeaderRowIndex] = useState(0)
  const [headerPicked, setHeaderPicked] = useState(false)

  /* Bước 3 · khớp cột */
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [aiApplied, setAiApplied] = useState(false)

  /* Bước 4 · soát */
  const [overwriteAsked, setOverwriteAsked] = useState<string[]>([])

  /* Bước 5 · xác nhận */
  const [legalBasis, setLegalBasis] = useState('')
  const [cost, setCost] = useState('')
  const [free, setFree] = useState(false)
  const [usedFor, setUsedFor] = useState('')
  const [filterLabel, setFilterLabel] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [done, setDone] = useState(false)

  /* Đang hỏi "rời màn là mất bản nháp, chắc chưa". */
  const [leaveAsked, setLeaveAsked] = useState(false)

  /* Luật 10 · rail dựng thẳng từ E1, màn không tự viết chip. Nằm NGOÀI mọi nhánh
     chờ dữ liệu và có mặt ở CẢ hai chế độ, cả năm bước. */
  const rail = useMemo(() => {
    const story = dasVina.graph.story(RAIL_ANCHOR)
    if (story.length === 0) return [{ code: RAIL_ANCHOR, source: true }]
    return story.map((o) => ({ code: o.code, source: o.code === RAIL_ANCHOR }))
  }, [])

  /** Danh mục nhà cung cấp của mục 5.8, ghép với lần nhập gần nhất của từng nhà.
   *  Ghép ở đây chứ không ở tầng cấu hình: "lần nhập gần nhất" là câu hỏi của
   *  bước 1, không phải một ô cấu hình. */
  const suppliers = useMemo(() => {
    const last = new Map<string, BatchRow>()
    for (const r of rows) {
      const cur = last.get(r.supplier)
      if (!cur || r.importedAt > cur.importedAt) last.set(r.supplier, r)
    }
    return (config?.prospect.suppliers ?? []).map((s) => ({ ...s, last: last.get(s.name) }))
  }, [rows, config])

  const table = useMemo(
    () => (text ? readTable(text, headerRowIndex) : null),
    [text, headerRowIndex],
  )
  const suggestion = useMemo(() => (table ? suggestMapping(table.header) : null), [table])
  const mapErrors = useMemo(
    () => (table ? mappingErrors(table.header, mapping) : []),
    [table, mapping],
  )
  const hasPersonal = useMemo(() => batchHasPersonalData(mapping), [mapping])

  const review = useMemo(() => {
    if (!table) return null
    /* `store` để trống: kịch bản đóng băng không chép dòng của tám lô cũ, nên
       vòng khử trùng chéo lô chỉ chạy được với kho THẬT khi có backend. Vòng
       trong-file và vòng với sổ lead thì chạy đủ. */
    return reviewRows({
      cells: cellsOf(table, mapping),
      batchCode: code,
      batchLegalBasis: legalBasis ? (legalBasis as never) : undefined,
    })
  }, [table, mapping, code, legalBasis])

  /** Lý do loại đứng đầu — dải cảnh báo lớn phải chỉ đúng bước có lỗi, không mặc
   *  định đổ cho bước khớp cột. */
  const topReason = useMemo(() => {
    if (!review) return null
    return review.byReason.reduce<Review['byReason'][number] | null>(
      (top, r) => (r.count > 0 && (!top || r.count > top.count) ? r : top),
      null,
    )
  }, [review])

  const costNumber = Number(cost) || 0
  const needsApproval = costNeedsApproval(costNumber) || overwriteAsked.length > 0

  const confirmIssues = useMemo(
    () =>
      confirmErrors({
        hasPersonalData: hasPersonal,
        legalBasis: legalBasis ? (legalBasis as never) : undefined,
        rowsValid: review?.rowsValid ?? 0,
        cost: costNumber,
        freeChecked: free,
      }),
    [hasPersonal, legalBasis, review, costNumber, free],
  )

  const fileReady =
    table !== null && table.errors.length === 0 && (!table.headerLooksLikeData || headerPicked)
  const mapReady = table !== null && mapErrors.length === 0
  const reviewReady = review !== null && review.canGoOn
  const canGoOn = [Boolean(supplier), fileReady, mapReady, reviewReady, false][step] ?? false

  const nameTaken = suppliers.some(
    (s) => s.name.trim().toLowerCase() === newName.trim().toLowerCase(),
  )

  const resetImport = () => {
    setStep(0)
    setSupplier('')
    setNewOpen(false)
    setNewName('')
    setTab('file')
    setFileName('')
    setFileSize(0)
    setText('')
    setFileError('')
    setHeaderRowIndex(0)
    setHeaderPicked(false)
    setMapping({})
    setAiApplied(false)
    setOverwriteAsked([])
    setLegalBasis('')
    setCost('')
    setFree(false)
    setUsedFor('')
    setFilterLabel('')
    setFilterValue('')
    setDone(false)
    setLeaveAsked(false)
  }

  /** Rời luồng nhập. Chưa động vào gì thì đi thẳng; đã có file hoặc đã qua bước
   *  đầu thì hỏi một câu — mất bản nháp là mất công đọc file và khớp mười lăm cột. */
  const leaveImport = () => {
    if (text === '' && step === 0) {
      resetImport()
      setMode('kho')
      return
    }
    setLeaveAsked(true)
  }

  const resetFile = () => {
    setHeaderRowIndex(0)
    setHeaderPicked(false)
    setMapping({})
    setAiApplied(false)
  }

  const takeFile = (file: File) => {
    setFileName(file.name)
    setFileSize(file.size)
    resetFile()

    const tooBig = checkFileSize(file.size)
    if (tooBig) {
      setText('')
      setFileError(tooBig.text)
      return
    }

    setFileError('')
    setReading(true)
    file
      .text()
      .then((raw) => {
        setText(raw)
        setReading(false)
      })
      .catch(() => {
        setText('')
        setFileError('Không đọc được file này. Chọn file khác, hoặc dán trực tiếp.')
        setReading(false)
      })
  }

  const takePaste = (raw: string) => {
    setText(raw)
    setFileName('')
    setFileSize(0)
    setFileError('')
    resetFile()
  }

  const pickSupplier = (name: string, basis?: string) => {
    setSupplier(name)
    setNewOpen(false)
    if (basis) setLegalBasis(basis)
  }

  /** "Dùng nhà đã có" — phải lấy ĐÚNG tên chuẩn trong danh mục (không phải chuỗi
   *  người dùng vừa gõ) VÀ căn cứ mặc định của nhà đó. Bỏ căn cứ ở đây là đẩy
   *  người dùng vào ngõ cụt: mọi dòng có cột người/thư/điện thoại sẽ bị loại vì
   *  "thiếu căn cứ liên hệ" ở bước 4, mà ô khai căn cứ lại nằm ở bước 5. */
  const useExisting = () => {
    const found = suppliers.find(
      (s) => s.name.trim().toLowerCase() === newName.trim().toLowerCase(),
    )
    if (found) pickSupplier(found.name, found.legalBasisDefault)
  }

  const sample = sampleCsvFile()
  /** Thẻ tải file mẫu là một `<a download>` thật, nội dung nhúng thẳng trong
   *  đường dẫn: không cần API trình duyệt nào, và tầng dữ liệu vẫn không biết gì
   *  về DOM. Nội dung mở đầu bằng BOM để Excel trên Windows đọc đúng tiếng Việt. */
  const sampleHref = `data:${sample.type},${encodeURIComponent(sample.text)}`

  const opened = openCode ? (rows.find((r) => r.code === openCode) ?? null) : null

  const stepItems = STEP_LABELS.map((label, i) => {
    const hint =
      i === 0
        ? supplier || 'chưa chọn nhà cung cấp'
        : i === 1
          ? table
            ? `${grouped(table.body.length)} dòng · ${DELIMITER_LABEL[table.sniff.delimiter]}`
            : 'chưa có file'
          : i === 2
            ? table
              ? `${Object.values(mapping).filter((v) => v && v !== SKIP_TARGET).length}/${table.header.length} cột đã khớp`
              : 'chưa có cột nào'
            : i === 3
              ? review
                ? `${grouped(review.rowsValid)} dòng hợp lệ`
                : 'chưa soát'
              : code
    return { key: label, label, hint }
  })

  // -------------------------------------------------------------------------
  // Chế độ NHẬP — năm bước trong một màn
  // -------------------------------------------------------------------------
  if (mode === 'nhap') {
    return (
      <AppShell {...chrome.shell}>
        <div className="flex flex-col gap-4 lg:gap-6">
          {/* Lối về đi qua `back` của `PageHeader`, không qua `actions`: luồng
              nhập là màn con của kho, và quy ước của hệ đặt lối về sổ ở TRÊN
              tiêu đề. Bản nháp chỉ sống trong màn này nên nút ấy là một nút
              XOÁ — có gì để mất thì `leaveImport` hỏi một câu ngay trên màn,
              không dùng `window.confirm`. */}
          <PageHeader
            back={{ label: 'Về kho danh sách', onBack: leaveImport }}
            title="Nhập danh sách"
            subtitle={
              <>
                Lô <span className="font-mono">{code}</span> · người nhập {me} · người gật{' '}
                {IMPORT_APPROVER}
              </>
            }
            rail={<ContextRail objects={rail} />}
          />

          {leaveAsked ? (
            <GlassCard
              className="flex flex-wrap items-center justify-between gap-4 p-5"
              role="alert"
            >
              <span className="text-warning flex items-center gap-2 text-[12.5px] leading-[1.5]">
                <Icon icon={TriangleAlert} size={16} />
                Rời màn là mất bản nháp: file đã đọc, bộ khớp cột và kết quả soát đều không được giữ
                lại ở đâu.
              </span>
              <span className="flex flex-wrap items-center gap-3">
                <Button size="lg" variant="ghost" onClick={() => setLeaveAsked(false)}>
                  Ở lại
                </Button>
                <Button
                  size="lg"
                  onClick={() => {
                    resetImport()
                    setMode('kho')
                  }}
                >
                  Bỏ bản nháp, về kho
                </Button>
              </span>
            </GlassCard>
          ) : null}

          <StepStrip steps={stepItems} current={step} onGo={(i) => setStep(i)} />

          <p className="text-glass-foreground text-[12.5px] leading-[1.6]">
            Bản nháp chỉ sống trong màn này — rời màn hoặc F5 là mất. Một luồng nhập dở dang không
            đáng giữ ở đường dẫn.
          </p>

          {/* Bước 1 · Chọn nguồn */}
          {step === 0 ? (
            <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
              <SectionTitle
                size="sm"
                kicker="Bước 1"
                hint="Nhà cung cấp quyết định ba thứ: lô có tốn tiền không, khử trùng chặt tới đâu, và căn cứ liên hệ mặc định là gì."
              >
                Lô này mua ở đâu
              </SectionTitle>

              {suppliers.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  message="Chưa có nhà cung cấp nào. Lô đầu tiên bắt đầu bằng việc đặt tên chỗ mua nó."
                  action={{ label: 'Thêm nhà cung cấp', onClick: () => setNewOpen(true) }}
                  className="py-12"
                />
              ) : (
                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  {suppliers.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => pickSupplier(s.name, s.legalBasisDefault)}
                      /* Ba mức nền CÓ TÊN, không ba con số alpha gõ tay: thẻ
                         nghỉ ở `--surface-inset`, rê chuột lên `--surface-control`,
                         đang chọn thì `--surface-active` THAY CHỖ hai mức kia
                         chứ không phủ thêm một lớp trắng nữa (luật 12). */
                      className={cn(
                        'motion-std flex min-h-12 flex-col gap-2 rounded-md p-4 text-left',
                        supplier === s.name
                          ? 'bg-surface-active'
                          : 'bg-surface-inset hover:bg-surface-control',
                      )}
                    >
                      <span className="text-[12.5px] font-semibold">{s.name}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <MetaPill>{SUPPLIER_KIND_LABEL[s.kind]}</MetaPill>
                        {s.last ? (
                          <MetaPill mono icon={CalendarDays}>
                            {dm(s.last.importedAt)}
                          </MetaPill>
                        ) : null}
                      </span>
                      <span className="text-glass-foreground tnum text-[12.5px] leading-[1.6]">
                        {s.last
                          ? `Lần gần nhất ${grouped(s.last.rowsRaw)} dòng · loại ${
                              s.last.rejectRate === null ? '—' : percent(s.last.rejectRate, 1)
                            }`
                          : 'Chưa nhập lô nào từ nhà này.'}
                      </span>
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setNewOpen(true)}
                    className={cn(
                      'motion-std flex min-h-12 items-center justify-center gap-2 rounded-md p-4 text-[12.5px] font-semibold',
                      newOpen ? 'bg-surface-active' : 'bg-surface-inset hover:bg-surface-control',
                    )}
                  >
                    <Icon icon={Plus} size={16} />
                    Nhà cung cấp mới
                  </button>
                </div>
              )}

              {newOpen ? (
                <InsetPanel className="flex flex-col gap-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Field label="Tên nhà cung cấp" required>
                      <Input
                        value={newName}
                        invalid={nameTaken}
                        aria-required="true"
                        onChange={(e) => setNewName(e.target.value)}
                      />
                    </Field>
                    <Field label="Kiểu">
                      <Select
                        label="Kiểu nhà cung cấp"
                        hideLabel
                        value={newKind}
                        options={SUPPLIER_KIND_OPTIONS}
                        onChange={setNewKind}
                      />
                    </Field>
                    <Field label="Căn cứ liên hệ mặc định">
                      <Select
                        label="Căn cứ liên hệ mặc định"
                        hideLabel
                        value={newBasis}
                        options={LEGAL_BASIS_OPTIONS}
                        onChange={setNewBasis}
                      />
                    </Field>
                  </div>

                  {nameTaken ? (
                    <div className="flex flex-wrap items-center gap-3" role="alert">
                      <span className="text-destructive-foreground flex items-center gap-2 text-[12.5px] leading-[1.6]">
                        <Icon icon={TriangleAlert} size={14} />
                        Tên này đã có trong danh mục. Hai nhà trùng tên là hai kho lô không ai ghép
                        lại được.
                      </span>
                      <Button size="sm" variant="ghost" onClick={useExisting}>
                        Dùng nhà đã có
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        size="md"
                        disabled={newName.trim() === ''}
                        onClick={() => pickSupplier(newName.trim(), newBasis)}
                      >
                        Dùng nhà này
                      </Button>
                      <span className="text-glass-foreground text-[12.5px] leading-[1.6]">
                        Hạn lưu mặc định {IMPORT_GATE.retentionDays} ngày — đổi được ở màn Cấu hình,
                        không đổi ở đây.
                      </span>
                    </div>
                  )}
                </InsetPanel>
              ) : null}
            </GlassCard>
          ) : null}

          {/* Bước 2 · Tải mẫu · Upload */}
          {step === 1 ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr] lg:gap-6">
              <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
                <SectionTitle
                  size="sm"
                  kicker="Bước 2"
                  /* Số dòng ĐẾM từ chính file mẫu — câu này từng ghi cứng "Ba
                     dòng" và sai ngay hôm file có dòng thứ tư. */
                  hint={`${SAMPLE_ROW_COUNT} dòng ví dụ, một hàng tiêu đề.`}
                >
                  File mẫu của hệ
                </SectionTitle>

                <a
                  href={sampleHref}
                  download={SAMPLE_FILE_NAME}
                  className={cn(buttonVariants({ size: 'lg', variant: 'ghost' }), 'self-start')}
                >
                  <Icon icon={FileSpreadsheet} size={16} />
                  Tải file mẫu (CSV UTF-8)
                </a>

                <ul className="text-muted-foreground m-0 flex list-none flex-col gap-2 p-0 text-[12.5px] leading-[1.6]">
                  <li>
                    Một hàng tiêu đề, {grouped(IMPORT_GATE.maxRows)} dòng dữ liệu là mức tối đa của
                    bản này.
                  </li>
                  <li>Tên cột trong file của bạn KHÔNG cần trùng tên mẫu — khớp ở bước sau.</li>
                  <li>
                    Dòng đầy đủ nhất vẫn chỉ điền được 5 trên 6 ô bắt buộc. Ô "Đau ở đâu" không nhà
                    cung cấp nào bán.
                  </li>
                </ul>
              </GlassCard>

              <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
                <SegmentedControl
                  label="Cách đưa dữ liệu vào"
                  value={tab}
                  onChange={(v) => setTab(v as 'file' | 'dan')}
                  options={[
                    { value: 'file', label: 'Chọn file' },
                    { value: 'dan', label: 'Dán trực tiếp' },
                  ]}
                />

                {tab === 'file' ? (
                  <Dropzone
                    accept=".csv,.txt,.tsv"
                    fileName={fileName || undefined}
                    fileMeta={
                      table
                        ? `${Math.max(1, Math.round(fileSize / 1024))} KB · ${grouped(
                            table.body.length,
                          )} dòng · ${DELIMITER_LABEL[table.sniff.delimiter]}`
                        : undefined
                    }
                    error={fileError || undefined}
                    hint="Kéo file CSV vào đây, hoặc bấm để chọn. Máy Việt xuất bằng dấu chấm phẩy thì hệ tự nhận."
                    onFile={takeFile}
                    onClear={
                      fileName
                        ? () => {
                            setFileName('')
                            setFileSize(0)
                            setText('')
                            setFileError('')
                            resetFile()
                          }
                        : undefined
                    }
                  />
                ) : (
                  <Field
                    label="Dán từ Excel"
                    hint="Chép vùng ô trong Excel rồi dán vào đây — bộ nhớ tạm của Excel là văn bản ngăn bằng dấu tab, và đó là đường thoát cho file .xlsx."
                  >
                    <textarea
                      value={text}
                      onChange={(e) => takePaste(e.target.value)}
                      /* 12,5px mono — bậc "thân · mono" của thang chữ. 12px
                         không có trong thang chín bậc (§8.3). */
                      className="bg-input text-glass-foreground min-h-32 w-full rounded-md p-3 font-mono text-[12.5px] leading-[1.7] outline-none focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]"
                    />
                  </Field>
                )}

                {reading ? <LoadingBlock height={44} label="Đang đọc file" /> : null}

                {table ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-muted-foreground tnum text-[12.5px] leading-[1.6]">
                      Đọc được {grouped(table.body.length)} dòng · {table.columns} cột · dấu phân
                      tách hệ tự nhận: {DELIMITER_LABEL[table.sniff.delimiter]}
                      {table.hadBom ? ' · file có dấu UTF-8 ở đầu' : ''}
                    </p>

                    {table.errors.map((issue) => (
                      <p
                        key={issue.code}
                        role="alert"
                        className="text-destructive-foreground flex items-center gap-2 text-[12.5px] leading-[1.6]"
                      >
                        <Icon icon={TriangleAlert} size={14} />
                        {issue.text}
                      </p>
                    ))}

                    {table.warnings.map((issue) => (
                      <p
                        key={issue.code}
                        className="text-warning flex items-center gap-2 text-[12.5px] leading-[1.6]"
                      >
                        <Icon icon={TriangleAlert} size={14} />
                        {issue.text}
                      </p>
                    ))}

                    {table.headerLooksLikeData ? (
                      <Field
                        label="Hàng nào là hàng tiêu đề"
                        required
                        hint="File Excel Việt hay có khối tiêu đề trang trí ở trên cùng. Chọn xong mới đi tiếp được."
                      >
                        <Select
                          label="Hàng tiêu đề"
                          hideLabel
                          value={headerPicked ? String(headerRowIndex) : ''}
                          neutralValue=""
                          options={[
                            { value: '', label: 'Chưa chọn hàng nào' },
                            ...table.all.slice(0, 5).map((line, i) => ({
                              value: String(i),
                              label: `Hàng ${i + 1} · ${line.slice(0, 4).join(' · ')}`,
                            })),
                          ]}
                          onChange={(v) => {
                            if (v === '') return
                            setHeaderRowIndex(Number(v))
                            setHeaderPicked(true)
                          }}
                        />
                      </Field>
                    ) : null}

                    {/* Năm dòng đầu dạng bảng thô — người dùng đối chiếu bằng mắt
                        trước khi đi tiếp. Cố ý KHÔNG dùng DataTable: đây là văn
                        bản chưa qua cột nào, không phải một bảng có nghĩa.

                        `InsetPanel` chứ không phải mặt kính thứ hai: thẻ cha đã
                        là `.glass-a`, và một `.glass-b` lồng trong đó là lớp nền
                        thứ năm (luật 12 · §8.1 điều 11). */}
                    <InsetPanel className="flex flex-col gap-2 overflow-x-auto">
                      {table.all.slice(0, 5).map((line, i) => (
                        <span
                          key={`preview-${String(i)}`}
                          className={cn(
                            'truncate font-mono text-[11.5px] leading-[1.7]',
                            i === headerRowIndex ? 'font-semibold' : 'text-muted-foreground',
                          )}
                        >
                          {line.join(' | ')}
                        </span>
                      ))}
                    </InsetPanel>
                  </div>
                ) : null}
              </GlassCard>
            </div>
          ) : null}

          {/* Bước 3 · Khớp cột */}
          {step === 2 && table ? (
            <div className="flex flex-col gap-4 lg:gap-6">
              {/* Luật 9 · khối AI đề nghị CẢ BỘ một lần, có căn cứ, có nút, và nói
                  thẳng hệ quả của việc chưa bấm. Bảng bên dưới mở ra ở trạng thái
                  chưa ánh xạ gì — AI không tự điền ô nào. */}
              <AiAction
                variant="strip"
                suggestion="Khớp cả bộ cột của file này vào ô đích của hệ trong một lần."
                basis={suggestion?.basis ?? 'Chưa đọc được hàng tiêu đề nào.'}
                confirmLabel="Áp bộ ánh xạ này"
                empty="Chưa áp bộ nào — bảng bên dưới còn trống."
                done={aiApplied}
                onConfirm={() => {
                  setMapping(suggestion?.mapping ?? {})
                  setAiApplied(true)
                }}
              />

              <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
                <SectionTitle
                  size="sm"
                  kicker="Bước 3"
                  /* KHÔNG hứa "bộ đầu tiên sẽ được lưu": danh mục 5.8.1 chưa có
                     trường nào giữ bộ khớp, nên câu ấy hứa một thứ không tồn tại.
                     Mục này đã vào khối "Cố tình không làm". */
                  hint={`Mỗi lô khớp lại từ đầu — hệ chưa nhớ bộ khớp của nhà "${supplier}".`}
                >
                  Cột trong file trỏ vào ô nào
                </SectionTitle>

                {/* Bảng khớp cột đi TRẦN trong thẻ cha: thẻ cha đã là `.glass-a`,
                    thêm một `.glass-b` nữa là lớp nền thứ năm (luật 12 · §8.1
                    điều 11). `ColumnMap` tự dựng nền cho từng dòng của nó. */}
                <div>
                  <ColumnMap
                    targets={columnTargets()}
                    onChange={(source, value) =>
                      setMapping((prev) => ({ ...prev, [source]: value }))
                    }
                    rows={table.header.map((name, i) => {
                      const samples = table.body.slice(0, 3).map((line) => line[i] ?? '')
                      const value = mapping[name] ?? ''
                      const twin =
                        value && value !== SKIP_TARGET
                          ? table.header.find((other) => other !== name && mapping[other] === value)
                          : undefined
                      const warning =
                        value && value !== SKIP_TARGET
                          ? sampleWarning(value as ProspectField, samples)
                          : ''
                      return {
                        source: name,
                        samples,
                        value,
                        ...(twin ? { error: `Cột "${twin}" đã trỏ vào ô này rồi.` } : {}),
                        ...(warning ? { warning } : {}),
                      }
                    })}
                  />
                </div>

                {mapErrors.map((issue) => (
                  <p
                    key={issue.code}
                    role="alert"
                    className="text-destructive-foreground flex items-center gap-2 text-[12.5px] leading-[1.6]"
                  >
                    <Icon icon={TriangleAlert} size={14} />
                    {issue.text}
                  </p>
                ))}

                {mapReady && !hasPersonal ? (
                  <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
                    Lô này chỉ có cột pháp nhân — không có người liên hệ, chức danh, thư đích danh
                    hay di động. Căn cứ liên hệ vì thế không phải ô bắt buộc ở bước cuối.
                  </p>
                ) : null}
              </GlassCard>
            </div>
          ) : null}

          {/* Bước 4 · Soát & khử trùng */}
          {step === 3 && review ? (
            <div className="flex flex-col gap-4 lg:gap-6">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatCard
                  size="compact"
                  icon={Layers}
                  value={grouped(review.rowsRaw)}
                  label="Dòng thô"
                  hint="không kể hàng tiêu đề"
                />
                <StatCard
                  size="compact"
                  icon={Check}
                  value={grouped(review.rowsValid)}
                  label="Dòng hợp lệ"
                  hint="đây là khán giả của đợt gửi"
                />
                <StatCard
                  size="compact"
                  icon={Users}
                  value={grouped(review.rowsDuplicate)}
                  label="Dòng trùng"
                  hint={
                    review.duplicateRate === null
                      ? 'chưa đo được'
                      : `${percent(review.duplicateRate, 1)} số dòng thô`
                  }
                />
                <StatCard
                  size="compact"
                  icon={TriangleAlert}
                  value={grouped(review.rowsRejected)}
                  label="Dòng bị loại"
                  hint={
                    review.rejectRate === null
                      ? 'chưa đo được'
                      : `${percent(review.rejectRate, 1)} số dòng thô`
                  }
                />
              </div>

              {/* HAI CÂU, không một câu: `rowsHeld` gộp hai thứ trái ngược nhau.
                  Dòng có chủ VÀO KHO được (chỉ không vào khán giả); dòng đã ký
                  thì KHÔNG vào kho — §5.4 gọi nó là chặn cứng. Gộp lại rồi viết
                  "vào kho được" là nói sai về nửa sau. */}
              {review.held.length > 0 ? (
                <p className="text-glass-foreground text-[12.5px] leading-[1.6]">
                  {grouped(review.held.length)} dòng vào kho được nhưng KHÔNG vào khán giả — Sale
                  đang chăm dòng sổ đó, một lá thư lạnh làm hỏng việc.
                </p>
              ) : null}

              {review.blocked.length > 0 ? (
                <p className="text-glass-foreground text-[12.5px] leading-[1.6]">
                  {grouped(review.blocked.length)} dòng bị chặn cứng vì đã ký hợp đồng — khách đã
                  mua không quay lại kho danh sách, và đây là chỗ duy nhất của bước soát không có
                  nút tắt.
                </p>
              ) : null}

              {/* Dải cảnh báo phải chỉ đúng bước có lỗi. Khi lý do loại đứng đầu
                  là "thiếu căn cứ liên hệ" thì bước khớp cột không có gì sai —
                  cửa Nghị định 13 mới là chỗ chặn, và nó nằm ở lô chứ không ở cột. */}
              {review.highReject ? (
                <GlassCard className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <span className="text-warning flex items-center gap-2 text-[12.5px] leading-[1.5]">
                    <Icon icon={TriangleAlert} size={16} />
                    {/* Tỉ lệ THẬT của lô này, không phải một câu ước chừng: dải
                        này cũng bật khi 60% hay 90% số dòng bị bỏ, mà "cứ ba
                        dòng thì một" thì đọc ra 33% — trong khi thẻ số cách đó
                        bốn chục dòng đang in đúng con số. `highReject` chỉ bật
                        khi `rejectRate` khác null, nên `?? 0` là lối thoát kiểu
                        chứ không phải một nhánh chạy thật. */}
                    {topReason?.reason === 'thieu-can-cu-lien-he'
                      ? `${percent(review.rejectRate ?? 0, 1)} số dòng thô bị bỏ — trên ngưỡng ${percent(IMPORT_GATE.rejectRateWarn)} của phòng, và phần lớn vì lô CHƯA KHAI CĂN CỨ LIÊN HỆ. Chọn căn cứ ngay dưới đây — không phải lỗi khớp cột.`
                      : `${percent(review.rejectRate ?? 0, 1)} số dòng thô bị bỏ — trên ngưỡng ${percent(IMPORT_GATE.rejectRateWarn)} của phòng. Kiểm lại bước khớp cột trước khi nhập.`}
                  </span>
                  {topReason?.reason === 'thieu-can-cu-lien-he' ? (
                    <Select
                      label="Căn cứ liên hệ của lô"
                      value={legalBasis}
                      options={[{ value: '', label: 'Chưa chọn căn cứ' }, ...LEGAL_BASIS_OPTIONS]}
                      onChange={setLegalBasis}
                    />
                  ) : (
                    <Button size="lg" variant="ghost" onClick={() => setStep(2)}>
                      Quay lại khớp cột
                    </Button>
                  )}
                </GlassCard>
              ) : null}

              <Foldable
                title="Trùng trong chính file"
                count={review.inFile.length}
                /* Một kết quả, không một lời khen: hệ KHÔNG có dòng của các lô
                   cũ để so, nên "sạch nhất từ nhà này" là câu không đo được —
                   xem mục thứ ba của "Cố tình không làm". */
                empty="Không dòng nào trùng trong chính file."
              >
                <DupeTable rows={review.inFile} />
              </Foldable>

              {/* `count={null}`, KHÔNG phải 0: vòng khử trùng chéo lô chưa chạy
                  lần nào (xem `review` — `store` để trống), nên in số 0 ở đây là
                  bịa ra một kết quả đã đo. */}
              <Foldable
                title="Trùng với lô đã có"
                count={null}
                empty="Chưa đối chiếu được với kho lô cũ, nên đây là dấu gạch chứ không phải số 0: kịch bản đóng băng không chép dòng của tám lô trước, chỉ chép số tổng của từng lô. Vòng khử trùng chéo lô chạy khi có kho dòng thật."
              >
                <DupeTable rows={review.inStore} />
              </Foldable>

              <Foldable
                title="Bị loại"
                count={review.rejected.length}
                empty="Không dòng nào bị loại — file này đã sạch trước khi vào hệ."
              >
                <div>
                  <DataTable
                    columns={[
                      { header: 'Dòng', width: '0.8fr' },
                      { header: 'Công ty', width: '2fr' },
                      { header: 'Vì sao bỏ dòng này', width: '2fr' },
                    ]}
                    rows={review.rejected.map((r) => ({
                      id: r.id,
                      cells: [
                        <span key="i" className="font-mono text-[11.5px]">
                          {r.no}
                        </span>,
                        <span key="c" className="block truncate">
                          {r.row.companyRaw ?? '—'}
                        </span>,
                        <span key="w">
                          {r.rejectReason ? REJECT_REASON_LABEL[r.rejectReason] : '—'}
                        </span>,
                      ],
                    }))}
                  />
                </div>
              </Foldable>

              <Foldable
                title="Đã có trong sổ lead"
                count={
                  review.inBook.owned.length +
                  review.inBook.exited.length +
                  review.inBook.signed.length
                }
                empty="Không dòng nào của file này đã nằm trong sổ lead."
              >
                <div className="flex flex-col gap-4">
                  {/* Cột "Xin đè" là cột ĐẦU vì nó là thứ duy nhất bấm được
                      trong bảng này. Ô tick chỉ mọc ở dòng CÓ CHỦ: dòng ở kho
                      chung không có ô nào để đè (nhập chỉ điền ô trống) và dòng
                      đã ký thì không vào kho — vẽ một ô tick tắt sẵn ở đó là mời
                      người ta bấm vào một việc không xảy ra. Chúng nhận dấu "—",
                      cùng nghĩa "không áp dụng cho loại này" như mọi bảng khác. */}
                  <DataTable
                    columns={[
                      { header: 'Xin đè', width: '1fr' },
                      { header: 'Dòng', width: '0.7fr' },
                      { header: 'Công ty', width: '1.8fr' },
                      { header: 'Nhóm', width: '1.4fr' },
                      { header: 'Dòng sổ', width: '0.9fr' },
                      { header: 'Hệ nói gì', width: '2.4fr' },
                    ]}
                    rows={[
                      ...review.inBook.owned,
                      ...review.inBook.exited,
                      ...review.inBook.signed,
                    ].map((r) => {
                      const company = r.row.companyRaw ?? `dòng ${r.no}`
                      const canOverwrite = review.overwritable.some((o) => o.id === r.id)
                      return {
                        id: r.id,
                        cells: [
                          canOverwrite ? (
                            <Checkbox
                              key="ow"
                              checked={overwriteAsked.includes(r.id)}
                              onChange={(on) =>
                                setOverwriteAsked((prev) =>
                                  on ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                                )
                              }
                              className="-mx-3 py-1"
                              /* Nhãn thấy được ngắn, nhưng TÊN mà trình đọc màn
                                 hình đọc phải nói ra dòng nào — hai mươi ô tick
                                 cùng đọc "Xin đè" là hai mươi ô không phân biệt
                                 được bằng tai. */
                              label={
                                <span className="text-[11.5px]">
                                  Xin đè<span className="sr-only"> ô của {company}</span>
                                </span>
                              }
                            />
                          ) : (
                            <span key="ow" className="text-muted-foreground">
                              —
                            </span>
                          ),
                          <span key="i" className="font-mono text-[11.5px]">
                            {r.no}
                          </span>,
                          <span key="c" className="block truncate">
                            {company}
                          </span>,
                          /* `da-co-chu` gộp HAI NGẢ khác hẳn nhau: lead có chủ (Sale
                             đang chăm, không gửi, có ô để đè) và lead ở kho chung
                             (nhập chỉ điền ô trống, vẫn gửi được). In cùng một nhãn
                             cho cả hai là giấu đúng chỗ người bấm cần phân biệt. */
                          <span key="g">{groupLabel(r)}</span>,
                          <Chip key="l" variant="object">
                            {r.matchedWith ?? '—'}
                          </Chip>,
                          <span key="n" className="text-muted-foreground block truncate">
                            {r.book?.note ?? ''}
                          </span>,
                        ],
                      }
                    })}
                  />

                  {review.overwritable.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Hai nút này chỉ là lối tắt của cột tick — chúng không
                          gửi gì đi. Yêu cầu duyệt sinh ra lúc bấm nút CUỐI của
                          bước 5, và cho tới lúc đó tick vào tick ra đều được. */}
                      <Button
                        size="md"
                        variant="ghost"
                        onClick={() => setOverwriteAsked(review.overwritable.map((r) => r.id))}
                        disabled={overwriteAsked.length === review.overwritable.length}
                      >
                        Chọn cả {grouped(review.overwritable.length)} dòng có chủ
                      </Button>
                      {overwriteAsked.length > 0 ? (
                        <Button size="md" variant="ghost" onClick={() => setOverwriteAsked([])}>
                          Bỏ chọn hết
                        </Button>
                      ) : null}
                      <span className="text-glass-foreground text-[12.5px] leading-[1.6]">
                        {overwriteAsked.length > 0
                          ? `Đã chọn ${grouped(overwriteAsked.length)}/${grouped(review.overwritable.length)} dòng CÓ CHỦ để xin đè — lô sẽ vào kho ở trạng thái chờ ${IMPORT_APPROVER} gật. Đổi ý được cho tới khi bấm nút cuối.`
                          : `${OVERWRITE_RULE.why} Chỉ ${grouped(review.overwritable.length)} dòng có chủ tick được; dòng ở kho chung không có ô nào để đè.`}
                      </span>
                    </div>
                  ) : null}
                </div>
              </Foldable>

              {!review.canGoOn ? (
                <p role="alert" className="text-destructive-foreground text-[12.5px] leading-[1.6]">
                  Không dòng nào hợp lệ — không có gì để nhập.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Bước 5 · Xác nhận nhập */}
          {step === 4 ? (
            done ? (
              <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
                <SectionTitle size="sm" kicker="Xong">
                  {needsApproval
                    ? `Lô ${code} đang chờ ${IMPORT_APPROVER} gật`
                    : `Lô ${code} đã vào kho`}
                </SectionTitle>
                <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
                  {needsApproval
                    ? 'Yêu cầu duyệt đã sinh, lô nằm ở trạng thái chờ duyệt. Không dòng nào của nó vào khán giả đợt nào trước khi có người gật.'
                    : `${grouped(review?.rowsValid ?? 0)} dòng đã vào kho. Hệ đã ghi một dòng nhật ký cho lô này.`}
                </p>
                <p className="text-[12.5px] font-semibold">{IMPORT_DISCLAIMER}</p>

                {/* Việc kế tiếp THẬT sau khi nhập xong một lô là tạo một đợt gửi
                    cho nó — bản trước dừng ở đây với đúng một nút trả người về
                    chỗ cũ. Nút chỉ mọc khi lô ĐÃ vào kho: lô còn chờ gật thì
                    không dòng nào của nó vào khán giả được, mời đi tạo đợt lúc
                    ấy là mời làm một việc chưa tới lượt. */}
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    variant={needsApproval ? 'default' : 'ghost'}
                    onClick={() => {
                      resetImport()
                      setMode('kho')
                    }}
                  >
                    Về kho danh sách
                  </Button>
                  {needsApproval ? null : (
                    /* Nút mang theo LÔ NÀY: sổ nguồn đọc `?tao=1` để mở thẳng
                       form tạo, `?lo=` và `?dong=` để ô "Khán giả" mở bằng số
                       dòng hợp lệ của chính lô vừa nhập. Không có ba tham số
                       ấy thì đích mở ra với khán giả của một lô khác, và nút
                       hứa "cho lô này" trong khi đích không biết lô nào. */
                    <Button
                      size="lg"
                      onClick={() =>
                        navigate(`/sales/campaigns?tao=1&lo=${code}&dong=${review?.rowsValid ?? 0}`)
                      }
                    >
                      <Icon icon={ArrowRight} size={16} />
                      Tạo đợt gửi cho lô này
                    </Button>
                  )}
                </div>
              </GlassCard>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:gap-6">
                <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
                  <SectionTitle size="sm" kicker="Bước 5" hint="Mã lô do hệ cấp, không ai gõ tay.">
                    Lô {code}
                  </SectionTitle>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Field label="Nhà cung cấp">
                      <Input value={supplier} readOnly />
                    </Field>
                    <Field label="Số dòng hợp lệ">
                      <Input value={grouped(review?.rowsValid ?? 0)} readOnly />
                    </Field>
                    <Field
                      label="Bộ lọc đã dùng · nhãn"
                      hint="Cặp nhãn–giá trị, chép đúng chữ của nhà cung cấp. Mỗi nhà một ngôn ngữ lọc riêng nên đây cố ý không phải một câu truy vấn."
                    >
                      <Input
                        value={filterLabel}
                        onChange={(e) => setFilterLabel(e.target.value)}
                        placeholder="Ngành"
                      />
                    </Field>
                    <Field label="Bộ lọc đã dùng · giá trị">
                      <Input
                        value={filterValue}
                        onChange={(e) => setFilterValue(e.target.value)}
                        placeholder="Dược & thiết bị y tế"
                      />
                    </Field>
                    <Field
                      label="Tiền mua dòng của lô"
                      /* Một câu, và là câu người đang gõ số cần: ô này đo cái
                         gì, và từ mức nào thì phải xin gật. Chuyện "thước này
                         khác chi dữ liệu của nguồn" nói MỘT lần ở kho, dưới
                         bảng có cả hai cột tiền — nói lại ở đây là lần thứ ba
                         trong một lượt đi. */
                      hint={`Chỉ tiền trả cho chỗ bán dòng này. Từ ${millions(IMPORT_GATE.approvalCost)} trở lên phải qua ${IMPORT_APPROVER}.`}
                    >
                      <Input
                        value={cost}
                        inputMode="numeric"
                        onChange={(e) => setCost(e.target.value.replace(/\D/g, ''))}
                      />
                    </Field>
                    <Field
                      label="Căn cứ liên hệ"
                      required={hasPersonal}
                      hint={
                        hasPersonal
                          ? 'Lô có cột dữ liệu cá nhân — Nghị định 13 bắt khai căn cứ trước khi nhập.'
                          : 'Lô chỉ có cột pháp nhân — ô này không bắt buộc.'
                      }
                    >
                      <Select
                        label="Căn cứ liên hệ"
                        hideLabel
                        value={legalBasis}
                        neutralValue=""
                        options={[{ value: '', label: 'Chưa chọn căn cứ' }, ...LEGAL_BASIS_OPTIONS]}
                        onChange={setLegalBasis}
                      />
                    </Field>
                    <Field
                      label="Dùng lô này cho"
                      hint="Để trống cũng được — lô của BD gọi tay không nuôi đợt nào, đó là chuyện bình thường."
                    >
                      <Select
                        label="Dùng lô này cho"
                        hideLabel
                        value={usedFor}
                        neutralValue=""
                        options={SOURCE_OPTIONS}
                        onChange={setUsedFor}
                      />
                    </Field>
                    <Field label="Hạn lưu">
                      <Input value={`${IMPORT_GATE.retentionDays} ngày`} readOnly />
                    </Field>
                  </div>

                  <Checkbox
                    checked={free}
                    onChange={setFree}
                    label="Lô này không tốn tiền"
                    hint="Bỏ trống vì quên và bỏ trống vì đúng là không tốn đồng nào là hai chuyện khác nhau."
                  />

                  {confirmIssues.map((issue) => (
                    <p
                      key={issue.code}
                      role="alert"
                      className="text-destructive-foreground flex items-center gap-2 text-[12.5px] leading-[1.6]"
                    >
                      <Icon icon={TriangleAlert} size={14} />
                      {issue.text}
                    </p>
                  ))}

                  <div className="flex flex-wrap items-center gap-4">
                    <Button
                      size="lg"
                      disabled={confirmIssues.length > 0}
                      onClick={() => setDone(true)}
                    >
                      {needsApproval ? `Gửi ${IMPORT_APPROVER} duyệt` : 'Nhập lô vào kho'}
                    </Button>
                    <span className="text-[12.5px] font-semibold">{IMPORT_DISCLAIMER}</span>
                  </div>
                </GlassCard>

                <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
                  <SectionTitle size="sm" kicker="Nhập xong thì gì xảy ra">
                    Không đợt nào tự chạy
                  </SectionTitle>
                  <ul className="text-muted-foreground m-0 flex list-none flex-col gap-3 p-0 text-[12.5px] leading-[1.6]">
                    <li>
                      Lô vào kho, người nhập ghi là {me}, ngày nhập {dmy(DAS_VINA_FROZEN_AT)}.
                    </li>
                    <li>Hệ ghi một dòng nhật ký cho lô — nhật ký này không xoá theo hạn lưu.</li>
                    <li>
                      Muốn gửi cho {grouped(review?.rowsValid ?? 0)} dòng này thì phải tạo một đợt ở
                      màn Chiến dịch, và đợt đó vẫn phải qua người gật.
                    </li>
                  </ul>
                  <NotDoing validRows={totals.rowsValid} />
                </GlassCard>
              </div>
            )
          ) : null}

          {/* Đi lùi luôn được, đi tới phải qua cửa. Nút cao 48px cho ngưỡng chạm
              tablet (luật 13). */}
          {done ? null : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Button
                size="lg"
                variant="ghost"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                <Icon icon={ArrowLeft} size={16} />
                Quay lại
              </Button>

              {step < STEP_LABELS.length - 1 ? (
                <Button size="lg" disabled={!canGoOn} onClick={() => setStep((s) => s + 1)}>
                  Tiếp
                  <Icon icon={ArrowRight} size={16} />
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </AppShell>
    )
  }

  // -------------------------------------------------------------------------
  // Chế độ KHO — tám lô của kỳ
  // -------------------------------------------------------------------------
  return (
    <AppShell {...chrome.shell}>
      <div className="flex flex-col gap-4 lg:gap-6">
        {/* Màn con của một sổ luôn có lối về sổ — cùng quy ước với hồ sơ nguồn
            và hồ sơ lead, và `PageHeader` đặt nó đúng chỗ: TRÊN tiêu đề. */}
        <PageHeader
          back={{ label: 'Sổ nguồn', onBack: () => navigate('/sales/campaigns') }}
          title="Kho danh sách"
          subtitle={
            <>
              DAS Vina · kỳ <span className="font-mono">{PERIOD}</span> · chủ màn {MARKETING} ·
              người gật {HEAD_OF_SALES}
            </>
          }
          rail={<ContextRail objects={rail} />}
          actions={
            <Button size="md" onClick={() => setMode('nhap')}>
              <Icon icon={Plus} size={16} />
              Nhập danh sách
            </Button>
          }
        />

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              size="compact"
              icon={Database}
              value={String(totals.batches)}
              label="Lô trong kho"
              hint={`${grouped(suppliers.length)} nhà cung cấp`}
            />
            <StatCard
              size="compact"
              icon={Layers}
              value={grouped(totals.rowsRaw)}
              label="Dòng đã đọc vào"
              hint="không kể hàng tiêu đề"
            />
            <StatCard
              size="compact"
              icon={Check}
              value={grouped(totals.rowsValid)}
              label="Dòng hợp lệ"
              hint={`trùng ${grouped(totals.rowsDuplicate)} · loại ${grouped(totals.rowsRejected)}`}
            />
            <StatCard
              size="compact"
              icon={Wallet}
              value={millions(totals.cost)}
              label="Tiền mua dòng cả kỳ"
              /* KHÔNG ghi "nằm trong tiền của nguồn": không con số nào trên hệ
                 chứng minh được câu ấy — bảng phân rã của một nguồn không có
                 dòng nào mang tên lô, và dòng "Dữ liệu" của bốn nguồn lô nuôi
                 cộng lại còn chưa bằng tiền của một lô. Nhãn chỉ khai đúng thứ
                 nó đo. Xem openDecisions. */
              hint={`${grouped(totals.paidRows)} dòng phải trả tiền cho chỗ bán dòng`}
            />
            <StatCard
              size="compact"
              icon={Users}
              value={grouped(totals.leadsWithBatch)}
              label="Lead có lô đứng sau"
              hint={`${grouped(totals.leadsDirect)} trực tiếp · ${grouped(totals.leadsIndirect)} qua một bước đăng ký`}
            />
            {/* Câu TP Kinh doanh hỏi đầu tiên khi mở kho: "31 triệu tiền mua
                dòng ra bao nhiêu lead". Phép chia sống ở engine
                (`costOfPaidBatchLead`), màn chỉ đọc — và nhãn KHAI PHẠM VI ngay
                trong hint, vì cả tử lẫn mẫu chỉ đứng trên các lô MẤT TIỀN. */}
            <StatCard
              size="compact"
              icon={Coins}
              value={totals.costPerPaidBatchLead === null ? '—' : dong(totals.costPerPaidBatchLead)}
              label="Tiền mua dòng mỗi lead"
              hint={`${totals.paidBatches} lô mất tiền · ${grouped(totals.paidBatchLeads)} lead truy về chính chúng`}
            />
          </div>

          {/* Bỏ ngoài phép chia thì được, GIẤU thì không: bốn lô 0 đồng có lead
              thật, thả chúng vào mẫu số là lấy lead miễn phí trợ giá cho dòng đã
              mua và một lô 12 triệu đọc ra rẻ gần bốn lần. */}
          <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
            {totals.freeBatches} lô 0 đồng cùng {grouped(totals.freeBatchLeads)} lead của chúng nằm
            NGOÀI phép chia ở ô cuối — 0 đồng chia cho lead nào cũng ra 0, và gộp vào là làm dòng đã
            mua trông rẻ hơn thật.
          </p>

          <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
            {grouped(totals.leadsNoBatch)} lead trong sổ KHÔNG có lô nào đứng sau — về từ các đợt
            đăng bài và từ khách cũ giới thiệu. Cả sổ {grouped(totals.allLeads)} dòng nằm ở Sổ lead.
            Nhập một lô không sinh lead nào.
          </p>

          {/* Màn vừa nói ra bốn con số về lead rồi chỉ sang Sổ lead bằng CHỮ —
              lối đi phải có thật. Nút mở cả sổ, không lọc theo lô nào: sổ lead
              truy nguồn chứ không truy lô, nên một tham số lọc ở đây sẽ hứa một
              phép lọc không tồn tại. */}
          <div>
            <Button size="md" variant="ghost" onClick={() => navigate('/sales/leads')}>
              <Icon icon={ArrowRight} size={16} />
              Mở Sổ lead
            </Button>
          </div>
        </div>

        {/* Bảng LUÔN nằm trên glass-b — luật 8. */}
        <GlassCard variant="b" className="flex flex-col gap-4 p-5">
          <SectionTitle
            size="sm"
            kicker="Lô của kỳ"
            hint={`${grouped(rows.length)} lô · bấm một dòng để mở thẻ chi tiết — bộ lọc đã dùng, nguồn lô nuôi và hạn lưu nằm trong đó. Cột "Loại" đọc trên dòng THÔ, ngưỡng cảnh báo của phòng là ${percent(IMPORT_GATE.rejectRateWarn)}.`}
          >
            Dòng vào hệ bằng đường nào
          </SectionTitle>

          {rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              message="Kho chưa có lô nào. Lô đầu tiên bắt đầu bằng việc chọn chỗ mua nó."
              action={{ label: 'Nhập danh sách', onClick: () => setMode('nhap') }}
              className="py-12"
            />
          ) : (
            <DataTable
              columns={[
                { header: 'Mã', width: '0.9fr' },
                { header: 'Nhà cung cấp', width: '2.4fr' },
                { header: 'Ngày nhập', width: '0.8fr' },
                { header: 'Thô', width: '0.6fr', align: 'right' },
                { header: 'Hợp lệ', width: '0.7fr', align: 'right' },
                { header: 'Trùng', width: '0.6fr', align: 'right' },
                /* Cột ĐẾM đứng cạnh ba cột đếm kia để bốn phép cân của §7.1 kiểm
                   được bằng mắt: thô − trùng − loại = hợp lệ. Tỉ lệ đi kèm dưới
                   dạng phụ, không thay chỗ con số đếm. */
                { header: 'Loại · tỉ lệ', width: '1fr', align: 'right' },
                { header: 'Tiền mua dòng', width: '0.9fr', align: 'right' },
                { header: 'Lead', width: '0.5fr', align: 'right' },
                { header: 'Trạng thái', width: '0.9fr' },
              ]}
              rows={rows.map((r) => ({
                id: r.code,
                onOpen: () => setOpenCode(r.code),
                cells: [
                  <Chip key="c" variant="object">
                    {r.code}
                  </Chip>,
                  <span key="s" className="block truncate">
                    {r.supplier}
                  </span>,
                  <MetaPill key="d" mono icon={CalendarDays}>
                    {dm(r.importedAt)}
                  </MetaPill>,
                  <span key="raw" className="tnum font-num">
                    {grouped(r.rowsRaw)}
                  </span>,
                  <span key="ok" className="tnum font-num">
                    {grouped(r.rowsValid)}
                  </span>,
                  <span key="dup" className="tnum font-num">
                    {grouped(r.rowsDuplicate)}
                  </span>,
                  <span
                    key="rej"
                    className={cn('tnum font-num', r.highReject && 'text-warning font-semibold')}
                  >
                    {grouped(r.rowsRejected)}
                    <span className="text-muted-foreground">
                      {r.rejectRate === null ? '' : ` · ${percent(r.rejectRate, 1)}`}
                    </span>
                  </span>,
                  /* `0 ₫` chứ KHÔNG phải "—": bốn lô miễn phí là 0 đồng THẬT.
                     Bảng này cố ý KHÔNG có dấu gạch nào — cột "Loại · tỉ lệ" để
                     TRỐNG khi chưa đo được tỉ lệ — nên một dấu gạch ở cột tiền
                     sẽ là dấu duy nhất của bảng và người đọc phải tự đoán nghĩa
                     của nó. */
                  <span key="cost" className="tnum font-num">
                    {r.cost === 0 ? dong(0) : millions(r.cost)}
                  </span>,
                  <span key="lead" className="tnum font-num">
                    {r.leads}
                  </span>,
                  <Badge key="st" tone={toneOfState(r.state)}>
                    {r.stateLabel}
                  </Badge>,
                ],
              }))}
            />
          )}

          <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
            Cột "Tiền mua dòng" đo ĐÚNG một thứ: tiền trả cho chỗ bán dòng. Nó không phải chi dữ
            liệu của NGUỒN — thước đó có mẫu số khác, nằm ở hồ sơ nguồn trong khối "Tiền đi đâu", và
            hai số không cộng lại được. {dong(0)} nghĩa là lô KHÔNG tốn tiền: sổ cũ của phòng, trang
            đích, quét mã tại gian hàng và ghế thuê tháng đều là 0 đồng thật, không phải ô còn
            thiếu. Kỳ này có {grouped(totals.approvalBatches)} lô chạm ngưỡng phải duyệt vì tiền và{' '}
            {grouped(totals.highRejectBatches)} lô chạm ngưỡng cảnh báo tỉ lệ loại.
          </p>
        </GlassCard>

        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:gap-6">
          <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
            <SectionTitle size="sm" kicker="Màn này bàn cái gì">
              Ba luật của kho danh sách
            </SectionTitle>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              <li className="flex flex-col gap-1">
                <b className="text-[11.5px] font-semibold">
                  Một dòng danh sách không phải một lead
                </b>
                <span className="text-muted-foreground text-[12.5px] leading-[1.6]">
                  Một dòng danh sách đứng ngoài phễu. {grouped(totals.rowsValid)} dòng hợp lệ của cả
                  kỳ mới ra {grouped(totals.allLeads)} dòng sổ. Lead sinh khi bên kia trả lời.
                </span>
              </li>
              <li className="flex flex-col gap-1">
                <b className="text-[11.5px] font-semibold">Mỗi nhãn tiền phải khai phạm vi</b>
                <span className="text-muted-foreground text-[12.5px] leading-[1.6]">
                  {millions(totals.cost)} ở màn này là TIỀN MUA DÒNG của các lô — tiền trả cho chỗ
                  bán dòng. Không ô nào trên màn ghi "chi phí" trỏ trong không.
                </span>
              </li>
              <li className="flex flex-col gap-1">
                <b className="text-[11.5px] font-semibold">Nhập không bao giờ đè lên ô đã có</b>
                <span className="text-muted-foreground text-[12.5px] leading-[1.6]">
                  Dòng khớp một lead đang có chủ thì vào kho nhưng không vào khán giả. Ghi đè là
                  hành động riêng, phải qua {IMPORT_APPROVER}.
                </span>
              </li>
            </ul>
          </GlassCard>

          <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
            <NotDoing validRows={totals.rowsValid} />
          </GlassCard>
        </div>
      </div>

      <Drawer
        open={opened !== null}
        onClose={() => setOpenCode(null)}
        title={opened?.code ?? ''}
        subtitle={opened?.supplier ?? ''}
        meta={opened ? <Badge tone={toneOfState(opened.state)}>{opened.stateLabel}</Badge> : null}
        width="md"
      >
        {opened ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <MetaPill>{opened.kindLabel}</MetaPill>
              <MetaPill avatar={opened.importedBy}>{opened.importedBy}</MetaPill>
              <MetaPill mono icon={CalendarDays}>
                {dmy(opened.importedAt)}
              </MetaPill>
              <MetaPill icon={ShieldCheck}>{opened.legalLabel}</MetaPill>
            </div>

            <GlassCard variant="b" className="flex flex-col gap-3 p-4">
              <span className="text-muted-foreground tnum text-[11.5px] leading-[1.7]">
                Thô {grouped(opened.rowsRaw)} · hợp lệ {grouped(opened.rowsValid)} · trùng{' '}
                {grouped(opened.rowsDuplicate)} · loại {grouped(opened.rowsRejected)}
              </span>
              {/* `dong(0)` y như trong bảng, không đổi sang chữ "không tốn tiền":
                  cùng một lô mà bảng in "0 ₫" còn thẻ chi tiết in một câu là hai
                  cách đọc cho một con số. Và số 0 ở đây là số ĐÃ ĐO. */}
              <span className="text-muted-foreground tnum text-[11.5px] leading-[1.7]">
                Tiền mua dòng của lô {dong(opened.cost)}
                {opened.costPerValidRow === null
                  ? ''
                  : ` · ${dong(opened.costPerValidRow)} một dòng hợp lệ`}
              </span>
              <span className="text-muted-foreground tnum text-[11.5px] leading-[1.7]">
                Lead truy về lô: {opened.leads} ({opened.leadsDirect} trực tiếp ·{' '}
                {opened.leadsIndirect} qua đăng ký)
                {opened.costPerLead === null ? '' : ` · ${dong(opened.costPerLead)} một lead`}
              </span>
              <span className="text-muted-foreground tnum text-[11.5px] leading-[1.7]">
                Hạn lưu {opened.retentionDays} ngày · hết hạn {dmy(opened.expiresAt)}
                {opened.expired ? ' · đã quá hạn' : ''}
              </span>
              <span className="text-muted-foreground text-[11.5px] leading-[1.7]">
                Dữ liệu cá nhân: {opened.hasPersonalData ? 'có' : 'không'}
              </span>
            </GlassCard>

            {/* Lô gọi tay và lô nuôi đợt là HAI chuyện, nên hai nhãn. DS-0108 có
                mã nguồn trong `sources` nhưng nguồn ấy không có đợt nào — gọi nó
                là "nguồn lô nuôi" là nói sai, và nhánh rỗng bên dưới thì không
                bao giờ chạy nên không thay được câu giải thích. */}
            <div className="flex flex-col gap-2">
              <span className="text-glass-foreground text-[11px]">
                {opened.handCalled ? 'Nguồn gọi tay' : 'Nguồn lô nuôi'}
              </span>
              {opened.sources.length === 0 ? (
                <span className="text-glass-foreground text-[12.5px] leading-[1.6]">
                  Lô này chưa gắn vào nguồn nào — mới nhập thì đó là chuyện bình thường.
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {opened.sources.map((s) => (
                    <Chip key={s} variant="source" onOpen={() => navigate(`/sales/campaigns/${s}`)}>
                      {s}
                    </Chip>
                  ))}
                </div>
              )}
              {opened.handCalled ? (
                <span className="text-glass-foreground text-[12.5px] leading-[1.6]">
                  Lô này không nuôi đợt gửi nào — người phụ trách gọi thẳng từng dòng. Không có "đợt
                  mở màn" để đối chiếu, và đó là kết quả đúng chứ không phải số còn thiếu.
                </span>
              ) : opened.openingSent === null ? null : (
                /* KHÔNG gọi là "đợt mở màn": đây là đợt ĐẦU TIÊN lô nuôi, mà với
                   DS-0106 đó là đợt 4 của CD-0102 và với DS-0107 là đợt 2 của
                   SK-0106. Chỉ 5 trên 7 lô là đợt mở màn thật. */
                <span className="text-glass-foreground tnum text-[12.5px] leading-[1.6]">
                  Đợt đầu tiên lô này nuôi gửi cho {grouped(opened.openingSent)} người — đúng bằng
                  số dòng hợp lệ của lô.
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-glass-foreground text-[11px]">Bộ lọc đã dùng</span>
              <div className="flex flex-wrap items-center gap-2">
                {opened.code ? <FilterPills code={opened.code} /> : null}
              </div>
            </div>

            <p className="text-muted-foreground text-[11.5px] leading-[1.6]">{opened.note}</p>
          </div>
        ) : null}
      </Drawer>
    </AppShell>
  )
}

/** Bảng hai cột cho hai bảng trùng — cùng một hình, khác nhau ở chỗ dòng kia
 *  nằm trong file hay nằm trong kho. */
function DupeTable({ rows }: { rows: ReviewRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Câu §5.2 lập luận kỹ nhất mà bảng đang im: ba khoá không ngang hàng, và
          chúng KHÔNG chạy hết — dừng ở khoá đầu tiên bắt được. Người đọc bảng
          cần biết một dòng khớp bằng "tên + tỉnh" thì yếu hơn khớp bằng MST. */}
      <p className="text-glass-foreground text-[12.5px] leading-[1.6]">
        Ba khoá chạy theo thứ tự, dừng ở khoá đầu tiên bắt được:{' '}
        {DEDUPE_KEYS.map((k) => `${k.label} · ${k.confidence}`).join(' → ')}.
      </p>
      <DataTable
        columns={[
          { header: 'Dòng', width: '0.7fr' },
          { header: 'Công ty', width: '2fr' },
          { header: 'Khớp với dòng nào', width: '1.2fr' },
          { header: 'Khớp bằng khoá nào', width: '1.4fr' },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          cells: [
            <span key="i" className="font-mono text-[11.5px]">
              {r.no}
            </span>,
            <span key="c" className="block truncate">
              {r.row.companyRaw ?? '—'}
            </span>,
            <span key="m" className="font-mono text-[11.5px]">
              {r.matchedWith ?? '—'}
            </span>,
            /* Nhãn tiếng Việt kèm độ tin, không phải khoá kỹ thuật `ten-tinh`. */
            <span key="k">{r.matchedBy ? dedupeKeyLabel(r.matchedBy) : '—'}</span>,
          ],
        }))}
      />
    </div>
  )
}

/** `'ten-tinh'` → `"Tên pháp nhân + tỉnh · tạm"`. Một thứ một tên hiển thị: bảng
 *  nhãn đã có ở tầng dữ liệu, màn không chép lại. */
function dedupeKeyLabel(key: NonNullable<ReviewRow['matchedBy']>): string {
  const k = DEDUPE_KEYS.find((x) => x.key === key)
  return k ? `${k.label} · ${k.confidence}` : key
}

/** Cặp nhãn–giá trị của bộ lọc một lô. Đọc thẳng từ kho, không gõ lại ở màn. */
function FilterPills({ code }: { code: string }) {
  const filters = FILTERS_OF.get(code) ?? []

  if (filters.length === 0)
    return (
      <span className="text-muted-foreground text-[12.5px] leading-[1.6]">
        Không lọc gì cả — người tự để lại thông tin thì không ai lọc.
      </span>
    )

  return (
    <>
      {filters.map((f) => (
        <MetaPill key={`${f.label}-${f.value}`} icon={Filter}>
          {f.label}: {f.value}
        </MetaPill>
      ))}
    </>
  )
}

export default ProspectListsPage
