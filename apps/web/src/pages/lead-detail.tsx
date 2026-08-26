import { useState, type ReactNode } from 'react'
import {
  ChevronDown,
  Database,
  Inbox,
  Mail,
  MessageSquare,
  Phone,
  Pin,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  AvatarGroup,
  Badge,
  Button,
  Chip,
  ContextRail,
  GlassCard,
  Icon,
  InsetPanel,
  Kicker,
  LoadingBlock,
  MetaPill,
  Money,
  PageHeader,
  Progress,
  SectionTitle,
  Separator,
  StatusDot,
  Timeline,
  cn,
} from '@pv/ui'
import {
  canPromoteToSql,
  DAS_VINA_FROZEN_AT,
  dasVina,
  dayISO,
  EXIT_REASONS,
  HEAD_OF_SALES,
  INIT_DATA_QUESTIONS,
  INIT_DATA_SLOTS,
  isOverSla,
  LEAD_CATEGORIES,
  LEAD_TIERS,
  leadContact,
  leadOrigin,
  leadResearch,
  leadTranscript,
  OPEN_DEALS,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  type ExitReason,
  type Lead,
  type LeadEventKind,
  type LeadTier,
  type TurnKind,
} from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { pinsOf, useLeadDesk } from '@/app/desk'
import { useSession } from '@/app/session'
import { dm, dmy } from '@/lib/date'
import { leadBookQuery, nextActions, ORIGIN_FACE, peopleOn } from '@/data/leads'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import { AssignedPills, AssignMenu } from '@/components/assign-menu'

/** Module 2 · Hồ sơ một lead — `/sales/leads/:code`.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO LÀ MỘT TRANG RIÊNG
 *  ------------------------------------------------------------------
 *  Hồ sơ này có năm thẻ và một trong số đó là transcript nguyên văn. Nhét vào
 *  panel bên phải của sổ thì vừa bóp bảng còn 60% chiều rộng vừa bắt người dùng
 *  cuộn ba màn hình trong một cột hẹp. Danh sách và hồ sơ là hai việc khác nhau
 *  nên là hai trang khác nhau; sổ giữ đường quay lại ở góc trái trên.
 *
 *  Bố cục: hai cột — bên trái là CÂU CHUYỆN (từ đâu về · đã hiểu gì · đã nói
 *  những gì), bên phải là TRẠNG THÁI (ai đang giữ + mười ô, rồi cả đời lead kèm
 *  lý do rơi ở chân nó). Dưới cùng là thanh dính: thông tin liên hệ ở trái,
 *  việc tiếp theo ở phải — hai thứ người dùng cần đúng lúc đang đọc dở hồ sơ,
 *  nên chúng không được cuộn mất. Ngay trên thanh đó là khối "Cố tình không
 *  làm": mọi nút của màn này dừng ở "đã đề nghị", và điều đó phải nói ra trên
 *  màn chứ không nằm trong comment.
 *
 *  **Bảy thẻ dồn còn năm (20/08).** "Đang làm" gộp vào thẻ bộ 10 câu vì cả hai
 *  trả lời cùng câu "ai đang giữ, moi được mấy ô"; "Lead có vấn đề" xuống chân
 *  timeline vì lý do rơi là mốc cuối của đời lead. Bù lại chỗ mất: "Lead có vấn
 *  đề" nay nằm sau một danh sách dài, nên nó giữ tiêu đề riêng và vạch ngăn để
 *  mắt vẫn nhặt ra được.
 *
 *  Transcript lưu bằng TIẾNG ANH và **không mở sẵn** (docs/kien-truc-san-pham.md
 *  · "Transcript"): thứ đọc mặc định là báo cáo tìm hiểu — phần rút ra, tiếng
 *  Việt. Nguyên văn nằm sau một nút, cho người cần soi lại câu chữ.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */

/* Mốc kỳ dữ liệu suy từ fixture, không gõ vào JSX. `dayISO(0)` là ngày đầu kỳ. */
const PERIOD_FROM = dm(dayISO(0))
const PERIOD_TO = dm(DAS_VINA_FROZEN_AT)

const TIER_TONE: Record<LeadTier, 'draft' | 'running' | 'success'> = {
  'dau-moi': 'draft',
  mql: 'running',
  sql: 'success',
}

const CATEGORY_LABEL = new Map(LEAD_CATEGORIES.map((c) => [c.key, c.label]))
const TIER_LABEL = new Map(LEAD_TIERS.map((t) => [t.key, t.label]))
const STAGE_LABEL = new Map(PIPELINE_STAGES.map((s) => [s.key, s.label]))
const DEAL_AMOUNT = new Map(OPEN_DEALS.map((d) => [d.code, d.amount]))

