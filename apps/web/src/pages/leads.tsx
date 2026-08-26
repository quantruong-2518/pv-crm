import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Pin,
  TriangleAlert,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
  InsetPanel,
  Kicker,
  PageHeader,
  SearchField,
  SectionTitle,
  Select,
  TableSkeleton,
  cn,
  type TableSort,
} from '@pv/ui'
import {
  DAS_VINA_FROZEN_AT,
  dasVina,
  dayISO,
  isOverSla,
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
  EMPTY_ICON,
  filterBook,
  funnelRows,
  isFiltered,
  LEAD_STATUSES,
  leadBookQuery,
  leadsOfSource,
  myWork,
  OPEN_FILTER,
  ORIGIN_FACE,
  PAGE_SIZE,
  peopleOn,
  planLine,
  statusCounts,
  STATUS_LABEL,
  tierCounts,
  unownedCount,
  WORK_COLUMNS,
  type BookFilter,
  type PlanLine,
  type StatusKey,
  type WorkColumn,
  type WorkItem,
} from '@/data/leads'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'

/** Module 2 · Sổ lead (docs/kien-truc-san-pham.md · "Năm module Pebble Sales").
 *
 *  ------------------------------------------------------------------
 *  MÀN NÀY LÀ MỘT DANH SÁCH, KHÔNG PHẢI MỘT BÀN LÀM VIỆC
 *  ------------------------------------------------------------------
 *  Bản trước nhét cả hồ sơ lead vào panel bên phải: bảng co còn 60% chiều rộng,
 *  panel phải cuộn ba màn hình mới hết, và cùng một lead thao tác được ở hai
 *  chỗ. Chốt lại: **danh sách ở đây, hồ sơ ở `/sales/leads/:code`.** Bấm một
 *  dòng là sang trang — dòng nổi lên và đổi con trỏ để nói ra điều đó.
 *
 *  Tám khối, đúng thứ tự mắt cần:
 *   1 · `PageHeader` — tiêu đề, hai tab, và ContextRail thành hàng riêng;
 *   2 · một dòng chỉ tiêu của kỳ — con số kế hoạch, xem đoạn dưới;
 *   3 · phễu — thẻ điểm của cả kỳ, VÀ là bộ lọc: bấm một bậc là lọc theo bậc đó;
 *   4 · một hàng lọc — ô tìm + bốn select, không còn ba chục nút pill;
 *   5 · ghim của tôi — tách lên trên, vì ghim nằm lẫn trong bảng thì vô nghĩa;
 *   6 · bảng;
 *   7 · phân trang, ĐÚNG MỘT lần, dưới bảng;
 *   8 · "Cố tình không làm" — chân màn, chung cho cả hai tab.
 *
 *  Tab thứ hai **Việc của tôi** là cùng một sổ nhìn từ phía người đăng nhập:
 *  việc xếp theo cột kanban của phòng, việc mới giao nằm đúng cột nó thuộc về.
 *  Người nhận việc không bấm "next" — họ bấm ĐÚNG hành động của việc đó, và
 *  luồng tự trôi trong kanban.
 *
 *  Sổ là CẢ KỲ DỮ LIỆU 01/05 → 17/08: 100 dòng, phân trang, không cuộn vô tận.
 *
 *  **Con số kế hoạch đọc được ngay ở đây.** Ngay dưới tiêu đề là một dòng: kỳ
 *  này vai đang đăng nhập được giao bao nhiêu, đã đạt bao nhiêu, còn thiếu bao
 *  nhiêu, còn mấy ngày. Số ấy KHÔNG tính lại ở màn này — nó hỏi module 4
 *  (`planLine` → `data/plan.ts`), đúng cửa mà module 4 mở sẵn, để hai màn không
 *  bao giờ nói hai con số cho cùng một câu.
 *
 *  **Hai chỗ ra hai số cho cùng một câu, và màn phải nói ra cả hai:**
 *   · phễu đếm luỹ kế, ô lọc Bậc đếm bậc đang đứng — câu dưới phễu nói chỗ đó;
 *   · sổ nguồn (module 1) đếm cả kỳ, sổ này mặc định lọc "Đang chạy" — nguồn
 *     CD-0101 vì thế ghi 22 ở màn nguồn và 10 ở đây. Vào màn bằng `?source=`
 *     thì `hint` của bảng in thẳng chỗ chênh, không để người dùng tự dò.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. Vào được màn này là vai có
 *  nhánh Sales — cửa ở `app/guard.tsx`, không kiểm lại ở đây.
 *
 *  Mọi phép đếm nằm ở `data/leads.ts`, không có phép tính nào trong JSX. State:
 *  bộ lọc, trang, tab và cột sắp xếp là chuyện RIÊNG của màn nên giữ ở đây bằng
 *  `useState`. Ghim và đề nghị giao việc sống lâu hơn một lần mở màn và đi qua
 *  cả màn chi tiết — chúng nằm ở `app/desk.ts`. */

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

