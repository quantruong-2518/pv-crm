import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Archive,
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Eye,
  Inbox,
  Layers,
  MapPin,
  Megaphone,
  Pencil,
  Plus,
  Reply,
  Send,
  Sprout,
  Target,
  Trash2,
  TriangleAlert,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AiAction,
  AppShell,
  ApprovalChain,
  Avatar,
  Badge,
  Button,
  ChannelTag,
  Chip,
  ContextRail,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  Input,
  MetaPill,
  Progress,
  RichText,
  RichTextView,
  SectionTitle,
  Skeleton,
  StatCard,
  Timeline,
  cn,
  millions,
  percent,
  type TableSort,
  type TimelineItem,
} from '@pv/ui'
import {
  DAS_VINA_FROZEN_AT,
  DAY_FROZEN,
  dasVina,
  HEAD_OF_SALES,
  MARKETING,
  REQUIRED_SLOTS,
  dayISO,
  type SourceKind,
  type WaveChannel,
} from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { useSession } from '@/app/session'
import { dm } from '@/lib/date'
import {
  ANCHOR_SOURCE,
  DRAFT_STEP_DAYS,
  DRAFT_TEMPLATE,
  OPEN_VALUE,
  SOURCE_SORTS,
  campaignTotalsQuery,
  sourcesQuery,
  type DraftWave,
  type SourceRow,
  type SourceSortKey,
} from '@/data/campaigns'
import { CHANNEL_ICON, CHANNEL_LABEL, E4_CHANNELS } from '@/data/sales-config'

/** Module 1 · Chiến dịch & Sự kiện (docs/kien-truc-san-pham.md).
 *
 *  Module này trả câu "khách ở đâu ra". Nó từng tên là Thị trường và bị chặn vì
 *  cần dữ liệu thị trường ngoài — tức cần kịch bản thứ ba. Nhìn dưới góc chiến
 *  dịch thì câu hỏi vẫn thế mà dữ liệu nằm gọn trong DAS Vina.
 *
 *  Chủ màn là vai **Marketing**. Người gật vẫn là TP Kinh doanh.
 *
 *  HAI CHẾ ĐỘ, một màn (`mode`):
 *   · `list`          — sổ nguồn bên trái, chi tiết một nguồn bên phải. Cả hai
 *     khối tự cuộn bên trong, trang KHÔNG cuộn (`AppShell fill`).
 *   · `create`/`edit` — cùng MỘT form dàn ngang. Sửa dùng đúng màn tạo, không
 *     dựng màn thứ hai (docs · mục 1.6).
 *
 *  BA LUẬT màn này không được phá:
 *   · Mọi lần gửi đi qua E4 (E5 giữ kế hoạch, E4 giữ nhật ký + chống trùng).
 *     Màn không gọi API nền tảng nào. Ba kênh LinkedIn · Facebook · Website E4
 *     CHƯA mở đường — màn nói thẳng ra ở từng đợt thay vì giả vờ gửi được.
 *   · Luật 9 — mọi khối AI có "Căn cứ:", có nút, và có "Chưa tạo gì cả" ngay
 *     dưới nút.
 *   · Đợt được chấm bằng KỲ VỌNG đặt trước (`Wave.expected`), không phải bằng
 *     một điểm số màn tự nghĩ ra (docs · mục 1.7).
 *
 *  TÊN ENGINE KHÔNG LÊN GIAO DIỆN (luật 14). Chủ màn là Marketing; "E5 không
 *  bung đợt nào" không nói được gì với người đó. Trên màn viết bằng VIỆC — "hệ
 *  gửi đợt này", "hệ chưa nối đường gửi cho LinkedIn". Trong comment thì giữ
 *  nguyên E1…E5: đây mới là chỗ của chúng, vì người đọc comment là người sẽ nối
 *  dây.
 *
 *  HAI CHỖ DỄ ĐẶT NHÃN SAI — đọc trước khi sửa chữ trên màn:
 *   · `campaignTotals.leads` là **88**, không phải 100. Nó chỉ cộng lead của sáu
 *     nguồn CÓ ĐỢT; 12 lead còn lại đến từ hai nguồn tự nhiên, không đợt nào kéo
 *     chúng về nên không đợt nào được ghi công. Chỗ chênh in thẳng dưới hàng KPI
 *     (`totals.natural` + `totals.bookLeads`) chứ không bắt ai tự trừ.
 *   · `totals.sent` là LƯỢT GỬI, không phải người: CD-0101 gửi cùng một danh
 *     sách ba lần, SK-0106 quét lại đúng 143 người đã quét mã. Nhãn phải là
 *     "lượt", và hơn nửa số đó là số NGƯỜI TỰ NHẬP (`manualSent`) vì hai đợt
 *     LinkedIn/Facebook không có đường gửi thật.
 *
 *  `?source=SK-0103` — màn ĐỌC tham số này làm nguồn mở đầu, và khi bấm "Mở Sổ
 *  lead" thì GỬI nó sang module 2. Sự thật hôm nay: Sổ lead CHƯA đọc tham số
 *  đó và chưa có nút mở ngược về đây. Đường đã thông một chiều, đừng viết
 *  comment như thể cả hai chiều đã xong.
 *
 *  CỐ TÌNH KHÔNG LÀM: ba dòng đáng nhất nằm trên chính màn (`<NotDoing />` cuối
 *  cột chi tiết) vì người xem sẽ hỏi ngay. Phần còn lại ghi ở đây:
 *   · Không có ô "lượt xem / lượt hiển thị" ở hàng KPI. Module 1 đo bằng lead
 *     (docs · mục 1.4). Số gửi/mở/trả lời vẫn có, nhưng nằm trong timeline từng
 *     đợt để chẩn đoán — nó không được leo lên làm thước đo của phòng.
 *   · Không tách sự kiện thành màn riêng. Hai loại một khung, chỉ khác khối
 *     giữa (docs · "Hai loại, một khung").
 *   · Trình soạn nội dung dừng ở `<RichText>` (contentEditable, POC) — đậm,
 *     nghiêng, gạch đầu dòng, chèn ảnh, sửa HTML thô. KHÔNG kéo editor thật vào
 *     giai đoạn này: E5 chưa có mô hình nội dung, đổi ruột `RichText` sau này
 *     không đụng tới màn.
 *   · Đóng · theo dõi · người duyệt · nháp AI mới chỉ là state của màn, và cả
 *     bốn giữ theo MÃ nguồn ở tầng trang để đổi nguồn rồi quay lại thì việc vừa
 *     làm còn nguyên. Chỗ nối E3 (đóng và duyệt là yêu cầu chờ gật) và E4 (theo
 *     dõi là đăng ký nhận thông báo) ghi ngay tại chỗ bấm.
 *   · Màn KHÔNG tự cộng số nghiệp vụ. Mọi tổng, mọi tỉ lệ và mọi phép so đạt/hụt
 *     nằm ở `data/campaigns.ts`; một phép chia viết trong JSX là một phép chia
 *     không ai test được.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */

const KINDS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'chien-dich', label: 'Chiến dịch' },
  { key: 'su-kien', label: 'Sự kiện' },
  { key: 'tu-nhien', label: 'Tự nhiên' },
] as const

const KIND_LABEL: Record<SourceKind, string> = {
  'chien-dich': 'Chiến dịch',
  'su-kien': 'Sự kiện',
  'tu-nhien': 'Tự nhiên',
}

const KIND_TONE: Record<SourceKind, 'running' | 'success' | 'draft'> = {
  'chien-dich': 'running',
  'su-kien': 'success',
  'tu-nhien': 'draft',
}

/** Icon định danh của LOẠI nguồn — cùng vai trò với `CHANNEL_ICON` của kênh:
 *  nhìn hình là biết dòng đó là chiến dịch chạy trên kênh, một buổi có mặt người
 *  thật, hay khách tự tìm tới. */
const KIND_ICON: Record<SourceKind, LucideIcon> = {
  'chien-dich': Megaphone,
  'su-kien': CalendarCheck,
  'tu-nhien': Sprout,
}

/** Kênh gửi đọc từ module 5 · Cấu hình, KHÔNG khai lại ở đây.
 *
 *  Trước 19/08 màn này giữ bản sao `CHANNEL_LABEL` + `E4_CHANNELS` của riêng
 *  nó, vì E4 mới có `type Channel` — một kiểu, không phải danh sách chạy được.
 *  Bản sao đó phá đúng luật 1 của module 5 ("cấu hình là dữ liệu, không màn nào
 *  giữ bản sao một hằng số"), và hai bản sao thì sớm muộn lệch nhau.
 *
 *  Bốn kênh E4 đã mở đường; ba kênh còn lại là nền tảng đăng bài ra ngoài — nợ
 *  treo số 2 của docs. Đây là ranh giới thật chứ không phải cách tô màu: đợt
 *  nằm ngoài bốn kênh đó thì hệ chỉ giữ lịch, người phải tự đăng. */
const sendsViaE4 = (c: WaveChannel) => E4_CHANNELS.includes(c)

const CHANNELS = Object.keys(CHANNEL_LABEL) as WaveChannel[]

