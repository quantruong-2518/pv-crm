import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  ColumnFilter,
  ColumnFilterList,
  ColumnFilterRange,
  Icon,
  Inbox,
  Megaphone,
  Plus,
  Zap,
  SearchField,
  SegmentedControl,
  ScreenLayout,
  StatCard,
  type TableSort,
} from '@pv/ui'
import {
  CampaignBookQuery,
  CampaignBookSortKey,
  OWNER_NONE,
  type CampaignBookRow,
  type CampaignState,
} from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { useSalesPeople } from '@/data/directory'
import { salesCatalogQuery } from '@/data/sales-config'
import { useCan } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { dm } from '@/lib/date'
import {
  CAMPAIGN_STATE_LABEL,
  CAMPAIGN_STATE_TONE,
  campaignBookQuery,
  campaignFacetQuery,
} from '@/data/campaign-book'
import { BookCount, BookPage } from '@/components/book-page'
import { Module1Books } from '@/components/module1-books'
import { AvatarCell, TableFooter } from '@/components/table-bits'
import { CampaignCreateModal } from './campaign-profile-parts'

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
 *  vào chiến dịch từ Sổ lead, không từ một tệp rời). Trạng thái là hàng tab; Người phụ trách,
 *  Nguồn dẫn và Tạo lúc lọc ngay trên tiêu đề cột (`ColumnFilter`) như Sổ lead. */

/** Số dòng bảng vẽ. Nhỏ hơn mặc định 50 của hợp đồng vì hàng chiến dịch cao
 *  hơn hàng cơ hội — có tên dài và hai con số. */
const PAGE_SIZE = 10

