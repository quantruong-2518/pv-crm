import { useMemo, useState } from 'react'
import {
  CalendarDays,
  ClipboardList,
  Inbox,
  MapPin,
  Megaphone,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
  UserPlus,
  Users,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  AiAction,
  AppShell,
  Badge,
  Button,
  Chip,
  ContextRail,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  Input,
  Progress,
  Skeleton,
  StatCard,
  cn,
  millions,
  percent,
} from '@pv/ui'
import {
  DAS_VINA_FROZEN_AT,
  dasVina,
  HEAD_OF_SALES,
  LEAD_CATEGORIES,
  LEAD_TIERS,
  MARKETING,
  REQUIRED_SLOTS,
  dayISO,
  type Lead,
  type LeadTier,
  type SourceKind,
  type WaveChannel,
} from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { dm } from '@/lib/date'
import {
  ANCHOR_SOURCE,
  DRAFT_STEP_DAYS,
  DRAFT_TEMPLATE,
  sourceLeadsQuery,
  sourcesQuery,
  type DraftWave,
  type SourceRow,
} from '@/data/campaigns'
import { CHANNEL_LABEL, E4_CHANNELS } from '@/data/sales-config'

/** Module 1 · Chiến dịch & Sự kiện (docs/kien-truc-san-pham.md).
 *
 *  Module này trả câu "khách ở đâu ra". Nó từng tên là Thị trường và bị chặn vì
 *  cần dữ liệu thị trường ngoài — tức cần kịch bản thứ ba. Nhìn dưới góc chiến
 *  dịch thì câu hỏi vẫn thế mà dữ liệu nằm gọn trong DAS Vina.
 *
 *  Chủ màn là vai **Marketing**. Người gật vẫn là TP Kinh doanh.
 *
 *  HAI VIỆC, một màn:
 *   · "Đang chạy" — chiến dịch đã chạy, đo bằng LEAD đổ về chứ không bằng lượt
 *     xem, và mỗi lead nói rõ đang trong tay ai, giao được chủ, tạo được phiếu
 *     việc — đúng chuỗi ba bước của mục 1.5.
 *   · "Tạo mới"   — dựng chuỗi đợt: kênh, nhịp, nội dung soạn sẵn, điều kiện dừng.
 *
 *  BA LUẬT màn này không được phá:
 *   · Mọi lần gửi đi qua E4 (E5 giữ kế hoạch, E4 giữ nhật ký + chống trùng).
 *     Màn không gọi API nền tảng nào. Ba kênh LinkedIn · Facebook · Website E4
 *     CHƯA mở đường — màn nói thẳng ra ở từng đợt thay vì giả vờ gửi được.
 *   · Luật 9 — mọi khối AI có "Căn cứ:", có nút, và có "Chưa tạo gì cả" ngay
 *     dưới nút.
 *   · "Tạo phiếu việc" KHÔNG đẩy lead sang SQL. Cổng init data không có đường
 *     vòng; phiếu việc là việc đi lấy nốt ô còn thiếu, và khác phiếu tiếp cận —
 *     thứ agent 2 dựng SAU khi lead đã qua cổng.
 *
 *  CỐ TÌNH KHÔNG LÀM:
 *   · Không có ô "lượt xem / lượt hiển thị" ở hàng KPI. Module 1 đo bằng lead
 *     (docs · mục 1.4). Số gửi/mở/trả lời vẫn có, nhưng nằm trong chi tiết từng
 *     đợt để chẩn đoán — nó không được leo lên làm thước đo của phòng.
 *   · Không vẽ đường cong theo thời gian. Kịch bản là một lát cắt đóng băng
 *     17/08; dựng trục tháng-quý là phải đẻ số không ai ký.
 *   · Không có nút "Gửi ngay". Nút cuối của tab tạo mới là "gửi duyệt" — E3 giữ
 *     chuỗi duyệt, E5 chỉ bung đợt sau khi có người gật.
 *   · Không tách sự kiện thành màn riêng. Hai loại một khung, chỉ khác khối
 *     giữa (docs · "Hai loại, một khung").
 *   · Nội dung đợt chỉ là bản nháp một dòng, không dựng trình soạn thảo. E5
 *     chưa có mô hình nội dung; bịa ra một cái rồi sẽ phải xoá.
 *   · Giao chủ dừng ở ĐỀ NGHỊ. E3 chưa nối nên chưa có phiếu duyệt thật, chưa ai
 *     nhận thông báo, và người giữ lead trong sổ chưa đổi. Giao lead giữa hai
 *     Sale đã có chủ là mục 2.2 của module 2 — ở đây chỉ có bước đưa lead RỜI
 *     KHO CHUNG, đúng phần mục 1.5 nói.
 *   · Tab "Tạo mới" mở sẵn bằng bản nháp chép nhịp của nguồn mẫu (tên, số người
 *     nhận, khoảng cách đợt). Đó là điểm xuất phát để sửa, KHÔNG phải số đo của
 *     chiến dịch mới — và nó suy từ fixture, không gõ tay.
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

const TIER_LABEL = new Map(LEAD_TIERS.map((t) => [t.key, t.label]))

const TIER_TONE: Record<LeadTier, 'draft' | 'running' | 'success'> = {
  'dau-moi': 'draft',
  mql: 'running',
  sql: 'success',
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

/** Ba Sale nhận được lead. TP Kinh doanh KHÔNG có trong danh sách: vai đó gật
 *  chứ không giữ khách (docs · vai người). Suy từ `LEAD_CATEGORIES` đúng như
 *  module 2 — hai màn gõ hai danh sách thì sớm muộn lệch nhau. */
