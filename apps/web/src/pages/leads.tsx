import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Inbox,
  Megaphone,
  TriangleAlert,
  UserPlus,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  ContextRail,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  Money,
  Progress,
  SearchField,
  Skeleton,
  StatusDot,
  cn,
} from '@pv/ui'
import {
  canPromoteToSql,
  COMMISSION_SPLIT,
  DAS_VINA_FROZEN_AT,
  dasVina,
  dayISO,
  EXIT_REASONS,
  FUNNEL,
  HEAD_OF_SALES,
  INIT_DATA_QUESTIONS,
  INIT_DATA_SLOTS,
  isOverSla,
  isRunning,
  LEAD_CATEGORIES,
  LEAD_TIERS,
  OPEN_DEALS,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  SOURCES,
  type ExitReason,
  type Lead,
  type LeadCategory,
  type LeadEventKind,
  type LeadTier,
} from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { dm, dmy } from '@/lib/date'
import { ANCHOR_CODE, leadBookQuery } from '@/data/leads'

/** Module 2 · Sổ lead (docs/kien-truc-san-pham.md · "Năm module Pebble Sales").
 *
 *  Ba mục của module nằm trên đúng một màn, vì cả ba đều thao tác trên cùng
 *  một dòng lead: 2.1 danh sách + lọc · 2.2 giao/nhận · 2.3 report có vấn đề.
 *  Tách thành ba màn thì người dùng phải nhớ mình đang cầm lead nào.
 *
 *  Sổ là CẢ KỲ 01/05 → 17/08: 100 dòng, phân trang, không cuộn vô tận. Hai cách
 *  nhìn cùng một sổ — bảng để tra, kanban để thấy đơn đang tắc ở cột nào. Lead
 *  chưa qua cổng KHÔNG có mặt trên kanban: nó chưa có cột nào để đứng.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. Vào được màn này là vai có
 *  nhánh Sales — cửa ở `app/guard.tsx`, không kiểm lại ở đây.
 *
 *  Sổ lead lấy qua `useQuery`, không đọc thẳng fixture: đó là đường nối để sau
 *  này cắm backend mà màn không phải sửa (xem `data/leads.ts`).
 *
 *  State: bộ lọc, trang, cách nhìn và dòng đang chọn là chuyện RIÊNG của màn nên
 *  giữ ở đây bằng `useState`. Chỉ thứ toàn app — ai đang đăng nhập — mới nằm
 *  trong zustand. */

const PAGE_SIZE = 10

/* Mốc kỳ suy từ fixture, không gõ vào JSX: kỳ đổi mốc thì màn tự đúng theo,
   không phải đi sửa chuỗi ở đầu trang. `dayISO(0)` là ngày đầu kỳ. */
const PERIOD_FROM = dm(dayISO(0))
const PERIOD_TO = dm(DAS_VINA_FROZEN_AT)
const FROZEN_HM = DAS_VINA_FROZEN_AT.slice(11, 16)

const TIER_TONE: Record<LeadTier, 'draft' | 'running' | 'success'> = {
  'dau-moi': 'draft',
  mql: 'running',
  sql: 'success',
}

/** Bốn trạng thái của một dòng trong sổ. "Đang chạy" là mặc định — lead đã rơi
 *  vẫn tra được, vì đó là nơi câu trả lời "vì sao mất" nằm. */
const STATUSES = [
  { key: 'running', label: 'Đang chạy' },
  { key: 'signed', label: 'Đã ký' },
  { key: 'exited', label: 'Đã rơi' },
  { key: 'all', label: 'Cả kỳ' },
] as const

type StatusKey = (typeof STATUSES)[number]['key']

/** Ba Sale nhận được lead. TP Kinh doanh không nằm trong danh sách này: vai đó
 *  phân công chứ không giữ khách (docs/kien-truc-san-pham.md). */
const SALES = [...new Set(LEAD_CATEGORIES.map((c) => c.sale))]

const CATEGORY_LABEL = new Map(LEAD_CATEGORIES.map((c) => [c.key, c.label]))
const TIER_LABEL = new Map(LEAD_TIERS.map((t) => [t.key, t.label]))
const SOURCE_LABEL = new Map(SOURCES.map((s) => [s.code, s.label]))
const DEAL_AMOUNT = new Map(OPEN_DEALS.map((d) => [d.code, d.amount]))

