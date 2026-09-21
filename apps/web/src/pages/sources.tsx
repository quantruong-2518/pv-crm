import { useMemo, useState } from 'react'
import { CheckCircle2, Mail, MailOpen, Plus, Reply, Zap } from '@pv/ui'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Avatar,
  Button,
  ChannelTag,
  Icon,
  ScreenLayout,
  ScreenScoreGrid,
  Select,
  SegmentedControl,
  Skeleton,
  StatCard,
  StatusDot,
  percent,
  type TableSort,
} from '@pv/ui'
import { useAppChrome } from '@/app/chrome'
import { dm } from '@/lib/date'
import {
  CAMPAIGN_STATUS,
  NO_FILTER,
  SOURCE_SORTS,
  STATUS_DOT,
  STATUS_LABEL,
  TIME_WINDOWS,
  campaignTotalsQuery,
  channelsInUse,
  filterSources,
  ownersOf,
  rate,
  sourcesQuery,
  type CampaignFilter,
  type CampaignStatus,
  type SourceSortKey,
  type TimeWindowKey,
} from '@/data/campaigns'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import { toast } from '@/app/toast'
import { RECIPIENT_SPEC } from '@/data/intake'
import { useLeadImport } from '@/data/lead-import'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { BookCount, BookPage } from '@/components/book-page'
import { Module1Books } from '@/components/module1-books'
import { FilterMenu } from '@/components/table-bits'
import { CampaignForm } from './source-parts'
import { SourceStatsBlock } from './source-stats-parts'
import { CAMPAIGN_ICON, MAX_CHANNEL_TAGS, channelsOf, draftOf, grouped } from './source-model'

/** Module 1 · SỔ NGUỒN DẪN (`SR-nn`).
 *
 *  ------------------------------------------------------------------
 *  ĐỔI TÊN 29/08 — MÀN NÀY TỪNG LÀ `/sales/campaigns`
 *  ------------------------------------------------------------------
 *  Nó nhường đường dẫn đó cho `sales.campaign` thật (`CP-nnnn`,
 *  `pages/campaigns.tsx`) và lui về `/sales/campaigns/sources`. Quyết định D2
 *  ngày 28/08: SOURCE là nơi lead SINH RA, `sales.campaign` là đơn vị GỬI —
 *  hai định nghĩa đối lập, không gộp được thành một bảng mà không phá một
 *  trong hai. Đổi ở đây là copy và path, cấu trúc màn không động tới; tên biến
 *  và tên hàm bên trong (`CampaignForm`, `CAMPAIGN_ICON`, `filterSources`) giữ
 *  nguyên vì đổi chúng là một lượt sửa xuyên bốn file cho không thêm sự thật
 *  nào — `SourceRow` vẫn là kiểu dữ liệu thật sự chạy qua đây.
 *
 *  Màn này trả đúng một câu: **nguồn nào đang chạy, gửi cho bao nhiêu
 *  người, ra bao nhiêu cơ hội.**
 *
 *  ĐỔI LỚN 23/08 — trước đó nó là "Sổ nguồn" và ôm ba khái niệm cùng lúc:
 *  chiến dịch, sự kiện, nguồn tự nhiên. Ba thứ đó đo bằng ba bộ chỉ số khác
 *  nhau nên không cột nào so được với cột nào, và người mới phải học một phân
 *  biệt không đổi được việc họ làm. Giờ còn MỘT khái niệm:
 *
 *   · Nguồn tự nhiên ra khỏi sổ (`fetchSources`) — không đợt, không người nhận,
 *     không có gì để gửi hay dừng. 12 lead của chúng vẫn ở Sổ lead.
 *   · Sự kiện ở lại nhưng đọc thành chiến dịch — nó có chuỗi đợt và có mail đi
 *     ra, tức nó trả lời đúng câu màn này hỏi. Cái bỏ đi là NHÃN, không phải
 *     dòng dữ liệu.
 *
 *  Bảng đo đúng một cái phễu, theo thứ tự người đọc từ trái sang: gửi cho bao
 *  nhiêu người → mở → trả lời → hỏng → thành cơ hội. Ba cột cũ (Lead · MQL ·
 *  Giá trị đơn mở) đã bỏ: chúng là số của module 2 và module 3, và một con số
 *  cùng tên hiện ở ba màn là ba chỗ để lệch nhau.
 *
 *  BỐN BỘ LỌC dựng từ chính dữ liệu đang có (`ownersOf`, `channelsInUse`) — một
 *  mục lọc không dòng nào khớp đọc y hệt một bộ lọc hỏng. Trạng thái ở hàng
 *  tab, ba ô còn lại trong `FilterMenu`: hình chung của mọi sổ (`BookPage`).
 *
 *  KHÔNG có ContextRail ở màn này (bỏ 23/08). Luật 10 buộc rail đi kèm việc MỞ
 *  một object; sổ không mở object nào, và bốn chip đứng cạnh nút "Chiến dịch
 *  mới" chỉ trỏ vào một đơn của một dòng trong sáu. Rail vẫn ở hồ sơ chiến dịch,
 *  nơi đúng một object đang được mở.
 *
 *  KHÔNG có khối AI (bỏ 23/08 theo yêu cầu). Không có khối AI thì luật 9 không
 *  có gì để cưỡng chế ở đây — nó cấm AI tự chạy, không đòi mọi màn phải có AI.
 *
 *  Màn KHÔNG tự cộng số nghiệp vụ. Mọi tổng, mọi tỉ lệ, mọi phép lọc nằm ở
 *  `data/campaigns.ts` — một phép chia viết trong JSX là một phép chia không ai
 *  test được.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */
/** Panel nạp KHÔNG loại dòng nào trước khi máy chủ nhìn thấy lô — lý do đầy đủ
 *  ở `NO_LOCAL_KEYS` của `pages/leads.tsx`: hai bên chống trùng bằng hai khoá
 *  khác nhau, mà bốn con số panel vẽ là số của bên đã ghi thật. */
const NO_LOCAL_KEYS: ReadonlySet<string> = new Set()

/** Ten columns, five of them numeric. Below this the source name truncates to a
 *  single word and the ratio columns lose their digits, so the card scrolls
 *  sideways instead of squeezing. */
const TABLE_MIN_WIDTH = 'min-w-[1100px]'

export function SourcesPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm nguồn dẫn, đợt gửi…' })
  const navigate = useNavigate()

  const { data: sources = [], isPending } = useQuery(sourcesQuery)
  const { data: totals } = useQuery(campaignTotalsQuery)

  const loadFile = useLeadImport()

  const [mode, setMode] = useState<'list' | 'create'>('list')
  const [filter, setFilter] = useState<CampaignFilter>(NO_FILTER)
  /* Thứ tự bảng là state của MÀN, không phải của `DataTable` — bảng chỉ vẽ mũi
     tên và báo người dùng vừa bấm cột nào. Mặc định mới nhất lên trước. */
  const [sort, setSort] = useState<{ key: SourceSortKey; dir: TableSort['dir'] }>({
    key: 'start',
    dir: 'desc',
  })

  const owners = useMemo(() => ownersOf(sources), [sources])
  const channels = useMemo(() => channelsInUse(sources), [sources])

  /* Đếm trạng thái đi qua ĐÚNG những dòng bảng đang cầm, không qua một con số
     riêng của máy chủ. "Đang chạy" là một phép so với đồng hồ của trình duyệt
     (`statusOf`), nên một con số đếm ở máy chủ sẽ chấm theo đồng hồ khác và ô
     tổng nói 2 trong khi bảng dưới nó tô một dòng. */
  const byStatus = useMemo(
    () => ({
      done: sources.filter((r) => r.status === 'done').length,
      running: sources.filter((r) => r.status === 'running').length,
    }),
    [sources],
  )

  /* Số đếm trên bộ chọn trạng thái tính trên tập ĐÃ LỌC BA CHIỀU KIA. Đếm trên
     cả sáu dòng thì lọc kênh email xong vẫn thấy "Đang chạy · 1" trong khi bảng
     rỗng, và người dùng kết luận bảng hỏng. */
  const beforeStatus = useMemo(
    () => filterSources(sources, { ...filter, status: null }),
    [sources, filter],
  )

  const visible = useMemo(() => {
    const list = filterSources(sources, filter)
    const compare = SOURCE_SORTS.find((s) => s.key === sort.key)?.compare
    if (!compare) return list
    /* `compare` của tầng data LUÔN tăng dần — hướng là việc của màn. */
    const asc = [...list].sort(compare)
    return sort.dir === 'asc' ? asc : asc.reverse()
  }, [sources, filter, sort])

  const toggleSort = (key: string) => {
    const found = SOURCE_SORTS.find((s) => s.key === key)
    if (!found) return
    setSort((cur) =>
      cur.key === found.key
        ? { ...cur, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { key: found.key, dir: 'desc' },
    )
  }

  /* So với BỘ LỌC RỖNG, không so số dòng. Một bộ lọc đang bật mà tình cờ khớp
     cả sáu dòng vẫn là một bộ lọc đang bật — giấu nút "Xoá lọc" ở đó là nhốt
     người dùng trong một phép lọc họ không thấy. */
  const filtering =
    filter.owner !== null ||
    filter.channel !== null ||
    filter.status !== null ||
    filter.window !== NO_FILTER.window

  /* The number printed on the filter button. Status is NOT counted: the tab row
     above already shows it, and counting it twice says one thing twice. */
  const activeFilters =
    [filter.owner, filter.channel].filter((v) => v !== null).length +
    (filter.window === NO_FILTER.window ? 0 : 1)

  /* Lô nạp GHI THẲNG lên máy chủ, cùng hai cửa sổ lead đang dùng
     (`data/lead-import.ts`). Trước 31/08 chỗ này ghi vào `useIntakeDesk` — một
     kho zustand trong trình duyệt — rồi toast "đã vào sổ lead" trong khi Neon
     không nhận dòng nào: người dùng mở Sổ lead ngay sau đó và không thấy gì.

     Ba thứ chết theo cùng lượt và không thứ nào là mất mát: mã lead do MÁY CHỦ
     cấp nên `rowsToLeads` hết việc; chống trùng do máy chủ làm trên chỉ mục
     hộp thư nên `frozenLeadBookQuery` — sổ fixture 100 dòng — hết lý do tồn
     tại; và bốn con số cuối panel là số của bên đã ghi thật, không phải số
     trình duyệt tự đếm. */
  const commitRecipients = async ({
    rows,
    motion,
    fileName,
    scope,
  }: ImportCommit & { scope?: string }) => {
    const run = await loadFile({ rows, motion, fileName, source: scope })
    const { report } = run

    toast(run.failure ?? `${report.rows.length} người nhận đã vào sổ lead`, {
      tone: run.failure ? 'danger' : 'success',
      detail: [
        scope && `Gắn vào nguồn ${scope}`,
        report.duplicates > 0 && `${report.duplicates} dòng trùng sổ, bỏ qua`,
        report.dupInFile > 0 && `${report.dupInFile} dòng trùng nhau trong tệp`,
        report.errors.length > 0 && `${report.errors.length} dòng không nạp được`,
      ]
        .filter(Boolean)
        .join(' · '),
      action: { label: 'Mở sổ lead', onClick: () => navigate('/sales/leads') },
    })

    return report
  }

  if (mode === 'create') {
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <CampaignForm
            mode="create"
            initial={draftOf(null, false)}
            onClose={() => setMode('list')}
          />
        </ScreenLayout>
      </AppShell>
    )
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Nguồn dẫn"
          actions={
            <>
              {/* Nạp danh sách người nhận cho MỘT chiến dịch đã có. Ở sổ thì
                chiến dịch phải chọn (`scopeOptions`); trong hồ sơ một chiến
                dịch thì mã của nó cố định, không chọn lại. */}
              <ImportZone
                spec={RECIPIENT_SPEC}
                existingKeys={NO_LOCAL_KEYS}
                scopeOptions={sources.map((s) => ({
                  value: s.code,
                  label: `${s.code} · ${s.label}`,
                }))}
                buttonLabel="Nạp danh sách"
                onCommit={commitRecipients}
                onSeeResult={() => navigate('/sales/leads')}
              />
              <Button size="md" onClick={() => setMode('create')}>
                <Icon icon={Plus} size={16} />
                Nguồn dẫn mới
              </Button>
            </>
          }
          nav={<Module1Books />}
          score={
            /* NĂM ô, đọc từ trái sang là một câu: bao nhiêu chiến dịch xong · bao
               nhiêu còn chạy · gửi đi bao nhiêu · có ai mở · có ai trả lời. */
            totals ? (
              <div className="flex flex-col gap-3">
                {/* Điểm gãy là `lg`: ba thiết bị của luật 3, không đẻ điểm gãy thứ tư. */}
                <ScreenScoreGrid className="xl:grid-cols-5">
                  <StatCard
                    size="compact"
                    icon={CheckCircle2}
                    value={String(byStatus.done)}
                    label="Nguồn dẫn đã hoàn thành"
                    hint={`trên ${totals.sources} nguồn dẫn của kỳ`}
                  />
                  <StatCard
                    size="compact"
                    icon={Zap}
                    value={String(byStatus.running)}
                    label="Nguồn dẫn đang chạy"
                    hint="đợt cuối còn trong 14 ngày — trả lời vẫn về"
                  />
                  <StatCard
                    size="compact"
                    icon={Mail}
                    value={grouped(totals.sent)}
                    label="Số mail đã gửi"
                    hint={`${totals.waves} đợt · ${grouped(totals.audience)} thư lô đã nợ khi mở`}
                  />
                  <StatCard
                    size="compact"
                    icon={MailOpen}
                    value={percent(rate(totals.opened, totals.sent))}
                    label="Tỉ lệ mở mail"
                    hint={`${grouped(totals.opened)} người mở`}
                  />
                  <StatCard
                    size="compact"
                    icon={Reply}
                    value={percent(rate(totals.clicked, totals.sent))}
                    label="Tỉ lệ bấm vào thư"
                    hint={`${grouped(totals.clicked)} người bấm`}
                  />
                </ScreenScoreGrid>

                {/* Ba chỗ chênh nói thẳng ở đây, không bắt ai tự trừ: thư nợ mà
                    không đi được, nguồn tự nhiên đứng ngoài sổ này, và phần cơ hội
                    không chiến dịch nào được ghi công. */}
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Hai tỉ lệ trên chia cho cùng một mẫu số là {grouped(totals.sent)} thư đã gửi; các
                  lô nợ {grouped(totals.audience)} thư khi mở, chỗ chênh là thư không rời được máy
                  (bị chặn, dội, hoặc hết lượt thử). {totals.natural.count} nguồn tự nhiên (
                  {totals.natural.leads} lead, không ai chạy đợt nào) không nằm trong sổ này; chúng
                  ở Sổ lead. {totals.ops}/{totals.opsBook} cơ hội của kỳ đến từ những chiến dịch
                  dưới đây.
                </p>
              </div>
            ) : (
              <Skeleton className="h-20 w-full" />
            )
          }
          tabs={
            <SegmentedControl
              label="Trạng thái"
              hideLabel
              tone="quiet"
              value={filter.status ?? 'all'}
              onChange={(v) =>
                setFilter((f) => ({
                  ...f,
                  status: v === 'all' ? null : (v as CampaignStatus),
                }))
              }
              options={[
                { value: 'all', label: 'Tất cả', count: beforeStatus.length },
                /* Chỉ hiện trạng thái CÓ dòng. "Nháp · 0" hôm nay luôn rỗng
                   (fixture không có chiến dịch nháp nào) và một ô bấm vào ra
                   bảng trống là một ô dạy người mới rằng công cụ hỏng. */
                ...CAMPAIGN_STATUS.filter((s) => beforeStatus.some((r) => r.status === s.key)).map(
                  (s) => ({
                    value: s.key,
                    label: s.label,
                    count: beforeStatus.filter((r) => r.status === s.key).length,
                  }),
                ),
              ]}
            />
          }
          count={<BookCount total={visible.length} noun="nguồn dẫn" />}
          tools={
            <FilterMenu label="Bộ lọc nguồn dẫn" active={activeFilters}>
              <Select
                label="Kênh"
                value={filter.channel ?? 'all'}
                neutralValue="all"
                onChange={(v) =>
                  setFilter((f) => ({
                    ...f,
                    channel: v === 'all' ? null : (v as (typeof channels)[number]),
                  }))
                }
                /* A native select grows to its longest option and would burst the
                   popover — clamp it to the panel. */
                className="w-full max-w-none"
                options={[
                  { value: 'all', label: 'Mọi kênh' },
                  ...channels.map((c) => ({ value: c, label: CHANNEL_LABEL[c] })),
                ]}
              />

              <Select
                label="Thời gian"
                value={filter.window}
                neutralValue="all"
                onChange={(v) => setFilter((f) => ({ ...f, window: v as TimeWindowKey }))}
                className="w-full max-w-none"
                options={TIME_WINDOWS.map((w) => ({ value: w.key, label: w.label }))}
              />

              {/* Ô lọc PIC chỉ có mặt khi có từ hai người trở lên. Cả kỳ này
                  một mình Marketing chạy sáu chiến dịch, nên hôm nay nó vắng
                  — và câu dưới sổ nói ra chuyện đó. Một hộp lọc một lựa
                  chọn là một hộp không lọc được gì. */}
              {owners.length > 1 ? (
                <Select
                  label="PIC"
                  value={filter.owner ?? 'all'}
                  neutralValue="all"
                  onChange={(v) => setFilter((f) => ({ ...f, owner: v === 'all' ? null : v }))}
                  className="w-full max-w-none"
                  options={[
                    { value: 'all', label: 'Mọi PIC' },
                    ...owners.map((o) => ({ value: o, label: o })),
                  ]}
                />
              ) : null}

              {filtering ? (
                <Button size="md" variant="ghost" onClick={() => setFilter(NO_FILTER)}>
                  Xoá lọc
                </Button>
              ) : null}
            </FilterMenu>
          }
          pending={isPending}
          empty={
            visible.length === 0
              ? {
                  message: 'Không có chiến dịch nào khớp bộ lọc đang bật.',
                  action: { label: 'Xoá lọc', onClick: () => setFilter(NO_FILTER) },
                }
              : undefined
          }
          table={{
            minWidth: TABLE_MIN_WIDTH,
            sort,
            onSort: toggleSort,
            columns: [
              { header: 'Nguồn dẫn', width: '2.4fr' },
              { header: 'PIC', width: '1fr' },
              { header: 'Kênh bắn', width: '0.8fr' },
              { header: 'Bắt đầu', width: '0.75fr', sortKey: 'start' },
              { header: 'Kết thúc', width: '0.75fr', sortKey: 'end' },
              { header: 'Người nhận', width: '0.8fr', align: 'right', sortKey: 'recipients' },
              /* The three ratio columns each divide by THAT source's own
                 recipient count, which is why a source run off a social post
                 reads low on all three — the channel column says why. */
              { header: 'Mở mail', width: '0.7fr', align: 'right', sortKey: 'opens' },
              { header: 'Bấm', width: '0.7fr', align: 'right', sortKey: 'clicks' },
              { header: 'Mail hỏng', width: '0.75fr', align: 'right', sortKey: 'bounces' },
              { header: '→ Ops', width: '0.7fr', align: 'right', sortKey: 'ops' },
            ],
            rows: visible.map((s) => {
              const chans = channelsOf(s)
              return {
                id: s.code,
                /* CẢ DÒNG mở hồ sơ. Không có vùng bấm thứ hai bên trong dòng:
                   hai vùng bấm chồng nhau chỉ làm người dùng đoán xem phải
                   bấm chỗ nào. */
                onOpen: () => navigate(`/sales/campaigns/sources/${s.code}`),
                cells: [
                  /* Trạng thái là một CHẤM đứng trước tên, không phải một cột
                     riêng: nó chỉ có ba giá trị, và một cột 0.8fr cho ba chữ
                     là 0.8fr lấy mất của cột tên. Chấm có `label` nên trình
                     đọc màn hình vẫn nghe được trạng thái. */
                  <span key="n" className="flex min-w-0 items-center gap-2">
                    <StatusDot state={STATUS_DOT[s.status]} label={STATUS_LABEL[s.status]} />
                    <Icon icon={CAMPAIGN_ICON} size={16} className="text-muted-foreground" />
                    <span className="truncate">{s.label}</span>
                    <span className="text-muted-foreground font-num shrink-0 text-[11px]">
                      {s.code}
                    </span>
                  </span>,
                  <span key="p" className="flex min-w-0 items-center gap-2">
                    <Avatar name={s.owner} size="sm" />
                    <span className="truncate text-[11.5px]">{s.owner}</span>
                  </span>,
                  <span key="ch" className="flex items-center gap-1">
                    {chans.length === 0 ? <span className="text-muted-foreground">—</span> : null}
                    {chans.slice(0, MAX_CHANNEL_TAGS).map((c) => (
                      <ChannelTag
                        key={c}
                        iconOnly
                        icon={CHANNEL_ICON[c]}
                        label={CHANNEL_LABEL[c]}
                      />
                    ))}
                    {chans.length > MAX_CHANNEL_TAGS ? (
                      <span className="text-muted-foreground text-[11px]">
                        +{chans.length - MAX_CHANNEL_TAGS}
                      </span>
                    ) : null}
                  </span>,
                  <span key="b" className="tnum font-num">
                    {dm(s.startISO)}
                  </span>,
                  <span key="e" className="tnum font-num">
                    {dm(s.lastISO)}
                  </span>,
                  <span key="r" className="tnum font-num">
                    {grouped(s.sent)}
                  </span>,
                  <span key="o" className="tnum font-num">
                    {percent(s.openRate)}
                  </span>,
                  <span key="t" className="tnum font-num">
                    {percent(s.clickRate)}
                  </span>,
                  <span key="h" className="tnum font-num">
                    {percent(s.bounceRate)}
                  </span>,
                  <span key="ops" className="tnum font-num">
                    {s.ops}
                  </span>,
                ],
              }
            }),
          }}
        />

        <SourceStatsBlock />
      </ScreenLayout>
    </AppShell>
  )
}

export default SourcesPage