const SALES = [...new Set(LEAD_CATEGORIES.map((c) => c.sale))]

/** Kỳ của kịch bản, đọc từ fixture. Ngày đầu kỳ là mốc 0 của `dayISO`, ngày
 *  cuối là lúc kịch bản đóng băng — không gõ hai con số này ra tay. */
const PERIOD = `${dm(dayISO(0))} → ${dm(DAS_VINA_FROZEN_AT)}`

export function CampaignsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm chiến dịch, sự kiện, đợt gửi…' })
  const { data: sources = [], isPending } = useQuery(sourcesQuery)

  const [tab, setTab] = useState<'dang-chay' | 'tao-moi'>('dang-chay')
  const [kind, setKind] = useState<(typeof KINDS)[number]['key']>('all')
  const [pickedCode, setPickedCode] = useState<string>(ANCHOR_SOURCE)

  const visible = useMemo(
    () => sources.filter((s) => kind === 'all' || s.kind === kind),
    [sources, kind],
  )

  /* Nguồn đang mở phải NẰM TRONG bộ lọc đang bật. Tìm trên `sources` chưa lọc
     thì lọc sang "Sự kiện" trong khi đang mở một chiến dịch sẽ để panel phải và
     bảng "Lead đổ về" bày một nguồn không có mặt trên bảng.

     Rơi ra ngoài thì tụt về nguồn đầu của bộ lọc — không ghi đè `pickedCode`,
     nên bỏ lọc ra là nguồn cũ tự mở lại. */
  const picked = visible.find((s) => s.code === pickedCode) ?? visible[0] ?? null

  /* Lối ra của mọi EmptyState: mở một nguồn thì phải mở luôn bộ lọc đang giấu
     nó, nếu không người dùng bấm nút mà màn không đổi gì. */
  const openSource = (code: string) => {
    setKind('all')
    setPickedCode(code)
  }

  const totals = useMemo(() => {
    const leads = sources.reduce((n, s) => n + s.leads, 0)
    const good = sources.reduce((n, s) => n + s.good, 0)
    const signed = sources.reduce((n, s) => n + s.signed, 0)
    const cost = sources.reduce((n, s) => n + s.cost, 0)
    return { leads, good, signed, cost, perGood: good > 0 ? Math.round(cost / good) : 0 }
  }, [sources])

  /* Luật 10 · ContextRail dựng thẳng từ E1 và nằm ở TẦNG MÀN, không nằm trong
     một panel — hai tab là hai việc của cùng một màn, rail không được biến mất
     khi người dùng sang tab tạo mới.

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
    >
      <div className="flex flex-col gap-5 lg:gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">
              Chiến dịch &amp; Sự kiện
            </h2>
            <p className="text-muted-foreground mt-1 text-[12px]">
              DAS Vina · kỳ <span className="font-mono">{PERIOD}</span> · chủ màn {MARKETING} ·
              người gật {HEAD_OF_SALES}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="md"
              variant={tab === 'dang-chay' ? 'default' : 'ghost'}
              onClick={() => setTab('dang-chay')}
            >
              Đang chạy
            </Button>
            <Button
              size="md"
              variant={tab === 'tao-moi' ? 'default' : 'ghost'}
              onClick={() => setTab('tao-moi')}
            >
              <Icon icon={Plus} size={16} />
              Tạo mới
            </Button>
          </div>
        </div>

        <ContextRail objects={rail} />

        {tab === 'tao-moi' ? (
          <CreateCampaign sources={sources} />
        ) : (
          <>
            {/* Đo bằng LEAD, không đo bằng lượt xem. Bốn ô này là toàn bộ câu
                trả lời của module 1 cho TP Kinh doanh. */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard value={String(totals.leads)} label="Lead cả kỳ" />
              {/* Tỉ lệ qua cổng nằm trong NHÃN, không nằm ở khe `delta`: khe đó
                  vẽ trending-up/down/minus, tức là biến thiên so với kỳ trước.
                  Kịch bản đóng băng 17/08 không có kỳ trước nào, nên một dấu
                  minus ở đây đọc thành "tỉ lệ không đổi" — điều fixture không đo
                  được. */}
              <StatCard
                value={String(totals.good)}
                label={`Lead tốt · ${percent(totals.leads > 0 ? totals.good / totals.leads : 0)} qua cổng init data`}
              />
              <StatCard value={String(totals.signed)} label="Đã thành hợp đồng" />
              <StatCard value={millions(totals.perGood)} label="Chi phí mỗi lead tốt" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-[11px]">Loại</span>
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

            <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr] lg:gap-6">
              <div className="flex flex-col gap-4 lg:gap-6">
                {/* Bảng LUÔN nằm trên glass-b — luật 8. */}
                <GlassCard variant="b" className="p-5 lg:p-6">
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
                      columns={[
                        { header: 'Mã', width: '0.9fr' },
                        { header: 'Tên', width: '2fr' },
                        { header: 'Loại', width: '0.9fr' },
                        { header: 'Đợt', width: '0.5fr', align: 'right' },
                        { header: 'Lead', width: '0.5fr', align: 'right' },
                        { header: 'Lead tốt', width: '0.7fr', align: 'right' },
                        { header: 'Giá/lead tốt', width: '1fr', align: 'right' },
                      ]}
                      rows={visible.map((s) => ({
                        id: s.code,
                        /* Sáng theo `picked` chứ không theo `pickedCode`: dòng
                           sáng phải là dòng mà panel bên phải đang mở. */
                        state: s.code === picked?.code ? 'selected' : 'default',
                        cells: [
                          <Chip key="c" onOpen={() => setPickedCode(s.code)}>
                            {s.code}
                          </Chip>,
                          s.label,
                          <Badge key="k" tone={KIND_TONE[s.kind]}>
                            {KIND_LABEL[s.kind]}
                          </Badge>,
                          <span key="w" className="tnum font-num">
                            {s.waves.length}
                          </span>,
                          <span key="l" className="tnum font-num">
                            {s.leads}
                          </span>,
                          <span key="g" className="tnum font-num">
                            {s.good}
                          </span>,
                          <span key="p" className="tnum font-num">
                            {s.costPerGood === null ? '—' : millions(s.costPerGood)}
                          </span>,
                        ],
                      }))}
                    />
                  )}
                </GlassCard>

                {picked ? <SourceLeads source={picked} onPick={openSource} /> : null}
              </div>

              <SourceDetail source={picked} onPick={openSource} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------