/** Vai của từng người, tra theo tên — dùng ở chuỗi duyệt. Lấy từ `actors`, đây
 *  là chỗ duy nhất biết "Trần Thu Hà" làm gì. */
const ROLE_OF = new Map(dasVina.actors.map((a) => [a.name, a.role]))

/** Kỳ của kịch bản, đọc từ fixture. Ngày đầu kỳ là mốc 0 của `dayISO`, ngày
 *  cuối là lúc kịch bản đóng băng — không gõ hai con số này ra tay. */
const PERIOD = `${dm(dayISO(0))} → ${dm(DAS_VINA_FROZEN_AT)}`

/** Ô "Kênh" của bảng chỉ đủ chỗ cho ba hình; dư thì gộp thành "+n" chứ không
 *  đẩy dòng cao lên — dòng bảng cao cố định 44px. */
const MAX_CHANNEL_TAGS = 3

/** Số nguyên có dấu chấm ngăn nghìn (luật 6). `millions`/`percent` của @pv/ui lo
 *  phần tiền và tỉ lệ; số người nhận không thuộc hai loại đó. */
const grouped = (n: number) => n.toLocaleString('vi-VN')

/** Kênh nguồn đã dùng, theo thứ tự đợt và không lặp. */
const channelsOf = (source: SourceRow): WaveChannel[] => [
  ...new Set(source.waves.map((w) => w.channel)),
]