export function LeadsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { data: book = [], isPending } = useQuery(leadBookQuery)

  const me = useSession((s) => s.actor)
  const assigns = useLeadDesk((s) => s.assigns)
  const pins = useLeadDesk((s) => pinsOf(s, me?.id))
  const togglePin = useLeadDesk((s) => s.togglePin)

  const [tab, setTab] = useState<'so' | 'viec'>('so')
  /* Hồ sơ nguồn gửi sang `?source=CD-0101`. Đọc ĐÚNG MỘT LẦN lúc dựng, như kho
     danh sách đọc `?lo=`: sau đó ô lọc là của người dùng, không phải của URL.
     Mã lạ thì bỏ qua — không dựng một bộ lọc trỏ vào nguồn không có thật. */
  const [filter, setFilter] = useState<BookFilter>(() => {
    const asked = params.get('source')
    const known = asked !== null && SOURCES.some((s) => s.code === asked)
    return known ? { ...OPEN_FILTER, source: asked } : OPEN_FILTER
  })
  const [sort, setSort] = useState<TableSort | undefined>()
  const [page, setPage] = useState(0)

  const set = <K extends keyof BookFilter>(key: K, value: BookFilter[K]) =>
    setFilter((f) => ({ ...f, [key]: value }))

  const open = (code: string) => navigate(`/sales/leads/${code}`)

  const filtered = useMemo(() => filterBook(book, filter), [book, filter])

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
  useEffect(() => setPage(0), [filter, sort])
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
  const tierNow = useMemo(() => tierCounts(book, filter), [book, filter])
  /* Chỉ tiêu của kỳ, lấy nguyên từ module 4. Không đi qua `useQuery`: nó là hàm
     thuần trên fixture, và một dòng chỉ tiêu biến mất trong lúc chờ sổ thì đúng
     lúc người ta mở màn lại không thấy con số điều phối. */
  const plan = useMemo(() => planLine(me), [me])

  const clearFilters = () => setFilter(OPEN_FILTER)

  /* Câu nói ra chỗ chênh với sổ nguồn. Ba điều kiện, không hai:
      · sổ đã về — lúc còn chờ thì "còn 0 dòng" là một con số sai;
      · hai số thật sự khác nhau;
      · BỐN ô lọc còn lại đang ở mặc định. Câu này quy chỗ chênh cho ô lọc Trạng
        thái, nên nó chỉ đúng khi Trạng thái là thứ duy nhất đang cắt. Gõ thêm
        một chữ vào ô tìm mà vẫn in câu cũ là in ra một lời giải thích sai. */
  const onlyStatusCuts =
    filter.tier === 'all' && filter.category === 'all' && filter.query === '' && !filter.overSlaOnly
  const ofSource = filter.source === 'all' ? null : leadsOfSource(book, filter.source)
  const gapHint =
    !isPending && onlyStatusCuts && ofSource !== null && ofSource !== visible.length
      ? `Sổ nguồn đếm cả kỳ nên ${filter.source} ghi ${ofSource} lead; bảng đang lọc "${STATUS_LABEL.get(filter.status)}" nên còn ${visible.length} dòng — hai số khác nhau là đúng.`
      : null
  const tableHint =
    gapHint ??
    `Cột "Ô bắt buộc" đếm ô của bộ 10 câu đã moi được (cổng vào sổ cơ hội là ${REQUIRED_SLOTS} ô), và avatar đứng đầu cột người là người giữ, sau đó mới là người được giao.`

  /* Luật 10 · ContextRail dựng thẳng từ E1, ở TẦNG MÀN chứ không trong một
     panel — hai tab là hai việc của cùng một màn, rail không được biến mất khi
     người dùng sang tab kia. Chuỗi đi qua đơn của dòng mồi. */
  /* Chỉ chip của CHÍNH đơn mồi mở được — nó là thứ duy nhất trong chuỗi có một
     màn để tới (hồ sơ lead của đơn đó). Ba chip kia mang mã khách, mã liên hệ
     và mã báo giá: gán `onOpen` cho chúng thì `Chip` thành `<button>` mời bấm,
     mà bấm mã báo giá lại ra hồ sơ lead — một nút hứa sai chỗ nó tới. */
  const anchor = book.find((l) => l.code === ANCHOR_CODE)
  const story = anchor?.dealCode ? dasVina.graph.story(anchor.dealCode) : []
  const rail =
    story.length > 0
      ? story.map((o) => ({
          code: o.code,
          source: o.code !== anchor?.dealCode,
          onOpen: o.code === anchor?.dealCode ? () => open(ANCHOR_CODE) : undefined,
        }))
      : [{ code: ANCHOR_CODE, source: false, onOpen: () => open(ANCHOR_CODE) }]

  return (
    <AppShell {...chrome.shell}>
      <div className="flex flex-col gap-4 lg:gap-6">
        <PageHeader
          title="Sổ lead"
          subtitle={
            <>
              DAS Vina · kỳ dữ liệu{' '}
              <span className="font-mono">
                {PERIOD_FROM} → {PERIOD_TO}
              </span>{' '}
              ·{' '}
              {/* Lúc sổ chưa về, "0 dòng" là một con số SAI chứ không phải một
                  con số nhỏ — nói thẳng là đang đếm. */}
              {isPending ? (
                'đang đếm sổ'
              ) : (
                <>
                  <span className="tnum">{book.length}</span> dòng
                </>
              )}{' '}
              · chủ màn là Sale, người gật là TP Kinh doanh
            </>
          }
          /* Hai tab là hai câu hỏi khác nhau trên cùng một sổ: "phòng đang có
             gì" và "tôi phải làm gì". */
          actions={
            <>
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
                Việc của tôi{isPending ? '' : ` · ${work.length}`}
              </Button>
            </>
          }
          rail={<ContextRail objects={rail} />}
        />

        <PlanLineText line={plan} />

        {tab === 'viec' ? (
          <MyWork items={work} onOpen={open} onSeeBook={() => setTab('so')} />
        ) : (
          <>
            <FunnelCard
              book={book}
              pending={isPending}
              tier={filter.tier}
              status={filter.status}
              slaNote={filter.overSlaOnly}
              onTier={(t) => set('tier', t)}
              onStatus={(s) => set('status', s)}
            />

            {/* Một hàng lọc. Ô tìm nở hết chỗ còn lại, bốn select cùng cao 40px
                đứng cạnh nó — không còn ba dòng nút pill để mắt phải quét. */}
            <div className="flex flex-wrap items-center gap-3">
              <SearchField
                size="topbar"
                placeholder="Tìm theo tên công ty hoặc mã lead…"
                value={filter.query}
                onChange={(v) => set('query', v)}
                className="min-w-[240px] flex-1"
              />
              <Select
                label="Trạng thái"
                value={filter.status}
                neutralValue={OPEN_FILTER.status}
                onChange={(v) => set('status', v as StatusKey)}
                options={LEAD_STATUSES.map((s) => ({ value: s.key, label: s.label }))}
              />
              <Select
                label="Bậc"
                value={filter.tier}
                onChange={(v) => set('tier', v as LeadTier | 'all')}
                /* Số trên nhãn đếm trong ĐÚNG phạm vi bảng đang hiện, nên bấm
                   vào ra đúng chừng ấy dòng. Sổ chưa về thì bỏ hẳn con số —
                   "MQL · 0" là một lời hứa sai. */
                options={[
                  { value: 'all', label: 'Tất cả' },
                  ...LEAD_TIERS.map((t) => ({
                    value: t.key,
                    label: isPending ? t.label : `${t.label} · ${tierNow.get(t.key) ?? 0}`,
                  })),
                ]}
              />
              <Select
                label="Ngành"
                value={filter.category}
                onChange={(v) => set('category', v as LeadCategory | 'all')}
                options={[
                  { value: 'all', label: 'Tất cả' },
                  ...LEAD_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
                ]}
              />
              <Select
                label="Nguồn"
                value={filter.source}
                onChange={(v) => set('source', v)}
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
                variant={filter.overSlaOnly ? 'default' : 'ghost'}
                onClick={() => set('overSlaOnly', !filter.overSlaOnly)}
              >
                <Icon icon={TriangleAlert} size={16} />
                Quá hạn cột
              </Button>
              {isFiltered(filter) && (
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

            {/* Bảng LUÔN nằm trên glass-b — luật 8. */}
            <GlassCard variant="b" className="flex flex-col gap-4 p-4 lg:p-5">
              <SectionTitle size="sm" hint={tableHint}>
                {isPending ? (
                  'Sổ lead'
                ) : (
                  <>
                    <span className="tnum">{visible.length}</span> dòng khớp bộ lọc
                  </>
                )}
              </SectionTitle>

              {isPending ? (
                <TableSkeleton rows={3} label="Đang tải sổ lead" />
              ) : visible.length === 0 ? (
                <EmptyState
                  icon={EMPTY_ICON}
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
                    { header: 'Người giữ · được giao', width: '1fr' },
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
                      <span key="a" className="tnum font-mono">
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

        {/* Khối chân màn nằm NGOÀI hai tab: thứ màn cố tình không làm là chuyện
            của cả module, không của một tab. */}
        <NotDoing onSeePerformance={() => navigate('/sales/performance')} />
      </div>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------

/** Con số kế hoạch, một dòng, ngay dưới tiêu đề.
 *
 *  Đây là chỗ module 4 chạm vào module 2. Người Sale ngồi ở sổ lead cả ngày mà
 *  không biết tháng này còn nợ mấy đơn thì con số kế hoạch chỉ điều phối được
 *  đúng một cái ngăn kéo ở màn Performance.
 *
 *  Không con số nào tính ở đây: `planLine` trả về chữ đã format theo đúng đơn
 *  vị của thước, kể cả câu "còn bao nhiêu mỗi ngày" — viết ở tầng dữ liệu để
 *  hai màn không tự chế hai cách nói cho cùng một phép chia.
 *
 *  Vai không có thước riêng (TP Kinh doanh, Presales) đọc câu tóm của cả phòng,
 *  chứ không được gán bừa thước của người khác. */
function PlanLineText({ line }: { line: PlanLine | null }) {
  if (!line) return null

  if (line.kind === 'chua-co-thuoc') {
    return (
      <p aria-label="Chỉ tiêu kỳ" className="text-muted-foreground text-[12.5px] leading-[1.5]">
        Bảng kế hoạch {line.label} chưa có dòng nào cho vai {line.role} — chỉ tiêu đặt ở module 4 ·
        Số liệu &amp; kế hoạch.
      </p>
    )
  }

  if (line.kind === 'cua-phong') {
    return (
      <p aria-label="Chỉ tiêu kỳ" className="text-[12.5px] leading-[1.5]">
        <span className="text-muted-foreground">
          Chỉ tiêu {line.label}, còn <span className="tnum">{line.daysLeft}</span> ngày · cả
          phòng:{' '}
        </span>
        {line.headline}
      </p>
    )
  }

  return (
    <p aria-label="Chỉ tiêu kỳ" className="text-[12.5px] leading-[1.5]">
      {/* Số ngày còn lại đứng ở ĐẦU câu, làm khung cho cả dòng — nó là thứ duy
          nhất ở đây không đổi theo vai, và là lý do câu này gấp.

          `line.scope` đứng ngay trước dấu hai chấm và KHÔNG được bỏ: chỉ tiêu
          này đã nhân cho số người mang vai, còn drawer của màn Performance trả
          lời cùng câu hỏi bằng chỉ tiêu của MỘT người. Bỏ vế phạm vi là để hai
          màn nói 3 và 1 cho cùng một chữ "chỉ tiêu". */}
      <span className="text-muted-foreground">
        Chỉ tiêu {line.label}, còn <span className="tnum">{line.daysLeft}</span> ngày ·{' '}
        {line.metric} của {line.scope}:{' '}
      </span>
      <span className="tnum font-semibold">{line.target}</span>, đã đạt{' '}
      <span className="tnum">{line.done}</span>
      {line.missingRaw === 0 ? (
        ' — đủ chỉ tiêu kỳ.'
      ) : (
        <>
          , còn thiếu{' '}
          <span className={cn('tnum font-semibold', line.pace === 'hut-nhip' && 'text-warning')}>
            {line.missing}
          </span>{' '}
          — nhịp cần có {line.perDayText}.
        </>
      )}
    </p>
  )
}

/** Cố tình không làm — bốn thứ bị bỏ có chủ ý trên hai màn của module 2.
 *
 *  Ba trong bốn dòng là thứ người xem sẽ hỏi ngay khi bấm thử: "bấm đề nghị rồi
 *  sao nữa", "kanban của cả phòng đâu". Trả lời trên màn rẻ hơn trả lời trong
 *  họp, và nói ra thì lời hứa ngầm hết là lời hứa.
 *
 *  Dòng thứ tư chỉ sang module 3 — và chỉ bằng CHỮ thì bước "đo" của vòng bốn
 *  module không đi được: người dùng phải tự tìm dropdown nav. Nút dưới danh
 *  sách là lối đi thật; `/sales/performance` có trong `routes.tsx` nên nó không
 *  hứa một màn không tồn tại. */
function NotDoing({ onSeePerformance }: { onSeePerformance: () => void }) {
  const items = [
    {
      title: 'Đề nghị chưa đi qua chuỗi duyệt thật',
      body: 'Bấm một hành động thì màn ghi "đã đề nghị" và dừng ở đó. E3 chưa nối, nên chưa có phiếu duyệt nào chạy tới TP Kinh doanh và chưa ai nhận được thông báo.',
    },
    {
      title: 'Đưa lead ra khỏi luồng chưa ghi vết',
      body: 'Lý do rơi hiện ngay trên hồ sơ, nhưng chưa vào sổ ghi vết của E2. Bản này chưa trả lời được câu "ai đã đưa lead ra, lúc nào".',
    },
    {
      title: 'Chưa có phiếu tiếp cận tự soạn',
      body: 'Lead qua cổng ô bắt buộc thì việc kế tiếp vẫn là người làm. Bản này không có khối trợ lý nào trên hai màn của module 2 — không có gì tự chạy sau khi đủ ô.',
    },
    {
      title: 'Kanban ở đây là việc CỦA TÔI, không phải của cả phòng',
      body: 'Tab "Việc của tôi" xếp theo cột của sổ cơ hội nhưng chỉ chứa phần việc của vai đang đăng nhập. Bảng của cả phòng là câu hỏi của module 3 · Performance.',
    },
  ]

  return (
    <GlassCard className="flex flex-col gap-3 p-4 lg:p-5">
      <SectionTitle size="sm">Cố tình không làm</SectionTitle>
      <ul className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        {items.map((it) => (
          <li key={it.title} className="flex flex-col gap-1">
            <b className="text-[12.5px] font-semibold">{it.title}</b>
            <span className="text-muted-foreground text-[12.5px] leading-[1.6]">{it.body}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="md" variant="ghost" onClick={onSeePerformance}>
          <Icon icon={ArrowRight} size={16} />
          Mở Performance của phòng
        </Button>
        <p className="text-muted-foreground min-w-0 flex-1 text-[12.5px] leading-[1.5]">
          Sổ này là việc của từng lead; ai đang làm được, ai đang tắc thì đo ở module 3.
        </p>
      </div>
    </GlassCard>
  )
}

/** Phễu — thẻ điểm của cả kỳ VÀ bộ lọc chính.
 *
 *  Bản trước là sáu con số nằm im trên một thẻ: chiếm chỗ nhất màn mà không trả
 *  lời được câu nào ngoài "có sáu bậc". Bản này thêm ba thứ khiến nó đáng chỗ:
 *   · **tỉ lệ qua bậc** — thứ duy nhất nói được phễu đang tắc ở đâu;
 *   · **thanh dài theo số** — so bậc bằng mắt, không phải đọc rồi trừ;
 *   · **bấm được** — ba bậc có bậc lead tương ứng thì bấm vào là lọc theo bậc
 *     đó, và ba con số cân sổ ở góc phải là ba bộ lọc trạng thái.
 *
 *  Ô thứ tư ở góc phải — "còn ở kho chung" — KHÔNG bấm được, và đó là chủ ý:
 *  sổ chưa có bộ lọc theo người giữ, nên dựng nút là hứa một bộ lọc không tồn
 *  tại. Con số vẫn phải có mặt: "ai đang trong tay ai" là câu hỏi chốt của
 *  module 2, mà trước bản này nó chỉ nằm ở cột cuối của bảng.
 *
 *  Một câu dưới thẻ, không hai: cả hai chỗ ra số khác nhau của màn này đều là
 *  chuyện "hai thước đếm hai thứ" nên chúng ở CHUNG một câu — luỹ kế so với bậc
 *  đang đứng, và ngưỡng hạn cột chỉ có cho cột của sổ cơ hội. Vế thứ hai chỉ
 *  hiện khi lọc "Quá hạn cột" đang bật: không bật thì nó là chữ thừa. */
function FunnelCard({
  book,
  pending,
  tier,
  status,
  slaNote,
  onTier,
  onStatus,
}: {
  book: Lead[]
  /** Sổ chưa về. Phễu vẫn vẽ được (số của phễu là số đã chốt, không đọc sổ),
   *  nhưng mọi con số ĐẾM TỪ SỔ phải im — không có số nào bằng 0 lúc chờ. */
  pending: boolean
  tier: LeadTier | 'all'
  status: StatusKey
  slaNote: boolean
  onTier: (t: LeadTier | 'all') => void
  onStatus: (s: StatusKey) => void
}) {
  const steps = funnelRows()
  const top = steps[0]?.count ?? 1
  const counts = statusCounts(book)
  const balance = [
    { key: 'signed' as const, label: 'đã ký', n: counts.signed },
    { key: 'running' as const, label: 'đang chạy', n: counts.running },
    { key: 'exited' as const, label: 'đã rơi', n: counts.exited },
  ]

  return (
    <GlassCard className="flex flex-col gap-4 p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Kicker>
          Phễu {PERIOD_FROM} → {PERIOD_TO}
        </Kicker>
        {pending ? (
          <span className="text-glass-foreground text-[11px]">Đang cân sổ…</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {balance.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => onStatus(b.key)}
                className={cn(
                  'motion-std flex items-center gap-2 rounded-sm px-2 py-1 text-[11px]',
                  status === b.key
                    ? 'bg-surface-active text-accent-foreground font-semibold'
                    : 'text-glass-foreground bg-surface-control hover:bg-surface-control-hover',
                )}
              >
                <span className="tnum font-num text-[12.5px] font-semibold">{b.n}</span>
                {b.label}
              </button>
            ))}
            {/* Câu hỏi chốt của module 2 là "ai đang trong tay ai", mà câu trả
                lời trước đây chỉ nằm ở cột cuối của bảng. Ô này KHÔNG phải nút:
                sổ chưa có bộ lọc theo người giữ, nên dựng nút là hứa một bộ lọc
                không tồn tại. */}
            <span className="text-glass-foreground bg-surface-inset flex items-center gap-2 rounded-sm px-2 py-1 text-[11px]">
              <span className="tnum font-num text-[12.5px] font-semibold">
                {unownedCount(book)}
              </span>
              còn ở kho chung, chưa ai giữ
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {steps.map((step) => {
          const active = Boolean(step.tier) && tier === step.tier

          const body = (
            <>
              <span className="flex items-baseline gap-2">
                <span className="tnum font-num text-[26px] font-semibold leading-none tracking-[-.8px]">
                  {step.count}
                </span>
                {/* `--glass-foreground` chứ không `--muted-foreground`: lúc rê
                    chuột nền ô lên `--surface-control` và chữ mờ rơi xuống
                    4,45:1 — dưới ngưỡng luật 13, đúng lúc người dùng đang nhắm
                    bấm. Ba nút cân sổ ngay trên đứng cùng nền và đã dùng mức
                    này. */}
                {step.pass !== null && (
                  <span className="text-glass-foreground tnum flex items-center text-[11px]">
                    <Icon icon={ChevronsRight} size={14} />
                    {step.pass}%
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
                {step.tier && step.tierLabel && (
                  <Badge tone={TIER_TONE[step.tier]}>{step.tierLabel}</Badge>
                )}
              </span>

              {/* Thanh dài theo số. Không phải trang trí: sáu con số xếp hàng thì
                  mắt phải đọc từng cái, sáu thanh thì thấy ngay chỗ hụt. */}
              <span className="bg-surface-control h-1 w-full overflow-hidden rounded-sm">
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
            active ? 'bg-surface-active' : 'bg-surface-inset',
          )

          /* Chỉ ba bậc có bậc lead tương ứng mới bấm được. Ba bậc còn lại
             (báo giá · chờ ký · hợp đồng) là trạng thái của ĐƠN chứ không phải
             bậc của lead — dựng nút cho chúng là hứa một bộ lọc không tồn tại. */
          const asTier = step.tier
          return asTier ? (
            <button
              key={step.key}
              type="button"
              title={active ? 'Bỏ lọc bậc này' : `Lọc sổ theo bậc ${step.tierLabel ?? step.label}`}
              onClick={() => onTier(active ? 'all' : asTier)}
              className={cn(shape, !active && 'hover:bg-surface-control')}
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

      <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
        Phễu đếm LUỸ KẾ cả kỳ, ô lọc &quot;Bậc&quot; đếm bậc lead ĐANG đứng trong đúng phạm vi bảng
        đang lọc — nên số trên ô lọc bằng đúng số dòng bấm vào sẽ ra.
        {slaNote &&
          ' Ngưỡng hạn cột cũng chỉ có cho cột của sổ cơ hội: đầu mối và MQL chưa có ngưỡng — chưa đo được, nên lọc "Quá hạn cột" chỉ lọc bên trong bậc SQL.'}
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
      {STAGE_LABEL.get(lead.stage)} · <span className="tnum font-mono">{lead.daysHere}</span> ngày
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
      /* 44px — bằng đúng chiều cao một dòng `DataTable`. Đây là control duy
         nhất trong dòng phải bấm trúng mà không mở trang, nên nó không được là
         thứ nhỏ nhất trên màn. */
      className={cn(
        'motion-std flex size-11 items-center justify-center rounded-md',
        on
          ? 'text-accent-foreground bg-surface-active'
          : 'text-muted-foreground hover:bg-surface-control',
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
 *  Người nhận việc KHÔNG bấm "next": mỗi thẻ mang đúng việc tiếp theo của lead
 *  đó (lấy nốt ô, đề nghị vào sổ cơ hội, báo tắc, nhắc ký) và luồng tự trôi sang
 *  cột kế trong kanban của phòng. Vì thế thẻ không có nút "hoàn thành" — không
 *  việc nào ở đây kết thúc bằng một dấu tick.
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
          icon={EMPTY_ICON}
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
            <span className="tnum font-num text-[26px] font-semibold leading-none">{s.n}</span>
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

      <p className="text-muted-foreground text-[12.5px] leading-[1.5]">
        Bấm hành động trên thẻ là ĐỀ NGHỊ — luồng trôi sang cột kế sau khi TP Kinh doanh gật. Không
        có nút &quot;hoàn thành&quot; ở đây: việc kết thúc bằng lead sang cột khác, không bằng một
        dấu tick.
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
          <span className="tnum">{items.length}</span> việc
          {column.limitDays ? ` · hạn ${column.limitDays} ngày` : ''}
        </span>
      </div>

      {items.length === 0 ? (
        <InsetPanel pad="sm">
          <span className="text-glass-foreground text-[11px]">Không có việc nào ở cột này.</span>
        </InsetPanel>
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
                  'motion-std hover:shadow-card bg-surface-inset flex cursor-pointer flex-col gap-2 rounded-md p-3 outline-none',
                  'hover:bg-surface-control focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
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

                <span className="text-glass-foreground text-[11px] leading-[1.5]">
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

/** Phân trang — ĐÚNG MỘT lần, dưới bảng. Bản trước in cả trên lẫn dưới: hai bộ
 *  nút cho cùng một việc, và bộ trên đứng trước cả bảng nó phân trang. */
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
      <span className="text-muted-foreground tnum text-[11.5px]">
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
