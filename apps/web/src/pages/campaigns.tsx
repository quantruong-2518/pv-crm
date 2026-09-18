import { useEffect, useMemo, useState } from 'react'
import { Inbox, Megaphone, Plus, Zap } from '@pv/ui'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  Icon,
  SearchField,
  SegmentedControl,
  Select,
  ScreenLayout,
  StatCard,
  type TableSort,
} from '@pv/ui'
import { CampaignBookSortKey, type CampaignBookQuery, type CampaignState } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { useCan } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { pageIndexFromQueryPage, queryPageFromPageIndex } from '@/app/url'
import { dm } from '@/lib/date'
import {
  CAMPAIGN_STATE_LABEL,
  CAMPAIGN_STATE_TONE,
  DEFAULT_CAMPAIGN_BOOK_QUERY,
  campaignBookQuery,
  campaignBookQueryToParams,
  campaignFacetQuery,
  parseCampaignBookQuery,
} from '@/data/campaign-book'
import { BookCount, BookPage } from '@/components/book-page'
import { Module1Books } from '@/components/module1-books'
import { FilterMenu, TableFooter } from '@/components/table-bits'

/** Module 1 · Sổ chiến dịch — `GET /sales/campaigns`.
 *
 *  ------------------------------------------------------------------
 *  ĐÂY LÀ `sales.campaign` (CP-nnnn), KHÔNG PHẢI MÀN NGUỒN DẪN
 *  ------------------------------------------------------------------
 *  Đường dẫn `/sales/campaigns` trước 29/08 là sổ **Nguồn dẫn** (`SR-nn`) —
 *  nơi lead SINH RA. Nó nay ở `/sales/campaigns/sources` (`pages/sources.tsx`),
 *  và chỗ này trả về cho thứ mang đúng cái tên: đơn vị GỬI, thứ TIÊU lead.
 *  Quyết định D2 ngày 28/08 chốt hai bảng tách riêng và không hợp nhất; đây là
 *  nửa còn thiếu của nó trên màn. Ba sổ của module đi qua `Module1Books`.
 *
 *  ------------------------------------------------------------------
 *  HÌNH SỔ NẰM Ở `BookPage`, ÍT KHỐI HƠN HAI SỔ KIA
 *  ------------------------------------------------------------------
 *  Màn chỉ đưa NỘI DUNG cho `components/book-page.tsx` — tiêu đề, nút, tab,
 *  cột. Bộ lọc nằm trên ĐỊA CHỈ, nên một trang đã lọc chép cho người khác được.
 *
 *  Ít thứ hơn vì sổ này trả lời ít câu hơn: không có nút nạp tệp (thành viên
 *  vào chiến dịch từ Sổ lead, không từ một tệp rời), trạng thái là hàng tab, và
 *  trong `FilterMenu` chỉ còn một ô Chủ. Ba ô lọc của sổ cơ hội trả lời những
 *  câu mà sổ vài chục dòng này chưa ai hỏi. */

/** Số dòng bảng vẽ. Nhỏ hơn mặc định 50 của hợp đồng vì hàng chiến dịch cao
 *  hơn hàng cơ hội — có tên dài và hai con số. */
const PAGE_SIZE = 10

const TABLE_MIN_WIDTH = 'min-w-[980px]'

/** How long after the last keystroke the search box writes to the address. Same
 *  value as the opportunity book because it is the same box: typing stays
 *  instant in local state, only the URL waits. */
const SEARCH_DELAY_MS = 300

const STATES: CampaignState[] = ['DRAFT', 'RUNNING', 'STOPPED', 'DONE']

/** "Every state" for the tab row. On the wire that is an ABSENT field, but a
 *  segmented control carries strings only, so it needs a stand-in value. */
const ANY = 'all'

/** The tab row — the `state` axis, laid open rather than hidden in a select,
 *  exactly as the lead and opportunity books lay theirs. The all-states tab
 *  stands first because it is the tab the screen opens on. Outside the
 *  component because `useQueries` below reads its length. */
const STATE_TABS: { value: string; label: string }[] = [
  { value: ANY, label: 'Tất cả' },
  ...STATES.map((state) => ({ value: state as string, label: CAMPAIGN_STATE_LABEL[state] })),
]

