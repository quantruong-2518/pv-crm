import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsRight, Inbox, Pin, TriangleAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  AvatarGroup,
  Badge,
  Button,
  Chip,
  ContextRail,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  Kicker,
  SearchField,
  Select,
  Skeleton,
  cn,
  type TableSort,
} from '@pv/ui'
import {
  DAS_VINA_FROZEN_AT,
  dasVina,
  dayISO,
  FUNNEL,
  isOverSla,
  isRunning,
  LEAD_CATEGORIES,
  LEAD_TIERS,
  leadOrigin,
  PIPELINE_STAGES,
  REQUIRED_SLOTS,
  SOURCES,
  type Lead,
  type LeadCategory,
  type LeadTier,
} from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { pinsOf, useLeadDesk } from '@/app/desk'
import { useSession } from '@/app/session'
import { dm } from '@/lib/date'
import {
  ANCHOR_CODE,
  leadBookQuery,
  myWork,
  ORIGIN_FACE,
  peopleOn,
  WORK_COLUMNS,
  type WorkColumn,
  type WorkItem,
} from '@/data/leads'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'

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
 *   1 · phễu — thẻ điểm của cả kỳ, VÀ là bộ lọc: bấm một bậc là lọc theo bậc đó;
 *   2 · một hàng lọc — ô tìm + bốn select, không còn ba chục nút pill;
 *   3 · sổ — ghim của tôi tách lên trên, rồi bảng phân trang.
 *
 *  Tab thứ hai **Việc của tôi** là cùng một sổ nhìn từ phía người đăng nhập:
 *  việc xếp theo cột kanban của phòng, việc mới giao nằm đúng cột nó thuộc về.
 *  Người nhận việc không bấm "next" — họ bấm ĐÚNG hành động của việc đó, và
 *  luồng tự trôi trong kanban.
 *
 *  Sổ là CẢ KỲ 01/05 → 17/08: 100 dòng, phân trang, không cuộn vô tận.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. Vào được màn này là vai có
 *  nhánh Sales — cửa ở `app/guard.tsx`, không kiểm lại ở đây.
 *
 *  State: bộ lọc, trang, tab và cột sắp xếp là chuyện RIÊNG của màn nên giữ ở
 *  đây bằng `useState`. Ghim và đề nghị giao việc sống lâu hơn một lần mở màn và
 *  đi qua cả màn chi tiết — chúng nằm ở `app/desk.ts`. */

const PAGE_SIZE = 10

/* Mốc kỳ suy từ fixture, không gõ vào JSX. `dayISO(0)` là ngày đầu kỳ. */
const PERIOD_FROM = dm(dayISO(0))
const PERIOD_TO = dm(DAS_VINA_FROZEN_AT)

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

const CATEGORY_LABEL = new Map(LEAD_CATEGORIES.map((c) => [c.key, c.label]))
const TIER_LABEL = new Map(LEAD_TIERS.map((t) => [t.key, t.label]))
const STAGE_LABEL = new Map(PIPELINE_STAGES.map((s) => [s.key, s.label]))

function matchStatus(lead: Lead, status: StatusKey): boolean {
  if (status === 'all') return true
  if (status === 'signed') return Boolean(lead.contractCode)
  if (status === 'exited') return Boolean(lead.exitReason)
  return isRunning(lead)
}