const EVENT_DOT: Record<LeadEventKind, 'ok' | 'current' | 'next' | 'bad' | 'warning'> = {
  'vao-so': 'next',
  cham: 'next',
  'dien-o': 'current',
  giao: 'current',
  'len-bac': 'ok',
  'vao-pipeline': 'ok',
  'doi-cot': 'current',
  ky: 'ok',
  'ra-khoi-luong': 'bad',
}

/** Bốn kiểu lần chạm. Hình lấy từ chính công cụ đã dùng — nhìn là biết lần đó
 *  gặp mặt hay chỉ nhắn một câu. */
const TURN_FACE: Record<TurnKind, { label: string; icon: LucideIcon }> = {
  gap: { label: 'Gặp mặt', icon: Users },
  goi: { label: 'Gọi điện', icon: Phone },
  chat: { label: 'Nhắn tin', icon: MessageSquare },
  mail: { label: 'Email', icon: Mail },
}

export function LeadDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: book = [], isPending } = useQuery(leadBookQuery)

  const me = useSession((s) => s.actor)
  const assigns = useLeadDesk((s) => s.assigns)
  const acted = useLeadDesk((s) => s.acted)
  const act = useLeadDesk((s) => s.act)
  const pins = useLeadDesk((s) => pinsOf(s, me?.id))
  const togglePin = useLeadDesk((s) => s.togglePin)

  const lead = book.find((l) => l.code === code) ?? null

  const shell = (children: ReactNode) => <AppShell {...chrome.shell}>{children}</AppShell>

  if (isPending) {
    return shell(
      /* Khung chờ cao xấp xỉ nội dung thật: một dải cỡ tiêu đề, rồi hai khối cỡ
         hai thẻ đầu của cột trái. Thấp hơn thì màn nhảy một nhịp lúc số về. */
      <div className="flex flex-col gap-4">
        <LoadingBlock height={44} width="256px" label="Đang tải hồ sơ lead" />
        <LoadingBlock height={160} lines={2} />
      </div>,
    )
  }

  if (!lead) {
    return shell(
      <GlassCard className="p-5 lg:p-6">
        <EmptyLead code={code} count={book.length} onBack={() => navigate('/sales/leads')} />
      </GlassCard>,
    )
  }

  const origin = leadOrigin(lead)
  const research = leadResearch(lead)
  const turns = leadTranscript(lead)
  const people = peopleOn(lead, assigns, dasVina.actors)
  const pinnedHere = pins.includes(lead.code)
  const done = acted[lead.code] ?? []

  /* Luật 10 · ContextRail dựng thẳng từ E1. Lead chưa vào sổ cơ hội thì chưa có
     object nào trong đồ thị — rail hiện đúng một chip của chính nó, chứ không
     biến mất. */
  const story = lead.dealCode ? dasVina.graph.story(lead.dealCode) : []
  const rail =
    story.length > 0
      ? story.map((o) => ({ code: o.code, source: o.code !== lead.dealCode }))
      : [{ code: lead.code, source: false }]

  /* Đi THẲNG vào hồ sơ nguồn, không bắn `?source=` vào sổ nguồn: sổ nguồn không
     đọc query nên nút cũ đổ người dùng vào bảng tám dòng để tự dò lại. Cả 8
     nguồn đều mở được ở `/sales/campaigns/:code`, kể cả hai nguồn tự nhiên. */
  const openSource = () => navigate(`/sales/campaigns/${origin.code}`)
  /* Mang mã lô theo: kho danh sách đọc `?lo=` lúc dựng và mở thẳng thẻ của lô đó.
     Không mang thì chip mã lô chỉ đổ người dùng vào bảng tám dòng để tự dò lại —
     một nút hứa nhiều hơn nó làm. */
  const openBatch = (batchCode: string) =>
    navigate(`/sales/campaigns/kho-danh-sach?lo=${batchCode}`)

  return shell(
    <div className="flex flex-col gap-4 lg:gap-6">
      <PageHeader
        back={{ label: 'Sổ lead', onBack: () => navigate('/sales/leads') }}
        title={lead.company}
        meta={
          <>
            <Badge tone={TIER_TONE[lead.tier]}>{TIER_LABEL.get(lead.tier) ?? lead.tier}</Badge>
            <StatusBadge lead={lead} />
          </>
        }
        tags={
          <>
            <Chip>{lead.code}</Chip>
            <MetaPill>{lead.province}</MetaPill>
            <MetaPill>{CATEGORY_LABEL.get(lead.category) ?? lead.category}</MetaPill>
            <MetaPill mono>vào sổ {dmy(lead.createdAt)}</MetaPill>
            {lead.stage && (
              <MetaPill tone={isOverSla(lead) ? 'warning' : 'accent'}>
                {STAGE_LABEL.get(lead.stage)} · {lead.daysHere} ngày
              </MetaPill>
            )}
          </>
        }
        /* Góc phải trên: ghim và giao việc. Hai thứ này thuộc về CẢ hồ sơ nên
           đứng cạnh tiêu đề, không nằm lẫn trong một khối nội dung. */
        actions={
          <>
            <Button
              size="md"
              variant={pinnedHere ? 'default' : 'ghost'}
              aria-pressed={pinnedHere}
              onClick={() => me && togglePin(me.id, lead.code)}
            >
              <Icon icon={Pin} size={16} />
              {pinnedHere ? 'Đã ghim' : 'Ghim'}
            </Button>
            <AssignMenu lead={lead} />
          </>
        }
        rail={<ContextRail objects={rail} />}
      />

      <AssignedPills lead={lead} />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <OriginCard lead={lead} onOpen={openSource} onOpenBatch={openBatch} />
          <ResearchCard research={research} />
          <TranscriptCard turns={turns} />
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          {/* Hai thẻ, không bốn. "Ai đang giữ" và "moi được mấy ô" là một câu
              hỏi chứ không hai — chúng ở chung một thẻ. Lý do lead rơi là dòng
              CUỐI của đời lead nên nó nằm ở chân timeline, không đứng ngang
              hàng với timeline. */}
          <HolderAndSlotsCard lead={lead} people={people} />
          <HistoryCard lead={lead} />
        </div>
      </div>

      <NotDoing />

      <ActionBar lead={lead} done={done} onAct={act} onOpenSource={openSource} />
    </div>,
  )
}

