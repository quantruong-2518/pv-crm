import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  ColumnFilter,
  ColumnFilterList,
  ColumnFilterRange,
  Icon,
  Plus,
  SearchField,
  SegmentedControl,
  ScreenLayout,
  cn,
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
import { AvatarCell, FilterMenu, TableFooter } from '@/components/table-bits'
import { nextTask, shareOf } from './campaign-model'
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
 *  vào chiến dịch từ Sổ lead, không từ một tệp rời). State is the tab row;
 *  source and created date sit behind the one filter button, owner on its column. */

/** Số dòng bảng vẽ. Nhỏ hơn mặc định 50 của hợp đồng vì hàng chiến dịch cao
 *  hơn hàng cơ hội — có tên dài và hai con số. */
const PAGE_SIZE = 10

const TABLE_MIN_WIDTH = 'min-w-[960px]'

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
  const canFire = useCan('campaign.broadcast')

  /* The create form opens HERE, in state, instead of on a route of its own:
     `/sales/campaigns/new` was a whole screen whose content was one form. */
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
  const ownerFilter = (
    <ColumnFilter label="Người phụ trách" active={Boolean(query.owner)}>
      {(close) => (
        <ColumnFilterList
          options={ownerOptions}
          selected={csvOf(query.owner)}
          close={close}
          onApply={(v) => book.patch({ owner: v.length ? v.join(',') : undefined })}
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
          /* Tabs, search and the one filter button read left to right as on
             the approved canvas; the count closes the row at the far right. */
          tabs={
            <>
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
              <SearchField
                placeholder="Tìm theo tên hoặc mã chiến dịch"
                value={book.text}
                onChange={book.setText}
                className="pointer-coarse:h-12 w-full sm:w-[320px]"
              />
              <FilterMenu
                label="Bộ lọc sổ chiến dịch"
                active={(query.source ? 1 : 0) + (query.createdFrom || query.createdTo ? 1 : 0)}
              >
                <FilterSection title="Nguồn dẫn">
                  <ColumnFilterList
                    options={sourceOptions}
                    selected={csvOf(query.source)}
                    close={noop}
                    onApply={(v) => book.patch({ source: v.length ? v.join(',') : undefined })}
                  />
                </FilterSection>
                <FilterSection title="Ngày tạo">
                  <ColumnFilterRange
                    from={query.createdFrom}
                    to={query.createdTo}
                    close={noop}
                    onApply={({ from, to }) => book.patch({ createdFrom: from, createdTo: to })}
                  />
                </FilterSection>
              </FilterMenu>
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
          tools={<BookCount total={total} noun="chiến dịch" hidden={hidden} />}
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
              { header: 'Chiến dịch', width: 'minmax(216px,3fr)', sortKey: 'name' },
              { header: 'Trạng thái', width: '104px' },
              { header: 'Việc kế tiếp', width: 'minmax(120px,1.2fr)' },
              { header: 'Người nhận', width: '88px', align: 'right', sortKey: 'audienceCount' },
              { header: 'Đợt gửi', width: 'minmax(104px,1fr)', sortKey: 'waveCount' },
              { header: 'Đã bấm liên kết', width: '120px', align: 'right' },
              {
                header: ownerFilter,
                width: '96px',
                align: 'center',
              },
            ],
            rows: rows.map((c) => ({
              id: c.code,
              onOpen: () => navigate(`/sales/campaigns/${c.code}`),
              cells: campaignCells(c, { 'campaign.edit': canWrite, 'campaign.broadcast': canFire }),
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

/** The filter menu stays open after an apply: its two sections are applied
 *  one at a time, and the count on the button says what is in force. */
const noop = () => {}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex max-h-[280px] min-h-0 flex-col gap-2">
      <h3 className="text-muted-foreground m-0 text-[12px] font-semibold">{title}</h3>
      {children}
    </section>
  )
}

const MUTED_LINE = 'text-muted-foreground block truncate text-[11px]'

/** `can` decides the amber: a next task reads as a call only to a reader who
 *  may answer it. */
function campaignCells(
  c: CampaignBookRow,
  can: Record<'campaign.edit' | 'campaign.broadcast', boolean>,
) {
  const task = nextTask(c)
  /* Scheduled-only waves have sent nothing: still an absence, not a zero. */
  const totals = c.waveTotals && c.waveTotals.sent > 0 ? c.waveTotals : undefined
  const lastWaveAt = c.waveTotals?.lastWaveAt
  return [
    <div key="n" className="flex min-w-0 items-center gap-3">
      <Thumbnail key={c.thumbnailUrl} url={c.thumbnailUrl} />
      <div className="min-w-0">
        <span className="block truncate" title={c.name}>
          {c.name}
        </span>
        <span className={MUTED_LINE}>
          <span className="font-mono">{c.code}</span> · {c.sourceName ?? 'chưa gán nguồn dẫn'}
        </span>
      </div>
    </div>,
    <Badge key="s" tone={CAMPAIGN_STATE_TONE[c.state]}>
      {CAMPAIGN_STATE_LABEL[c.state]}
    </Badge>,
    <span
      key="t"
      className={cn('block truncate', task?.needs && can[task.needs] && 'text-warning')}
    >
      {task?.label ?? '—'}
    </span>,
    <span key="a" className="tnum font-num">
      {c.audienceCount > 0 ? c.audienceCount.toLocaleString('vi-VN') : '—'}
    </span>,
    c.waveCount > 0 ? (
      <div key="w" className="min-w-0">
        <span className="tnum block truncate">{c.waveCount} đợt</span>
        {lastWaveAt && <span className={cn(MUTED_LINE, 'tnum')}>gần nhất {dm(lastWaveAt)}</span>}
      </div>
    ) : (
      <span key="w">—</span>
    ),
    totals ? (
      <div key="c" className="min-w-0">
        <span className="tnum font-num block">{totals.clicked.toLocaleString('vi-VN')}</span>
        <span className={cn(MUTED_LINE, 'tnum')}>
          {shareOf(totals.clicked, totals.delivered, 1)} số tới nơi
        </span>
      </div>
    ) : (
      <span key="c">—</span>
    ),
    <AvatarCell key="o" name={c.ownerName} email={c.ownerEmail} empty="Chưa có người phụ trách" />,
  ]
}

/** A 16:9 box that stays neutral when there is no picture or it will not
 *  load. Keyed on the URL by the caller, so `broken` is one address's verdict. */
function Thumbnail({ url }: { url?: string | undefined }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="bg-surface-ink/5 block aspect-video w-14 shrink-0 overflow-hidden rounded-sm">
      {url && !broken && (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      )}
    </span>
  )
}