/** Chuỗi đợt của một chiến dịch + khối AI soạn đợt tiếp theo. */
function SourceDetail({
  source,
  onPick,
}: {
  source: SourceRow | null
  onPick: (c: string) => void
}) {
  const [drafted, setDrafted] = useState(false)

  if (!source) {
    return (
      <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
        <h3 className="text-[13px] font-semibold">Chiến dịch đang chọn</h3>
        <EmptyState
          icon={Inbox}
          message="Chọn một dòng để xem chuỗi đợt và số của nó."
          action={{ label: 'Mở nguồn mồi', onClick: () => onPick(ANCHOR_SOURCE) }}
          className="py-8"
        />
      </GlassCard>
    )
  }

  const manualWaves = source.waves.filter((w) => !sendsViaE4(w.channel)).length

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
      <h3 className="text-[13px] font-semibold">Chiến dịch đang chọn</h3>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Icon icon={Megaphone} size={16} className="text-accent-foreground" />
          <span className="text-[15px] font-semibold">{source.label}</span>
        </div>
        <span className="text-muted-foreground text-[11.5px]">
          <span className="font-mono">{source.code}</span> · {KIND_LABEL[source.kind]} ·{' '}
          {source.owner} · chạy từ {dm(dayISO(source.startDay))}
        </span>
      </div>

      {/* Sự kiện thì có chỗ, có người đăng ký, có người đến. */}
      {source.kind === 'su-kien' ? (
        <div className="flex flex-col gap-3 rounded-md bg-white/5 p-4">
          <span className="flex items-center gap-2 text-[11.5px]">
            <Icon icon={MapPin} size={16} className="text-muted-foreground" />
            {source.venue}
          </span>
          <span className="flex items-center gap-2 text-[11.5px]">
            <Icon icon={Users} size={16} className="text-muted-foreground" />
            <span className="tnum font-num">{source.checkedIn}</span>/
            <span className="tnum font-num">{source.registered}</span> người đến trên số đăng ký
          </span>
          <Progress
            value={(source.checkedIn ?? 0) / Math.max(1, source.registered ?? 1)}
            label={`Tỷ lệ có mặt · ${percent((source.checkedIn ?? 0) / Math.max(1, source.registered ?? 1))}`}
          />
        </div>
      ) : null}

      {/* Chuỗi đợt. Nguồn tự nhiên không có đợt nào — nói thẳng thay vì vẽ bảng rỗng. */}
      {source.waves.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Nguồn tự nhiên — không ai chạy đợt nào. {source.leads} lead về từ đây là khách tự tìm tới
          hoặc do người trong phòng tự mở.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {source.waves.map((w) => (
            <li key={w.no} className="flex flex-col gap-2 rounded-md bg-white/5 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11.5px] font-semibold">
                  Đợt {w.no} · {w.label}
                </span>
                <Badge tone={sendsViaE4(w.channel) ? 'running' : 'warning'}>
                  {CHANNEL_LABEL[w.channel]}
                </Badge>
              </div>
              <span className="text-muted-foreground text-[11px]">
                <span className="font-mono">{dm(dayISO(w.day))}</span> · gửi{' '}
                <span className="tnum font-num">{w.sent}</span> · mở{' '}
                <span className="tnum font-num">{w.opened}</span> · trả lời{' '}
                <span className="tnum font-num">{w.replied}</span>
              </span>
              {sendsViaE4(w.channel) ? null : (
                <span className="text-warning flex items-start gap-2 text-[11px] leading-[1.5]">
                  <Icon icon={TriangleAlert} size={16} />
                  E4 chưa mở đường cho {CHANNEL_LABEL[w.channel]} — đợt này người tự đăng, số ở trên
                  là số nhập tay.
                </span>
              )}
              <Progress
                value={w.leads / Math.max(1, w.replied)}
                label={`${w.leads} lead trên ${w.replied} người trả lời`}
                tone={w.leads > 0 ? 'primary' : 'warning'}
              />
            </li>
          ))}
        </ol>
      )}

      {source.waves.length > 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          {source.waves.length - manualWaves}/{source.waves.length} đợt do E4 gửi. Mọi lần gửi đều
          qua E4 — màn không gọi thẳng API nền tảng nào, và nhật ký gửi chỉ có một bản.
        </p>
      ) : null}

      {/* Luật 9 · khối AI có "Căn cứ:", có nút, và có state "Chưa tạo gì cả". */}
      <AiAction
        variant="panel"
        suggestion={`Soạn đợt tiếp theo cho ${source.code} — nhắm ${source.leads - source.good} lead chưa qua cổng, hỏi đúng ô còn thiếu.`}
        basis={`${source.waves.length} đợt đã chạy · ${source.leads} lead về · ${source.good} lead qua cổng ${REQUIRED_SLOTS} ô`}
        confirmLabel="Soạn nội dung"
        done={drafted}
        onConfirm={() => {
          setDrafted(true)
          /* Nối E3 khi có backend: `proposeFromAi` với basis ở trên. Đề xuất vào
             hệ ở trạng thái `waiting`, chờ TP Kinh doanh gật rồi E5 mới bung
             đợt và bắn xuống E4. */
        }}
      />
      {drafted ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Bản nháp nằm chờ {HEAD_OF_SALES} gật. Chưa gật thì E5 không bung đợt nào và E4 không nhận
          lệnh gửi nào.
        </p>
      ) : (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa tạo gì cả. Trợ lý chỉ soạn khi có người bấm, và bản soạn vẫn phải qua {HEAD_OF_SALES}{' '}
          trước khi đợt được gửi.
        </p>
      )}
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------