export function LeadsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { data: book = [], isPending } = useQuery(leadBookQuery)

  const me = useSession((s) => s.actor)
  const assigns = useLeadDesk((s) => s.assigns)
  const pins = useLeadDesk((s) => pinsOf(s, me?.id))
  const togglePin = useLeadDesk((s) => s.togglePin)

  const [tab, setTab] = useState<'so' | 'viec'>('so')
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState<LeadTier | 'all'>('all')
  const [category, setCategory] = useState<LeadCategory | 'all'>('all')
  const [source, setSource] = useState<string>('all')
  const [status, setStatus] = useState<StatusKey>('running')
  const [overSlaOnly, setOverSlaOnly] = useState(false)
  const [sort, setSort] = useState<TableSort | undefined>()
  const [page, setPage] = useState(0)

  const open = (code: string) => navigate(`/sales/leads/${code}`)

  const filtered = useMemo(
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

  /* Sắp xếp nằm ở màn, không ở `DataTable`: thứ tự là trạng thái của màn, bảng
     chỉ vẽ mũi tên. Không cột nào đang sắp thì giữ nguyên thứ tự sổ. */
  const visible = useMemo(() => {
    if (!sort) return filtered
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.key === 'company') return a.company.localeCompare(b.company) * dir
      if (sort.key === 'slots') return (a.requiredFilled - b.requiredFilled) * dir
      return (a.daysHere - b.daysHere) * dir
    })
  }, [filtered, sort])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  /* Đổi bộ lọc mà đang đứng ở trang 7 thì phải về trang đầu, nếu không người
     dùng thấy một trang trắng và tưởng là không có kết quả. */
  useEffect(() => setPage(0), [status, tier, category, source, overSlaOnly, query, sort])
  /* `useEffect` trên chạy SAU lượt vẽ, nên chỉ dựa vào nó thì vẫn lọt đúng một
     nhịp bảng trắng. Kẹp luôn lúc dựng để nhịp đó không bao giờ lên màn hình. */
  const safePage = Math.min(page, pageCount - 1)
  const rows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  const pinned = useMemo(
    () =>
      pins.map((code) => book.find((l) => l.code === code)).filter((l): l is Lead => Boolean(l)),
    [pins, book],
  )

  const work = useMemo(() => myWork({ actor: me, leads: book, assigns }), [me, book, assigns])

  /* Bậc HIỆN TẠI đếm lại từ sổ, KHÔNG mượn `FUNNEL.count`: phễu là luỹ kế (đã
     từng đạt bậc), ô lọc này là bậc lead đang đứng. Mượn số của phễu thì chọn
     "MQL" ra một đằng còn đầu màn ghi một nẻo. */
  const tierNow = useMemo(
    () => new Map(LEAD_TIERS.map((t) => [t.key, book.filter((l) => l.tier === t.key).length])),
    [book],
  )

  const dirty =
    query !== '' ||
    tier !== 'all' ||
    category !== 'all' ||
    source !== 'all' ||
    status !== 'running' ||
    overSlaOnly

  const clearFilters = () => {
    setQuery('')
    setTier('all')
    setCategory('all')
    setSource('all')
    setStatus('running')
    setOverSlaOnly(false)
  }

  /* Luật 10 · ContextRail dựng thẳng từ E1, ở TẦNG MÀN chứ không trong một
     panel — hai tab là hai việc của cùng một màn, rail không được biến mất khi
     người dùng sang tab kia. Chuỗi đi qua đơn của dòng mồi. */
  const anchor = book.find((l) => l.code === ANCHOR_CODE)
  const story = anchor?.dealCode ? dasVina.graph.story(anchor.dealCode) : []
  const rail =
    story.length > 0
      ? story.map((o) => ({
          code: o.code,
          source: o.code !== anchor?.dealCode,
          onOpen: () => open(ANCHOR_CODE),
        }))
      : [{ code: ANCHOR_CODE, source: false, onOpen: () => open(ANCHOR_CODE) }]

  return (
    <AppShell {...chrome.shell}>
      <div className="flex flex-col gap-4 lg:gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">Sổ lead</h2>
            <p className="text-muted-foreground mt-1 text-[12px]">
              DAS Vina · kỳ{' '}
              <span className="font-mono">
                {PERIOD_FROM} → {PERIOD_TO}
              </span>{' '}
              · {book.length} dòng cả kỳ
            </p>
          </div>

          {/* Hai tab là hai câu hỏi khác nhau trên cùng một sổ: "phòng đang có
              gì" và "tôi phải làm gì". */}
          <div className="flex gap-2">
            <Button
              size="md"
              variant={tab === 'so' ? 'default' : 'ghost'}
              onClick={() => setTab('so')}
            >
              Sổ lead
            </Button>
            <Button
              size="md"
              variant={tab === 'viec' ? 'default' : 'ghost'}
              onClick={() => setTab('viec')}
            >
              Việc của tôi · {work.length}
            </Button>
          </div>
        </div>

        <ContextRail objects={rail} />

        {tab === 'viec' ? (
          <MyWork items={work} onOpen={open} onSeeBook={() => setTab('so')} />
        ) : (
          <>
            <FunnelCard
              book={book}
              tier={tier}
              status={status}
              onTier={setTier}
              onStatus={setStatus}
            />

            {/* Một hàng lọc. Ô tìm nở hết chỗ còn lại, bốn select cùng cao 40px
                đứng cạnh nó — không còn ba dòng nút pill để mắt phải quét. */}
            <div className="flex flex-wrap items-center gap-3">
              <SearchField
                size="topbar"
                placeholder="Tìm theo tên công ty hoặc mã lead…"
                value={query}
                onChange={setQuery}
                className="min-w-[240px] flex-1"
              />
              <Select
                label="Trạng thái"
                value={status}
                neutralValue="running"
                onChange={(v) => setStatus(v as StatusKey)}
                options={STATUSES.map((s) => ({ value: s.key, label: s.label }))}
              />
              <Select
                label="Bậc"
                value={tier}
                onChange={(v) => setTier(v as LeadTier | 'all')}
                options={[
                  { value: 'all', label: 'Tất cả' },
                  ...LEAD_TIERS.map((t) => ({
                    value: t.key,
                    label: `${t.label} · ${tierNow.get(t.key) ?? 0}`,
                  })),
                ]}
              />
              <Select
                label="Ngành"
                value={category}
                onChange={(v) => setCategory(v as LeadCategory | 'all')}
                options={[
                  { value: 'all', label: 'Tất cả' },
                  ...LEAD_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
                ]}
              />
              <Select
                label="Nguồn"
                value={source}
                onChange={setSource}
                /* Tên chiến dịch dài tới 40 ký tự và `<select>` gốc nở theo
                   option dài nhất — không kẹp thì một ô lọc nuốt nửa hàng. */
                className="max-w-[240px]"
                options={[
                  { value: 'all', label: 'Mọi nguồn' },
                  ...SOURCES.map((s) => ({ value: s.code, label: `${s.code} · ${s.label}` })),
                ]}
              />
              <Button
                size="md"
                variant={overSlaOnly ? 'default' : 'ghost'}
                onClick={() => setOverSlaOnly((v) => !v)}
              >
                <Icon icon={TriangleAlert} size={16} />
                Quá SLA
              </Button>
              {dirty && (
                <Button size="md" variant="ghost" onClick={clearFilters}>
                  Bỏ hết bộ lọc
                </Button>
              )}
            </div>

            {/* Lọc "Quá SLA" chỉ có nghĩa trong bậc SQL — `isOverSla` đo bằng hạn
                của cột, mà chỉ lead đã vào sổ cơ hội mới có cột. Không nói ra thì
                bật lọc ở bậc đầu mối ra EmptyState, người dùng đọc thành "không
                ai quá hạn". */}
            {overSlaOnly && (
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Ngưỡng SLA mới có cho cột của sổ cơ hội; đầu mối và MQL chưa có ngưỡng — chưa đo
                được. Lọc này vì thế chỉ lọc bên trong bậc SQL: rỗng ở hai bậc kia nghĩa là chưa ai
                đặt hạn, không phải không ai quá hạn.
              </p>
            )}

            {pinned.length > 0 && (
              <PinnedStrip
                leads={pinned}
                onOpen={open}
                onUnpin={(code) => me && togglePin(me.id, code)}
              />
            )}

            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-[11.5px]">
                <span className="tnum font-num">{visible.length}</span> dòng khớp bộ lọc
              </span>
              {visible.length > PAGE_SIZE && (
                <Pager page={safePage} pageCount={pageCount} onPage={setPage} />
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
              ) : visible.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  message="Không có lead nào khớp bộ lọc đang chọn."
                  action={{ label: 'Bỏ hết bộ lọc', onClick: clearFilters }}
                  className="py-12"
                />
              ) : (
                <DataTable
                  sort={sort}
                  onSort={(key) =>
                    setSort((s) =>
                      s?.key === key
                        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
                        : { key, dir: 'asc' },
                    )
                  }
                  columns={[
                    { header: 'Ghim', width: '52px' },
                    { header: 'Mã', width: '0.9fr' },
                    { header: 'Công ty', width: '2fr', sortKey: 'company' },
                    { header: 'Nguồn', width: '1fr' },
                    { header: 'Bậc', width: '0.7fr' },
                    { header: 'Ô bắt buộc', width: '0.9fr', align: 'right', sortKey: 'slots' },
                    { header: 'Đang ở', width: '1.3fr', sortKey: 'days' },
                    { header: 'Đang làm', width: '1fr' },
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
                      <span key="n" className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{l.company}</span>
                        {isOverSla(l) && (
                          <Icon icon={TriangleAlert} size={16} className="text-warning shrink-0" />
                        )}
                      </span>,
                      <SourceMark key="s" lead={l} />,
                      <Badge key="t" tone={TIER_TONE[l.tier]}>
                        {TIER_LABEL.get(l.tier) ?? l.tier}
                      </Badge>,
                      <span key="a" className="tnum font-num">
                        {l.requiredFilled}/{REQUIRED_SLOTS}
                      </span>,
                      <WhereCell key="w" lead={l} />,
                      <AvatarGroup key="o" names={peopleOn(l, assigns, dasVina.actors)} />,
                    ],
                  }))}
                />
              )}
            </GlassCard>

            {visible.length > PAGE_SIZE && (
              <div className="flex justify-end">
                <Pager page={safePage} pageCount={pageCount} onPage={setPage} />
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------

/** Phễu — thẻ điểm của cả kỳ VÀ bộ lọc chính.
 *
 *  Bản trước là sáu con số nằm im trên một thẻ: chiếm chỗ nhất màn mà không trả
 *  lời được câu nào ngoài "có sáu bậc". Bản này thêm ba thứ khiến nó đáng chỗ:
 *   · **tỉ lệ qua bậc** — thứ duy nhất nói được phễu đang tắc ở đâu;
 *   · **thanh dài theo số** — so bậc bằng mắt, không phải đọc rồi trừ;
 *   · **bấm được** — ba bậc có bậc lead tương ứng thì bấm vào là lọc theo bậc
 *     đó, và ba con số cân sổ ở góc phải là ba bộ lọc trạng thái.
 *
 *  Số ở đây LUỸ KẾ (đã từng đạt bậc), khác nghĩa với "bậc hiện tại" của ô lọc
 *  Bậc — dòng cuối nói thẳng điều đó, vì không nói thì người dùng đọc thành "số
 *  liệu đá nhau". */
function FunnelCard({
  book,
  tier,
  status,
  onTier,
  onStatus,
}: {
  book: Lead[]
  tier: LeadTier | 'all'
  status: StatusKey
  onTier: (t: LeadTier | 'all') => void
  onStatus: (s: StatusKey) => void
}) {
  const top = FUNNEL[0]?.count ?? 1
  const balance = [
    { key: 'signed' as const, label: 'đã ký', n: book.filter((l) => l.contractCode).length },
    { key: 'running' as const, label: 'đang chạy', n: book.filter(isRunning).length },
    { key: 'exited' as const, label: 'đã rơi', n: book.filter((l) => l.exitReason).length },
  ]

  return (
    <GlassCard className="flex flex-col gap-4 p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Kicker>
          Phễu {PERIOD_FROM} → {PERIOD_TO}
        </Kicker>
        <div className="flex flex-wrap gap-2">
          {balance.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => onStatus(b.key)}
              className={cn(
                'motion-std flex items-center gap-2 rounded-sm px-2 py-1 text-[11px]',
                status === b.key
                  ? 'bg-primary/24 text-accent-foreground font-semibold'
                  : 'text-glass-foreground bg-white/9 hover:bg-white/16',
              )}
            >
              <span className="tnum font-num text-[12.5px] font-semibold">{b.n}</span>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {FUNNEL.map((step, i) => {
          const asTier = LEAD_TIERS.find((t) => t.funnelKey === step.key)
          const prev = FUNNEL[i - 1]
          const pass = prev ? Math.round((step.count / prev.count) * 100) : null
          const active = Boolean(asTier) && tier === asTier?.key

          const body = (
            <>
              <span className="flex items-baseline gap-2">
                <span className="tnum font-num text-[26px] font-semibold leading-none tracking-[-.8px]">
                  {step.count}
                </span>
                {pass !== null && (
                  <span className="text-muted-foreground tnum flex items-center text-[11px]">
                    <Icon icon={ChevronsRight} size={14} />
                    {pass}%
                  </span>
                )}
              </span>

              {/* Hàng nhãn giữ chiều cao tối thiểu để thanh của sáu ô thẳng
                  hàng, kể cả ô không có badge bậc. */}
              <span className="flex min-h-5 flex-wrap items-center gap-2">
                <span
                  className={cn('text-[11.5px]', active && 'text-accent-foreground font-semibold')}
                >
                  {step.label}
                </span>
                {/* Badge chỉ có nghĩa khi nó NÓI THÊM: bậc `dau-moi` trùng tên
                    với bậc phễu, in ra là "Đầu mối · Đầu mối". */}
                {asTier && asTier.label !== step.label && (
                  <Badge tone={TIER_TONE[asTier.key]}>{asTier.label}</Badge>
                )}
              </span>

              {/* Thanh dài theo số. Không phải trang trí: sáu con số xếp hàng thì
                  mắt phải đọc từng cái, sáu thanh thì thấy ngay chỗ hụt. */}
              <span className="h-1 w-full overflow-hidden rounded-sm bg-white/10">
                <span
                  className={cn(
                    'block h-full rounded-sm',
                    active ? 'bg-accent-foreground' : 'bg-primary',
                  )}
                  style={{ width: `${(step.count / top) * 100}%` }}
                />
              </span>
            </>
          )

          const shape = cn(
            'motion-std flex flex-col gap-2 rounded-md p-3 text-left',
            active ? 'bg-primary/24' : 'bg-white/5',
          )

          /* Chỉ ba bậc có bậc lead tương ứng mới bấm được. Ba bậc còn lại
             (báo giá · chờ ký · hợp đồng) là trạng thái của ĐƠN chứ không phải
             bậc của lead — dựng nút cho chúng là hứa một bộ lọc không tồn tại. */
          return asTier ? (
            <button
              key={step.key}
              type="button"
              title={active ? 'Bỏ lọc bậc này' : `Lọc sổ theo bậc ${asTier.label}`}
              onClick={() => onTier(active ? 'all' : asTier.key)}
              className={cn(shape, !active && 'hover:bg-white/9')}
            >
              {body}
            </button>
          ) : (
            <div key={step.key} className={shape}>
              {body}
            </div>
          )
        })}
      </div>

      <p className="text-muted-foreground text-[11px] leading-[1.5]">
        Phễu đếm LUỸ KẾ cả kỳ: lead đã lên SQL vẫn được tính ở mọi bậc nó đi qua. Ô lọc
        &quot;Bậc&quot; đếm bậc lead ĐANG đứng, nên hai chỗ ra số khác nhau — đúng như vậy, không
        phải lệch số.
      </p>
    </GlassCard>
  )
}

/** Nguồn của một lead: hình của kênh + mã nguồn, cùng cỡ với chữ trong ô.
 *
 *  Đây là dây nối sang module 1 nhìn từ phía sổ. Kênh nào là hình nào đọc từ
 *  module 5 · Cấu hình, không khai lại ở đây. Nguồn tự nhiên không đi qua kênh
 *  nào nên lấy hình của KIỂU xuất xứ — bắt tay cho "khách cũ giới thiệu", ngòi
 *  bút cho "BD tự mở". */
function SourceMark({ lead }: { lead: Lead }) {
  const origin = leadOrigin(lead)
  const face = ORIGIN_FACE[origin.kind]
  const icon = origin.channel ? CHANNEL_ICON[origin.channel] : face.icon
  const title = origin.channel
    ? `${origin.label} · ${CHANNEL_LABEL[origin.channel]}`
    : `${origin.label} · ${face.label}`

  return (
    <span className="flex min-w-0 items-center gap-2" title={title}>
      <Icon icon={icon} size={16} className="text-accent-foreground shrink-0" />
      <span className="truncate font-mono text-[11px]">{origin.code}</span>
    </span>
  )
}

/** Lead đang đứng ở đâu — một ô trả lời cho cả ba loại dòng: đã ký, đã rơi, và
 *  đang chạy ở một cột của sổ cơ hội. */
function WhereCell({ lead }: { lead: Lead }) {
  if (lead.contractCode) {
    return <span className="text-success text-[11.5px]">Đã ký · {lead.contractCode}</span>
  }
  if (lead.exitReason) {
    return (
      <span className="text-muted-foreground block truncate text-[11.5px]" title={lead.exitReason}>
        Đã rơi · {lead.exitReason}
      </span>
    )
  }
  if (!lead.stage) {
    return <span className="text-muted-foreground text-[11.5px]">Chưa vào sổ cơ hội</span>
  }
  return (
    <span className="text-[11.5px]">
      {STAGE_LABEL.get(lead.stage)} · <span className="tnum font-num">{lead.daysHere}</span> ngày
    </span>
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
  leads: Lead[]
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
                {CATEGORY_LABEL.get(l.category) ?? l.category} · {l.requiredFilled}/{REQUIRED_SLOTS}{' '}
                ô
              </span>
            </button>
            <PinCell on company={l.company} onToggle={() => onUnpin(l.code)} />
          </GlassCard>
        ))}
      </div>
    </div>
  )
}

