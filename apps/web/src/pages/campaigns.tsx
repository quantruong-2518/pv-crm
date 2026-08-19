import { useMemo, useState } from 'react'
import {
  CalendarDays,
  Inbox,
  Layers,
  Megaphone,
  Plus,
  Reply,
  Target,
  Users,
  Wallet,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  ChannelTag,
  Chip,
  ContextRail,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  MetaPill,
  SectionTitle,
  Skeleton,
  StatCard,
  cn,
  millions,
  percent,
  type TableSort,
} from '@pv/ui'
import { dasVina, HEAD_OF_SALES, MARKETING } from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { dm } from '@/lib/date'
import {
  ANCHOR_SOURCE,
  OPEN_VALUE,
  SOURCE_SORTS,
  campaignTotalsQuery,
  sourcesQuery,
  type SourceSortKey,
} from '@/data/campaigns'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import { CampaignForm } from './campaign-parts'
import {
  KINDS,
  KIND_ICON,
  MAX_CHANNEL_TAGS,
  PERIOD,
  channelsOf,
  draftOf,
  grouped,
  sendsViaE4,
} from './campaign-model'

/** Module 1 · Chiến dịch & Sự kiện — SỔ NGUỒN (docs/kien-truc-san-pham.md).
 *
 *  Module này trả câu "khách ở đâu ra". Chủ màn là vai **Marketing**; người gật
 *  vẫn là TP Kinh doanh.
 *
 *  MÀN NÀY CHỈ CÒN SỔ. Tới 19/08 nó ôm cả ba việc: sổ nguồn, hồ sơ một nguồn ở
 *  panel bên phải, và form tạo/sửa. Hồ sơ đã rời sang `/sales/campaigns/:code`
 *  (`campaign-detail.tsx`) — lý do đầy đủ ở docblock màn đó. Còn lại đúng hai
 *  chế độ:
 *   · `list`   — sáu ô KPI của kỳ + bảng nguồn TRÀN NGANG. Bảng cũ chỉ được
 *     1.45fr của một lưới hai cột, nên bảy cột phải chen trong ~613px; giờ nó
 *     có cả bề ngang màn.
 *   · `create` — form tạo, dùng chung `CampaignForm` với màn sửa.
 *
 *  BA LUẬT màn này không được phá:
 *   · Mọi lần gửi đi qua hệ gửi chung (E4 giữ nhật ký + chống trùng). Màn không
 *     gọi API nền tảng nào.
 *   · Luật 9 — mọi khối AI có "Căn cứ:", có nút, và có "Chưa tạo gì cả".
 *   · Đợt được chấm bằng KỲ VỌNG đặt trước (`Wave.expected`), không phải bằng
 *     một điểm số màn tự nghĩ ra (docs · mục 1.7).
 *
 *  TÊN ENGINE KHÔNG LÊN GIAO DIỆN (luật 14) — trên màn viết bằng VIỆC, trong
 *  comment mới giữ E1…E5.
 *
 *  HAI CHỖ DỄ ĐẶT NHÃN SAI — đọc trước khi sửa chữ trên màn:
 *   · `campaignTotals.leads` là **88**, không phải 100. Nó chỉ cộng lead của
 *     sáu nguồn CÓ ĐỢT; 12 lead còn lại đến từ hai nguồn tự nhiên. Chỗ chênh in
 *     thẳng dưới hàng KPI chứ không bắt ai tự trừ.
 *   · `totals.sent` là LƯỢT GỬI, không phải người: CD-0101 gửi cùng một danh
 *     sách ba lần, SK-0106 quét lại đúng 143 người đã quét mã.
 *
 *  Màn KHÔNG tự cộng số nghiệp vụ. Mọi tổng, mọi tỉ lệ nằm ở `data/campaigns.ts`
 *  — một phép chia viết trong JSX là một phép chia không ai test được.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */
export function CampaignsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm chiến dịch, sự kiện, đợt gửi…' })
  const navigate = useNavigate()

  const { data: sources = [], isPending } = useQuery(sourcesQuery)
  const { data: totals } = useQuery(campaignTotalsQuery)

  const [mode, setMode] = useState<'list' | 'create'>('list')
  const [kind, setKind] = useState<(typeof KINDS)[number]['key']>('all')
  /* Thứ tự bảng là state của MÀN, không phải của `DataTable` — bảng chỉ vẽ mũi
     tên và báo người dùng vừa bấm cột nào. Mặc định mới nhất lên trước. */
  const [sort, setSort] = useState<{ key: SourceSortKey; dir: TableSort['dir'] }>({
    key: 'ngay',
    dir: 'desc',
  })

  const visible = useMemo(() => {
    const list = sources.filter((s) => kind === 'all' || s.kind === kind)
    const compare = SOURCE_SORTS.find((s) => s.key === sort.key)?.compare
    if (!compare) return list
    /* `compare` của tầng data LUÔN tăng dần — hướng là việc của màn. */
    const asc = [...list].sort(compare)
    return sort.dir === 'asc' ? asc : asc.reverse()
  }, [sources, kind, sort])

  const toggleSort = (key: string) => {
    const found = SOURCE_SORTS.find((s) => s.key === key)
    if (!found) return
    setSort((cur) =>
      cur.key === found.key
        ? { ...cur, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { key: found.key, dir: 'desc' },
    )
  }

  /* Luật 10 · ContextRail dựng thẳng từ E1. Sổ không "mở" object nào, nên rail
     đi qua nguồn mồi — cùng chuỗi mà mọi màn của kịch bản này chỉ vào. Chip mở
     hồ sơ của object thì E1 chưa làm được, nên không có `onOpen`: một chip bấm
     được rồi không xảy ra gì còn tệ hơn một chip đứng yên. */
  const anchor = sources.find((s) => s.code === ANCHOR_SOURCE) ?? sources[0] ?? null
  const story = anchor?.anchorDeal ? dasVina.graph.story(anchor.anchorDeal) : []
  const rail =
    story.length > 0
      ? story.map((o) => ({ code: o.code, source: o.code === anchor?.anchorDeal }))
      : [{ code: anchor?.code ?? ANCHOR_SOURCE, source: false }]

  if (mode === 'create') {
    return (
      <AppShell activeNav="home" approvalsCount={chrome.approvalsCount} header={chrome.header}>
        {/* Luật 10 · rail có mặt ở CẢ hai chế độ. Tạo mới là một việc của cùng
            màn, không phải một màn khác — chuỗi object không được biến mất chỉ
            vì người dùng bấm sang form. */}
        <div className="flex flex-col gap-4 lg:gap-6">
          <ContextRail objects={rail} />
          <CampaignForm
            mode="create"
            initial={draftOf(null, false)}
            seededWave={false}
            sources={sources}
            onCancel={() => setMode('list')}
          />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      /* BottomNav chỉ có bốn mục Core; màn nhánh không nằm trong đó nên giữ
         'home' làm mục sáng — người dùng dưới lg vẫn về được Core. */
      activeNav="home"
      approvalsCount={chrome.approvalsCount}
      header={chrome.header}
    >
      <div className="flex flex-col gap-4 lg:gap-6">
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
            <Button size="md" onClick={() => setMode('create')}>
              <Icon icon={Plus} size={16} />
              Chiến dịch mới
            </Button>
          </div>
        </div>

        {/* Sáu ô này đo CHIẾN DỊCH: bao nhiêu nguồn có người chạy, bao nhiêu đợt
            đã gửi, chạm được bao nhiêu lượt, và các tỉ lệ rút ra từ đó. Số lead
            chi tiết là việc của module 2.

            Điểm gãy là `lg`: ba thiết bị của luật 3, không đẻ điểm gãy thứ tư. */}
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
              {/* "Lượt", không phải "người": cùng một danh sách bị gửi lại ở đợt
                  nhắc, và người quét mã ở gian hàng bị đếm lại ở đợt sau. */}
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

            {/* Chỗ chênh giữa 88 và 100 nói thẳng ở đây. Không có dòng này thì
                người đọc phải tự trừ hai con số nằm cách nhau nửa màn. */}
            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              {totals.natural.count} nguồn tự nhiên kéo thêm {totals.natural.leads} lead, không đợt
              nào ghi công — cả sổ {totals.bookLeads} dòng nằm ở Sổ lead.
            </p>
          </div>
        ) : (
          <Skeleton className="h-20 w-full" />
        )}

        {/* Bảng LUÔN nằm trên glass-b — luật 8. */}
        <GlassCard variant="b" className="flex flex-col gap-4 p-5">
          <SectionTitle
            size="sm"
            kicker="Nguồn của kỳ"
            /* Câu giải thích cột "Giá trị" nằm ở ĐÂY, một lần. Trước nó là
               `title` của từng ô — vô hình với cảm ứng và bàn phím. */
            hint={`${visible.length}/${sources.length} nguồn đang hiện · bấm một dòng để mở hồ sơ nguồn. ${OPEN_VALUE.label}: cộng ${OPEN_VALUE.deals} đơn đang mở trong kỳ; ${OPEN_VALUE.signedDeals} hợp đồng đã ký không có số tiền trong kịch bản.`}
            actions={
              /* Bộ lọc gọn: bốn loại nằm cùng hàng tiêu đề, không chiếm một hàng
                 riêng và không có nhãn "Loại" đứng trước. */
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
                { header: 'Mã', width: '0.9fr' },
                { header: 'Tên', width: '2.4fr' },
                { header: 'Kênh', width: '0.8fr' },
                { header: 'Bắt đầu', width: '0.8fr', sortKey: 'ngay' },
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
                  /* Yêu cầu 4 · CẢ DÒNG mở hồ sơ. Chip mã không có `onOpen`
                     riêng: hai vùng bấm chồng nhau trên một dòng chỉ làm người
                     dùng đoán xem phải bấm chỗ nào. */
                  onOpen: () => navigate(`/sales/campaigns/${s.code}`),
                  cells: [
                    <span key="c" className="flex items-center gap-2">
                      <Icon icon={KIND_ICON[s.kind]} size={16} className="text-muted-foreground" />
                      <Chip variant="object">{s.code}</Chip>
                    </span>,
                    <span key="l" className="block truncate">
                      {s.label}
                    </span>,
                    <span key="ch" className="flex items-center gap-1">
                      {chans.length === 0 ? <span className="text-muted-foreground">—</span> : null}
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
        </GlassCard>
      </div>
    </AppShell>
  )
}

export default CampaignsPage
