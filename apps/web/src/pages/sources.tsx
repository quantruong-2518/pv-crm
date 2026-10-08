import { useMemo, useState } from 'react'
import { CheckCircle2, Mail, MailOpen, Plus, Reply, Zap } from '@pv/ui'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Avatar,
  Button,
  ChannelTag,
  ColumnFilter,
  ColumnFilterList,
  ColumnFilterRange,
  Icon,
  ScreenLayout,
  ScreenScoreGrid,
  SearchField,
  SegmentedControl,
  Skeleton,
  StatCard,
  StatusDot,
  percent,
  type TableSort,
} from '@pv/ui'
import { useAppChrome } from '@/app/chrome'
import {
  dayField,
  listField,
  oneOf,
  useClientBookFilter,
  type BookFilters,
} from '@/app/client-book-filter'
import { dm } from '@/lib/date'
import {
  CAMPAIGN_STATUS,
  SOURCE_SORTS,
  STATUS_DOT,
  STATUS_LABEL,
  campaignTotalsQuery,
  channelsInUse,
  ownersOf,
  rate,
  sourcesQuery,
  type SourceRow,
  type SourceSortKey,
} from '@/data/campaigns'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { RECIPIENT_SPEC, normalise } from '@/data/intake'
import { useLeadImport } from '@/data/lead-import'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { BookCount, BookPage } from '@/components/book-page'
import { Module1Books } from '@/components/module1-books'
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
 *  và tên hàm bên trong (`CampaignForm`, `CAMPAIGN_ICON`) giữ
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
 *  BỘ LỌC dựng từ chính dữ liệu đang có (`ownersOf`, `channelsInUse`) — một
 *  mục lọc không dòng nào khớp đọc y hệt một bộ lọc hỏng. Trạng thái ở hàng
 *  tab, ô tìm ở thanh công cụ, còn lại nằm trên tiêu đề cột (`ColumnFilter`);
 *  tất cả ghi lên địa chỉ qua `useClientBookFilter`.
 *
 *  KHÔNG có ContextRail ở màn này (bỏ 23/08). Luật 10 buộc rail đi kèm việc MỞ
 *  một object; sổ không mở object nào, và bốn chip đứng cạnh nút "Chiến dịch
 *  mới" chỉ trỏ vào một đơn của một dòng trong sáu. Rail vẫn ở hồ sơ chiến dịch,
 *  nơi đúng một object đang được mở.
 *
 *  KHÔNG có khối AI (bỏ 23/08 theo yêu cầu). Không có khối AI thì luật 9 không
 *  có gì để cưỡng chế ở đây — nó cấm AI tự chạy, không đòi mọi màn phải có AI.
 *
 *  Màn KHÔNG tự cộng số nghiệp vụ. Mọi tổng, mọi tỉ lệ nằm ở `data/campaigns.ts`
 *  — một phép chia viết trong JSX là một phép chia không ai test được. Bộ lọc
 *  sống trên địa chỉ qua `useClientBookFilter` (xem `SOURCE_FILTERS` bên dưới).
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

/** Address keys of this book. Module-level so the hook's memo key is stable. */
const SOURCE_FILTERS = {
  status: oneOf(
    CAMPAIGN_STATUS.map((s) => s.key),
    undefined,
  ),
  owner: listField(),
  channel: listField(),
  from: dayField(),
  to: dayField(),
}

type SourceFilters = BookFilters<typeof SOURCE_FILTERS>

/** Pure: the search covers name and code; channel matches ANY wave of the source;
 *  the date range is on the start day. */
function filterSourceBook(rows: SourceRow[], f: SourceFilters): SourceRow[] {
  const needle = normalise(f.q)
  return rows.filter((r) => {
    if (needle && !normalise(`${r.label} ${r.code}`).includes(needle)) return false
    if (f.status && r.status !== f.status) return false
    if (f.owner.length > 0 && !f.owner.includes(r.owner)) return false
    if (f.channel.length > 0 && !r.waves.some((w) => f.channel.includes(w.channel))) return false
    const day = r.startISO.slice(0, 10)
    return (!f.from || day >= f.from) && (!f.to || day <= f.to)
  })
}