/** Việc của tôi — cùng một sổ, xếp theo cột kanban của phòng.
 *
 *  Người nhận việc KHÔNG bấm "next": mỗi thẻ mang đúng hành động của việc đó
 *  (lấy nốt ô, đề nghị vào pipeline, báo tắc, nhắc ký) và luồng tự trôi sang cột
 *  kế trong kanban của phòng. Vì thế thẻ không có nút "hoàn thành" — không việc
 *  nào ở đây kết thúc bằng một dấu tick.
 *
 *  Việc VỪA ĐƯỢC GIAO đứng ở đúng cột nó thuộc về và đeo nhãn "mới", chứ không
 *  gom vào một hộp riêng: người nhận cần thấy việc mới rơi vào chỗ nào trong
 *  luồng, không phải thấy nó nằm ngoài luồng. */
function MyWork({
  items,
  onOpen,
  onSeeBook,
}: {
  items: WorkItem[]
  onOpen: (code: string) => void
  onSeeBook: () => void
}) {
  const acted = useLeadDesk((s) => s.acted)
  const act = useLeadDesk((s) => s.act)

  if (items.length === 0) {
    return (
      <GlassCard className="p-5 lg:p-6">
        <EmptyState
          icon={Inbox}
          message="Vai này chưa có việc nào trên sổ lead: chưa giữ lead nào và chưa ai giao việc gì. Mở sổ để nhận một dòng về mình."
          action={{ label: 'Mở sổ lead', onClick: onSeeBook }}
          className="py-12"
        />
      </GlassCard>
    )
  }

  const summary = [
    { label: 'việc đang mở', n: items.length },
    { label: 'mới giao cho tôi', n: items.filter((i) => i.fresh).length },
    { label: 'quá hạn cột', n: items.filter((i) => i.overSla).length },
  ]

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <div className="flex flex-wrap gap-3">
        {summary.map((s) => (
          <GlassCard key={s.label} className="flex items-baseline gap-2 px-4 py-3">
            <span className="tnum font-num text-[20px] font-semibold">{s.n}</span>
            <span className="text-muted-foreground text-[11.5px]">{s.label}</span>
          </GlassCard>
        ))}
      </div>

      {/* Danh sách dài nằm trên glass-b — luật 8. */}
      <GlassCard variant="b" className="p-4 lg:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {WORK_COLUMNS.map((col) => (
            <WorkColumnView
              key={col.key}
              column={col}
              items={items.filter((i) => i.column === col.key)}
              acted={acted}
              onAct={act}
              onOpen={onOpen}
            />
          ))}
        </div>
      </GlassCard>

      <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
        Bấm hành động trên thẻ là ĐỀ NGHỊ — luồng trôi sang cột kế trong kanban của phòng sau khi TP
        Kinh doanh gật. Không có nút &quot;hoàn thành&quot; ở đây: việc kết thúc bằng lead sang cột
        khác, không bằng một dấu tick.
      </p>
    </div>
  )
}

