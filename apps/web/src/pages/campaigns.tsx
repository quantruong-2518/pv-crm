import { useMemo, useState, type ReactNode } from 'react'
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
 *  HAI CHỖ DỄ ĐẶT NHÃN SAI — đọc trước khi sửa chữ trên màn:
 *   · `campaignTotals.leads` là **88**, không phải 100. Nó chỉ cộng lead của sáu
 *     nguồn CÓ ĐỢT; 12 lead còn lại đến từ hai nguồn tự nhiên, không đợt nào kéo
 *     chúng về nên không đợt nào được ghi công. Nhãn phải nói "lead từ các đợt",
 *     đừng để ai đọc thành "sổ lead mất 12 dòng" — con số 100 của cả sổ nằm ở
 *     module 2, đúng chỗ của nó.
 *   · `running` nghĩa là "nguồn có người chạy đợt", KHÔNG phải "đợt còn đang
 *     gửi". Trong kịch bản đóng băng cả sáu nguồn có đợt đều đã chạy xong.
 *
 *  CỐ TÌNH KHÔNG LÀM:
 *   · Không có ô "lượt xem / lượt hiển thị" ở hàng KPI. Module 1 đo bằng lead
 *     (docs · mục 1.4). Số gửi/mở/trả lời vẫn có, nhưng nằm trong timeline từng
 *     đợt để chẩn đoán — nó không được leo lên làm thước đo của phòng.
 *   · Không vẽ đường cong theo thời gian. Kịch bản là một lát cắt đóng băng
 *     17/08; dựng trục tháng-quý là phải đẻ số không ai ký.
 *   · Không có nút "Gửi ngay". Nút cuối của form là "gửi duyệt" — E3 giữ chuỗi
 *     duyệt, E5 chỉ bung đợt sau khi có người gật.
 *   · Không tách sự kiện thành màn riêng. Hai loại một khung, chỉ khác khối
 *     giữa (docs · "Hai loại, một khung").
 *   · Không có BẢNG LEAD trên màn này. Bản trước có, kèm hai nút giao chủ và
 *     tạo phiếu việc; người dùng bỏ nó ngày 19/08 vì lead thuộc module 2 — cùng
 *     một dòng lead mà thao tác được ở hai màn thì không màn nào là nơi đúng để
 *     tra. Còn lại đúng một dòng "bao nhiêu lead của nguồn này đã qua cổng" và
 *     một lối sang Sổ lead. Ràng buộc cũ không mất: cổng init data vẫn là luật,
 *     "phiếu việc ≠ cơ hội" vẫn đúng, chỉ được thi hành ở module 2.
 *   · Trình soạn nội dung dừng ở `<RichText>` (contentEditable, POC) — đậm,
 *     nghiêng, gạch đầu dòng, chèn ảnh, sửa HTML thô. KHÔNG kéo editor thật vào
 *     giai đoạn này: E5 chưa có mô hình nội dung, đổi ruột `RichText` sau này
 *     không đụng tới màn.
 *   · Đóng · theo dõi · người duyệt mới chỉ là state của màn. Chỗ nối E3 (đóng
 *     và duyệt là yêu cầu chờ gật) và E4 (theo dõi là đăng ký nhận thông báo)
 *     ghi ngay tại chỗ bấm.
 *   · Màn KHÔNG tự cộng số nghiệp vụ. Mọi tổng và mọi tỉ lệ nằm ở `data/
 *     campaigns.ts`; một phép chia viết trong JSX là một phép chia không ai
 *     test được.
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
  /* Màn Sổ lead mở sang đây bằng `?source=SK-0103` — nút "Xem sự kiện" trên hồ
     sơ một lead phải mở ĐÚNG nguồn kéo lead đó về, không phải mở nguồn mồi rồi
     bắt người dùng tự tìm. Chỉ dùng làm giá trị KHỞI TẠO: bấm sang nguồn khác
     thì đường dẫn không đổi theo, và F5 vẫn về đúng nguồn đã gửi trong link. */
  const [params] = useSearchParams()
  const [pickedCode, setPickedCode] = useState<string>(params.get('source') ?? ANCHOR_SOURCE)
  /* Ba state dưới là POC: chúng sống trong màn vì chưa có backend giữ. Mỗi chỗ
     bấm ghi rõ engine nào sẽ nhận việc. Giữ theo MÃ nguồn chứ không giữ trong
     panel chi tiết: đổi sang nguồn khác rồi quay lại thì việc vừa làm phải còn. */
  const [closed, setClosed] = useState<string[]>([])
  const [followers, setFollowers] = useState<Record<string, string[]>>({})
  /** Vào form bằng nút "Thêm đợt vào chuỗi" thì form mở sẵn một đợt trống ở cuối. */
  const [seedWave, setSeedWave] = useState(false)

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
     chứ không biến mất. */
  const story = picked?.anchorDeal ? dasVina.graph.story(picked.anchorDeal) : []
  const rail =
    story.length > 0
      ? story.map((o) => ({
          code: o.code,
          source: o.code !== picked?.anchorDeal,
          onOpen: () => {},
        }))
      : [{ code: picked?.code ?? ANCHOR_SOURCE, source: false, onOpen: () => {} }]

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
                đợt đã gửi, chạm được bao nhiêu người, và các tỉ lệ rút ra từ đó.
                Số lead chi tiết là việc của module 2 — ở đây lead chỉ xuất hiện
                dưới dạng "đạt bao nhiêu phần kỳ vọng". */}
            {totals ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
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
                <StatCard
                  size="compact"
                  icon={Users}
                  value={grouped(totals.sent)}
                  label="Người đã tiếp cận"
                  hint={`mở ${percent(totals.openRate)}`}
                />
                <StatCard
                  size="compact"
                  icon={Reply}
                  value={percent(totals.replyRate)}
                  label="Tỉ lệ trả lời"
                  hint={`${totals.replied} người trả lời`}
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
            ) : (
              <Skeleton className="h-20 w-full" />
            )}

            <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[1.45fr_1fr]">
              {/* Bảng LUÔN nằm trên glass-b — luật 8. */}
              <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:min-h-0">
                <SectionTitle
                  size="sm"
                  kicker="Nguồn của kỳ"
                  hint={`${visible.length}/${sources.length} nguồn đang hiện · bấm một dòng để mở chi tiết`}
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
                        { header: 'Giá trị', width: '0.9fr', align: 'right', sortKey: 'gia-tri' },
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
                            <span key="c" className="flex items-center gap-2">
                              <Icon
                                icon={KIND_ICON[s.kind]}
                                size={16}
                                className="text-muted-foreground"
                              />
                              <Chip variant={s.code === picked?.code ? 'source' : 'object'}>
                                {s.code}
                              </Chip>
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
                            /* Cột tiền là CƠ HỘI ĐANG TREO, không phải doanh thu:
                               kịch bản không có tiền của hợp đồng đã ký. Nói ra
                               bằng `title` thay vì để người đọc tự đoán. */
                            <span
                              key="v"
                              className="tnum font-num"
                              title={`${OPEN_VALUE.label} · ${OPEN_VALUE.deals} đơn đang mở trong kỳ. ${OPEN_VALUE.signedDeals} hợp đồng đã ký không có số tiền trong kịch bản.`}
                            >
                              {s.value === 0 ? '—' : millions(s.value)}
                            </span>,
                          ],
                        }
                      })}
                    />
                  )}
                </div>
              </GlassCard>

              {picked ? (
                <SourceDetail
                  key={picked.code}
                  source={picked}
                  closed={closed.includes(picked.code)}
                  followers={followersOf(picked)}
                  me={me}
                  onEdit={() => openForm('edit')}
                  onAddWave={() => openForm('edit', true)}
                  onClose={() => setClosed((prev) => [...prev, picked.code])}
                  onToggleFollow={() => toggleFollow(picked)}
                  onOpenLeads={() => navigate('/sales/leads')}
                />
              ) : (
                <GlassCard className="flex flex-col gap-4 p-5">
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
            sources={sources}
            onCancel={() => {
              setSeedWave(false)
              setMode('list')
            }}
          />
        )}
      </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------