export function SourcesPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm nguồn dẫn, đợt gửi…' })
  const navigate = useNavigate()

  const { data: sources = [], isPending, error, refetch } = useQuery(sourcesQuery)
  const { data: totals } = useQuery(campaignTotalsQuery)

  const loadFile = useLeadImport()

  const [mode, setMode] = useState<'list' | 'create'>('list')
  const book = useClientBookFilter(SOURCE_FILTERS)
  const { filters, patch } = book
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

  /* Số đếm trên bộ chọn trạng thái tính trên tập ĐÃ LỌC CÁC CHIỀU KIA. Đếm trên
     cả sổ thì lọc kênh email xong vẫn thấy "Đang chạy · 1" trong khi bảng
     rỗng, và người dùng kết luận bảng hỏng. */
  const beforeStatus = useMemo(
    () => filterSourceBook(sources, { ...filters, status: undefined }),
    [sources, filters],
  )

  const visible = useMemo(() => {
    const list = filterSourceBook(sources, filters)
    const compare = SOURCE_SORTS.find((s) => s.key === sort.key)?.compare
    if (!compare) return list
    /* `compare` của tầng data LUÔN tăng dần — hướng là việc của màn. */
    const asc = [...list].sort(compare)
    return sort.dir === 'asc' ? asc : asc.reverse()
  }, [sources, filters, sort])

  const toggleSort = (key: string) => {
    const found = SOURCE_SORTS.find((s) => s.key === key)
    if (!found) return
    setSort((cur) =>
      cur.key === found.key
        ? { ...cur, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { key: found.key, dir: 'desc' },
    )
  }

  const ownerFilter = (
    <ColumnFilter label="Người phụ trách" active={filters.owner.length > 0}>
      {(close) => (
        <ColumnFilterList
          options={owners.map((o) => ({ value: o, label: o }))}
          selected={filters.owner}
          close={close}
          onApply={(owner) => patch({ owner })}
        />
      )}
    </ColumnFilter>
  )
  const channelFilter = (
    <ColumnFilter label="Kênh gửi" active={filters.channel.length > 0}>
      {(close) => (
        <ColumnFilterList
          options={channels.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
          selected={filters.channel}
          close={close}
          searchable={false}
          onApply={(channel) => patch({ channel })}
        />
      )}
    </ColumnFilter>
  )
  const startFilter = (
    <ColumnFilter iconOnly label="Bắt đầu" active={Boolean(filters.from || filters.to)}>
      {(close) => (
        <ColumnFilterRange
          from={filters.from}
          to={filters.to}
          close={close}
          onApply={({ from, to }) => patch({ from, to })}
        />
      )}
    </ColumnFilter>
  )

  /* Lô nạp GHI THẲNG lên máy chủ, cùng hai cửa sổ lead đang dùng
     (`data/lead-import.ts`). Trước 31/08 chỗ này ghi vào `useIntakeDesk` — một
     kho zustand trong trình duyệt — rồi toast "đã vào sổ lead" trong khi Neon
     không nhận dòng nào: người dùng mở Sổ lead ngay sau đó và không thấy gì.

     Ba thứ chết theo cùng lượt và không thứ nào là mất mát: mã lead do MÁY CHỦ
     cấp nên `rowsToLeads` hết việc; chống trùng do máy chủ đọc tại thời điểm
     đọc, trên chỉ mục hộp thư (ADR 0070, không còn chặn ghi) nên
     `frozenLeadBookQuery` — sổ fixture 100 dòng — hết lý do tồn tại; và bốn
     con số cuối panel là số của bên đã ghi thật, không phải số trình duyệt tự
     đếm. */
  const commitRecipients = async ({
    rows,
    motion,
    fileName,
    scope,
  }: ImportCommit & { scope?: string }) => {
    const run = await loadFile({ rows, motion, fileName, source: scope })
    const { report } = run

    toast(run.failure ?? `${report.rows.length} người nhận đã được thêm vào sổ lead`, {
      tone: run.failure ? 'danger' : 'success',
      detail: [
        scope && `Gắn với nguồn dẫn ${scope}`,
        report.duplicates > 0 &&
          `${report.duplicates} dòng đã có trong hệ thống, vẫn nhập và đánh dấu`,
        report.dupInFile > 0 && `${report.dupInFile} dòng trùng nhau trong tệp`,
        report.errors.length > 0 && `${report.errors.length} dòng không nạp được`,
      ]
        .filter(Boolean)
        .join(' · '),
      action: { label: 'Xem sổ lead', onClick: () => navigate('/sales/leads') },
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
                buttonLabel="Nhập người nhận từ tệp"
                onCommit={commitRecipients}
                onSeeResult={() => navigate('/sales/leads')}
              />
              <Button size="md" onClick={() => setMode('create')}>
                <Icon icon={Plus} size={16} />
                Thêm nguồn dẫn
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
                    label="Đã hoàn thành"
                    hint={`${byStatus.done}/${totals.sources} nguồn dẫn`}
                  />
                  <StatCard
                    size="compact"
                    icon={Zap}
                    value={String(byStatus.running)}
                    label="Đang hoạt động"
                    hint="Có đợt gửi trong 14 ngày gần nhất"
                  />
                  <StatCard
                    size="compact"
                    icon={Mail}
                    value={grouped(totals.sent)}
                    label="Email đã gửi"
                    hint={`${totals.waves} đợt gửi · ${grouped(totals.audience)} lượt người nhận dự kiến`}
                  />
                  <StatCard
                    size="compact"
                    icon={MailOpen}
                    value={percent(rate(totals.opened, totals.sent))}
                    label="Tỷ lệ mở email"
                    hint={`${grouped(totals.opened)}/${grouped(totals.sent)} email đã được mở`}
                  />
                  <StatCard
                    size="compact"
                    icon={Reply}
                    value={percent(rate(totals.clicked, totals.sent))}
                    label="Tỷ lệ nhấp liên kết"
                    hint={`${grouped(totals.clicked)}/${grouped(totals.sent)} email có lượt nhấp`}
                  />
                </ScreenScoreGrid>

                {/* Ba chỗ chênh nói thẳng ở đây, không bắt ai tự trừ: thư nợ mà
                    không đi được, nguồn tự nhiên đứng ngoài sổ này, và phần cơ hội
                    không chiến dịch nào được ghi công. */}
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Hai tỷ lệ trên đều được tính trên {grouped(totals.sent)} email đã gửi. Chênh lệch
                  so với {grouped(totals.audience)} lượt người nhận dự kiến là email bị chặn, bị trả
                  lại hoặc gửi không thành công. {totals.natural.count} nguồn tự nhiên với{' '}
                  {totals.natural.leads} lead được thống kê tại Sổ lead. {totals.ops}/
                  {totals.opsBook}
                  cơ hội trong kỳ đến từ các nguồn dẫn bên dưới.
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
              value={filters.status ?? 'all'}
              onChange={(v) => patch({ status: CAMPAIGN_STATUS.find((s) => s.key === v)?.key })}
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
            <>
              <SearchField
                placeholder="Tìm theo tên hoặc mã nguồn dẫn…"
                value={book.text}
                onChange={book.setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              {book.dirty && (
                <Button
                  size="md"
                  variant="ghost"
                  onClick={book.clear}
                  className="pointer-coarse:h-12"
                >
                  Bỏ hết bộ lọc
                </Button>
              )}
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `Không tải được danh sách nguồn dẫn. ${
                    isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            visible.length === 0
              ? book.dirty
                ? {
                    message: 'Không có nguồn dẫn nào phù hợp với bộ lọc hiện tại.',
                    action: { label: 'Bỏ hết bộ lọc', onClick: book.clear },
                  }
                : {
                    message: 'Chưa có nguồn dẫn nào. Hãy thêm nguồn dẫn đầu tiên.',
                    action: { label: 'Thêm nguồn dẫn', onClick: () => setMode('create') },
                  }
              : undefined
          }
          table={{
            minWidth: TABLE_MIN_WIDTH,
            sort,
            onSort: toggleSort,
            columns: [
              { header: 'Nguồn dẫn', width: '2.4fr' },
              /* A one-choice filter filters nothing, so the plain title stays. */
              { header: owners.length > 1 ? ownerFilter : 'Người phụ trách', width: '1fr' },
              { header: channels.length > 1 ? channelFilter : 'Kênh gửi', width: '0.8fr' },
              { header: 'Bắt đầu', width: '0.75fr', sortKey: 'start', filter: startFilter },
              { header: 'Kết thúc', width: '0.75fr', sortKey: 'end' },
              { header: 'Người nhận', width: '0.8fr', align: 'right', sortKey: 'recipients' },
              /* The three ratio columns each divide by THAT source's own
                 recipient count, which is why a source run off a social post
                 reads low on all three — the channel column says why. */
              { header: 'Tỷ lệ mở', width: '0.7fr', align: 'right', sortKey: 'opens' },
              { header: 'Tỷ lệ nhấp', width: '0.7fr', align: 'right', sortKey: 'clicks' },
              { header: 'Tỷ lệ trả lại', width: '0.75fr', align: 'right', sortKey: 'bounces' },
              { header: 'Cơ hội tạo ra', width: '0.7fr', align: 'right', sortKey: 'ops' },
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