/** Lead đổ về từ một chiến dịch — chuỗi ba bước của mục 1.5 nằm trên đúng một
 *  dòng: lead đổ về → giao chủ → tạo phiếu việc. */
function SourceLeads({ source, onPick }: { source: SourceRow; onPick: (c: string) => void }) {
  const { data: leads = [], isPending } = useQuery(sourceLeadsQuery(source.code))
  const [tickets, setTickets] = useState<string[]>([])
  /* Hai state dưới mang theo MÃ LEAD chứ không giữ mỗi tên người: bảng có tới
     hai chục dòng, đề nghị ở dòng này không được đội nhãn sang dòng khác. */
  const [picking, setPicking] = useState<string | null>(null)
  const [handedTo, setHandedTo] = useState<Record<string, string>>({})

  /* Tra trong danh sách đang hiện: đổi nguồn khi đang chọn người thì khối chọn
     phải biến mất theo, chứ không treo lại tên một lead của nguồn cũ. */
  const pickingLead = leads.find((l) => l.code === picking) ?? null

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold">
          Lead đổ về từ <span className="font-mono">{source.code}</span>
        </h3>
        <span className="text-muted-foreground text-[11.5px]">
          <span className="tnum font-num">{source.good}</span>/
          <span className="tnum font-num">{source.leads}</span> lead đã qua cổng
        </span>
      </div>

      {isPending ? (
        <Skeleton className="h-11 w-full" />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message="Chưa lead nào về từ nguồn này."
          /* EmptyState LUÔN vẽ một nút, nên nút phải làm được việc: đưa người
             dùng về nguồn mồi thay vì đứng nhìn một nút câm. */
          action={{ label: 'Mở nguồn mồi', onClick: () => onPick(ANCHOR_SOURCE) }}
          className="py-8"
        />
      ) : (
        <DataTable
          columns={[
            { header: 'Mã', width: '0.9fr' },
            { header: 'Công ty', width: '1.6fr' },
            { header: 'Bậc', width: '0.7fr' },
            { header: 'Ô bắt buộc', width: '0.8fr', align: 'right' },
            /* Rộng hơn hai cột chữ: ô này còn phải chứa nút giao chủ. */
            { header: 'Đang trong tay', width: '1.7fr' },
            { header: 'Phiếu việc', width: '1.2fr' },
          ]}
          rows={leads.map((l) => ({
            id: l.code,
            cells: [
              <span key="c" className="font-mono text-[11px]">
                {l.code}
              </span>,
              l.company,
              <Badge key="b" tone={TIER_TONE[l.tier]}>
                {TIER_LABEL.get(l.tier) ?? l.tier}
              </Badge>,
              <span key="a" className="tnum font-num">
                {l.requiredFilled}/{REQUIRED_SLOTS}
              </span>,
              <OwnerCell
                key="o"
                lead={l}
                handedTo={handedTo[l.code]}
                picking={picking === l.code}
                onStartPick={() => setPicking(l.code)}
              />,
              tickets.includes(l.code) ? (
                <Badge key="t" tone="running">
                  Đã tạo
                </Badge>
              ) : (
                <Button
                  key="t"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTickets((prev) => [...prev, l.code])
                    /* Nối One Plus · Công việc khi năng lực đó mở. Phiếu việc
                       KHÔNG đẩy lead sang SQL: state ở đây chỉ ghi "đã có việc",
                       không đụng `tier` của dòng nào — cổng init data không có
                       đường vòng (docs · "Phiếu việc ≠ cơ hội"). */
                  }}
                >
                  <Icon icon={ClipboardList} size={16} />
                  Tạo phiếu việc
                </Button>
              ),
            ],
          }))}
        />
      )}

      {/* Chọn người ở DƯỚI bảng, không nhét vào ô: dòng bảng cao cố định, ba cái
          tên dài nhét vào một ô 1.4fr thì tràn ra ngoài dòng. */}
      {pickingLead ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-white/5 p-3">
          <span className="text-[11.5px]">
            Giao <b className="font-semibold">{pickingLead.company}</b> cho
          </span>
          {SALES.map((name) => (
            <Button
              key={name}
              size="sm"
              variant="ghost"
              onClick={() => {
                setHandedTo((prev) => ({ ...prev, [pickingLead.code]: name }))
                setPicking(null)
                /* Nối E3 khi có backend: đề nghị giao chủ nằm chờ TP Kinh doanh
                   gật, gật xong lead mới thực sự rời kho chung. Giao chủ KHÔNG
                   đụng `tier` — cổng init data vẫn là sáu ô, không có đường vòng
                   qua việc đổi tay. */
              }}
            >
              <Icon icon={UserPlus} size={16} />
              {name}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setPicking(null)}>
            Thôi
          </Button>
        </div>
      ) : null}

      <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
        Giao chủ là ĐỀ NGHỊ, không phải lệnh: lead rời kho chung khi {HEAD_OF_SALES} gật, và bậc của
        nó không đổi vì đổi tay. Lead đã có chủ thì đổi tay giữa hai Sale là việc của sổ lead, không
        làm ở đây.
      </p>

      <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
        Phiếu việc là việc đi lấy nốt ô còn thiếu, không phải cơ hội — bậc của lead không đổi vì một
        cái phiếu. Lead chỉ sang SQL khi đủ {REQUIRED_SLOTS} ô bắt buộc, và người gật là{' '}
        {HEAD_OF_SALES}.
      </p>
    </GlassCard>
  )
}