export function CampaignsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm chiến dịch, đợt gửi…' })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  /* HIDDEN, not greyed out — same call `opportunity-detail` makes for its sign
     button. A greyed button promises "you could do this, just not now", and for
     a read-only role it is never now. `useCan` asks the very E2 function
     `app/api/client.ts` asks before letting a byte out, so the button and the
     fence never disagree; the real fence stays at the api layer and on the
     route. */
  const canWrite = useCan('campaign.edit')

  const urlQuery = useMemo(() => parseCampaignBookQuery(params), [params])
  const query = useMemo<CampaignBookQuery>(() => ({ ...urlQuery, size: PAGE_SIZE }), [urlQuery])

  const {
    data,
    isPending,
    error: bookError,
    refetch: refetchBook,
  } = useQuery(campaignBookQuery(query))
  const { data: facets } = useQuery(campaignFacetQuery)

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const hidden = data?.hidden ?? 0
  const wholeBook = useMemo(() => facets?.rows ?? [], [facets])

  /* Ba con số của CẢ SỔ, không của trang đang mở — `campaignFacetQuery` giải
     thích vì sao và nó gãy ở đâu. "Người nhận" cộng dồn `audienceCount` chứ
     không đếm lead DISTINCT: một lead nằm trong hai chiến dịch là hai lần được
     gửi, và con số này trả lời "bao nhiêu lá thư một vòng bắn", không trả lời
     "bao nhiêu người trong sổ". */
  const score = useMemo(
    () => ({
      drafts: wholeBook.filter((c) => c.state === 'DRAFT').length,
      running: wholeBook.filter((c) => c.state === 'RUNNING').length,
      audience: wholeBook.reduce((sum, c) => sum + c.audienceCount, 0),
    }),
    [wholeBook],
  )

  /* Danh sách chủ dựng TỪ CẢ SỔ, khoá theo id và nhãn là tên máy chủ đã gửi —
     không tra ngược id sang tên bằng fixture, vì dữ liệu thật không nằm trong
     một kịch bản đóng băng. */
  const owners = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of wholeBook) {
      if (c.ownerId && !seen.has(c.ownerId)) seen.set(c.ownerId, c.ownerName ?? c.ownerId)
    }
    return [...seen].map(([value, label]) => ({ value, label }))
  }, [wholeBook])

  const patch = (next: Partial<CampaignBookQuery>) =>
    setParams(
      campaignBookQueryToParams({
        ...urlQuery,
        ...next,
        page: DEFAULT_CAMPAIGN_BOOK_QUERY.page,
      }),
    )

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageIndex = Math.min(pageIndexFromQueryPage(query.page), pageCount - 1)
  const goPage = (index: number) =>
    setParams(campaignBookQueryToParams({ ...urlQuery, page: queryPageFromPageIndex(index) }))

  /* The box keeps the text in state so typing shows up at once, then drips onto
     the address after `SEARCH_DELAY_MS` with `replace`: one eight-letter query
     pushing eight history entries turns Back into a backspace key. */
  const [text, setText] = useState(urlQuery.q ?? '')

  /* Address changed from OUTSIDE — Back, F5, a link someone sent — so the box
     has to follow, or the text says one thing while the table filters another. */
  useEffect(() => setText(urlQuery.q ?? ''), [urlQuery.q])

  useEffect(() => {
    const wanted = text.trim() === '' ? undefined : text.trim()
    if (wanted === urlQuery.q) return
    const timer = setTimeout(
      () =>
        setParams(
          campaignBookQueryToParams({
            ...urlQuery,
            q: wanted,
            page: DEFAULT_CAMPAIGN_BOOK_QUERY.page,
          }),
          { replace: true },
        ),
      SEARCH_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [text, urlQuery, setParams])

  const dirty = text.trim() !== '' || query.state !== undefined || query.owner !== undefined
  const clearFilters = () => {
    setText('')
    patch({ q: undefined, state: undefined, owner: undefined })
  }

  /* One `size=1` read per tab, the move both other books make: `total` is the
     count under the OTHER filters in force, and no other endpoint answers that. */
  const tabCounts = useQueries({
    queries: STATE_TABS.map((tab) =>
      campaignBookQuery({
        ...urlQuery,
        state: tab.value === ANY ? undefined : (tab.value as CampaignState),
        page: DEFAULT_CAMPAIGN_BOOK_QUERY.page,
        size: 1,
      }),
    ),
  })
  const tabs = STATE_TABS.map((tab, i) => ({ ...tab, count: tabCounts[i]?.data?.total }))

  /* Zero reads as "missing", not "fine" — tint per cell on its own count.
     `facets` is the loaded flag: `score` defaults every field to 0 while it
     is still pending, and that pending zero must not flash as a warning. */
  const zero = (n: number) => Boolean(facets) && n === 0

  const scoreItems = [
    {
      icon: Megaphone,
      label: 'Nháp chờ bắn',
      value: String(score.drafts),
      hint: 'đã dựng xong nhưng chưa gửi',
      warn: zero(score.drafts),
    },
    {
      icon: Zap,
      label: 'Đang chạy',
      value: String(score.running),
      hint: 'còn ít nhất một đợt chưa gửi xong',
      warn: zero(score.running),
    },
    {
      icon: Inbox,
      label: 'Lượt gửi đã gom',
      value: score.audience.toLocaleString('vi-VN'),
      hint: 'cộng dồn, không trừ trùng',
      warn: zero(score.audience),
    },
  ]

  const tableSort: TableSort | undefined =
    query.sort === DEFAULT_CAMPAIGN_BOOK_QUERY.sort
      ? undefined
      : { key: query.sort, dir: query.dir }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Sổ chiến dịch"
          actions={
            canWrite && (
              <Button size="md" onClick={() => navigate('/sales/campaigns/new')}>
                <Icon icon={Plus} size={16} />
                Chiến dịch mới
              </Button>
            )
          }
          nav={<Module1Books />}
          score={
            <div
              role="group"
              aria-label="Thẻ điểm sổ chiến dịch"
              className="grid grid-cols-2 gap-3 lg:grid-cols-3"
            >
              {scoreItems.map((item) => (
                <StatCard
                  key={item.label}
                  size="compact"
                  icon={item.icon}
                  label={item.label}
                  value={item.value}
                  hint={item.hint}
                  tone={item.warn ? 'warning' : 'default'}
                />
              ))}
            </div>
          }
          tabs={
            <SegmentedControl
              label="Trạng thái chiến dịch"
              hideLabel
              tone="quiet"
              value={query.state ?? ANY}
              options={tabs}
              onChange={(value) =>
                patch({ state: value === ANY ? undefined : (value as CampaignState) })
              }
            />
          }
          count={<BookCount total={total} noun="chiến dịch" hidden={hidden} />}
          tools={
            <>
              <SearchField
                placeholder="Tìm theo tên hoặc mã chiến dịch…"
                value={text}
                onChange={setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              <FilterMenu label="Bộ lọc sổ chiến dịch" active={query.owner === undefined ? 0 : 1}>
                <Select
                  label="Chủ"
                  value={query.owner ?? ANY}
                  onChange={(value) => patch({ owner: value === ANY ? undefined : value })}
                  /* A native select grows to its longest option — clamp it to
                     the panel. */
                  className="w-full max-w-none"
                  options={[{ value: ANY, label: 'Mọi chủ' }, ...owners]}
                />
                {dirty && (
                  <Button size="md" variant="ghost" onClick={clearFilters}>
                    Bỏ hết bộ lọc
                  </Button>
                )}
              </FilterMenu>
            </>
          }
          pending={isPending}
          failure={
            bookError
              ? {
                  message: `Không lấy được sổ chiến dịch. ${
                    isApiError(bookError) ? userMessage(bookError) : 'Vui lòng thử lại.'
                  }`,
                  onRetry: () => void refetchBook(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: dirty
                    ? 'Không có chiến dịch nào khớp bộ lọc đang chọn.'
                    : canWrite
                      ? 'Sổ chiến dịch chưa có gì. Tạo một chiến dịch rồi gom người nhận từ Sổ lead.'
                      : 'Sổ chiến dịch chưa có gì mở cho bạn. Chiến dịch do Marketing hoặc quản lý tạo.',
                  action: dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: clearFilters }
                    : canWrite
                      ? { label: 'Chiến dịch mới', onClick: () => navigate('/sales/campaigns/new') }
                      : {
                          label: 'Xem Sổ lô gửi',
                          onClick: () => navigate('/sales/campaigns/mail-runs'),
                        },
                }
              : undefined
          }
          table={{
            minWidth: TABLE_MIN_WIDTH,
            sort: tableSort,
            onSort: (key) => {
              /* Máy chủ chỉ nhận hai khoá (`CampaignBookSortKey`). Cột nào không
                 có `sortKey` bên dưới thì không vẽ mũi tên, nên nhánh này chỉ
                 chặn một đường vòng — nhưng rẻ hơn một lượt 400 từ cổng zod. */
              const parsed = CampaignBookSortKey.safeParse(key)
              if (!parsed.success) return
              patch(
                query.sort === parsed.data
                  ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
                  : { sort: parsed.data, dir: 'asc' },
              )
            },
            columns: [
              { header: 'Mã', width: '0.8fr' },
              { header: 'Tên chiến dịch', width: '2.2fr', sortKey: 'name' },
              { header: 'Trạng thái', width: '1fr' },
              { header: 'Chủ', width: '1.2fr' },
              { header: 'Nguồn dẫn', width: '1.2fr' },
              { header: 'Người nhận', width: '0.9fr', align: 'right' },
              { header: 'Đợt', width: '0.6fr', align: 'right' },
              { header: 'Tạo lúc', width: '0.9fr', sortKey: 'createdAt' },
            ],
            rows: rows.map((c) => ({
              id: c.code,
              onOpen: () => navigate(`/sales/campaigns/${c.code}`),
              cells: [
                <Chip key="c">{c.code}</Chip>,
                <span key="n" className="block truncate" title={c.name}>
                  {c.name}
                </span>,
                <Badge key="s" tone={CAMPAIGN_STATE_TONE[c.state]}>
                  {CAMPAIGN_STATE_LABEL[c.state]}
                </Badge>,
                <span key="o" className="block truncate">
                  {c.ownerName ?? '—'}
                </span>,
                <span key="src" className="block truncate">
                  {c.sourceName ?? '—'}
                </span>,
                <span key="a">{c.audienceCount.toLocaleString('vi-VN')}</span>,
                <span key="w">{c.waveCount}</span>,
                <span key="t">{dm(c.createdAt)}</span>,
              ],
            })),
          }}
          footer={
            <TableFooter page={pageIndex} pageSize={PAGE_SIZE} total={total} onPage={goPage} />
          }
        />
      </ScreenLayout>
    </AppShell>
  )
}

export default CampaignsPage