/** Cố tình không làm — bốn thứ bị bỏ có chủ ý, kèm lý do.
 *
 *  Ba trong bốn dòng nói ra thứ người bấm sẽ tưởng là đã xảy ra: bấm "đề nghị"
 *  xong không có gì chạy tiếp, đưa lead ra khỏi luồng xong không ai ghi lại.
 *  Chúng nằm trên MÀN chứ không trong comment — người bấm nút không đọc source. */
function NotDoing() {
  const items = [
    {
      title: 'Đề nghị chưa đi qua chuỗi duyệt thật',
      body: `Mọi nút ở thanh đáy và nút giao việc đều dừng ở "đã đề nghị". E3 chưa nối, nên chưa có phiếu duyệt nào chạy tới ${HEAD_OF_SALES} và chưa ai nhận được thông báo.`,
    },
    {
      title: 'Đưa lead ra khỏi luồng chưa ghi vết',
      body: 'Lý do rơi hiện ngay ở chân timeline, nhưng chưa vào sổ ghi vết của E2 — bản này chưa trả lời được "ai đã đưa lead ra, lúc nào".',
    },
    {
      title: 'Chưa có phiếu tiếp cận tự soạn',
      body: 'Đủ ô bắt buộc thì cổng mở, còn việc kế tiếp vẫn là người làm. Màn này không có khối trợ lý nào, nên cũng không có gì tự chạy sau khi qua cổng.',
    },
    {
      title: 'Bộ 10 câu chỉ ĐỌC ở đây',
      body: 'Ô nào bắt buộc, thêm bớt câu nào là hình của cả phòng — sửa ở module 5 · Cấu hình, không sửa trên một hồ sơ.',
    },
  ]

  return (
    <GlassCard className="flex flex-col gap-3 p-5 lg:p-6">
      <SectionTitle size="sm">Cố tình không làm</SectionTitle>
      <ul className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        {items.map((it) => (
          <li key={it.title} className="flex flex-col gap-1">
            <b className="text-[12.5px] font-semibold">{it.title}</b>
            <span className="text-muted-foreground text-[12.5px] leading-[1.6]">{it.body}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------

/** Mã không có trong sổ. Vẫn là `EmptyState` viết tay chứ không dùng `M-08`: mã
 *  lead phải in bằng mono, mà `EmptyState.message` hiện chỉ nhận `string` (G-06
 *  của sổ gap — đã ghi vào sharedRequests). Nới xong thì xoá hàm này. */
function EmptyLead({ code, count, onBack }: { code: string; count: number; onBack: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon icon={Inbox} size={26} className="text-muted-foreground" />
      <p className="text-muted-foreground text-[12.5px] leading-[1.65]">
        Sổ không có dòng nào mang mã <span className="font-mono">{code}</span>. Sổ là{' '}
        <span className="tnum">{count}</span> dòng của kỳ dữ liệu{' '}
        <span className="font-mono">
          {PERIOD_FROM} → {PERIOD_TO}
        </span>
        ; mã ngoài khoảng đó không tồn tại.
      </p>
      <Button size="sm" variant="ghost" onClick={onBack}>
        Về sổ lead
      </Button>
    </div>
  )
}

function StatusBadge({ lead }: { lead: Lead }) {
  if (lead.contractCode) return <Badge tone="success">Đã ký · {lead.contractCode}</Badge>
  if (lead.exitReason) return <Badge tone="danger">Đã rơi · {lead.exitReason}</Badge>
  if (isOverSla(lead)) return <Badge tone="warning">Quá hạn cột</Badge>
  return <Badge tone="running">Đang chạy</Badge>
}

/** Lead này từ đâu về — bốn kiểu, bốn cách kể.
 *
 *  Đây là câu hỏi đầu tiên người cầm lead hỏi, nên nó là khối đầu tiên. Chiến
 *  dịch và sự kiện mở được sang màn nguồn; hai kiểu tự nhiên vẫn mở được vì
 *  chúng CÓ mặt trong sổ nguồn — chỉ khác là chúng không có đợt nào để xem.
 *
 *  Công trạng kéo lead này về ghi cho NGUỒN, và lead qua được cổng thì tính là
 *  lead tốt của nguồn đó. Câu ấy ở đây chứ không trên màn: nó là luật công
 *  trạng (module 5 · mục 5.6), không phải một con số của hồ sơ này. */
function OriginCard({
  lead,
  onOpen,
  onOpenBatch,
}: {
  lead: Lead
  onOpen: () => void
  onOpenBatch: (batchCode: string) => void
}) {
  const origin = leadOrigin(lead)
  const face = ORIGIN_FACE[origin.kind]
  const isEvent = origin.kind === 'su-kien'
  const batch = origin.batch

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Lead đến từ đâu">
      <SectionTitle
        kicker="Đến từ"
        size="md"
        actions={
          <Button size="sm" variant="ghost" onClick={onOpen}>
            {face.openLabel}
          </Button>
        }
      >
        <span className="flex items-center gap-2">
          <Icon icon={face.icon} size={18} className="text-accent-foreground" />
          {origin.label}
        </span>
      </SectionTitle>

      <div className="flex flex-wrap items-center gap-2">
        <Chip variant="source">{origin.code}</Chip>
        <MetaPill tone="accent">{face.label}</MetaPill>
        <MetaPill avatar={origin.owner}>{origin.owner}</MetaPill>
        <MetaPill mono>chạy từ {dm(origin.startedAt)}</MetaPill>
        {origin.channel && (
          <MetaPill icon={CHANNEL_ICON[origin.channel]}>{CHANNEL_LABEL[origin.channel]}</MetaPill>
        )}
      </div>

      {isEvent && (
        <InsetPanel pad="sm" className="flex flex-wrap gap-3 text-[11.5px]">
          <span>{origin.venue}</span>
          <Separator className="hidden w-px self-stretch sm:block" />
          <span>
            <span className="tnum font-mono">{origin.checkedIn}</span>/
            <span className="tnum font-mono">{origin.registered}</span> người đến trên số đăng ký
          </span>
        </InsetPanel>
      )}

      {/* Lô đứng sau lead — chỉ hiện khi `origin.batch` có giá trị, và `undefined`
          là câu trả lời HỢP LỆ chứ không phải chỗ thiếu dữ liệu.

          Ba con số của chỗ này, tất cả đều ở mức DÒNG SỔ và tất cả đọc từ
          docblock của `prospectBatchOfSource`, đừng đếm lại bằng tay:
           · 64/100 dòng mang được mã lô — khối này hiện;
           · 22/100 dòng thật sự không có lô nào đứng sau (15 dòng của ba đợt
             reach nền tảng + 7 dòng khách cũ giới thiệu);
           · 14/100 dòng CÓ lô nhưng không truy được tới mức dòng, vì `Lead` cố
             tình không mang `waveNo`.
          Cộng lại: khối này vắng ở 36/100 dòng. Con số 22 KHÔNG phải số ở mức
          đợt — mức đợt là chuyện của màn kho danh sách, không của màn này.

          Không có dòng "chưa có lô" thay thế: rỗng ở đây nghĩa là không có lô,
          chứ không phải "chưa đo được". */}
      {batch && (
        <InsetPanel pad="sm" className="flex flex-wrap items-center gap-2 text-[11.5px]">
          <Icon icon={Database} size={14} className="text-glass-foreground" />
          <span className="text-glass-foreground">Về từ lô</span>
          <Chip variant="object" onOpen={() => onOpenBatch(batch.code)}>
            {batch.code}
          </Chip>
          <span className="text-glass-foreground">
            {batch.supplier} · nhập {dm(batch.importedAt)}
          </span>
        </InsetPanel>
      )}

      <p className="text-muted-foreground text-[12.5px] leading-[1.5]">{origin.note}</p>
    </GlassCard>
  )
}

/** Báo cáo tìm hiểu khách hàng — trạng thái HIỆN TẠI của hiểu biết về khách.
 *
 *  Số lần cập nhật hiện to và đứng trước: nó trả lời "bản tôi đang đọc có mới
 *  không". Một báo cáo không ghi lần cập nhật thì người đọc không biết mình
 *  đang đọc thứ của hôm nay hay của sáu tuần trước. */
function ResearchCard({ research }: { research: ReturnType<typeof leadResearch> }) {
  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Báo cáo tìm hiểu khách hàng">
      <SectionTitle
        kicker={`Cập nhật lần thứ ${research.version}`}
        size="md"
        hint={
          research.version > 0
            ? `Lần gần nhất ${dmy(research.updatedAt)} · ${research.updatedBy}. Mỗi lần nói chuyện với khách là một lần cập nhật.`
            : 'Chưa ai nói chuyện được với khách — báo cáo còn trắng.'
        }
      >
        Báo cáo tìm hiểu khách hàng
      </SectionTitle>

      <p className="text-[12.5px] leading-[1.6]">{research.headline}</p>

      {research.lines.length > 0 && (
        <ul className="flex flex-col gap-3">
          {research.lines.map((line) => (
            <li key={line.key} className="flex items-start gap-3">
              <StatusDot state="ok" className="mt-1" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-semibold">
                  <span className="font-mono">{line.no}.</span> {line.label}
                  {!line.required && (
                    <span className="text-muted-foreground"> · không bắt buộc</span>
                  )}
                </span>
                <span className="text-glass-foreground text-[12.5px] leading-[1.6]">
                  {line.body}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {(research.missingRequired.length > 0 || research.missingOptional.length > 0) && (
        <InsetPanel pad="sm" className="flex flex-col gap-2">
          <Kicker tone="muted">Chưa moi được</Kicker>
          <MissingLine
            keys={research.missingRequired}
            tone="warning"
            /* Luật 14 · "cổng init data" là tên trong tài liệu; trên màn nó là
               cổng ô bắt buộc, giống cách module 1 đã gọi. */
            note={`còn thiếu ${research.missingRequired.length} ô BẮT BUỘC — cổng ô bắt buộc chưa mở`}
          />
          <MissingLine
            keys={research.missingOptional}
            tone="muted"
            note="không chặn cổng, nhưng vẫn đếm — đó là thước công trạng của BD"
          />
        </InsetPanel>
      )}
    </GlassCard>
  )
}

function MissingLine({
  keys,
  tone,
  note,
}: {
  keys: string[]
  tone: 'warning' | 'muted'
  note: string
}) {
  if (keys.length === 0) return null
  const labels = INIT_DATA_QUESTIONS.filter((q) => keys.includes(q.key))
  return (
    <p
      className={cn(
        'text-[11.5px] leading-[1.5]',
        tone === 'warning' ? 'text-warning' : 'text-muted-foreground',
      )}
    >
      {labels.map((q) => `${q.no}. ${q.label}`).join(' · ')} — {note}.
    </p>
  )
}

/** Transcript các lần gặp.
 *
 *  Nguyên văn lưu bằng tiếng Anh và ĐÓNG sẵn: docs chốt "transcript tiếng Anh là
 *  dữ liệu lưu, không phải thứ hiển thị mặc định". Thứ mở sẵn là phần rút ra —
 *  ô nào của bộ 10 câu moi được trong lần chạm đó. */
function TranscriptCard({ turns }: { turns: ReturnType<typeof leadTranscript> }) {
  const [openTurn, setOpenTurn] = useState<number | null>(null)

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Transcript">
      <SectionTitle
        kicker={`${turns.length} lần chạm`}
        size="md"
        hint="Lưu nguyên văn bằng tiếng Anh — một ngôn ngữ duy nhất để phân tích được cả sổ. Bộ 10 câu là phần rút ra từ đây, không thay thế nó."
      >
        Transcript
      </SectionTitle>

      {turns.length === 0 ? (
        <p className="text-glass-foreground text-[12.5px] leading-[1.5]">
          Chưa lần chạm nào moi được ô nào nên chưa có gì để lưu — gọi mà không hỏi ra gì thì không
          sinh transcript.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {turns.map((turn) => {
            const face = TURN_FACE[turn.kind]
            const open = openTurn === turn.no
            return (
              /* `bg-surface-inset` gõ thẳng chứ không bọc `InsetPanel`: mục của
                 một `<ol>` phải là `<li>`, và InsetPanel dựng ra `<div>`. Cùng
                 một mức nền có tên, chỉ khác thẻ. */
              <li key={turn.no} className="bg-surface-inset flex flex-col gap-3 rounded-md p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="draft">Lần {turn.no}</Badge>
                  <MetaPill icon={face.icon}>{face.label}</MetaPill>
                  <MetaPill avatar={turn.by}>{turn.by}</MetaPill>
                  <MetaPill mono>{dmy(turn.at)}</MetaPill>
                </div>

                <div className="flex flex-wrap gap-2">
                  {INIT_DATA_QUESTIONS.filter((q) => turn.slots.includes(q.key)).map((q) => (
                    <Chip key={q.key}>
                      ô {q.no} · {q.label}
                    </Chip>
                  ))}
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  aria-expanded={open}
                  onClick={() => setOpenTurn(open ? null : turn.no)}
                >
                  <Icon icon={ChevronDown} size={16} className={cn(open && 'rotate-180')} />
                  {open ? 'Ẩn nguyên văn' : 'Xem nguyên văn'}
                </Button>

                {open && (
                  <div className="flex flex-col gap-2">
                    {turn.lines.map((line, i) => (
                      <p
                        key={i}
                        className={cn(
                          'text-[12.5px] leading-[1.65]',
                          line.speaker === 'pv'
                            ? 'text-accent-foreground'
                            : 'text-glass-foreground',
                        )}
                      >
                        <span className="font-mono text-[10.5px] uppercase tracking-[.13em]">
                          {line.speaker === 'pv' ? 'PV' : 'KH'}
                        </span>{' '}
                        {line.text}
                      </p>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </GlassCard>
  )
}

/** Ai đang giữ + mười ô của bộ 10 câu — MỘT thẻ.
 *
 *  Hai khối này từng là hai thẻ đứng cạnh nhau và cùng trả lời một câu của
 *  module 2: "ai đang trong tay ai, và đã moi được mấy ô". Tách ra thì cột phải
 *  có bốn tiêu đề cho hai ý.
 *
 *  Người GIỮ và người ĐƯỢC GIAO là hai vai khác nhau — cụm avatar gộp cả hai,
 *  nên ngay dưới nó phải có một dòng gọi thẳng tên người giữ. Câu "giao việc
 *  không đổi người giữ" đã nằm trong bảng giao việc (`components/assign-menu`),
 *  chỗ người ta thật sự bấm; nói lại ở đây là nói hai lần.
 *
 *  Câu từ chối của cổng do engine trả (`canPromoteToSql`), màn không tự chế. Ô
 *  nào bắt buộc sửa ở module 5 · Cấu hình, không sửa trên màn này. */
function HolderAndSlotsCard({ lead, people }: { lead: Lead; people: string[] }) {
  const gate = canPromoteToSql(lead)
  const missing = Math.max(0, REQUIRED_SLOTS - lead.requiredFilled)
  const amount = lead.dealCode ? DEAL_AMOUNT.get(lead.dealCode) : undefined

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Người giữ và bộ 10 câu">
      <SectionTitle size="sm">Ai đang giữ</SectionTitle>
      <AvatarGroup names={people} max={5} size="md" emptyLabel="chưa ai nhận" />
      <p className="text-[12.5px] leading-[1.5]">
        Người giữ:{' '}
        {lead.owner ? (
          <b className="font-semibold">{lead.owner}</b>
        ) : (
          <span className="text-muted-foreground">còn ở kho chung, chưa ai nhận</span>
        )}
      </p>

      <Separator />

      <SectionTitle size="sm">Bộ 10 câu</SectionTitle>

      <Progress
        value={lead.requiredFilled / REQUIRED_SLOTS}
        label={`Ô bắt buộc · ${lead.requiredFilled}/${REQUIRED_SLOTS}`}
        tone={missing > 0 ? 'warning' : 'primary'}
      />

      <ul className="flex flex-col gap-2">
        {INIT_DATA_QUESTIONS.map((q) => {
          const filled = lead.filled.includes(q.key)
          return (
            <li key={q.key} className="flex items-start gap-2 text-[11.5px] leading-[1.5]">
              <StatusDot state={filled ? 'ok' : q.required ? 'warning' : 'next'} className="mt-1" />
              <span className={cn(!filled && 'text-muted-foreground')}>
                <span className="font-mono">{q.no}.</span> {q.label}
                {!q.required && <span className="text-muted-foreground"> · không bắt buộc</span>}
              </span>
            </li>
          )
        })}
      </ul>

      <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
        Cổng là {REQUIRED_SLOTS} ô bắt buộc, không phải {INIT_DATA_SLOTS}/{INIT_DATA_SLOTS}.
        {!gate.ok && ` ${gate.reason}.`}
      </p>

      {amount && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11.5px]">Giá trị đơn</span>
          {/* `card` in ra "4.200,0 tr" — đúng số nhưng không ai đọc đơn tỷ bằng
              đơn vị triệu. Đơn của sổ cơ hội luôn ở thang tỷ. */}
          <Money value={amount} scale="hero" />
        </div>
      )}
    </GlassCard>
  )
}

/** Cả đời lead, theo thứ tự thời gian, và ở CHÂN nó là chỗ báo lead có vấn đề.
 *
 *  Lý do rơi là mốc CUỐI của đời một lead, không phải một thẻ đứng ngang hàng
 *  với timeline — đặt nó ở chân danh sách các mốc là đặt đúng chỗ nó thuộc về.
 *  Đổi lại, nó nằm sau một danh sách dài, nên giữ vạch ngăn và tiêu đề riêng
 *  (kèm `aria-label`) để mắt và trình đọc màn hình vẫn nhặt ra được.
 *
 *  Danh sách dài → glass-b (luật 8). */
function HistoryCard({ lead }: { lead: Lead }) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Timeline">
      <SectionTitle size="sm">Timeline · {lead.history.length} mốc</SectionTitle>
      <Timeline
        items={lead.history.map((e, i) => ({
          id: `${e.at}-${i}`,
          state: EVENT_DOT[e.kind],
          marker: dm(e.at),
          title: e.note,
          meta: <MetaPill avatar={e.by}>{e.by}</MetaPill>,
        }))}
      />
      <Separator />
      <ExitBlock lead={lead} />
    </GlassCard>
  )
}

/** 2.3 · report. ĐÚNG sáu lý do, không có ô "khác". */
function ExitBlock({ lead }: { lead: Lead }) {
  const [reported, setReported] = useState<ExitReason | null>(null)
  const [draft, setDraft] = useState<ExitReason | null>(null)

  return (
    <section className="flex flex-col gap-4" aria-label="Lead có vấn đề">
      <SectionTitle size="sm">
        <span className="flex items-center gap-2">
          <Icon icon={TriangleAlert} size={16} className="text-warning" />
          Lead có vấn đề
        </span>
      </SectionTitle>

      {lead.exitReason ? (
        <div className="flex flex-col gap-2">
          <Badge tone="danger" className="self-start">
            Đã ra khỏi luồng · {lead.exitReason}
          </Badge>
          {lead.exitedAt && (
            <span className="text-muted-foreground text-[11.5px]">
              Ghi nhận {dmy(lead.exitedAt)}
            </span>
          )}
        </div>
      ) : reported ? (
        <div className="flex flex-col gap-3">
          <Badge tone="warning" className="self-start">
            Đã báo · {reported}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => setReported(null)}
          >
            Rút lại
          </Button>
        </div>
      ) : (
        <>
          {/* `size="md"` chứ không `sm`: chọn lý do rơi là hành động nghiệp vụ,
              không phải một nút phụ — nó đứng ngay trước nút không rút lại được
              ở dưới. */}
          <div className="flex flex-wrap gap-2">
            {EXIT_REASONS.map((r) => (
              <Button
                key={r.label}
                size="md"
                variant={draft === r.label ? 'default' : 'ghost'}
                onClick={() => setDraft(r.label)}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <Button
            size="md"
            variant="destructive"
            disabled={!draft}
            className="self-start"
            onClick={() => {
              if (!draft) return
              setReported(draft)
              setDraft(null)
              /* Nối E2 khi có backend: mọi lần đưa lead ra khỏi luồng phải ghi vết. */
            }}
          >
            Đưa ra khỏi luồng
          </Button>
          <p className="text-glass-foreground text-[12.5px] leading-[1.5]">
            Sáu lý do là toàn bộ danh sách, không có ô &quot;khác&quot; — thêm lý do thứ bảy là việc
            của module 5 · Cấu hình.
          </p>
        </>
      )}
    </section>
  )
}

/** Thanh dính đáy: liên hệ khách bên trái, việc tiếp theo bên phải.
 *
 *  Hai thứ này đi cùng nhau có chủ ý — mọi hành động ở đây kết thúc bằng việc
 *  chạm khách, nên số điện thoại phải nằm ngay cạnh nút chứ không nằm ở một
 *  khối đã cuộn mất từ lâu. Thanh DÍNH chứ không cố định tuyệt đối: nó ở trong
 *  luồng nội dung nên không đè lên sidebar, và dưới `lg` thì nhường chỗ cho
 *  BottomNav 84px của AppShell. */
function ActionBar({
  lead,
  done,
  onAct,
  onOpenSource,
}: {
  lead: Lead
  done: string[]
  onAct: (code: string, key: string) => void
  onOpenSource: () => void
}) {
  const contact = leadContact(lead)
  const actions = nextActions(lead).filter((a) => a.key !== 'giao-viec')
  const primary = actions.find((a) => a.primary)

  return (
    <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-10 lg:bottom-0">
      <GlassCard
        variant="b"
        /* `backdrop-blur` là NGOẠI LỆ có lý do của glass-b: mặt kính b cố ý bỏ
           blur vì nó nằm trên một cái nền tĩnh (xem globals.css). Thanh này thì
           có NỘI DUNG TRÔI phía sau, và 16% lọt qua của --popover đủ để chữ bên
           dưới đội lên chữ của thanh. */
        className="shadow-panel flex flex-wrap items-center justify-between gap-4 p-4 backdrop-blur-xl"
        aria-label="Liên hệ và việc tiếp theo"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <Kicker tone="muted">Liên hệ khách</Kicker>
          {contact ? (
            <div className="flex flex-wrap items-center gap-2">
              <MetaPill avatar={contact.name}>
                {contact.name} · {contact.title}
              </MetaPill>
              {contact.phone && (
                <MetaPill icon={Phone} mono>
                  {contact.phone}
                </MetaPill>
              )}
              {contact.email && <MetaPill icon={Mail}>{contact.email}</MetaPill>}
              {contact.channel && (
                <MetaPill icon={CHANNEL_ICON[contact.channel]} tone="accent">
                  {CHANNEL_LABEL[contact.channel]}
                </MetaPill>
              )}
            </div>
          ) : (
            <span className="text-warning text-[11.5px] leading-[1.5]">
              Chưa có người liên hệ — ô số 4 của bộ 10 câu còn trống. Chưa moi được thì chưa gọi
              được cho ai.
            </span>
          )}
        </div>

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => {
              const pressed = done.includes(a.key)
              return pressed ? (
                <Badge key={a.key} tone="warning" className="self-center">
                  Đã đề nghị · {a.label}
                </Badge>
              ) : (
                <Button
                  key={a.key}
                  size="md"
                  variant={a.primary ? 'default' : 'ghost'}
                  onClick={() => (a.key === 'mo-nguon' ? onOpenSource() : onAct(lead.code, a.key))}
                >
                  <Icon icon={a.icon} size={16} />
                  {a.label}
                </Button>
              )
            })}
          </div>
          {primary && (
            <span className="text-muted-foreground max-w-[520px] text-[11px] leading-[1.5] lg:text-right">
              {primary.why} Người gật là {HEAD_OF_SALES}.
            </span>
          )}
        </div>

        {/* Chỗ trống đúng bằng nút Trợ lý AI nổi (60px, `bottom-8 right-8` của
            AppShell). Thanh này chạm mép phải cùng chỗ với nút đó, nên không
            chừa thì nút đè lên đúng hành động cuối. Dưới `lg` không có FAB nên
            cũng không có ô này. */}
        <span aria-hidden className="hidden shrink-0 lg:block lg:size-[60px]" />
      </GlassCard>
    </div>
  )
}

export default LeadDetailPage