function matchStatus(lead: Lead, status: StatusKey): boolean {
  if (status === 'all') return true
  if (status === 'signed') return Boolean(lead.contractCode)
  if (status === 'exited') return Boolean(lead.exitReason)
  return isRunning(lead)
}

export function LeadsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const { data: book = [], isPending } = useQuery(leadBookQuery)

  const [query, setQuery] = useState('')
  const [tier, setTier] = useState<LeadTier | 'all'>('all')
  const [category, setCategory] = useState<LeadCategory | 'all'>('all')
  const [source, setSource] = useState<string>('all')
  const [status, setStatus] = useState<StatusKey>('running')
  const [overSlaOnly, setOverSlaOnly] = useState(false)
  const [view, setView] = useState<'bang' | 'kanban'>('bang')
  const [page, setPage] = useState(0)
  const [pickedCode, setPickedCode] = useState<string | null>(ANCHOR_CODE)

  const visible = useMemo(
    () =>
      book.filter((l) => {
        if (!matchStatus(l, status)) return false
        if (tier !== 'all' && l.tier !== tier) return false
        if (category !== 'all' && l.category !== category) return false
        if (source !== 'all' && l.source !== source) return false
        if (overSlaOnly && !isOverSla(l)) return false
        if (query.trim() === '') return true
        const needle = query.trim().toLowerCase()
        return l.company.toLowerCase().includes(needle) || l.code.toLowerCase().includes(needle)
      }),
    [book, status, tier, category, source, overSlaOnly, query],
  )

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  /* Đổi bộ lọc mà đang đứng ở trang 7 thì phải về trang đầu, nếu không người
     dùng thấy một trang trắng và tưởng là không có kết quả. */
  useEffect(() => setPage(0), [status, tier, category, source, overSlaOnly, query])
  /* `useEffect` trên chạy SAU lượt vẽ, nên chỉ dựa vào nó thì vẫn lọt đúng một
     nhịp bảng trắng: 42 dòng lọc còn 6, `page` vẫn là 4, lát cắt ra rỗng. Kẹp
     luôn lúc dựng để nhịp đó không bao giờ lên màn hình. */
  const safePage = Math.min(page, pageCount - 1)
  const rows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  /* Dòng đang chọn tra trong CẢ sổ, không chỉ trang hiện tại: bấm sang trang
     khác không được làm panel bên phải trống trơn. */
  const picked = book.find((l) => l.code === pickedCode) ?? null

  /* Bậc HIỆN TẠI phải đếm lại từ sổ, KHÔNG mượn `FUNNEL.count`: phễu là luỹ kế
     (đã từng đạt bậc), bộ lọc này là bậc lead đang đứng. Mượn số của phễu thì
     bấm "MQL" ra một đằng còn đầu màn ghi một nẻo. */
  const tierNow = useMemo(
    () =>
      new Map(LEAD_TIERS.map((t) => [t.key, book.filter((l) => l.tier === t.key).length] as const)),
    [book],
  )

  const clearFilters = () => {
    setQuery('')
    setTier('all')
    setCategory('all')
    setSource('all')
    setStatus('running')
    setOverSlaOnly(false)
  }

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
        <div>
          <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">Sổ lead</h2>
          <p className="text-muted-foreground mt-1 text-[12px]">
            DAS Vina · phễu {PERIOD_FROM} → {PERIOD_TO} · chốt lúc{' '}
            <span className="font-mono">{FROZEN_HM}</span> ngày{' '}
            <span className="font-mono">{PERIOD_TO}</span> · {visible.length}/{book.length} dòng
            đang hiện
          </p>
        </div>

        {/* Phễu — sáu bậc đã chốt. MQL và SQL là bậc 2 và bậc 3, không phải nhãn mới.
            Số ở đây là LUỸ KẾ, khác nghĩa với bộ lọc "Bậc hiện tại" bên dưới — dòng
            chú thích ngay dưới lưới nói thẳng điều đó, vì không nói thì người dùng
            đọc thành "số liệu đá nhau". */}
        <GlassCard className="p-5 lg:p-6">
          <div className="grid grid-cols-3 gap-4 lg:grid-cols-6">
            {FUNNEL.map((step) => {
              const asTier = LEAD_TIERS.find((t) => t.funnelKey === step.key)
              return (
                <div key={step.key} className="flex flex-col gap-1">
                  <span className="tnum font-num text-[22px] font-semibold">{step.count}</span>
                  <span className="text-[11.5px] leading-[1.4]">{step.label}</span>
                  {asTier && asTier.key !== 'dau-moi' ? (
                    <Badge tone={TIER_TONE[asTier.key]} className="mt-1 self-start">
                      {asTier.label}
                    </Badge>
                  ) : null}
                </div>
              )
            })}
          </div>
          <p className="text-muted-foreground mt-4 text-[11.5px] leading-[1.5]">
            Phễu đếm LUỸ KẾ cả kỳ: lead đã lên SQL vẫn được tính ở mọi bậc nó đi qua. Bộ lọc
            &quot;Bậc hiện tại&quot; bên dưới đếm bậc lead ĐANG đứng, nên hai chỗ ra số khác nhau —
            đúng như vậy, không phải lệch số.
          </p>
        </GlassCard>

        {/* 2.1 · thanh lọc */}
        <div className="flex flex-col gap-3">
          <SearchField
            size="page"
            placeholder="Tìm theo tên công ty hoặc mã lead…"
            value={query}
            onChange={setQuery}
            meta={`${visible.length} kết quả`}
          />
          <div className="flex flex-wrap gap-2">
            <FilterGroup
              label="Trạng thái"
              options={STATUSES.map((s) => ({ key: s.key, label: s.label }))}
              active={status}
              onPick={(k) => setStatus(k as StatusKey)}
            />
            <FilterGroup
              label="Bậc hiện tại"
              options={[
                { key: 'all', label: book.length > 0 ? `Tất cả · ${book.length}` : 'Tất cả' },
                ...LEAD_TIERS.map((t) => ({
                  key: t.key,
                  label: book.length > 0 ? `${t.label} · ${tierNow.get(t.key) ?? 0}` : t.label,
                })),
              ]}
              active={tier}
              onPick={(k) => setTier(k as LeadTier | 'all')}
            />
            <FilterGroup
              label="Ngành"
              options={[
                { key: 'all', label: 'Tất cả' },
                ...LEAD_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
              ]}
              active={category}
              onPick={(k) => setCategory(k as LeadCategory | 'all')}
            />
            <Button
              size="sm"
              variant={overSlaOnly ? 'default' : 'ghost'}
              onClick={() => setOverSlaOnly((v) => !v)}
            >
              Quá SLA
            </Button>
          </div>

          {/* Lọc "Quá SLA" chỉ có nghĩa trong bậc SQL — `isOverSla` đo bằng hạn của
              cột, mà chỉ lead đã vào sổ cơ hội mới có cột. Không nói ra thì bật lọc
              ở bậc đầu mối ra EmptyState, người dùng đọc thành "không ai quá hạn". */}
          {overSlaOnly ? (
            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              Ngưỡng SLA mới có cho cột của sổ cơ hội; đầu mối và MQL chưa có ngưỡng — chưa đo được.
              Lọc này vì thế chỉ lọc bên trong bậc SQL: rỗng ở hai bậc kia nghĩa là chưa ai đặt hạn,
              không phải không ai quá hạn.
            </p>
          ) : null}

          {/* Lọc theo nguồn — dây nối sang module 1. Đây là chỗ trả lời
              "đợt nào ra khách", nhìn từ phía sổ lead. */}
          <FilterGroup
            label="Nguồn"
            options={[
              { key: 'all', label: 'Mọi nguồn' },
              ...SOURCES.map((s) => ({ key: s.code, label: s.code })),
            ]}
            active={source}
            onPick={setSource}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr] lg:gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <FilterGroup
                label="Xem"
                options={[
                  { key: 'bang', label: 'Bảng' },
                  { key: 'kanban', label: 'Kanban' },
                ]}
                active={view}
                onPick={(k) => setView(k as 'bang' | 'kanban')}
              />
              {view === 'bang' && visible.length > PAGE_SIZE ? (
                <Pager page={safePage} pageCount={pageCount} onPage={setPage} />
              ) : null}
            </div>

            {/* 2.1 · danh sách. Bảng LUÔN nằm trên glass-b — luật 8. */}
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
                  message="Không có lead nào khớp bộ lọc đang chọn."
                  action={{ label: 'Bỏ hết bộ lọc', onClick: clearFilters }}
                  className="py-12"
                />
              ) : view === 'kanban' ? (
                <Kanban
                  leads={visible}
                  pickedCode={pickedCode}
                  onPick={setPickedCode}
                  onShowTable={() => setView('bang')}
                />
              ) : (
                <DataTable
                  columns={[
                    { header: 'Mã', width: '0.9fr' },
                    { header: 'Công ty', width: '1.6fr' },
                    { header: 'Ngành', width: '0.7fr' },
                    { header: 'Bậc', width: '0.7fr' },
                    { header: 'Ô bắt buộc', width: '0.8fr', align: 'right' },
                    { header: 'Nguồn', width: '0.8fr' },
                    { header: 'Người giữ', width: '1.2fr' },
                  ]}
                  rows={rows.map((l) => ({
                    id: l.code,
                    state: l.code === pickedCode ? 'selected' : 'default',
                    cells: [
                      <Chip key="c" onOpen={() => setPickedCode(l.code)}>
                        {l.code}
                      </Chip>,
                      <span key="n" className="flex items-center gap-2">
                        {l.company}
                        {isOverSla(l) ? (
                          <Icon icon={TriangleAlert} size={16} className="text-warning" />
                        ) : null}
                      </span>,
                      CATEGORY_LABEL.get(l.category) ?? l.category,
                      <Badge key="t" tone={TIER_TONE[l.tier]}>
                        {TIER_LABEL.get(l.tier) ?? l.tier}
                      </Badge>,
                      <span key="a" className="tnum font-num">
                        {l.requiredFilled}/{REQUIRED_SLOTS}
                      </span>,
                      <span key="s" className="font-mono text-[11px]">
                        {l.source}
                      </span>,
                      l.owner ?? <span className="text-muted-foreground">chưa ai nhận</span>,
                    ],
                  }))}
                />
              )}
            </GlassCard>
          </div>

          {/* 2.2 + 2.3 · thao tác trên lead đang chọn */}
          <div className="flex flex-col gap-4 lg:gap-6">
            <LeadDetail lead={picked} onPick={setPickedCode} onClear={clearFilters} />
            <ExitPanel lead={picked} />
            <NotDoing />
          </div>
        </div>
      </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------