const TABLE_MIN_WIDTH = 'min-w-[1040px]'

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

  /* HIDDEN, not greyed out — same call `opportunity-detail` makes for its sign
     button. A greyed button promises "you could do this, just not now", and for
     a read-only role it is never now. `useCan` asks the very E2 function
     `app/api/client.ts` asks before letting a byte out, so the button and the
     fence never disagree; the real fence stays at the api layer and on the
     route. */
  const canWrite = useCan('campaign.edit')

  /* The create form opens HERE, in state, instead of on a route of its own:
     `/sales/campaigns/new` was a whole screen whose content was five boxes. */
  const [creating, setCreating] = useState(false)
  const people = useSalesPeople()
  /* `config.view`, which `presales` does not hold while holding
     `campaign.view` — and only the create modal reads it. */
  const { data: catalog } = useQuery({ ...salesCatalogQuery, enabled: canWrite })
  const sources = useMemo(() => catalog?.SOURCE ?? [], [catalog])

  const book = useBookQuery(CampaignBookQuery, {
    size: PAGE_SIZE,
    filterKeys: ['state', 'owner', 'source', 'createdFrom', 'createdTo'],
  })
  const { query, urlQuery } = book

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

  /* Options are built from the whole book, keyed by id with the server's own
     name and a count; a value no campaign carries is never offered. */
  const optionsOf = (
    pick: (c: CampaignBookRow) => [id?: string, name?: string],
    none: { value: string; label: string } | null,
  ) => {
    const seen = new Map<string, { label: string; n: number }>()
    let unset = 0
    for (const c of wholeBook) {
      const [id, name] = pick(c)
      if (!id) unset += 1
      else seen.set(id, { label: name ?? id, n: (seen.get(id)?.n ?? 0) + 1 })
    }
    return [
      ...(none && unset > 0 ? [{ value: none.value, label: `${none.label} · ${unset}` }] : []),
      ...[...seen].map(([value, v]) => ({ value, label: `${v.label} · ${v.n}` })),
    ]
  }
  const ownerOptions = optionsOf((c) => [c.ownerId, c.ownerName], {
    value: OWNER_NONE,
    label: 'Chưa có người phụ trách',
  })
  const sourceOptions = optionsOf((c) => [c.sourceId, c.sourceName], null)

  const csvOf = (v?: string) => (v ? v.split(',') : [])
  const listFilter = (
    label: string,
    key: 'owner' | 'source',
    options: { value: string; label: string }[],
  ) => (
    <ColumnFilter label={label} active={Boolean(query[key])}>
      {(close) => (
        <ColumnFilterList
          options={options}
          selected={csvOf(query[key])}
          close={close}
          onApply={(v) => book.patch({ [key]: v.length ? v.join(',') : undefined })}
        />
      )}
    </ColumnFilter>
  )
  const dateFilter = (
    <ColumnFilter label="Ngày tạo" iconOnly active={Boolean(query.createdFrom || query.createdTo)}>
      {(close) => (
        <ColumnFilterRange
          from={query.createdFrom}
          to={query.createdTo}
          close={close}
          onApply={({ from, to }) => book.patch({ createdFrom: from, createdTo: to })}
        />
      )}
    </ColumnFilter>
  )

  /* One `size=1` read per tab, the move both other books make: `total` is the
     count under the OTHER filters in force, and no other endpoint answers that. */
  const tabCounts = useQueries({
    queries: STATE_TABS.map((tab) =>
      campaignBookQuery({
        ...urlQuery,
        state: tab.value === ANY ? undefined : (tab.value as CampaignState),
        page: 1,
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
      label: 'Bản nháp',
      value: String(score.drafts),
      hint: 'Chiến dịch chưa bắt đầu gửi email',
      warn: zero(score.drafts),
    },
    {
      icon: Zap,
      label: 'Đang chạy',
      value: String(score.running),
      hint: 'Còn ít nhất một đợt gửi chưa hoàn tất',
      warn: zero(score.running),
    },
    {
      icon: Inbox,
      label: 'Tổng lượt người nhận',
      value: score.audience.toLocaleString('vi-VN'),
      hint: 'Một người có thể được tính ở nhiều chiến dịch',
      warn: zero(score.audience),
    },
  ]

  const { pageIndex } = useBookPageClamp(book, data?.total)
  const tableSort: TableSort = { key: query.sort, dir: query.dir }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Sổ chiến dịch"
          actions={
            canWrite && (
              <Button size="md" className="pointer-coarse:h-12" onClick={() => setCreating(true)}>
                <Icon icon={Plus} size={16} />
                Tạo chiến dịch
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
                book.patch({ state: value === ANY ? undefined : (value as CampaignState) })
              }
            />
          }
          count={<BookCount total={total} noun="chiến dịch" hidden={hidden} />}
          tools={
            <>
              <SearchField
                placeholder="Tìm theo tên hoặc mã chiến dịch…"
                value={book.text}
                onChange={book.setText}
                className="min-w-0 flex-1 sm:max-w-[320px]"
              />
              {book.dirty && (
                <Button
                  size="md"
                  variant="ghost"
                  className="pointer-coarse:h-12"
                  onClick={book.clear}
                >
                  Bỏ hết bộ lọc
                </Button>
              )}
            </>
          }
          pending={isPending}
          failure={
            bookError
              ? {
                  message: `Không tải được danh sách chiến dịch. ${
                    isApiError(bookError) ? userMessage(bookError) : 'Vui lòng thử lại.'
                  }`,
                  onRetry: () => void refetchBook(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: book.dirty
                    ? 'Không có chiến dịch nào phù hợp với bộ lọc hiện tại.'
                    : canWrite
                      ? 'Chưa có chiến dịch nào. Hãy tạo chiến dịch rồi thêm người nhận từ sổ lead.'
                      : 'Chưa có chiến dịch nào trong phạm vi của bạn.',
                  action: book.dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: book.clear }
                    : canWrite
                      ? { label: 'Tạo chiến dịch', onClick: () => setCreating(true) }
                      : {
                          label: 'Xem sổ lô gửi',
                          onClick: () => navigate('/sales/campaigns/mail-runs'),
                        },
                }
              : undefined
          }
          table={{
            minWidth: TABLE_MIN_WIDTH,
            sort: tableSort,
            onSort: (key) => {
              /* Máy chủ chỉ nhận các khoá của `CampaignBookSortKey`. Cột nào không
                 có `sortKey` bên dưới thì không vẽ mũi tên, nên nhánh này chỉ
                 chặn một đường vòng — nhưng rẻ hơn một lượt 400 từ cổng zod. */
              const parsed = CampaignBookSortKey.safeParse(key)
              if (!parsed.success) return
              book.patch(
                query.sort === parsed.data
                  ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
                  : { sort: parsed.data, dir: parsed.data === 'name' ? 'asc' : 'desc' },
              )
            },
            columns: [
              /* Code and name are ONE column since 20/09: the code is how a
                 row is named out loud, so it rides with the name instead of
                 paying for a column of its own. The slack went to the name. */
              { header: 'Chiến dịch', width: '3fr', sortKey: 'name' },
              { header: 'Trạng thái', width: '1fr' },
              {
                header: listFilter('Người phụ trách', 'owner', ownerOptions),
                width: '140px',
                align: 'center',
              },
              { header: listFilter('Nguồn dẫn', 'source', sourceOptions), width: '1.2fr' },
              { header: 'Người nhận', width: '0.9fr', align: 'right', sortKey: 'audienceCount' },
              {
                header: 'Số đợt gửi',
                width: 'minmax(88px,0.6fr)',
                align: 'right',
                sortKey: 'waveCount',
              },
              { header: 'Ngày tạo', width: '0.9fr', sortKey: 'createdAt', filter: dateFilter },
            ],
            rows: rows.map((c) => ({
              id: c.code,
              onOpen: () => navigate(`/sales/campaigns/${c.code}`),
              cells: [
                <div key="n" className="flex min-w-0 items-center gap-2">
                  <Chip>{c.code}</Chip>
                  <span className="min-w-0 truncate" title={c.name}>
                    {c.name}
                  </span>
                </div>,
                <Badge key="s" tone={CAMPAIGN_STATE_TONE[c.state]}>
                  {CAMPAIGN_STATE_LABEL[c.state]}
                </Badge>,
                <AvatarCell
                  key="o"
                  name={c.ownerName}
                  email={c.ownerEmail}
                  empty="Chưa có người phụ trách"
                />,
                <span key="src" className="block truncate">
                  {c.sourceName ?? '—'}
                </span>,
                <span key="a" className="tnum font-num">
                  {c.audienceCount.toLocaleString('vi-VN')}
                </span>,
                <span key="w" className="tnum font-num">
                  {c.waveCount}
                </span>,
                <span key="t" className="tnum font-num">
                  {dm(c.createdAt)}
                </span>,
              ],
            })),
          }}
          footer={
            <TableFooter page={pageIndex} pageSize={PAGE_SIZE} total={total} onPage={book.goPage} />
          }
        />

        <CampaignCreateModal
          open={creating}
          onClose={() => setCreating(false)}
          people={people}
          sources={sources}
          onCreated={(code) => navigate(`/sales/campaigns/${code}`)}
        />
      </ScreenLayout>
    </AppShell>
  )
}

export default CampaignsPage