export function CampaignsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm chiến dịch, sự kiện, đợt gửi…' })
  const navigate = useNavigate()
  /* Người đang đăng nhập là người bấm "Theo dõi" — không hỏi tên, không cho
     chọn hộ người khác. */
  const me = useSession((s) => s.actor?.name ?? null)

  const { data: sources = [], isPending } = useQuery(sourcesQuery)
  const { data: totals } = useQuery(campaignTotalsQuery)

  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
  const [kind, setKind] = useState<(typeof KINDS)[number]['key']>('all')
  /* Thứ tự bảng là state của MÀN, không phải của `DataTable` — bảng chỉ vẽ mũi
     tên và báo người dùng vừa bấm cột nào. Mặc định mới nhất lên trước. */
  const [sort, setSort] = useState<{ key: SourceSortKey; dir: TableSort['dir'] }>({
    key: 'ngay',
    dir: 'desc',
  })
  /* Màn Sổ lead sẽ mở sang đây bằng `?source=SK-0103` khi hồ sơ lead có nút mở
     ngược — hôm nay CHƯA có nút đó, nên tham số này thực tế chỉ đến từ link ai
     đó dán tay. Đọc nó vẫn đúng: chiều ngược lại (màn này gửi mã sang Sổ lead)
     đã thông, và F5 phải về đúng nguồn ghi trong đường dẫn.
     Chỉ dùng làm giá trị KHỞI TẠO: bấm sang nguồn khác thì đường dẫn không đổi
     theo. */
  const [params] = useSearchParams()
  const [pickedCode, setPickedCode] = useState<string>(params.get('source') ?? ANCHOR_SOURCE)
  /* Bốn state dưới là POC: chúng sống trong màn vì chưa có backend giữ. Mỗi chỗ
     bấm ghi rõ engine nào sẽ nhận việc. Giữ theo MÃ nguồn chứ không giữ trong
     panel chi tiết: panel bị `key` dựng lại mỗi lần đổi nguồn, nên state nằm
     trong đó sẽ bốc hơi khi người dùng quay lại. */
  const [closed, setClosed] = useState<string[]>([])
  const [followers, setFollowers] = useState<Record<string, string[]>>({})
  const [drafted, setDrafted] = useState<string[]>([])
  /** Vào form bằng nút "Thêm đợt vào chuỗi" thì form mở sẵn một đợt trống ở cuối. */
  const [seedWave, setSeedWave] = useState(false)

  /* Luật 13 · bấm "Huỷ" xong thì focus rơi về `<body>` vì cả cây con vừa biến
     mất. Đưa focus về đầu sổ nguồn — người dùng bàn phím quay lại đúng chỗ họ
     rời đi, không phải Tab lại từ đầu trang. */
  const listHeadRef = useRef<HTMLDivElement>(null)
  const backToList = useRef(false)

  useEffect(() => {
    if (mode !== 'list' || !backToList.current) return
    backToList.current = false
    listHeadRef.current?.focus()
  }, [mode])

  const visible = useMemo(() => {
    const list = sources.filter((s) => kind === 'all' || s.kind === kind)
    const compare = SOURCE_SORTS.find((s) => s.key === sort.key)?.compare
    if (!compare) return list
    /* `compare` của tầng data LUÔN tăng dần — hướng là việc của màn. Nhét hướng
       vào bảng sắp xếp thì mỗi mục phải có hai bản và hai bản sẽ lệch nhau. */
    const asc = [...list].sort(compare)
    return sort.dir === 'asc' ? asc : asc.reverse()
  }, [sources, kind, sort])

  /* Nguồn đang mở phải NẰM TRONG bộ lọc đang bật. Tìm trên `sources` chưa lọc
     thì lọc sang "Sự kiện" trong khi đang mở một chiến dịch sẽ để panel phải
     bày một nguồn không có mặt trên bảng.

     Rơi ra ngoài thì tụt về nguồn đầu của bộ lọc — không ghi đè `pickedCode`,
     nên bỏ lọc ra là nguồn cũ tự mở lại. */
  const picked = visible.find((s) => s.code === pickedCode) ?? visible[0] ?? null

  /* Lối ra của mọi EmptyState: mở một nguồn thì phải mở luôn bộ lọc đang giấu
     nó, nếu không người dùng bấm nút mà màn không đổi gì. */
  const openSource = (code: string) => {
    setKind('all')
    setPickedCode(code)
  }

  const toggleSort = (key: string) => {
    const found = SOURCE_SORTS.find((s) => s.key === key)
    if (!found) return
    setSort((cur) =>
      cur.key === found.key
        ? { ...cur, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { key: found.key, dir: 'desc' },
    )
  }

  const openForm = (next: 'create' | 'edit', withEmptyWave = false) => {
    setSeedWave(withEmptyWave)
    setMode(next)
  }

  const leaveForm = () => {
    setSeedWave(false)
    backToList.current = true
    setMode('list')
  }

  /** Người theo dõi hiện tại của một nguồn: fixture là điểm xuất phát, state của
   *  màn đè lên khi có người bấm. */
  const followersOf = (source: SourceRow) => followers[source.code] ?? source.followers

  const toggleFollow = (source: SourceRow) => {
    if (!me) return
    const now = followersOf(source)
    setFollowers((prev) => ({
      ...prev,
      [source.code]: now.includes(me) ? now.filter((n) => n !== me) : [...now, me],
    }))
    /* Nối E4 khi có backend: theo dõi là ĐĂNG KÝ NHẬN THÔNG BÁO của nguồn này —
       đợt chạy xong, số hụt kỳ vọng, chiến dịch bị đóng đều bắn về đây. Nhiều
       người cùng theo dõi một sự kiện là chuyện thường, nên đây là danh sách
       chứ không phải một ô "người phụ trách thứ hai". */
  }

  /* Luật 10 · ContextRail dựng thẳng từ E1 và nằm ở TẦNG MÀN, không nằm trong
     một panel — hai chế độ là hai việc của cùng một màn, rail không được biến
     mất khi người dùng sang form.

     Chiến dịch chưa có `ObjectKind` riêng trong E1 (nợ đã ghi ở docs) nên rail
     đi qua đơn tiêu biểu mà nguồn đang mở đã đẻ ra — `anchorDeal` tính sẵn ở
     tầng data. Nguồn chưa đẻ đơn nào thì rail hiện đúng một chip của chính nó,
     chứ không biến mất.

     Chip azure là object ĐANG MỞ, mọi chip còn lại là object liên quan (luật 10
     + docblock của `context-rail.tsx`). Không có `onOpen`: E1 chưa mở được
     object của nhánh này, mà một chip bấm được rồi không xảy ra gì còn tệ hơn
     một chip đứng yên — nó còn chiếm một điểm dừng của phím Tab. */
  const story = picked?.anchorDeal ? dasVina.graph.story(picked.anchorDeal) : []
  const rail =
    story.length > 0
      ? story.map((o) => ({ code: o.code, source: o.code === picked?.anchorDeal }))
      : [{ code: picked?.code ?? ANCHOR_SOURCE, source: false }]

  return (
    <AppShell
      /* BottomNav chỉ có bốn mục Core; màn nhánh không nằm trong đó nên giữ
         'home' làm mục sáng — người dùng dưới lg vẫn về được Core. */
      activeNav="home"
      approvalsCount={chrome.approvalsCount}
      sidebar={chrome.sidebar}
      topbar={chrome.topbar}
      /* Yêu cầu "nội dung vừa màn hình": từ lg trở lên trang không cuộn, chỉ hai
         khối chính tự cuộn bên trong. Dưới lg vẫn cuộn trang như mọi màn. */
      fill
    >
      <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">
              Chiến dịch &amp; Sự kiện
            </h2>
            <p className="text-muted-foreground mt-1 text-[12px]">
              DAS Vina · kỳ <span className="font-mono">{PERIOD}</span> · chủ màn {MARKETING} ·
              người gật {HEAD_OF_SALES}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <ContextRail objects={rail} />
            {mode === 'list' ? (
              <Button size="md" onClick={() => openForm('create')}>
                <Icon icon={Plus} size={16} />
                Chiến dịch mới
              </Button>
            ) : null}
          </div>
        </div>

        {mode === 'list' ? (
          <>
            {/* Sáu ô này đo CHIẾN DỊCH: bao nhiêu nguồn có người chạy, bao nhiêu
                đợt đã gửi, chạm được bao nhiêu lượt, và các tỉ lệ rút ra từ đó.
                Số lead chi tiết là việc của module 2 — ở đây lead chỉ xuất hiện
                dưới dạng "đạt bao nhiêu phần kỳ vọng".

                Điểm gãy là `lg`, giống màn Performance: ba thiết bị của luật 3,
                không đẻ điểm gãy thứ tư. Để `md` thì ở 768–1023px hai màn cạnh
                nhau hiện 3 cột và 2 cột cho cùng một loại thẻ. */}
            {totals ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                  <StatCard
                    size="compact"
                    icon={Megaphone}
                    value={String(totals.running)}
                    label="Chiến dịch đã chạy đợt"
                    hint={`${totals.sources} nguồn cả kỳ · ${totals.events} sự kiện`}
                  />
                  <StatCard
                    size="compact"
                    icon={Layers}
                    value={String(totals.waves)}
                    label="Đợt đã gửi"
                    hint={`${totals.manualWaves} đợt người tự đăng`}
                  />
                  {/* "Lượt", không phải "người": cùng một danh sách bị gửi lại ở
                      đợt nhắc, và người quét mã ở gian hàng bị đếm lại ở đợt
                      sau. Số người thật nhỏ hơn nhiều lần và kịch bản không có
                      nó — nói "lượt" là nói đúng thứ đang cộng. */}
                  <StatCard
                    size="compact"
                    icon={Users}
                    value={grouped(totals.sent)}
                    label="Lượt tiếp cận"
                    hint={`mở ${percent(totals.openRate)} · ${grouped(totals.manualSent)} lượt là số người tự nhập`}
                  />
                  <StatCard
                    size="compact"
                    icon={Reply}
                    value={percent(totals.replyRate)}
                    label="Tỉ lệ trả lời"
                    hint={`${totals.replied} người trả lời · ${totals.manualWaves} đợt trong đó nhập số bằng tay`}
                  />
                  <StatCard
                    size="compact"
                    icon={Target}
                    value={percent(totals.hitRate)}
                    label="Đạt kỳ vọng lead"
                    hint={`${totals.leads}/${totals.expected} lead từ các đợt`}
                  />
                  <StatCard
                    size="compact"
                    icon={Wallet}
                    value={totals.costPerGood === null ? '—' : millions(totals.costPerGood)}
                    label="Chi phí mỗi lead tốt"
                    hint={`đã tiêu ${millions(totals.cost)}`}
                  />
                </div>

                {/* Chỗ chênh giữa 88 và 100 nói thẳng ở đây. Không có dòng này
                    thì người đọc phải tự trừ hai con số nằm cách nhau nửa màn,
                    rồi đi tìm xem 12 lead kia đâu mất. */}
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  {totals.natural.count} nguồn tự nhiên kéo thêm {totals.natural.leads} lead, không
                  đợt nào ghi công — cả sổ {totals.bookLeads} dòng nằm ở Sổ lead.
                </p>
              </div>
            ) : (
              <Skeleton className="h-20 w-full" />
            )}

            <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[1.45fr_1fr]">
              {/* Bảng LUÔN nằm trên glass-b — luật 8. */}
              <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:min-h-0">
                <div ref={listHeadRef} tabIndex={-1} className="outline-none">
                  <SectionTitle
                    size="sm"
                    kicker="Nguồn của kỳ"
                    /* Câu giải thích cột "Giá trị" nằm ở ĐÂY, một lần. Trước nó
                       là `title` của từng ô — vô hình với cảm ứng và bàn phím,
                       lại in ra cả trên dòng đang hiện "—". */
                    hint={`${visible.length}/${sources.length} nguồn đang hiện · bấm một dòng để mở chi tiết. ${OPEN_VALUE.label}: cộng ${OPEN_VALUE.deals} đơn đang mở trong kỳ; ${OPEN_VALUE.signedDeals} hợp đồng đã ký không có số tiền trong kịch bản.`}
                    actions={
                      /* Bộ lọc gọn: bốn loại nằm cùng hàng tiêu đề, không chiếm một
                         hàng riêng và không có nhãn "Loại" đứng trước — bốn chữ đã
                         tự nói ra chúng là loại gì. */
                      <div className="flex flex-wrap items-center gap-1">
                        {KINDS.map((k) => (
                          <Button
                            key={k.key}
                            size="sm"
                            variant={kind === k.key ? 'default' : 'ghost'}
                            onClick={() => setKind(k.key)}
                            className={cn(kind === k.key && 'shadow-primary')}
                          >
                            {k.label}
                          </Button>
                        ))}
                      </div>
                    }
                  >
                    Đợt nào ra khách
                  </SectionTitle>
                </div>

                <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  {isPending ? (
                    <div className="flex flex-col gap-3">
                      <Skeleton className="h-11 w-full" />
                      <Skeleton className="h-11 w-full" />
                      <Skeleton className="h-11 w-full" />
                    </div>
                  ) : visible.length === 0 ? (
                    <EmptyState
                      icon={Inbox}
                      message="Không có nguồn nào thuộc loại đang lọc."
                      action={{ label: 'Xem tất cả', onClick: () => setKind('all') }}
                      className="py-12"
                    />
                  ) : (
                    <DataTable
                      sort={sort}
                      onSort={toggleSort}
                      columns={[
                        { header: 'Mã', width: '1.1fr' },
                        { header: 'Tên', width: '1.9fr' },
                        { header: 'Kênh', width: '0.9fr' },
                        { header: 'Bắt đầu', width: '0.9fr', sortKey: 'ngay' },
                        { header: 'Lead', width: '0.5fr', align: 'right' },
                        { header: 'MQL', width: '0.6fr', align: 'right', sortKey: 'mql' },
                        {
                          header: OPEN_VALUE.shortLabel,
                          width: '0.9fr',
                          align: 'right',
                          sortKey: 'gia-tri',
                        },
                      ]}
                      rows={visible.map((s) => {
                        const chans = channelsOf(s)
                        return {
                          id: s.code,
                          /* Sáng theo `picked` chứ không theo `pickedCode`: dòng
                             sáng phải là dòng mà panel bên phải đang mở. */
                          state: s.code === picked?.code ? 'selected' : 'default',
                          /* Yêu cầu 4 · CẢ DÒNG mở chi tiết. Chip mã không còn
                             `onOpen`: hai vùng bấm chồng nhau trên một dòng chỉ
                             làm người dùng đoán xem phải bấm chỗ nào. */
                          onOpen: () => setPickedCode(s.code),
                          cells: [
                            /* Chip mã luôn `object`. Dòng đang chọn đã có nền
                               azure và vệt azure bên trái; tô azure cho chip
                               trong đó là vệt thứ ba nói cùng một tin (luật 3). */
                            <span key="c" className="flex items-center gap-2">
                              <Icon
                                icon={KIND_ICON[s.kind]}
                                size={16}
                                className="text-muted-foreground"
                              />
                              <Chip variant="object">{s.code}</Chip>
                            </span>,
                            <span key="l" className="block truncate">
                              {s.label}
                            </span>,
                            <span key="ch" className="flex items-center gap-1">
                              {chans.length === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : null}
                              {chans.slice(0, MAX_CHANNEL_TAGS).map((c) => (
                                <ChannelTag
                                  key={c}
                                  iconOnly
                                  icon={CHANNEL_ICON[c]}
                                  label={CHANNEL_LABEL[c]}
                                  tone={sendsViaE4(c) ? 'default' : 'warning'}
                                />
                              ))}
                              {chans.length > MAX_CHANNEL_TAGS ? (
                                <span className="text-muted-foreground text-[11px]">
                                  +{chans.length - MAX_CHANNEL_TAGS}
                                </span>
                              ) : null}
                            </span>,
                            <MetaPill key="d" mono icon={CalendarDays}>
                              {dm(s.startISO)}
                            </MetaPill>,
                            <span key="n" className="tnum font-num">
                              {s.leads}
                            </span>,
                            <span key="m" className="tnum font-num">
                              {percent(s.mqlRate)}
                            </span>,
                            <span key="v" className="tnum font-num">
                              {s.value === 0 ? '—' : millions(s.value)}
                            </span>,
                          ],
                        }
                      })}
                    />
                  )}
                </div>
              </GlassCard>

              {/* Panel phải đọc CÙNG `isPending` với bảng bên trái. Chỉ nhìn
                  `picked` thì lúc đang chờ dữ liệu nó bày EmptyState kèm nút "Mở
                  nguồn mồi" — mà bấm nút đó lúc ấy không đổi gì, vì nguồn mồi
                  vốn đã là giá trị khởi tạo. */}
              {isPending ? (
                <GlassCard variant="b" className="flex flex-col gap-4 p-5">
                  <SectionTitle size="sm">Nguồn đang mở</SectionTitle>
                  <Skeleton className="h-48 w-full" />
                </GlassCard>
              ) : picked ? (
                <SourceDetail
                  key={picked.code}
                  source={picked}
                  closed={closed.includes(picked.code)}
                  followers={followersOf(picked)}
                  me={me}
                  drafted={drafted.includes(picked.code)}
                  onEdit={() => openForm('edit')}
                  onAddWave={() => openForm('edit', true)}
                  onClose={() => setClosed((prev) => [...prev, picked.code])}
                  onToggleFollow={() => toggleFollow(picked)}
                  onDraft={() => setDrafted((prev) => [...prev, picked.code])}
                  onOpenLeads={() => navigate(`/sales/leads?source=${picked.code}`)}
                />
              ) : (
                <GlassCard variant="b" className="flex flex-col gap-4 p-5">
                  <SectionTitle size="sm">Nguồn đang mở</SectionTitle>
                  <EmptyState
                    icon={Inbox}
                    message="Chọn một dòng để xem chuỗi đợt và số của nó."
                    action={{ label: 'Mở nguồn mồi', onClick: () => openSource(ANCHOR_SOURCE) }}
                    className="py-8"
                  />
                </GlassCard>
              )}
            </div>
          </>
        ) : (
          <CampaignForm
            key={`${mode}-${picked?.code ?? ''}`}
            mode={mode}
            code={picked?.code}
            initial={draftOf(mode === 'edit' ? picked : null, seedWave)}
            seededWave={seedWave}
            sources={sources}
            onCancel={leaveForm}
          />
        )}
      </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------

/** Chi tiết một nguồn: nó là cái gì, ai giữ, đo được gì, chuỗi đợt chạy ra sao.
 *
 *  Panel này là `.glass-b`, KHÔNG phải `.glass-a`. Hai lý do, cả hai là luật:
 *   · luật 13 — bên trong có bốn `StatCard`, mà `StatCard` tự nó là một
 *     `GlassCard`. Xếp `.glass-a` trong `.glass-a` thì hai lớp trắng .085 chồng
 *     nhau và `backdrop-filter` chạy hai lần: `label`/`hint` của bốn thẻ đó tụt
 *     xuống 3.56–4.16:1 ở MỌI vị trí trên màn. Trên `.glass-b` (gần đục, tối
 *     hơn nền) chúng đo được 5.28:1.
 *   · §2 — `.glass-b` là mặt của "sidebar phải, list dài", và panel này giữ một
 *     timeline tự cuộn.
 *
 *  Timeline là hình đúng của một chiến dịch: đợt nối đợt theo thời gian, mỗi đợt
 *  nói rõ ngày nào, gửi bằng gì, ra bao nhiêu lead TRÊN KỲ VỌNG bao nhiêu. Chấm
 *  trạng thái và thanh tiến độ đọc CÙNG một phép so `w.hit` tính ở tầng data —
 *  hai ký hiệu cho một sự kiện thì không được lệch màu nhau. */
function SourceDetail({
  source,
  closed,
  followers,
  me,
  drafted,
  onEdit,
  onAddWave,
  onClose,
  onToggleFollow,
  onDraft,
  onOpenLeads,
}: {
  source: SourceRow
  closed: boolean
  followers: string[]
  me: string | null
  drafted: boolean
  onEdit: () => void
  onAddWave: () => void
  onClose: () => void
  onToggleFollow: () => void
  onDraft: () => void
  onOpenLeads: () => void
}) {
  const following = me !== null && followers.includes(me)
  /* Nguồn tự nhiên không có gì để đóng và không có gì để sửa: không ai mở nó ra
     cả, `waves` rỗng, và cụm nút Loại của form chỉ có chiến dịch/sự kiện — mở
     form sửa cho nó là mở một ngõ cụt cứng. */
  const runnable = source.waves.length > 0
  const editable = source.kind !== 'tu-nhien'

  const status = closed
    ? { label: 'Đã đóng', tone: 'draft' as const }
    : source.waves.length === 0
      ? { label: 'Không có đợt', tone: 'draft' as const }
      : source.finished
        ? { label: 'Đã chạy xong', tone: 'success' as const }
        : { label: 'Đang chạy', tone: 'running' as const }

  const items: TimelineItem[] = source.waves.map((w) => ({
    id: String(w.no),
    /* Ba trạng thái thật: đạt kỳ vọng · hụt kỳ vọng · chưa tới ngày chạy. Kịch
       bản đóng băng không có đợt nào thuộc loại thứ ba, nhưng xử lý cho đúng để
       một fixture khác không làm màn nói dối. */
    state: w.day > DAY_FROZEN ? 'next' : w.hit ? 'ok' : 'warning',
    marker: `Đợt ${w.no}`,
    title: w.label,
    meta: (
      <>
        <MetaPill mono icon={CalendarDays}>
          {dm(dayISO(w.day))}
        </MetaPill>
        <ChannelTag
          icon={CHANNEL_ICON[w.channel]}
          label={CHANNEL_LABEL[w.channel]}
          tone={sendsViaE4(w.channel) ? 'default' : 'warning'}
        />
      </>
    ),
    children: (
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">
          gửi <span className="tnum font-num">{w.sent}</span> · mở{' '}
          <span className="tnum font-num">{w.opened}</span> · trả lời{' '}
          <span className="tnum font-num">{w.replied}</span>
        </span>
        <Progress
          value={w.hitRate}
          label={`${w.leads} lead trên kỳ vọng ${w.expected}`}
          tone={w.hit ? 'success' : 'warning'}
        />
        {sendsViaE4(w.channel) ? null : (
          <span className="text-warning flex items-start gap-2 text-[11px] leading-[1.5]">
            <Icon icon={TriangleAlert} size={16} />
            Hệ chưa nối đường gửi cho {CHANNEL_LABEL[w.channel]} — đợt này người tự đăng, số ở trên
            là số nhập tay.
          </span>
        )}
      </div>
    ),
  }))

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:min-h-0">
      <div className="flex flex-wrap items-center gap-2">
        <Icon icon={KIND_ICON[source.kind]} size={18} className="text-accent-foreground" />
        <span className="min-w-0 flex-1 text-[15px] font-semibold">{source.label}</span>
        <Badge tone={KIND_TONE[source.kind]}>{KIND_LABEL[source.kind]}</Badge>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {/* Ngày · mã · tên người là ba thứ hay bị chôn trong câu chữ — tách ra
            thành pill để mắt bắt được ngay (yêu cầu 7). */}
        <div className="flex flex-wrap items-center gap-2">
          <MetaPill mono>{source.code}</MetaPill>
          {/* Nguồn không đợt thì KHÔNG có khoảng: `lastDay` của nó bằng chính
              `startDay`, in ra thành "04/05 → 04/05" đọc hệt như "nguồn này sống
              đúng một ngày" — trong khi nó chảy suốt kỳ. */}
          <MetaPill mono icon={CalendarDays}>
            {runnable
              ? `${dm(source.startISO)} → ${dm(source.lastISO)}`
              : `từ ${dm(source.startISO)}`}
          </MetaPill>
          <MetaPill avatar={source.owner}>{source.owner}</MetaPill>
          {source.venue ? <MetaPill icon={MapPin}>{source.venue}</MetaPill> : null}
        </div>

        {/* Nút nghiệp vụ, không phải nút phụ: `md` (h-10) chứ không `sm` (h-8).
            iPad dọc 768px chạy đúng layout này bằng ngón tay vì AppShell bỏ
            sidebar dưới `lg`. */}
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <Button size="md" variant="ghost" disabled={closed} onClick={onEdit}>
              <Icon icon={Pencil} size={16} />
              Sửa
            </Button>
          ) : null}

          {runnable && !closed ? (
            <Button
              size="md"
              variant="ghost"
              onClick={() => {
                onClose()
                /* Nối E3 khi có backend: đóng một chiến dịch là YÊU CẦU DUYỆT,
                   không phải một cái công tắc — đóng xong thì chi phí đã tiêu
                   chốt sổ và công trạng Marketing tính trên con số đó. */
              }}
            >
              <Icon icon={Archive} size={16} />
              Đóng {KIND_LABEL[source.kind].toLowerCase()}
            </Button>
          ) : null}

          <Button
            size="md"
            variant={following ? 'default' : 'ghost'}
            disabled={me === null}
            onClick={onToggleFollow}
          >
            <Icon icon={Eye} size={16} />
            {following ? 'Bỏ theo dõi' : 'Theo dõi'}
          </Button>

          {followers.length > 0 ? (
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                {followers.map((name) => (
                  <Avatar key={name} name={name} size="sm" />
                ))}
              </span>
              <span className="text-muted-foreground text-[11px]">
                {followers.length} người theo dõi
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground text-[11px]">Chưa ai theo dõi</span>
          )}
        </div>

        {/* Score card của CHÍNH nguồn này — bốn câu hỏi khác hàng KPI ở trên:
            trên kia là cả kỳ, dưới này là một chiến dịch. */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            size="compact"
            icon={Target}
            value={source.expected > 0 ? percent(source.hitRate) : '—'}
            label="Đạt kỳ vọng lead"
            hint={
              source.expected > 0
                ? `${source.leads} lead trên kỳ vọng ${source.expected}`
                : `${source.leads} lead · không đợt nào đặt kỳ vọng`
            }
          />
          <StatCard
            size="compact"
            icon={Reply}
            value={source.sent > 0 ? percent(source.replyRate) : '—'}
            label="Tỉ lệ trả lời"
            hint={
              source.sent > 0
                ? `${source.replied} trả lời trên ${source.sent} lượt gửi`
                : 'không đợt nào gửi đi'
            }
          />
          <StatCard
            size="compact"
            icon={Wallet}
            value={source.costPerGood === null ? '—' : millions(source.costPerGood)}
            label="Chi phí mỗi lead tốt"
            hint={`đã tiêu ${millions(source.cost)}`}
          />
          {/* Ô thứ tư đổi theo loại: sự kiện đo bằng người ĐẾN, chiến dịch đo
              bằng lead qua cổng. `attendRate` null nghĩa là không phải sự kiện,
              không phải "chưa ai đến".

              Nhãn là "Tỉ lệ MQL" chứ không phải "Tỉ lệ qua cổng": cột bảng bên
              trái đã gọi đúng chỉ số này là MQL, và một màn không được có hai
              tên cho một con số. */}
          {source.attendRate === null ? (
            <StatCard
              size="compact"
              icon={Users}
              value={percent(source.mqlRate)}
              label="Tỉ lệ MQL"
              hint={`${source.good}/${source.leads} lead qua cổng ${REQUIRED_SLOTS} ô bắt buộc`}
            />
          ) : (
            <StatCard
              size="compact"
              icon={Users}
              value={percent(source.attendRate)}
              label="Tỉ lệ có mặt"
              hint={`${source.checkedIn}/${source.registered} người đến trên số đăng ký`}
            />
          )}
        </div>

        {source.waves.length === 0 ? (
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Nguồn tự nhiên — không ai chạy đợt nào. {source.leads} lead về từ đây là khách tự tìm
            tới hoặc do người trong phòng tự mở, nên không có chuỗi đợt để vẽ và không có kỳ vọng để
            chấm.
          </p>
        ) : (
          <>
            <SectionTitle
              size="sm"
              hint={`${source.waves.length} đợt · chuỗi trải ${source.runDays} ngày · mọi lần gửi đi qua hệ gửi chung, màn không tự gọi nền tảng nào`}
            >
              Chuỗi đợt
            </SectionTitle>
            <Timeline items={items} />
            {closed ? (
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Chiến dịch đã đóng — chuỗi không nhận thêm đợt và nội dung không sửa được nữa. Mở
                lại là một yêu cầu duyệt khác.
              </p>
            ) : (
              <Button size="md" variant="ghost" className="self-start" onClick={onAddWave}>
                <Icon icon={Plus} size={16} />
                Thêm đợt vào chuỗi
              </Button>
            )}
          </>
        )}

        {/* Luật 9 · khối AI có "Căn cứ:", có nút, và có state "Chưa tạo gì cả".
            Đề xuất đổi theo nhánh: nguồn KHÔNG có đợt thì không thể đề xuất "đợt
            tiếp theo", và một căn cứ "0 đợt đã chạy · 7 lead trên kỳ vọng 0"
            không phải là căn cứ. */}
        <AiAction
          variant="panel"
          suggestion={
            runnable
              ? `Soạn đợt tiếp theo cho ${source.code} — nhắm ${source.notGood} lead chưa qua cổng, hỏi đúng ô còn thiếu.`
              : `Mở đợt đầu tiên cho ${source.code} — nhắm đúng nhóm khách nguồn này đang tự kéo về.`
          }
          basis={
            runnable
              ? `${source.waves.length} đợt đã chạy · ${source.leads} lead trên kỳ vọng ${source.expected} · ${source.good} lead đủ ${REQUIRED_SLOTS} ô bắt buộc`
              : `${source.leads} lead đã về mà không đợt nào kéo · ${source.good} lead qua cổng, tức ${percent(source.mqlRate)}`
          }
          confirmLabel="Soạn nội dung"
          done={drafted}
          onConfirm={() => {
            onDraft()
            /* Nối E3 khi có backend: `proposeFromAi` với basis ở trên. Đề xuất
               vào hệ ở trạng thái `waiting`, chờ TP Kinh doanh gật rồi E5 mới
               bung đợt và bắn xuống E4. */
          }}
        />
        {drafted ? (
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Bản nháp chưa rời màn này — chưa có ai nhận. Chưa có màn Hộp duyệt để gửi tới; khi có
            backend, bản soạn đi tới {HEAD_OF_SALES} rồi mới có đợt nào được bung.
          </p>
        ) : (
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Chưa tạo gì cả. Trợ lý chỉ soạn khi có người bấm, và bản soạn vẫn phải qua{' '}
            {HEAD_OF_SALES} trước khi đợt được gửi.
          </p>
        )}

        {/* Bảng lead đã rời khỏi màn này — lý do nằm ngay dưới, trong khối "Cố
            tình không làm". Còn lại đúng một con số và một lối đi; module 2 là
            nơi thao tác trên lead. */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white/5 p-4">
          <span className="text-[11.5px] leading-[1.5]">
            <span className="tnum font-num">{source.good}</span>/
            <span className="tnum font-num">{source.leads}</span> lead của nguồn này đã qua cổng
            init data
          </span>
          <Button size="md" variant="ghost" onClick={onOpenLeads}>
            <Icon icon={ArrowRight} size={16} />
            Mở Sổ lead
          </Button>
        </div>

        <NotDoing />
      </div>
    </GlassCard>
  )
}