/** Chi tiết một nguồn: nó là cái gì, ai giữ, đo được gì, chuỗi đợt chạy ra sao.
 *
 *  Timeline là hình đúng của một chiến dịch: đợt nối đợt theo thời gian, mỗi đợt
 *  nói rõ ngày nào, gửi bằng gì, ra bao nhiêu lead TRÊN KỲ VỌNG bao nhiêu. Chấm
 *  trạng thái đọc bằng đúng phép so đó, không phải bằng một điểm số màn tự chấm. */
function SourceDetail({
  source,
  closed,
  followers,
  me,
  onEdit,
  onAddWave,
  onClose,
  onToggleFollow,
  onOpenLeads,
}: {
  source: SourceRow
  closed: boolean
  followers: string[]
  me: string | null
  onEdit: () => void
  onAddWave: () => void
  onClose: () => void
  onToggleFollow: () => void
  onOpenLeads: () => void
}) {
  const [drafted, setDrafted] = useState(false)

  const following = me !== null && followers.includes(me)
  /* Nguồn tự nhiên không có gì để đóng: không ai mở nó ra cả. */
  const closable = source.waves.length > 0

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
    state: w.day > DAY_FROZEN ? 'next' : w.leads >= w.expected ? 'ok' : 'warning',
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
          value={w.leads / Math.max(1, w.expected)}
          label={`${w.leads} lead trên kỳ vọng ${w.expected}`}
          tone={w.leads >= w.expected ? 'primary' : 'warning'}
        />
        {sendsViaE4(w.channel) ? null : (
          <span className="text-warning flex items-start gap-2 text-[11px] leading-[1.5]">
            <Icon icon={TriangleAlert} size={16} />
            E4 chưa mở đường cho {CHANNEL_LABEL[w.channel]} — đợt này người tự đăng, số ở trên là số
            nhập tay.
          </span>
        )}
      </div>
    ),
  }))

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:min-h-0">
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
          <MetaPill mono icon={CalendarDays}>
            {dm(source.startISO)} → {dm(source.lastISO)}
          </MetaPill>
          <MetaPill avatar={source.owner}>{source.owner}</MetaPill>
          {source.venue ? <MetaPill icon={MapPin}>{source.venue}</MetaPill> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Icon icon={Pencil} size={16} />
            Sửa
          </Button>

          {closable && !closed ? (
            <Button
              size="sm"
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
            size="sm"
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
                ? `${source.replied}/${source.sent} người nhận`
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
              không phải "chưa ai đến". */}
          {source.attendRate === null ? (
            <StatCard
              size="compact"
              icon={Users}
              value={percent(source.mqlRate)}
              label="Tỉ lệ qua cổng"
              hint={`${source.good}/${source.leads} lead đủ ${REQUIRED_SLOTS} ô bắt buộc`}
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
              hint={`${source.waves.length} đợt · chuỗi trải ${source.runDays} ngày · mọi lần gửi đi qua E4, màn không gọi API nền tảng nào`}
            >
              Chuỗi đợt
            </SectionTitle>
            <Timeline items={items} />
            {closed ? (
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Chiến dịch đã đóng — chuỗi không nhận thêm đợt. Mở lại là một yêu cầu duyệt khác.
              </p>
            ) : (
              <Button size="sm" variant="ghost" className="self-start" onClick={onAddWave}>
                <Icon icon={Plus} size={16} />
                Thêm đợt vào chuỗi
              </Button>
            )}
          </>
        )}

        {/* Luật 9 · khối AI có "Căn cứ:", có nút, và có state "Chưa tạo gì cả". */}
        <AiAction
          variant="panel"
          suggestion={`Soạn đợt tiếp theo cho ${source.code} — nhắm ${source.leads - source.good} lead chưa qua cổng, hỏi đúng ô còn thiếu.`}
          basis={`${source.waves.length} đợt đã chạy · ${source.leads} lead trên kỳ vọng ${source.expected} · ${source.good} lead đủ ${REQUIRED_SLOTS} ô bắt buộc`}
          confirmLabel="Soạn nội dung"
          done={drafted}
          onConfirm={() => {
            setDrafted(true)
            /* Nối E3 khi có backend: `proposeFromAi` với basis ở trên. Đề xuất
               vào hệ ở trạng thái `waiting`, chờ TP Kinh doanh gật rồi E5 mới
               bung đợt và bắn xuống E4. */
          }}
        />
        {drafted ? (
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Bản nháp nằm chờ {HEAD_OF_SALES} gật. Chưa gật thì E5 không bung đợt nào và E4 không
            nhận lệnh gửi nào.
          </p>
        ) : (
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Chưa tạo gì cả. Trợ lý chỉ soạn khi có người bấm, và bản soạn vẫn phải qua{' '}
            {HEAD_OF_SALES} trước khi đợt được gửi.
          </p>
        )}

        {/* Bảng lead đã rời khỏi màn này (xem khối "Cố tình không làm"). Còn lại
            đúng một con số và một lối đi — module 2 là nơi thao tác trên lead. */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white/5 p-4">
          <span className="text-[11.5px] leading-[1.5]">
            <span className="tnum font-num">{source.good}</span>/
            <span className="tnum font-num">{source.leads}</span> lead của nguồn này đã qua cổng
            init data
          </span>
          <Button size="sm" variant="ghost" onClick={onOpenLeads}>
            <Icon icon={ArrowRight} size={16} />
            Mở Sổ lead
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------

/** Bản nháp đang soạn trong form. `waves` dùng đúng `DraftWave` của tầng data —
 *  form không đẻ ra một hình dữ liệu thứ hai cho cùng một thứ. */
type CampaignDraft = {
  name: string
  kind: SourceKind
  venue: string
  audience: string
  runDays: string
  waves: DraftWave[]
}

/** Đợt trống thêm vào cuối chuỗi. Nhịp và kỳ vọng CHÉP từ đợt liền trước — hai
 *  con số tròn gõ tay ở đây sẽ trông hệt số đo thật. */
function nextWave(waves: DraftWave[]): DraftWave {
  const last = waves[waves.length - 1]
  return {
    label: `Đợt ${waves.length + 1}`,
    channel: 'email',
    afterDays: (last?.afterDays ?? 0) + DRAFT_STEP_DAYS,
    expected: last?.expected ?? 0,
    content: '',
  }
}

/** Nguồn đang mở → bản nháp của form sửa; `null` → bản nháp của form tạo mới.
 *
 *  Bản nháp mở đầu của form tạo CHÉP NHỊP nguồn mẫu (`DRAFT_TEMPLATE`, suy từ
 *  fixture): tên gợi ý, số người nhận, số ngày chạy, nhịp đợt. Đó là điểm xuất
 *  phát để sửa, KHÔNG phải số đo của chiến dịch mới.
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
        runDays: String(source.runDays),
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
        runDays: String(DRAFT_TEMPLATE.runDays),
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
 *  Câu `hint` nằm NGOÀI `<label>`: mọi chữ trong thẻ label đều chui vào tên của
 *  ô nhập, nên một câu giải thích dài sẽ biến nhãn "Khán giả" thành cả đoạn văn
 *  với trình đọc màn hình. */
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
          {required ? <span className="text-warning"> *</span> : null}
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
 *  nhiều nút thì trình đọc màn hình đọc sai cái nào đang được chọn. */
function GroupLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <span className="text-muted-foreground text-[11px]">
      {children}
      {required ? <span className="text-warning"> *</span> : null}
    </span>
  )
}

/** Tạo và SỬA chiến dịch dùng chung một form (docs · mục 1.6) — dàn ngang, ba
 *  section, tự cuộn bên trong.
 *
 *  Không đợt nào tự gửi. Nút cuối cùng là "gửi duyệt", không phải "gửi ngay":
 *  E3 giữ chuỗi duyệt, E5 chỉ bung đợt sau khi có người gật. */
function CampaignForm({
  mode,
  code,
  initial,
  sources,
  onCancel,
}: {
  mode: 'create' | 'edit'
  code?: string
  initial: CampaignDraft
  sources: SourceRow[]
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<CampaignDraft>(initial)
  /* Chuỗi duyệt mở đầu bằng đúng một mắt xích — TP Kinh doanh. Thêm người được,
     bỏ người cuối cùng thì không: chuỗi rỗng là chuỗi không gửi được. */
  const [approvers, setApprovers] = useState<string[]>([HEAD_OF_SALES])
  const [picking, setPicking] = useState(false)
  const [stopOnReply, setStopOnReply] = useState(true)
  const [drafted, setDrafted] = useState(false)
  const [sent, setSent] = useState(false)

  /* Căn cứ của khối AI phải là số THẬT trong kịch bản, không phải câu nói suông:
     lấy đúng đợt đã ra nhiều lead nhất trong kỳ làm mẫu mở lời. */
  const best = useMemo(() => {
    const all = sources.flatMap((s) => s.waves.map((w) => ({ code: s.code, ...w })))
    return [...all].sort((a, b) => b.leads - a.leads)[0]
  }, [sources])

  const setWave = (i: number, patch: Partial<DraftWave>) =>
    setDraft((d) => ({ ...d, waves: d.waves.map((w, j) => (j === i ? { ...w, ...patch } : w)) }))

  const digits = (v: string) => Number(v.replace(/\D/g, '') || '0')

  /* Ba con số dưới cộng từ BẢN NHÁP người dùng vừa gõ, không phải từ fixture —
     tầng data không có hàm nào cộng hộ một chiến dịch chưa tồn tại. */
  const expected = draft.waves.reduce((n, w) => n + w.expected, 0)
  const spread = draft.waves.reduce((n, w) => Math.max(n, w.afterDays), 0)
  const byE4 = draft.waves.filter((w) => sendsViaE4(w.channel)).length
  const manual = draft.waves.length - byE4

  /* Ô khán giả xoá trắng được. Không in "0 người nhận" cho ô trắng — số 0 ở đây
     đọc thành "gửi cho không ai", mà thật ra là chưa ai đặt số. */
  const audienceText =
    draft.audience === '' ? 'chưa đặt số người nhận' : `${draft.audience} người nhận`

  /* Nói RÕ còn thiếu gì, không để một cái nút xám câm. */
  const missing = [
    draft.name.trim() === '' ? 'tên' : null,
    draft.waves.length === 0 ? 'ít nhất một đợt' : null,
    draft.kind === 'su-kien' && draft.venue.trim() === '' ? 'địa điểm của sự kiện' : null,
    approvers.length === 0 ? 'ít nhất một người duyệt' : null,
  ].filter((x): x is string => x !== null)
  const ready = missing.length === 0

  const firstApprover = approvers[0] ?? HEAD_OF_SALES
  const candidates = dasVina.actors.filter((a) => !approvers.includes(a.name))

  return (
    <GlassCard className="flex flex-col gap-5 p-5 lg:min-h-0 lg:flex-1 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
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

        <div className="flex flex-wrap items-center gap-2">
          <Button size="md" variant="ghost" onClick={onCancel}>
            Huỷ
          </Button>
          {sent ? (
            <Badge tone="running">Đã gửi · chờ {firstApprover} gật</Badge>
          ) : (
            <Button
              size="md"
              disabled={!ready}
              onClick={() => {
                setSent(true)
                /* Nối E3 khi có backend: `submit` một yêu cầu loại 'chiến-dịch'
                   với chuỗi duyệt đúng bằng `approvers`. */
              }}
            >
              <Icon icon={Send} size={16} />
              Gửi {firstApprover} duyệt
            </Button>
          )}
        </div>
      </div>

      {sent ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Yêu cầu nằm trong Hộp duyệt của One. Chưa gật thì E5 không bung đợt nào, và E4 không nhận
          lệnh gửi nào.
        </p>
      ) : (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          {ready
            ? `${draft.waves.length} đợt · ${audienceText} · kỳ vọng ${expected} lead · E4 gửi được ${byE4} đợt, ${manual} đợt phải tự đăng. Không đợt nào tự gửi trước khi có người gật.`
            : `Chưa gửi duyệt được — còn thiếu ${missing.join(' · ')}.`}
        </p>
      )}

      <div className="flex flex-col gap-8 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <section className="flex flex-col gap-4">
          <SectionTitle size="lg" kicker="Bước 1">
            Thông tin chung
          </SectionTitle>

          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Tên" required>
              <Input
                value={draft.name}
                /* Gợi ý lấy tên nguồn mẫu, không chép nguyên văn một nhãn vào
                   code: "Ví dụ" ở đầu để không ai đọc thành tên có thật. */
                placeholder={`Ví dụ ${DRAFT_TEMPLATE.name}`}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <GroupLabel required>Loại</GroupLabel>
              <div className="flex flex-wrap gap-2">
                {(['chien-dich', 'su-kien'] as const).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={draft.kind === k ? 'default' : 'ghost'}
                    onClick={() => setDraft((d) => ({ ...d, kind: k }))}
                  >
                    <Icon icon={KIND_ICON[k]} size={16} />
                    {KIND_LABEL[k]}
                  </Button>
                ))}
              </div>
              <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Sự kiện là buổi có mặt người thật — có chỗ, có đăng ký, có check-in. Cả hai đo bằng
                cùng một câu hỏi: đợt này ra bao nhiêu khách.
              </span>
            </div>

            {draft.kind === 'su-kien' ? (
              <Field label="Địa điểm" required>
                <Input
                  value={draft.venue}
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
                onChange={(e) =>
                  setDraft((d) => ({ ...d, audience: e.target.value.replace(/\D/g, '') }))
                }
              />
            </Field>

            <Field
              label="Chạy trong bao nhiêu ngày"
              hint="Mở sẵn bằng độ dài chuỗi của nguồn mẫu — từ đợt mở màn tới đợt cuối."
            >
              <Input
                value={draft.runDays}
                inputMode="numeric"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, runDays: e.target.value.replace(/\D/g, '') }))
                }
              />
            </Field>

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
            {draft.waves.map((w, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-md bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11.5px] font-semibold">Đợt {i + 1}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDraft((d) => ({ ...d, waves: d.waves.filter((_, j) => j !== i) }))
                    }
                  >
                    <Icon icon={Trash2} size={16} />
                    Bỏ
                  </Button>
                </div>

                <Field label="Tên đợt" required>
                  <Input value={w.label} onChange={(e) => setWave(i, { label: e.target.value })} />
                </Field>

                <div className="flex flex-col gap-2">
                  <GroupLabel required>Kênh</GroupLabel>
                  <div className="flex flex-wrap gap-1">
                    {CHANNELS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={w.channel === c}
                        onClick={() => setWave(i, { channel: c })}
                        className="motion-std rounded-sm"
                      >
                        <ChannelTag
                          icon={CHANNEL_ICON[c]}
                          label={CHANNEL_LABEL[c]}
                          tone={w.channel === c ? 'accent' : sendsViaE4(c) ? 'default' : 'warning'}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nói thẳng đợt này ai gửi. Chọn được kênh ngoài — kịch bản có
                    thật ba đợt như thế — nhưng màn không giả vờ rằng hệ bấm nút
                    là bài lên. */}
                {sendsViaE4(w.channel) ? (
                  <span className="text-muted-foreground flex items-start gap-2 text-[11px] leading-[1.5]">
                    <Icon icon={Send} size={16} />
                    E4 gửi đợt này · nhật ký gửi và luật chống trùng người nhận nằm ở E4
                  </span>
                ) : (
                  <span className="text-warning flex items-start gap-2 text-[11px] leading-[1.5]">
                    <Icon icon={TriangleAlert} size={16} />
                    E4 chưa mở đường cho {CHANNEL_LABEL[w.channel]} — hệ giữ lịch và nhắc, người tự
                    đăng bài rồi nhập số về.
                  </span>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Sau bao nhiêu ngày">
                    <Input
                      value={String(w.afterDays)}
                      inputMode="numeric"
                      onChange={(e) => setWave(i, { afterDays: digits(e.target.value) })}
                    />
                  </Field>
                  <Field label="Kỳ vọng bao nhiêu lead" required>
                    <Input
                      value={String(w.expected)}
                      inputMode="numeric"
                      onChange={(e) => setWave(i, { expected: digits(e.target.value) })}
                    />
                  </Field>
                </div>

                <div className="flex flex-col gap-2">
                  <GroupLabel>Nội dung đợt {i + 1}</GroupLabel>
                  <RichText
                    value={w.content}
                    onChange={(html) => setWave(i, { content: html })}
                    label={`Nội dung đợt ${i + 1}`}
                    placeholder="Soạn nội dung đợt này — chèn được ảnh, sửa được HTML thô."
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, waves: [...d.waves, nextWave(d.waves)] }))}
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
            hint="Chuỗi duyệt do E3 giữ. Điều kiện dừng do E5 giữ. Màn chỉ soạn ra hai thứ đó."
          >
            Duyệt &amp; điều kiện dừng
          </SectionTitle>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-md bg-white/5 p-4">
              <GroupLabel required>Người duyệt</GroupLabel>

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
                      disabled={approvers.length === 1}
                      onClick={() => setApprovers((prev) => prev.filter((n) => n !== name))}
                    >
                      <Icon icon={Trash2} size={16} />
                      Bỏ khỏi chuỗi duyệt
                    </Button>
                  </li>
                ))}
              </ul>

              <Button
                size="sm"
                variant={picking ? 'default' : 'ghost'}
                className="self-start"
                onClick={() => setPicking((v) => !v)}
              >
                <Icon icon={UserPlus} size={16} />
                Thêm người duyệt
              </Button>

              {picking ? (
                <div className="flex flex-wrap gap-2">
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

              {approvers.length > 0 ? (
                <ApprovalChain
                  steps={approvers.map((name, i) => ({
                    label: name,
                    state: i === 0 ? 'current' : 'next',
                  }))}
                />
              ) : null}

              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Chuỗi đi từ trái sang phải, người đầu tiên nhận trước. Bỏ được mọi người trừ người
                cuối cùng — chuỗi rỗng thì không có ai gật, và không gật thì không đợt nào bung.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-md bg-white/5 p-4">
                <GroupLabel>Điều kiện dừng</GroupLabel>
                <Button
                  size="sm"
                  variant={stopOnReply ? 'default' : 'ghost'}
                  className="self-start"
                  onClick={() => setStopOnReply((v) => !v)}
                >
                  Khách trả lời thì ngưng nhắc
                </Button>
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Điều kiện dừng do E5 giữ. Chống trùng người nhận vẫn là việc của E4 — một người
                  nằm trong hai chiến dịch không bị gửi hai lần trong cùng cửa sổ.
                </p>
              </div>

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
                  Đã đổ nháp vào {draft.waves.length} đợt — bản nháp chờ người sửa và duyệt, chưa
                  gửi cho ai.
                </p>
              ) : (
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Chưa tạo gì cả. Trợ lý không tự soạn và không tự gửi — luật 9.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </GlassCard>
  )
}

export default CampaignsPage
