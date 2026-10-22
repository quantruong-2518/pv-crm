import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  Icon,
  Plus,
  SegmentedControl,
  ScreenLayout,
  type TableSort,
} from '@pv/ui'
import { CampaignBookQuery, CampaignBookSortKey, type CampaignState } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { useSalesPeople } from '@/data/directory'
import { useCan } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { CAMPAIGN_STATE_LABEL, campaignBookQuery } from '@/data/campaign-book'
import { BookCount, BookPage, BookSearch } from '@/components/book-page'
import { BOOK_PAGE_SIZE } from '@/components/book-columns'
import { Module1Books } from '@/components/module1-books'
import { TableFooter } from '@/components/table-bits'
import { campaignCells, campaignColumns } from './campaigns-columns'
import { useCampaignFilters } from './campaigns-filters'
import { CampaignCreateModal } from './campaign-profile-parts'

/** Module 1 · the campaign book — `GET /sales/campaigns`.
 *
 *  This is `sales.campaign` (CP-nnnn): the unit that SENDS, the thing that
 *  spends leads. Before 29/08 this path held the lead-source book (`SR-nn`);
 *  that now lives at `/sales/campaigns/sources` (`pages/sources.tsx`). The two
 *  stay separate tables by decision D2 of 28/08. Three books of the module go
 *  through `Module1Books`.
 *
 *  The screen hands `BookPage` its content only; filters live on the ADDRESS,
 *  so a filtered page can be copied to someone else. State is the tab row;
 *  source, created date and owner filter from their own column headers.
 *  "Việc tiếp theo" is computed on the client (`nextTask`), so it has no filter. */

const STATES: CampaignState[] = ['DRAFT', 'RUNNING', 'STOPPED', 'DONE']

/** "Every state" for the tab row. On the wire that is an ABSENT field, but a
 *  segmented control carries strings only, so it needs a stand-in value. */
const ANY = 'all'

/** Outside the component because `useQueries` below reads its length. */
const STATE_TABS: { value: string; label: string }[] = [
  { value: ANY, label: 'Tất cả' },
  ...STATES.map((state) => ({ value: state as string, label: CAMPAIGN_STATE_LABEL[state] })),
]

const SEARCH_PLACEHOLDER = 'Tìm theo tên hoặc mã chiến dịch…'

export function CampaignsPage() {
  const chrome = useAppChrome({ searchPlaceholder: SEARCH_PLACEHOLDER })
  const navigate = useNavigate()

  /* HIDDEN, not greyed out: a read-only role never gets the chance. `useCan`
     asks the same E2 function the api layer asks, so button and fence agree. */
  const canWrite = useCan('campaign.edit')
  const canFire = useCan('campaign.broadcast')

  /* The create form opens HERE, in state, instead of on a route of its own. */
  const [creating, setCreating] = useState(false)
  const people = useSalesPeople()

  const book = useBookQuery(CampaignBookQuery, {
    size: BOOK_PAGE_SIZE,
    filterKeys: ['state', 'owner', 'source', 'createdFrom', 'createdTo'],
  })
  const { query, urlQuery } = book
  const filters = useCampaignFilters(book)

  const {
    data,
    isPending,
    error: bookError,
    refetch: refetchBook,
  } = useQuery(campaignBookQuery(query))

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const hidden = data?.hidden ?? 0

  /* One `size=1` read per tab: `total` is the count under the OTHER filters
     in force, and no other endpoint answers that. */
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
            <BookSearch
              value={book.text}
              onChange={book.setText}
              placeholder={SEARCH_PLACEHOLDER}
            />
          }
          filters={filters.chips}
          onClearFilters={book.dirty ? book.clear : undefined}
          pending={isPending}
          failure={
            bookError
              ? {
                  message: `Không tải được danh sách chiến dịch. ${
                    isApiError(bookError) ? userMessage(bookError) : 'Thử lại.'
                  }`,
                  onRetry: () => void refetchBook(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: book.dirty
                    ? 'Không có chiến dịch nào khớp bộ lọc.'
                    : canWrite
                      ? 'Chưa có chiến dịch nào.'
                      : 'Chưa có chiến dịch nào bạn xem được.',
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
            sort: tableSort,
            pageSize: BOOK_PAGE_SIZE,
            onSort: (key) => {
              /* Only `CampaignBookSortKey` values pass the server's zod door;
                 a column without a `sortKey` never reaches here. */
              const parsed = CampaignBookSortKey.safeParse(key)
              if (!parsed.success) return
              book.patch(
                query.sort === parsed.data
                  ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
                  : { sort: parsed.data, dir: parsed.data === 'name' ? 'asc' : 'desc' },
              )
            },
            columns: campaignColumns(filters),
            rows: rows.map((c) => ({
              id: c.code,
              onOpen: () => navigate(`/sales/campaigns/${c.code}`),
              cells: campaignCells(c, { 'campaign.edit': canWrite, 'campaign.broadcast': canFire }),
            })),
          }}
          footer={
            <TableFooter
              page={pageIndex}
              pageSize={BOOK_PAGE_SIZE}
              total={total}
              onPage={book.goPage}
            />
          }
        />

        <CampaignCreateModal
          open={creating}
          onClose={() => setCreating(false)}
          people={people}
          sources={filters.sources}
          onCreated={(code) => navigate(`/sales/campaigns/${code}`)}
        />
      </ScreenLayout>
    </AppShell>
  )
}

export default CampaignsPage