/** Cố tình không làm — ba thứ bị bỏ có chủ ý, kèm lý do.
 *
 *  Khối này ở lại trên màn (không phải trong comment) vì cả ba là câu người xem
 *  hỏi ngay trong buổi demo đầu tiên: "lead đâu", "sao không gửi luôn được",
 *  "sao không có biểu đồ". Trả lời một lần trên màn rẻ hơn trả lời mười lần.
 *
 *  Không dùng `GlassCard`: nó đang nằm trong panel `.glass-b` rồi, thêm một mặt
 *  kính nữa là thêm một lớp nền (luật 12). */
function NotDoing() {
  const items = [
    {
      title: 'Không có bảng lead trên màn này',
      body: 'Lead thuộc module 2. Cùng một dòng lead mà thao tác được ở hai màn thì không màn nào là nơi đúng để tra. Ở đây còn đúng một con số "đã qua cổng" và một lối sang Sổ lead.',
    },
    {
      title: 'Không có nút "Gửi ngay"',
      body: 'Nút cuối của form là gửi duyệt. Chuỗi duyệt do hệ giữ, và không đợt nào bung ra trước khi có người gật.',
    },
    {
      title: 'Không vẽ đường theo thời gian',
      body: `Kịch bản là một lát cắt đóng băng ${dm(DAS_VINA_FROZEN_AT)}. Dựng trục tháng-quý là phải đẻ số không ai ký.`,
    },
  ]

  return (
    <div className="flex flex-col gap-3 rounded-md bg-white/5 p-4">
      <h3 className="text-[12.5px] font-semibold">Cố tình không làm</h3>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((it) => (
          <li key={it.title} className="flex flex-col gap-1">
            <b className="text-[11.5px] font-semibold">{it.title}</b>
            <span className="text-muted-foreground text-[11.5px] leading-[1.5]">{it.body}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Bản nháp đang soạn trong form. `waves` dùng đúng `DraftWave` của tầng data —
 *  form không đẻ ra một hình dữ liệu thứ hai cho cùng một thứ.
 *
 *  KHÔNG có `runDays`: chuỗi dài bao nhiêu ngày suy ra từ nhịp các đợt. Giữ nó
 *  thành ô nhập riêng thì gõ 60 trong khi các đợt trải 28 ngày là hai con số
 *  chọi nhau ngay trên một màn, và không ai đọc ô đó nữa. */
type CampaignDraft = {
  name: string
  kind: SourceKind
  venue: string
  audience: string
  waves: DraftWave[]
}

/** Đợt trống thêm vào cuối chuỗi.
 *
 *  Nhịp chép từ khoảng cách hai đợt cuối của nguồn mẫu — nhưng CHUỖI RỖNG thì
 *  đợt thứ nhất phải là ngày 0, không phải "sau 14 ngày": không có gì để nó đi
 *  sau cả.
 *
 *  Kỳ vọng để 0. Chép `expected` của đợt liền trước thì đợt trống hiện ra một
 *  con số trông y hệt số ai đó đã đặt thật, mà ô này là ô BẮT BUỘC — người soạn
 *  phải tự đặt. */
function nextWave(waves: DraftWave[]): DraftWave {
  const last = waves[waves.length - 1]
  return {
    label: `Đợt ${waves.length + 1}`,
    channel: 'email',
    afterDays: last ? last.afterDays + DRAFT_STEP_DAYS : 0,
    expected: 0,
    content: '',
  }
}

/** Nguồn đang mở → bản nháp của form sửa; `null` → bản nháp của form tạo mới.
 *
 *  Bản nháp mở đầu của form tạo CHÉP NHỊP nguồn mẫu (`DRAFT_TEMPLATE`, suy từ
 *  fixture): tên gợi ý, số người nhận, nhịp đợt. Đó là điểm xuất phát để sửa,
 *  KHÔNG phải số đo của chiến dịch mới.
 *
 *  Nội dung đợt khi sửa để TRỐNG: kịch bản đóng băng không lưu bài đã soạn, và
 *  dựng lại một bài chưa từng có là bịa. */
function draftOf(source: SourceRow | null, withEmptyWave: boolean): CampaignDraft {
  const base: CampaignDraft = source
    ? {
        name: source.label,
        kind: source.kind,
        venue: source.venue ?? '',
        audience: String(source.waves[0]?.sent ?? ''),
        waves: source.waves.map((w) => ({
          label: w.label,
          channel: w.channel,
          afterDays: w.day - source.startDay,
          expected: w.expected,
          content: '',
        })),
      }
    : {
        name: '',
        kind: 'chien-dich',
        venue: '',
        audience: String(DRAFT_TEMPLATE.audience),
        waves: DRAFT_TEMPLATE.waves,
      }

  return withEmptyWave ? { ...base, waves: [...base.waves, nextWave(base.waves)] } : base
}

/** Nháp nội dung một đợt, dạng HTML (`RichText` nhận HTML). Cố tình KHÔNG có số
 *  liệu nào: trợ lý mở lời, người soạn viết phần còn lại. */
const draftHtml = (w: DraftWave) =>
  `<p><b>${w.label}</b> — gửi bằng ${CHANNEL_LABEL[w.channel]}</p><p>Bản nháp chờ người sửa và duyệt — chưa gửi cho ai.</p>`

/** Nhãn của một ô nhập. Ô bắt buộc mang dấu sao màu cảnh báo ngay cạnh nhãn —
 *  người soạn thấy trước khi gõ, không phải sau khi bấm gửi.
 *
 *  Dấu sao là `aria-hidden`: mọi chữ trong thẻ label chui vào TÊN của ô nhập,
 *  nên để nguyên thì trình đọc màn hình đọc ô kia là "Tên sao". Việc "ô này bắt
 *  buộc" nói bằng `aria-required` trên chính ô nhập, đúng chỗ của nó.
 *
 *  Câu `hint` cũng nằm NGOÀI `<label>` vì cùng lý do — một câu giải thích dài sẽ
 *  biến nhãn "Khán giả" thành cả đoạn văn. */
function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">
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
        <span className="text-muted-foreground text-[11.5px] leading-[1.5]">{hint}</span>
      ) : null}
    </div>
  )
}