/** "Của ai" có ba trạng thái thật, đừng gộp thành một ô trống. Và với lead còn ở
 *  KHO CHUNG thì chính ô này mở bước giao chủ — bước giữa của mục 1.5, đứng ngay
 *  cạnh nút phiếu việc vì hai việc đó đi liền nhau trên một dòng.
 *
 *  Lead đã ra khỏi luồng không có nút nào: giao một lead đã chết là việc không
 *  ai muốn làm. */
function OwnerCell({
  lead,
  handedTo,
  picking,
  onStartPick,
}: {
  lead: Lead
  handedTo?: string
  picking: boolean
  onStartPick: () => void
}) {
  if (lead.exitReason) {
    return <span className="text-muted-foreground">đã rời luồng · {lead.exitReason}</span>
  }
  if (lead.owner) return <span>{lead.owner}</span>
  if (handedTo) {
    return <Badge tone="running">Đã đề nghị giao · {handedTo}</Badge>
  }
  return (
    <span className="flex items-center gap-2">
      <span className="text-muted-foreground">kho chung</span>
      {/* Nút sáng lên để người dùng biết khối chọn người bên dưới đang nói về
          dòng nào — hai chục dòng thì không đoán được. */}
      <Button size="sm" variant={picking ? 'default' : 'ghost'} onClick={onStartPick}>
        <Icon icon={UserPlus} size={16} />
        Giao chủ
      </Button>
    </span>
  )
}