/** Hồ sơ một lead: mười ô, cổng, giao tay, phiếu việc, và toàn bộ timeline. */
function LeadDetail({
  lead,
  onPick,
  onClear,
}: {
  lead: Lead | null
  onPick: (code: string) => void
  onClear: () => void
}) {
  const [ticketFor, setTicketFor] = useState<string | null>(null)
  /* Hai đề nghị dưới mang theo mã lead, cùng lý do với `ExitPanel`: đề nghị ở
     lead A rồi bấm sang lead B thì B không được đội nhãn "đã đề nghị" của A. */
  const [promotedFor, setPromotedFor] = useState<string | null>(null)
  const [handOver, setHandOver] = useState<{ code: string; to: string } | null>(null)

  if (!lead) {
    return (
      <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
        <h3 className="text-[13px] font-semibold">Lead đang chọn</h3>
        <EmptyState
          icon={Inbox}
          message="Chọn một dòng trong sổ để giao, nhận hoặc báo lead có vấn đề."
          action={{ label: 'Bỏ hết bộ lọc', onClick: onClear }}
          className="py-8"
        />
      </GlassCard>
    )
  }

  const gate = canPromoteToSql(lead)
  const missing = Math.max(0, REQUIRED_SLOTS - lead.requiredFilled)
  const amount = lead.dealCode ? DEAL_AMOUNT.get(lead.dealCode) : undefined
  const promoted = promotedFor === lead.code
  const handedTo = handOver?.code === lead.code ? handOver.to : null

  /* Luật 10 · ContextRail dựng thẳng từ E1, màn không tự viết chip. Lead chưa
     vào sổ cơ hội thì chưa có object nào trong đồ thị — rail hiện đúng một chip
     của chính nó, chứ không biến mất. */
  const story = lead.dealCode ? dasVina.graph.story(lead.dealCode) : []
  const rail =
    story.length > 0
      ? story.map((o) => ({ code: o.code, source: o.code !== lead.dealCode, onOpen: () => {} }))
      : [{ code: lead.code, source: false, onOpen: () => onPick(lead.code) }]

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
      <h3 className="text-[13px] font-semibold">Lead đang chọn</h3>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold">{lead.company}</span>
          <Badge tone={TIER_TONE[lead.tier]}>{TIER_LABEL.get(lead.tier) ?? lead.tier}</Badge>
        </div>
        <span className="text-muted-foreground text-[11.5px]">
          <span className="font-mono">{lead.code}</span> · {lead.province} ·{' '}
          {CATEGORY_LABEL.get(lead.category)} · vào sổ {dmy(lead.createdAt)}
        </span>
        <span className="text-[11.5px]">
          Người giữ:{' '}
          {lead.owner ? (
            <b className="font-semibold">{lead.owner}</b>
          ) : (
            <span className="text-muted-foreground">còn ở kho chung, chưa ai nhận</span>
          )}
        </span>
        {amount ? (
          <span className="text-[11.5px]">
            Giá trị đơn: <Money value={amount} scale="table" />
          </span>
        ) : null}
      </div>

      {/* Nguồn — lead nào cũng biết mình từ đâu về. Đây là dây nối module 1. */}
      <div className="bg-accent/60 flex items-start gap-2 rounded-md p-3">
        <Icon icon={Megaphone} size={16} className="text-accent-foreground mt-1" />
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold">
            <span className="font-mono">{lead.source}</span> ·{' '}
            {/* Mã lạ thì nói "chưa rõ", KHÔNG dán nhãn "nguồn tự nhiên": đó là
                một loại nguồn có thật trong SOURCES, đoán nhầm là bịa dữ liệu. */}
            {SOURCE_LABEL.get(lead.source) ?? 'chưa rõ nguồn'}
          </span>
          <span className="text-muted-foreground text-[11px] leading-[1.5]">
            Công trạng kéo lead này về ghi cho nguồn trên. Lead qua được cổng thì tính là lead tốt.
          </span>
        </div>
      </div>

      {/* Bộ 10 câu — sáu ô đầu là cổng, bốn ô sau làm dày hồ sơ. */}
      <div className="flex flex-col gap-3">
        <Progress
          value={lead.requiredFilled / REQUIRED_SLOTS}
          label={`Ô bắt buộc · ${lead.requiredFilled}/${REQUIRED_SLOTS}`}
          tone={missing > 0 ? 'warning' : 'primary'}
        />
        <ul className="flex flex-col gap-2">
          {INIT_DATA_QUESTIONS.map((q) => {
            const done = lead.filled.includes(q.key)
            return (
              <li key={q.key} className="flex items-start gap-2 text-[11.5px] leading-[1.5]">
                <StatusDot state={done ? 'ok' : q.required ? 'warning' : 'next'} className="mt-1" />
                <span className={cn(!done && 'text-muted-foreground')}>
                  <span className="font-mono">{q.no}.</span> {q.label}
                  {q.required ? null : (
                    <span className="text-muted-foreground"> · không bắt buộc</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Cổng là {REQUIRED_SLOTS} ô bắt buộc, không phải {INIT_DATA_SLOTS}/{INIT_DATA_SLOTS}. Ô nào
          bắt buộc sửa ở module Cấu hình, không sửa trên màn này.
        </p>
      </div>

      {/* Cổng MQL → SQL. Câu từ chối do engine trả, màn không tự chế.
          Cổng THẬT SỰ mở với một số lead trong sổ, nên nút này bật trên màn chứ
          không phải luôn xám. Nút bật mà bấm không phản hồi thì người dùng tưởng
          màn hỏng — vì thế bấm xong đổi ngay sang nhãn "đã đề nghị". */}
      <div className="flex flex-col gap-2">
        {promoted ? (
          <Badge tone="running" className="self-start">
            Đã đề nghị · chờ {HEAD_OF_SALES} gật
          </Badge>
        ) : (
          <Button
            size="md"
            disabled={!gate.ok}
            onClick={() => {
              setPromotedFor(lead.code)
              /* Nối E3 khi có backend: đề nghị này thành phiếu duyệt thật. */
            }}
          >
            <Icon icon={UserPlus} size={16} />
            Nhận vào pipeline
          </Button>
        )}
        {!gate.ok ? (
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            {gate.reason}.
            {/* Câu về agent 2 chỉ đúng khi cổng còn thiếu ô. Lead đã ở bậc SQL
                cũng bị `canPromoteToSql` chặn, nhưng nó ĐÃ qua cổng — nói thêm
                "chưa qua cổng" ở đó là tự mâu thuẫn với chính dòng trên. */}
            {missing > 0 ? ' Chưa qua cổng thì agent 2 không chạy.' : ''}
          </p>
        ) : (
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Người gật là Trưởng phòng Kinh doanh — {HEAD_OF_SALES}. Sale đề nghị, không tự chuyển
            bậc.
          </p>
        )}
      </div>

      {/* Phiếu việc — KHÔNG phải cơ hội. Việc đi lấy nốt ô còn thiếu, đúng việc
          của agent 1 (docs · "Phiếu việc ≠ cơ hội"). */}
      <div className="flex flex-col gap-2">
        {ticketFor === lead.code ? (
          <Badge tone="running" className="self-start">
            Đã tạo phiếu việc · {missing > 0 ? `lấy ${missing} ô còn thiếu` : 'theo dõi tiếp'}
          </Badge>
        ) : (
          <Button
            size="md"
            variant="ghost"
            onClick={() => {
              setTicketFor(lead.code)
              /* Nối One Plus · Công việc khi năng lực đó mở: phiếu việc là task
                 thật, không phải nhãn trên màn. */
            }}
          >
            <Icon icon={ClipboardList} size={16} />
            Tạo phiếu việc
          </Button>
        )}
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Phiếu việc là việc đi lấy nốt ô còn thiếu — không đẩy lead sang SQL, và khác phiếu tiếp
          cận của agent 2.
        </p>
      </div>

      {/* 2.2 · giao tay. Cũng là đề nghị chứ không phải lệnh: người gật vẫn là
          TP Kinh doanh, và luật chia lại hoa hồng phải hiện ngay cạnh nút —
          nằm trong comment thì người bấm nút không đọc được. */}
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11.5px]">Giao cho</span>
        <div className="flex flex-wrap gap-2">
          {SALES.map((name) => (
            <Button
              key={name}
              size="sm"
              variant={name === (handedTo ?? lead.owner) ? 'default' : 'ghost'}
              onClick={() => {
                setHandOver({ code: lead.code, to: name })
                /* Nối E3: đề nghị đổi tay chờ TP Kinh doanh gật, gật xong mới
                   thực sự đổi người giữ trong sổ. */
              }}
            >
              <Icon icon={ArrowLeftRight} size={16} />
              {name}
            </Button>
          ))}
        </div>
        {handedTo ? (
          <Badge tone="running" className="self-start">
            Đã đề nghị giao cho {handedTo} · chờ {HEAD_OF_SALES} gật
          </Badge>
        ) : null}
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Đổi tay thì phần chốt {COMMISSION_SPLIT.chot} của hoa hồng chia lại theo số lần chạm; phần
          mở cửa {COMMISSION_SPLIT.moCua} và đi cùng demo {COMMISSION_SPLIT.diCungDemo} không đụng
          tới.
        </p>
      </div>

      <ContextRail objects={rail} />

      <Timeline lead={lead} />
    </GlassCard>
  )
}

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

/** Toàn bộ đời của lead. Danh sách dài → nằm trên glass-b (luật 8). */
function Timeline({ lead }: { lead: Lead }) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <h4 className="text-[12px] font-semibold">Timeline · {lead.history.length} mốc</h4>
      <ol className="flex flex-col gap-3">
        {lead.history.map((e, i) => (
          <li key={`${e.at}-${i}`} className="flex items-start gap-3">
            <StatusDot state={EVENT_DOT[e.kind]} className="mt-1" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[11.5px] leading-[1.5]">{e.note}</span>
              <span className="text-muted-foreground text-[11px]">
                <span className="font-mono">{dm(e.at)}</span> · {e.by}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </GlassCard>
  )
}

/** 2.3 · report. ĐÚNG sáu lý do, không có ô "khác". */
function ExitPanel({ lead }: { lead: Lead | null }) {
  /* Báo cáo thuộc về ĐÚNG một lead nên state phải mang theo mã lead. Giữ mỗi
     `ExitReason` thì báo xong lead A, bấm sang lead B là B đội luôn nhãn "đã
     báo" của A — panel nói dối về một dòng chưa ai đụng tới. */
  const [reported, setReported] = useState<{ code: string; reason: ExitReason } | null>(null)
  const [draft, setDraft] = useState<{ code: string; reason: ExitReason } | null>(null)

  const myReport = lead && reported?.code === lead.code ? reported.reason : null
  const myDraft = lead && draft?.code === lead.code ? draft.reason : null

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
      <div className="flex items-center gap-2">
        <Icon icon={TriangleAlert} size={16} className="text-warning" />
        <h3 className="text-[13px] font-semibold">Lead có vấn đề</h3>
      </div>

      {lead?.exitReason ? (
        <div className="flex flex-col gap-2">
          <Badge tone="danger" className="self-start">
            Đã ra khỏi luồng · {lead.exitReason}
          </Badge>
          <span className="text-muted-foreground text-[11.5px]">
            {lead.exitedAt ? `Ghi nhận ${dmy(lead.exitedAt)}` : null}
          </span>
        </div>
      ) : myReport ? (
        <div className="flex flex-col gap-3">
          <Badge tone="warning" className="self-start">
            Đã báo · {myReport}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => setReported(null)}>
            Rút lại
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {EXIT_REASONS.map((r) => (
              <Button
                key={r.label}
                size="sm"
                variant={myDraft === r.label ? 'default' : 'ghost'}
                disabled={!lead}
                onClick={() => lead && setDraft({ code: lead.code, reason: r.label })}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <Button
            size="md"
            variant="destructive"
            disabled={!lead || !myDraft}
            onClick={() => {
              if (!lead || !myDraft) return
              setReported({ code: lead.code, reason: myDraft })
              setDraft(null)
              /* Nối E2 khi có backend: mọi lần đưa lead ra khỏi luồng phải ghi vết. */
            }}
          >
            Đưa ra khỏi luồng
          </Button>
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Sáu lý do là toàn bộ danh sách, không có ô &quot;khác&quot;. Lý do thứ bảy là hành động
            cấu hình ở module 5, không gõ vào màn.
          </p>
        </>
      )}
    </GlassCard>
  )
}

/** Cố tình không làm — ba thứ bị bỏ có chủ ý, kèm lý do.
 *
 *  Khối này ở TRÊN MÀN chứ không nằm trong comment: cả ba đều là câu người dùng
 *  hỏi ngay khi bấm phải một nút chỉ ghi đề nghị, hoặc khi bật "Quá SLA" ở bậc
 *  đầu mối và thấy trống. Người dùng màn không đọc source. */
function NotDoing() {
  const items = [
    {
      title: 'Nút giao và nhận mới dừng ở đề nghị',
      body: `Bấm xong màn ghi "đã đề nghị" và chờ ${HEAD_OF_SALES} gật. E3 chưa nối nên chưa có phiếu duyệt thật, chưa ai nhận thông báo, và người giữ lead trong sổ chưa đổi.`,
    },
    {
      title: 'Đầu mối và MQL chưa có ngưỡng quá hạn',
      body: 'Hạn chỉ có ở năm cột của sổ cơ hội. Ngưỡng cho hai bậc đầu là mục 5.5 của module Cấu hình, chưa ai đặt giá trị — chế một con số ở tầng màn thì cả màn nói dối theo.',
    },
    {
      title: 'Không có khối AI trên màn này',
      body: 'Agent 2 dựng phiếu tiếp cận SAU khi lead qua cổng. Đặt nút AI cạnh một lead còn thiếu ô bắt buộc là mời người dùng bấm vào thứ chưa chạy được.',
    },
  ]

  return (
    <GlassCard className="flex flex-col gap-3 p-5 lg:p-6">
      <h3 className="text-[13px] font-semibold">Cố tình không làm</h3>
      <ul className="flex flex-col gap-3">
        {items.map((it) => (
          <li key={it.title} className="flex flex-col gap-1">
            <b className="text-[11.5px] font-semibold">{it.title}</b>
            <span className="text-muted-foreground text-[11.5px] leading-[1.5]">{it.body}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

/** Kanban năm cột. CHỈ lead đã vào sổ cơ hội có mặt ở đây — lead chưa qua cổng
 *  không có cột nào để đứng, vẽ nó lên là nói dối về trạng thái. */
function Kanban({
  leads,
  pickedCode,
  onPick,
  onShowTable,
}: {
  leads: Lead[]
  pickedCode: string | null
  onPick: (code: string) => void
  onShowTable: () => void
}) {
  const inPipeline = leads.filter((l) => l.stage)

  if (inPipeline.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        message="Không lead nào trong bộ lọc này đã vào sổ cơ hội. Kanban chỉ vẽ lead đã qua cổng."
        /* Lối ra phải bấm được: lọc "đầu mối" thì kanban luôn rỗng, và bảng mới
           là chỗ xem được số lead đó. Nút chết ở đây là ngõ cụt. */
        action={{ label: 'Xem dạng bảng', onClick: onShowTable }}
        className="py-12"
      />
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
      {PIPELINE_STAGES.map((stage) => {
        const col = inPipeline.filter((l) => l.stage === stage.key)
        return (
          <div key={stage.key} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold">{stage.label}</span>
              <span className="text-muted-foreground text-[11px]">
                <span className="tnum font-num">{col.length}</span> đơn · hạn {stage.limitDays} ngày
              </span>
            </div>

            {col.map((l) => {
              /* Không có giá thì KHÔNG in gì. `?? 0` vẽ ra "0 ₫" như thể đơn trị
                 giá 0 — một con số không ai ký. */
              const amount = l.dealCode ? DEAL_AMOUNT.get(l.dealCode) : undefined
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => onPick(l.code)}
                  className={cn(
                    'flex flex-col gap-2 rounded-md bg-white/5 p-3 text-left',
                    l.code === pickedCode && 'bg-accent',
                  )}
                >
                  <span className="text-[11.5px] font-semibold">{l.company}</span>
                  {l.dealCode ? (
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {l.dealCode}
                    </span>
                  ) : null}
                  {amount ? <Money value={amount} scale="table" /> : null}
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[11px]">{l.daysHere} ngày</span>
                    {isOverSla(l) ? (
                      <Icon icon={TriangleAlert} size={16} className="text-warning" />
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/** Phân trang. Sổ 100 dòng không cuộn vô tận — người dùng phải biết mình đang ở
 *  đâu trong sổ. */
function Pager({
  page,
  pageCount,
  onPage,
}: {
  page: number
  pageCount: number
  onPage: (p: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => onPage(page - 1)}>
        <Icon icon={ChevronLeft} size={16} />
        Trước
      </Button>
      <span className="text-muted-foreground tnum font-num text-[11.5px]">
        {page + 1}/{pageCount}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
      >
        Sau
        <Icon icon={ChevronRight} size={16} />
      </Button>
    </div>
  )
}

/** Một nhóm nút lọc. Chưa tách ra @pv/ui vì mới dùng ở đúng một chỗ — tách khi
 *  màn thứ hai cần đến, và lúc đó phải lên trang kit cùng lúc. */
function FilterGroup({
  label,
  options,
  active,
  onPick,
}: {
  label: string
  options: { key: string; label: string }[]
  active: string
  onPick: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      {options.map((o) => (
        <Button
          key={o.key}
          size="sm"
          variant={active === o.key ? 'default' : 'ghost'}
          onClick={() => onPick(o.key)}
          className={cn(active === o.key && 'shadow-primary')}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

export default LeadsPage