/** Nhãn cho một CỤM NÚT (loại, kênh). Không bọc `<label>`: một nhãn trỏ vào
 *  nhiều nút thì trình đọc màn hình đọc sai cái nào đang được chọn.
 *
 *  Có `id` để cụm nút bên dưới nối vào bằng `role="group" aria-labelledby`. Thiếu
 *  dây nối đó thì nhãn chỉ là một chữ đứng cạnh, và bảy nút kênh của ba đợt đọc
 *  ra y hệt nhau. */
function GroupLabel({
  id,
  children,
  required,
}: {
  id?: string
  children: ReactNode
  required?: boolean
}) {
  return (
    <span id={id} className="text-muted-foreground text-[11px]">
      {children}
      {required ? (
        <span className="text-warning" aria-hidden="true">
          {' '}
          *
        </span>
      ) : null}
    </span>
  )
}

/** Tạo và SỬA chiến dịch dùng chung một form (docs · mục 1.6) — dàn ngang, ba
 *  section, tự cuộn bên trong.
 *
 *  Không đợt nào tự gửi. Nút cuối cùng là "gửi duyệt", không phải "gửi ngay":
 *  E3 giữ chuỗi duyệt, E5 chỉ bung đợt sau khi có người gật.
 *
 *  GỬI XONG LÀ KHOÁ. Trước đây bấm gửi rồi vẫn gõ tiếp được, sửa đợt được, thêm
 *  người duyệt được — mà không còn nút gửi lại, nên mọi sửa đổi sau đó rơi vào
 *  hư không. Giờ ô nhập thành chỉ đọc và lối ra đổi tên thành "Về sổ nguồn". */