function WorkColumnView({
  column,
  items,
  acted,
  onAct,
  onOpen,
}: {
  column: { key: WorkColumn; label: string; limitDays?: number }
  items: WorkItem[]
  acted: Record<string, string[]>
  onAct: (code: string, key: string) => void
  onOpen: (code: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-[11.5px] font-semibold">{column.label}</span>
        <span className="text-muted-foreground text-[11px]">
          <span className="tnum font-num">{items.length}</span> việc
          {column.limitDays ? ` · hạn ${column.limitDays} ngày` : ''}
        </span>
      </div>

      {items.length === 0 ? (
        <span className="text-muted-foreground rounded-md bg-white/5 p-3 text-[11px]">
          Không có việc nào ở cột này.
        </span>
      ) : (
        /* Cột tự cuộn, không để cột dài nhất kéo cả bảng xuống ba màn hình. Sáu
           cột phải nhìn thấy cùng lúc thì mới trả lời được câu "việc đang tắc ở
           cột nào" — đó là toàn bộ lý do bảng này xếp theo cột. */
        <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
          {items.map((item) => {
            const done = (acted[item.lead.code] ?? []).includes(item.action.key)
            return (
              <div
                key={item.lead.code}
                role="button"
                tabIndex={0}
                /* Tên riêng cho cả thẻ. Không có nó thì tên trợ năng của thẻ là
                 toàn bộ chữ bên trong — kể cả nhãn của nút hành động nằm trong
                 nó — và "thẻ" với "nút" hoá ra cùng một tên. */
                aria-label={`Mở hồ sơ ${item.lead.company}`}
                onClick={() => onOpen(item.lead.code)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  onOpen(item.lead.code)
                }}
                className={cn(
                  'motion-std hover:shadow-card flex cursor-pointer flex-col gap-2 rounded-md bg-white/5 p-3 outline-none',
                  'hover:bg-white/9 focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11.5px] font-semibold leading-[1.4]">
                    {item.lead.company}
                  </span>
                  {item.overSla && (
                    <Icon icon={TriangleAlert} size={16} className="text-warning shrink-0" />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground font-mono text-[10.5px]">
                    {item.lead.code}
                  </span>
                  {item.fresh && <Badge tone="running">mới</Badge>}
                </div>

                <span className="text-muted-foreground text-[11px] leading-[1.5]">
                  {item.reason}
                </span>

                {done ? (
                  <Badge tone="warning" className="self-start">
                    Đã đề nghị
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      onAct(item.lead.code, item.action.key)
                    }}
                    className="self-start"
                  >
                    <Icon icon={item.action.icon} size={16} />
                    {item.action.label}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
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

export default LeadsPage