// ---------------------------------------------------------------------------

/** Tạo chiến dịch: khán giả → kênh → chuỗi đợt → điều kiện dừng → gửi duyệt.
 *
 *  Không đợt nào tự gửi. Nút cuối cùng là "gửi duyệt", không phải "gửi ngay":
 *  E3 giữ chuỗi duyệt, E5 chỉ bung đợt sau khi có người gật.
 *
 *  Bản nháp mở đầu — tên gợi ý, số người nhận, nhịp đợt — CHÉP từ nguồn mẫu ở
 *  `DRAFT_TEMPLATE` (tầng data, suy từ fixture). Gõ tay "1200" và "sau 14 ngày"
 *  vào đây thì hai con số ấy trông hệt số đo thật, mà đổi fixture lại không ai
 *  biết chúng đã sai. */
function CreateCampaign({ sources }: { sources: SourceRow[] }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SourceKind>('chien-dich')
  const [audience, setAudience] = useState(String(DRAFT_TEMPLATE.audience))
  const [venue, setVenue] = useState('')
  const [waves, setWaves] = useState<DraftWave[]>(DRAFT_TEMPLATE.waves)
  const [stopOnReply, setStopOnReply] = useState(true)
  const [drafted, setDrafted] = useState(false)
  const [sent, setSent] = useState(false)

  /* Căn cứ của khối AI phải là số THẬT trong kịch bản, không phải câu nói suông:
     lấy đúng đợt đã ra nhiều lead nhất trong kỳ làm mẫu mở lời. */
  const best = useMemo(() => {
    const all = sources.flatMap((s) => s.waves.map((w) => ({ code: s.code, ...w })))
    return [...all].sort((a, b) => b.leads - a.leads)[0]
  }, [sources])

  const byE4 = waves.filter((w) => sendsViaE4(w.channel)).length
  const manual = waves.length - byE4
  /* Ô khán giả xoá trắng được. Không in "0 người nhận" cho ô trắng — số 0 ở đây
     đọc thành "gửi cho không ai", mà thật ra là chưa ai đặt số. */
  const audienceText = audience === '' ? 'chưa đặt số người nhận' : `${audience} người nhận`
  const ready =
    name.trim() !== '' && waves.length > 0 && (kind !== 'su-kien' || venue.trim() !== '')

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:gap-6">
      <GlassCard className="flex flex-col gap-5 p-5 lg:gap-6 lg:p-6">
        <h3 className="text-[13px] font-semibold">Chiến dịch mới</h3>

        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Tên</span>
          <Input
            value={name}
            /* Gợi ý lấy tên nguồn mẫu, không chép nguyên văn một nhãn vào code:
               "Ví dụ" ở đầu để không ai đọc thành tên chiến dịch có thật. */
            placeholder={`Ví dụ ${DRAFT_TEMPLATE.name}`}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Loại</span>
          <div className="flex flex-wrap gap-2">
            {(['chien-dich', 'su-kien'] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={kind === k ? 'default' : 'ghost'}
                onClick={() => setKind(k)}
              >
                {KIND_LABEL[k]}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Sự kiện là buổi có mặt người thật — có chỗ, có đăng ký, có check-in. Cả hai đo bằng cùng
            một câu hỏi: đợt này ra bao nhiêu khách.
          </p>
        </div>

        {kind === 'su-kien' ? (
          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">Địa điểm</span>
            <Input
              value={venue}
              placeholder={`Ví dụ ${DRAFT_TEMPLATE.venue}`}
              onChange={(e) => setVenue(e.target.value)}
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Khán giả · số người nhận</span>
          <Input
            value={audience}
            inputMode="numeric"
            onChange={(e) => setAudience(e.target.value.replace(/\D/g, ''))}
          />
          <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Mở sẵn bằng số người nhận của đợt mở màn{' '}
            <span className="font-mono">{DRAFT_TEMPLATE.fromCode}</span> — điểm xuất phát để sửa,
            không phải số đo của chiến dịch này.
          </span>
        </label>

        {/* Chuỗi đợt — phần cốt lõi. Nhịp tính bằng số ngày kể từ đợt mở màn. */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-[11px]">Chuỗi đợt</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setWaves((prev) => [
                  ...prev,
                  {
                    label: `Đợt ${prev.length + 1}`,
                    channel: 'email',
                    /* Nhịp thêm đợt cũng suy từ nguồn mẫu — 14 gõ tay ở đây là
                       một con số tròn không ai đo. */
                    afterDays: (prev[prev.length - 1]?.afterDays ?? 0) + DRAFT_STEP_DAYS,
                  },
                ])
              }
            >
              <Icon icon={Plus} size={16} />
              Thêm đợt
            </Button>
          </div>

          {waves.map((w, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-md bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11.5px] font-semibold">Đợt {i + 1}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setWaves((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Icon icon={Trash2} size={16} />
                  Bỏ
                </Button>
              </div>

              <Input
                value={w.label}
                onChange={(e) =>
                  setWaves((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  )
                }
              />

              <div className="flex flex-wrap gap-2">
                {(Object.keys(CHANNEL_LABEL) as WaveChannel[]).map((c) => (
                  <Button
                    key={c}
                    size="sm"
                    variant={w.channel === c ? 'default' : 'ghost'}
                    onClick={() =>
                      setWaves((prev) => prev.map((x, j) => (j === i ? { ...x, channel: c } : x)))
                    }
                  >
                    {CHANNEL_LABEL[c]}
                  </Button>
                ))}
              </div>

              {/* Nói thẳng đợt này ai gửi. Chọn được kênh ngoài — CD-0102 trong
                  kịch bản có thật ba đợt như thế — nhưng màn không giả vờ rằng
                  hệ bấm nút là bài lên. */}
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

              <span className="text-muted-foreground flex items-center gap-2 text-[11px]">
                <Icon icon={CalendarDays} size={16} />
                {w.afterDays === 0 ? 'Gửi ngay khi được duyệt' : `Sau ${w.afterDays} ngày`}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Điều kiện dừng</span>
          <Button
            size="sm"
            variant={stopOnReply ? 'default' : 'ghost'}
            onClick={() => setStopOnReply((v) => !v)}
          >
            Khách trả lời thì ngưng nhắc
          </Button>
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Điều kiện dừng do E5 giữ. Chống trùng người nhận vẫn là việc của E4 — một người nằm
            trong hai chiến dịch không bị gửi hai lần trong cùng cửa sổ.
          </p>
        </div>
      </GlassCard>

      <div className="flex flex-col gap-4 lg:gap-6">
        <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
          <h3 className="text-[13px] font-semibold">Nội dung</h3>

          <AiAction
            variant="panel"
            suggestion={`Soạn nội dung cho ${waves.length} đợt, mở lời bằng thứ đợt ra nhiều lead nhất đã dùng.`}
            basis={
              best
                ? `Đợt ${best.no} của ${best.code} · gửi ${best.sent}, trả lời ${best.replied}, ra ${best.leads} lead`
                : 'Chưa có đợt nào đã chạy trong kỳ'
            }
            confirmLabel="Soạn nội dung"
            done={drafted}
            onConfirm={() => setDrafted(true)}
          />

          {drafted ? (
            <ol className="flex flex-col gap-2">
              {waves.map((w, i) => (
                <li key={i} className="rounded-md bg-white/5 p-3 text-[11.5px] leading-[1.5]">
                  <b className="font-semibold">
                    Đợt {i + 1} · {CHANNEL_LABEL[w.channel]}
                  </b>
                  <span className="text-muted-foreground mt-1 block">
                    Bản nháp chờ người sửa và duyệt — chưa gửi cho ai.
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              Chưa tạo gì cả. Trợ lý không tự soạn và không tự gửi — luật 9.
            </p>
          )}
        </GlassCard>

        <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
          <h3 className="text-[13px] font-semibold">Gửi duyệt</h3>

          {sent ? (
            <>
              <Badge tone="running" className="self-start">
                Đã gửi · chờ {HEAD_OF_SALES} gật
              </Badge>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Yêu cầu nằm trong Hộp duyệt của One. Chưa gật thì E5 không bung đợt nào, và E4 không
                nhận lệnh gửi nào.
              </p>
            </>
          ) : (
            <>
              <Button
                size="md"
                disabled={!ready}
                onClick={() => {
                  setSent(true)
                  /* Nối E3 khi có backend: `submit` một yêu cầu loại 'chiến-dịch'
                     với chuỗi duyệt một mắt xích — TP Kinh doanh. */
                }}
              >
                <Icon icon={Send} size={16} />
                Gửi {HEAD_OF_SALES} duyệt
              </Button>
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                {ready
                  ? `${waves.length} đợt · ${audienceText} · E4 gửi được ${byE4} đợt, ${manual} đợt phải tự đăng. Không đợt nào tự gửi trước khi có người gật.`
                  : 'Còn thiếu tên chiến dịch, ít nhất một đợt, và địa điểm nếu là sự kiện.'}
              </p>
            </>
          )}
        </GlassCard>
      </div>
    </div>
  )
}

export default CampaignsPage