function CampaignForm({
  mode,
  code,
  initial,
  seededWave,
  sources,
  onCancel,
}: {
  mode: 'create' | 'edit'
  code?: string
  initial: CampaignDraft
  /** Form mở bằng nút "Thêm đợt vào chuỗi": đợt cuối là đợt vừa thêm. */
  seededWave: boolean
  sources: SourceRow[]
  onCancel: () => void
}) {
  const uid = useId()
  const [draft, setDraft] = useState<CampaignDraft>(initial)
  /* Chuỗi duyệt mở đầu bằng đúng một mắt xích — TP Kinh doanh, và đó là mắt xích
     KHÔNG BỎ ĐƯỢC (docs: "Người gật vẫn là TP Kinh doanh"). Người thêm vào chỉ
     nối phía sau. */
  const [approvers, setApprovers] = useState<string[]>([HEAD_OF_SALES])
  const [picking, setPicking] = useState(false)
  const [stopOnReply, setStopOnReply] = useState(true)
  const [drafted, setDrafted] = useState(false)
  const [sent, setSent] = useState(false)
  const [askCancel, setAskCancel] = useState(false)

  /* Luật 13 · đổi chế độ là thay nguyên cây con, nút vừa bấm biến mất và focus
     rơi về `<body>`. Đưa nó lên tiêu đề form. */
  const headRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    headRef.current?.focus()
  }, [])

  /* "Thêm đợt" thả người dùng ở đầu Section 1 trong khi thẻ đợt mới nằm cuối
     Section 2, trong một lưới 2–3 cột. Cuộn tới và đặt focus vào chính thẻ đó. */
  const waveRefs = useRef<(HTMLDivElement | null)[]>([])
  const [focusWave, setFocusWave] = useState<number | null>(
    seededWave ? initial.waves.length - 1 : null,
  )

  useEffect(() => {
    if (focusWave === null) return
    const el = waveRefs.current[focusWave]
    setFocusWave(null)
    if (!el) return
    el.scrollIntoView?.({ block: 'center' })
    el.focus()
  }, [focusWave])

  /* Căn cứ của khối AI phải là số THẬT trong kịch bản, không phải câu nói suông:
     lấy đúng đợt đã ra nhiều lead nhất trong kỳ làm mẫu mở lời. */
  const best = useMemo(() => {
    const all = sources.flatMap((s) => s.waves.map((w) => ({ code: s.code, ...w })))
    return [...all].sort((a, b) => b.leads - a.leads)[0]
  }, [sources])

  const setWave = (i: number, patch: Partial<DraftWave>) =>
    setDraft((d) => ({ ...d, waves: d.waves.map((w, j) => (j === i ? { ...w, ...patch } : w)) }))

  const addWave = () => {
    const at = draft.waves.length
    setDraft((d) => ({ ...d, waves: [...d.waves, nextWave(d.waves)] }))
    setFocusWave(at)
  }

  const digits = (v: string) => Number(v.replace(/\D/g, '') || '0')

  /* Bốn con số dưới cộng từ BẢN NHÁP người dùng vừa gõ, không phải từ fixture —
     tầng data không có hàm nào cộng hộ một chiến dịch chưa tồn tại. */
  const expected = draft.waves.reduce((n, w) => n + w.expected, 0)
  const spread = draft.waves.reduce((n, w) => Math.max(n, w.afterDays), 0)
  const byE4 = draft.waves.filter((w) => sendsViaE4(w.channel)).length
  const manual = draft.waves.length - byE4

  /* Ô khán giả xoá trắng được. Không in "0 người nhận" cho ô trắng — số 0 ở đây
     đọc thành "gửi cho không ai", mà thật ra là chưa ai đặt số. */
  const audienceText =
    draft.audience === '' ? 'chưa đặt số người nhận' : `${draft.audience} người nhận`

  const stopText = stopOnReply
    ? 'khách trả lời thì ngưng nhắc'
    : 'chuỗi chạy hết kể cả khi khách đã trả lời'

  /* Nói RÕ còn thiếu gì, không để một cái nút xám câm. Chuỗi duyệt không có mặt
     trong danh sách này: TP Kinh doanh là mắt xích ghim, chuỗi không rỗng được. */
  const missing = [
    draft.name.trim() === '' ? 'tên' : null,
    draft.waves.length === 0 ? 'ít nhất một đợt' : null,
    draft.kind === 'su-kien' && draft.venue.trim() === '' ? 'địa điểm của sự kiện' : null,
  ].filter((x): x is string => x !== null)
  const ready = missing.length === 0

  const firstApprover = approvers[0] ?? HEAD_OF_SALES
  const candidates = dasVina.actors.filter((a) => !approvers.includes(a.name))

  /** Số đợt CHÉP TỪ NGUỒN. Đợt vừa thêm trong phiên này không nằm trong đó —
   *  câu "kịch bản không lưu nội dung" chỉ đúng với đợt cũ. */
  const copiedWaves = mode === 'edit' ? initial.waves.length - (seededWave ? 1 : 0) : 0

  /* Nháp đã đụng vào chưa. Bấm "Huỷ" lúc nháp còn nguyên thì đi thẳng; đụng rồi
     thì hỏi lại ngay tại chỗ — không `window.confirm`, hộp thoại của trình duyệt
     không có mặt kính nào và không nằm trong hệ thiết kế. */
  const untouched =
    JSON.stringify(draft) === JSON.stringify(initial) && approvers.length === 1 && stopOnReply

  const statusId = `${uid}-status`
  const kindId = `${uid}-kind`
  const approverId = `${uid}-approver`
  const stopId = `${uid}-stop`

  return (
    <GlassCard className="flex flex-col gap-5 p-5 lg:min-h-0 lg:flex-1 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div ref={headRef} tabIndex={-1} className="min-w-0 outline-none">
          <SectionTitle
            size="lg"
            kicker={mode === 'edit' ? 'Sửa chiến dịch' : 'Tạo mới'}
            hint={
              mode === 'edit'
                ? 'Sửa dùng đúng màn tạo, không có màn thứ hai. Ô có dấu sao là bắt buộc.'
                : 'Ô có dấu sao là bắt buộc. Chuỗi đợt và kỳ vọng đặt ngay ở đây, không đợi chạy xong mới ghi.'
            }
          >
            {mode === 'edit' ? `Sửa ${code}` : 'Chiến dịch mới'}
          </SectionTitle>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {askCancel ? (
            <>
              <span className="text-warning text-[11.5px] leading-[1.5]">
                Bỏ bản nháp đang soạn?
              </span>
              <Button size="md" variant="destructive" onClick={onCancel}>
                Bỏ nháp
              </Button>
              <Button size="md" variant="ghost" onClick={() => setAskCancel(false)}>
                Soạn tiếp
              </Button>
            </>
          ) : (
            <Button
              size="md"
              variant="ghost"
              onClick={() => (sent || untouched ? onCancel() : setAskCancel(true))}
            >
              {sent ? 'Về sổ nguồn' : 'Huỷ'}
            </Button>
          )}

          {sent ? (
            <Badge tone="running">Đã gửi · chờ {firstApprover} gật</Badge>
          ) : (
            <Button
              size="md"
              disabled={!ready}
              aria-describedby={statusId}
              onClick={() => {
                setSent(true)
                setAskCancel(false)
                /* Nối E3 khi có backend: `submit` một yêu cầu loại 'chiến-dịch'
                   với chuỗi duyệt đúng bằng `approvers`, và `stopOnReply` đi kèm
                   kế hoạch xuống E5. */
              }}
            >
              <Icon icon={Send} size={16} />
              Gửi {firstApprover} duyệt
            </Button>
          )}
        </div>
      </div>

      {/* MỘT thẻ `<p>` cho cả ba trạng thái, không ba thẻ thay nhau: vùng
          `aria-live` phải có mặt sẵn trong DOM trước khi chữ đổi, nếu không
          trình đọc màn hình chẳng đọc gì cả. Nút gửi `disabled` nên không nhận
          được focus — `aria-describedby` là đường duy nhất còn lại để người dùng
          bàn phím nghe được lý do nút xám.

          Nhánh "còn thiếu" tô `text-warning`: đây là câu DUY NHẤT giải thích vì
          sao nút bị chặn, để nó ở màu mờ nhất màn là chôn đúng thứ cần đọc. */}
      <p
        id={statusId}
        aria-live="polite"
        className={cn(
          'text-[11.5px] leading-[1.5]',
          !sent && !ready ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {sent
          ? `Chưa có màn Hộp duyệt — yêu cầu sẽ vào hệ duyệt khi có backend. Chưa gật thì không đợt nào được bung và không lệnh gửi nào được phát. Kịch bản đóng băng không nhận chiến dịch mới: dòng này chưa lên bảng nguồn.`
          : ready
            ? `${draft.waves.length} đợt · ${audienceText} · kỳ vọng ${expected} lead · hệ gửi được ${byE4} đợt, ${manual} đợt phải tự đăng · ${stopText}. Không đợt nào tự gửi trước khi có người gật.`
            : `Chưa gửi duyệt được — còn thiếu ${missing.join(' · ')}.`}
      </p>

      <div className="flex flex-col gap-8 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <section className="flex flex-col gap-4">
          <SectionTitle size="lg" kicker="Bước 1">
            Thông tin chung
          </SectionTitle>

          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Tên" required>
              <Input
                value={draft.name}
                aria-required
                readOnly={sent}
                /* Gợi ý lấy tên nguồn mẫu, không chép nguyên văn một nhãn vào
                   code: "Ví dụ" ở đầu để không ai đọc thành tên có thật. */
                placeholder={`Ví dụ ${DRAFT_TEMPLATE.name}`}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <GroupLabel id={kindId} required>
                Loại
              </GroupLabel>
              <div role="group" aria-labelledby={kindId} className="flex flex-wrap gap-2">
                {(['chien-dich', 'su-kien'] as const).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    disabled={sent}
                    variant={draft.kind === k ? 'default' : 'ghost'}
                    onClick={() => setDraft((d) => ({ ...d, kind: k }))}
                  >
                    <Icon icon={KIND_ICON[k]} size={16} />
                    {KIND_LABEL[k]}
                  </Button>
                ))}
              </div>
              <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Sự kiện là buổi có mặt người thật — có chỗ, có đăng ký, có người điểm danh. Cả hai
                đo bằng cùng một câu hỏi: đợt này ra bao nhiêu khách.
              </span>
            </div>

            {draft.kind === 'su-kien' ? (
              <Field label="Địa điểm" required>
                <Input
                  value={draft.venue}
                  aria-required
                  readOnly={sent}
                  placeholder={`Ví dụ ${DRAFT_TEMPLATE.venue}`}
                  onChange={(e) => setDraft((d) => ({ ...d, venue: e.target.value }))}
                />
              </Field>
            ) : null}

            <Field
              label="Khán giả · số người nhận"
              hint={`Mở sẵn bằng số người nhận của đợt mở màn ${DRAFT_TEMPLATE.fromCode} — điểm xuất phát để sửa, không phải số đo của chiến dịch này.`}
            >
              <Input
                value={draft.audience}
                inputMode="numeric"
                readOnly={sent}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, audience: e.target.value.replace(/\D/g, '') }))
                }
              />
            </Field>

            <div className="flex flex-col gap-2">
              <GroupLabel>Chạy trong bao nhiêu ngày</GroupLabel>
              <span className="tnum font-num text-[26px] font-semibold leading-none">{spread}</span>
              <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Suy từ nhịp các đợt — từ đợt mở màn tới đợt cuối. Đây là số ĐỌC, không phải ô nhập:
                một ô "chạy bao nhiêu ngày" gõ tay sẽ chọi với chính chuỗi đợt ngay dưới nó.
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <GroupLabel>Kỳ vọng lead cả chiến dịch</GroupLabel>
              <span className="tnum font-num text-[26px] font-semibold leading-none">
                {expected}
              </span>
              <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Cộng từ kỳ vọng của các đợt, không gõ thẳng. Đặt kỳ vọng ở từng đợt là cách duy nhất
                sau này chấm được đợt nào đạt, đợt nào hụt.
              </span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle
            size="lg"
            kicker="Bước 2"
            hint="Mỗi đợt một nội dung riêng. Nhịp tính bằng số ngày kể từ đợt mở màn."
          >
            Kế hoạch từng đợt
          </SectionTitle>

          {mode === 'edit' ? (
            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              Kịch bản không lưu nội dung đã soạn — ô nội dung của các đợt cũ để trống. Dựng lại một
              bài chưa từng có thì màn đang bịa.
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {draft.waves.map((w, i) => {
              const titleId = `${uid}-wave-${i}`
              const channelId = `${uid}-wave-${i}-channel`
              const contentId = `${uid}-wave-${i}-content`
              return (
                /* Mỗi thẻ là một NHÓM có tên. Ba đợt thì màn có 3 ô "Tên đợt",
                   3 ô "Sau bao nhiêu ngày", 3 nút "Bỏ" và 21 nút kênh trùng tên
                   nhau — không có nhóm thì trình đọc màn hình không nói được nút
                   nào thuộc đợt nào. */
                <div
                  key={i}
                  role="group"
                  aria-labelledby={titleId}
                  tabIndex={-1}
                  ref={(el) => {
                    waveRefs.current[i] = el
                  }}
                  className="flex flex-col gap-3 rounded-md bg-white/5 p-4 outline-none"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span id={titleId} className="text-[11.5px] font-semibold">
                      Đợt {i + 1}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={sent}
                      aria-label={`Bỏ đợt ${i + 1}`}
                      onClick={() =>
                        setDraft((d) => ({ ...d, waves: d.waves.filter((_, j) => j !== i) }))
                      }
                    >
                      <Icon icon={Trash2} size={16} />
                      Bỏ
                    </Button>
                  </div>

                  <Field label="Tên đợt" required>
                    <Input
                      value={w.label}
                      aria-required
                      readOnly={sent}
                      onChange={(e) => setWave(i, { label: e.target.value })}
                    />
                  </Field>

                  <div className="flex flex-col gap-2">
                    <GroupLabel id={channelId} required>
                      Kênh
                    </GroupLabel>
                    {/* Đây là thao tác CHÍNH của Bước 2, và ở iPad dọc 768px nó
                        được bấm bằng ngón tay — `<button>` trần bọc một tag
                        11px chỉ cao 24px. `min-h-8` đưa nó về đúng cỡ nút `sm`
                        của cả màn (luật 13). */}
                    <div role="group" aria-labelledby={channelId} className="flex flex-wrap gap-1">
                      {CHANNELS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          disabled={sent}
                          aria-pressed={w.channel === c}
                          onClick={() => setWave(i, { channel: c })}
                          className="motion-std flex min-h-8 items-center rounded-md px-1"
                        >
                          <ChannelTag
                            icon={CHANNEL_ICON[c]}
                            label={CHANNEL_LABEL[c]}
                            tone={
                              w.channel === c ? 'accent' : sendsViaE4(c) ? 'default' : 'warning'
                            }
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Nói thẳng đợt này ai gửi. Chọn được kênh ngoài — kịch bản
                      có thật hai đợt như thế, LinkedIn và Facebook — nhưng màn
                      không giả vờ rằng bấm nút là bài lên. */}
                  {sendsViaE4(w.channel) ? (
                    <span className="text-muted-foreground flex items-start gap-2 text-[11px] leading-[1.5]">
                      <Icon icon={Send} size={16} />
                      Hệ gửi đợt này · nhật ký gửi và luật chống trùng người nhận do hệ giữ
                    </span>
                  ) : (
                    <span className="text-warning flex items-start gap-2 text-[11px] leading-[1.5]">
                      <Icon icon={TriangleAlert} size={16} />
                      Hệ chưa nối đường gửi cho {CHANNEL_LABEL[w.channel]} — hệ giữ lịch và nhắc,
                      người tự đăng bài rồi nhập số về.
                    </span>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Sau bao nhiêu ngày">
                      <Input
                        value={String(w.afterDays)}
                        inputMode="numeric"
                        readOnly={sent}
                        onChange={(e) => setWave(i, { afterDays: digits(e.target.value) })}
                      />
                    </Field>
                    <Field label="Kỳ vọng bao nhiêu lead" required>
                      <Input
                        value={String(w.expected)}
                        inputMode="numeric"
                        aria-required
                        readOnly={sent}
                        onChange={(e) => setWave(i, { expected: digits(e.target.value) })}
                      />
                    </Field>
                  </div>

                  <div className="flex flex-col gap-2">
                    <GroupLabel id={contentId}>Nội dung đợt {i + 1}</GroupLabel>
                    {sent ? (
                      <div className="bg-input rounded-md p-3">
                        <RichTextView html={w.content} />
                      </div>
                    ) : (
                      <RichText
                        value={w.content}
                        onChange={(html) => setWave(i, { content: html })}
                        label={`Nội dung đợt ${i + 1}`}
                        placeholder="Soạn nội dung đợt này — chèn được ảnh, sửa được HTML thô."
                      />
                    )}
                    {/* Câu này đã có một lần ở đầu Section 2, nhưng người dùng
                        cuộn tới thẻ đợt thứ ba chỉ thấy một ô soạn trống — lặp
                        lại đúng chỗ họ đang nhìn. */}
                    {i < copiedWaves && w.content.trim() === '' ? (
                      <span className="text-muted-foreground text-[11px] leading-[1.5]">
                        Kịch bản không lưu nội dung đã soạn — ô này để trống là đúng.
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}

            <button
              type="button"
              disabled={sent}
              onClick={addWave}
              className="motion-std text-muted-foreground hover:text-foreground hover:bg-white/9 flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-md bg-white/5 p-4 text-[12.5px] font-semibold"
            >
              <Icon icon={Plus} size={20} />
              Thêm đợt
            </button>
          </div>

          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Chuỗi {draft.waves.length} đợt · trải {spread} ngày · kỳ vọng {expected} lead.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle
            size="lg"
            kicker="Bước 3"
            hint="Chuỗi duyệt và điều kiện dừng do hệ giữ. Màn chỉ soạn ra hai thứ đó."
          >
            Duyệt &amp; điều kiện dừng
          </SectionTitle>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-md bg-white/5 p-4">
              <GroupLabel id={approverId} required>
                Người duyệt
              </GroupLabel>

              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {approvers.map((name) => (
                  <li key={name} className="flex items-center gap-2">
                    <Avatar name={name} size="sm" />
                    <span className="min-w-0 flex-1 text-[11.5px]">
                      <b className="font-semibold">{name}</b>
                      <span className="text-muted-foreground"> · {ROLE_OF.get(name)}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      /* TP Kinh doanh là mắt xích ghim. Chỉ chặn "người cuối
                         cùng" thì thêm một Sale rồi bỏ TP là hợp lệ, và nút gửi
                         đọc thành "Gửi Đỗ Quang Huy duyệt" — trái docs. */
                      disabled={sent || name === HEAD_OF_SALES}
                      aria-label={`Bỏ ${name} khỏi chuỗi duyệt`}
                      onClick={() => setApprovers((prev) => prev.filter((n) => n !== name))}
                    >
                      <Icon icon={Trash2} size={16} />
                      Bỏ khỏi chuỗi duyệt
                    </Button>
                  </li>
                ))}
              </ul>

              {candidates.length === 0 ? (
                <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Cả phòng đã ở trong chuỗi — không còn ai để thêm.
                </span>
              ) : (
                <Button
                  size="sm"
                  variant={picking ? 'default' : 'ghost'}
                  className="self-start"
                  disabled={sent}
                  onClick={() => setPicking((v) => !v)}
                >
                  <Icon icon={UserPlus} size={16} />
                  Thêm người duyệt
                </Button>
              )}

              {picking && candidates.length > 0 ? (
                <div role="group" aria-labelledby={approverId} className="flex flex-wrap gap-2">
                  {candidates.map((a) => (
                    <Button
                      key={a.id}
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setApprovers((prev) => [...prev, a.name])
                        setPicking(false)
                      }}
                    >
                      {a.name}
                    </Button>
                  ))}
                </div>
              ) : null}

              <ApprovalChain
                steps={approvers.map((name, i) => ({
                  label: name,
                  state: i === 0 ? 'current' : 'next',
                }))}
              />

              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Chuỗi đi từ trái sang phải, người đầu tiên nhận trước. {HEAD_OF_SALES} là mắt xích
                không bỏ được — người gật cuối cùng vẫn là TP Kinh doanh; người thêm vào chỉ nối
                phía sau.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-md bg-white/5 p-4">
                <GroupLabel id={stopId}>Điều kiện dừng</GroupLabel>
                <div role="group" aria-labelledby={stopId} className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={stopOnReply ? 'default' : 'ghost'}
                    disabled={sent}
                    aria-pressed={stopOnReply}
                    onClick={() => {
                      setStopOnReply((v) => !v)
                      /* Nối E5 khi có backend: điều kiện dừng đi CÙNG kế hoạch
                         chiến dịch xuống E5, không phải một quy tắc rời của E4 —
                         E4 chỉ biết "gửi hay không gửi", nó không biết chuỗi này
                         còn mấy đợt nữa. */
                    }}
                  >
                    Khách trả lời thì ngưng nhắc
                  </Button>
                </div>
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Điều kiện dừng do hệ giữ, và nó đi kèm bản gửi duyệt — câu tóm tắt ngay trên nút
                  gửi nói rõ chuỗi này dừng theo cách nào. Chống trùng người nhận cũng do hệ giữ:
                  một người nằm trong hai chiến dịch không bị gửi hai lần trong cùng cửa sổ.
                </p>
              </div>

              {sent ? (
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Đã gửi duyệt — trợ lý không soạn thêm vào bản đã gửi.
                </p>
              ) : (
                <>
                  <AiAction
                    variant="panel"
                    suggestion={`Soạn nội dung cho ${draft.waves.length} đợt, mở lời bằng thứ đợt ra nhiều lead nhất đã dùng.`}
                    basis={
                      best
                        ? `Đợt ${best.no} của ${best.code} · gửi ${best.sent}, trả lời ${best.replied}, ra ${best.leads} lead trên kỳ vọng ${best.expected}`
                        : 'Chưa có đợt nào đã chạy trong kỳ'
                    }
                    confirmLabel="Soạn nội dung"
                    done={drafted}
                    onConfirm={() => {
                      /* Đổ nháp vào Ô NỘI DUNG của từng đợt, không in ra một danh
                         sách riêng: người soạn sửa ngay tại chỗ mình sẽ gửi. Đợt nào
                         đã có chữ thì giữ nguyên — trợ lý không đè bài của người. */
                      setDraft((d) => ({
                        ...d,
                        waves: d.waves.map((w) => ({
                          ...w,
                          content: w.content.trim() === '' ? draftHtml(w) : w.content,
                        })),
                      }))
                      setDrafted(true)
                    }}
                  />

                  {drafted ? (
                    <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                      Đã đổ nháp vào {draft.waves.length} đợt — bản nháp chờ người sửa và duyệt,
                      chưa gửi cho ai.
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                      Chưa tạo gì cả. Trợ lý không tự soạn và không tự gửi.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </GlassCard>
  )
}

export default CampaignsPage
