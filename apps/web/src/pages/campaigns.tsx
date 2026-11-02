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
import { campaignBookQuery } from '@/data/campaign-book'
import { BookCount, BookPage, BookSearch } from '@/components/book-page'
import { BOOK_PAGE_SIZE } from '@/components/book-columns'
import { Module1Books } from '@/components/module1-books'
import { TableFooter } from '@/components/table-bits'
import { campaignCells, campaignColumns } from './campaigns-columns'
import { useCampaignFilters } from './campaigns-filters'
import { CampaignCreateModal } from './campaign-profile-parts'
import { message, useI18n } from '@/app/i18n'
import { campaignStateText } from '@/data/campaign-i18n'

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
 *  source, created date and owner filter from their own column headers. */

type CampaignBookUrlQuery = Parameters<typeof campaignBookQuery>[0]

const STATES: CampaignState[] = ['DRAFT', 'RUNNING', 'STOPPED', 'DONE']

/** "Every state" for the tab row. On the wire that is an ABSENT field, but a
 *  segmented control carries strings only, so it needs a stand-in value. */
const ANY = 'all'

const TEXT = {
  searchByCampaignNameOr: message(
    'Tìm theo tên hoặc mã chiến dịch…',
    'Search by campaign name or code…',
    '캠페인명 또는 코드 검색…',
  ),
  noCampaignsMatchTheseFilters: message(
    'Không có chiến dịch nào khớp bộ lọc.',
    'No campaigns match these filters.',
    '필터에 맞는 캠페인이 없습니다.',
  ),
  noCampaignsYet: message(
    'Chưa có chiến dịch nào.',
    'No campaigns yet.',
    '아직 캠페인이 없습니다.',
  ),
  noCampaignsAreAvailableTo: message(
    'Chưa có chiến dịch nào bạn xem được.',
    'No campaigns are available to you.',
    '볼 수 있는 캠페인이 없습니다.',
  ),
}

/** The state tab row, each tab carrying its own count. One `size=1` read per
 *  tab: `total` is the count under the OTHER filters in force, and no other
 *  endpoint answers that. */
function useStateTabs(urlQuery: CampaignBookUrlQuery) {
  const { lang, t } = useI18n()
  const stateTabs: { value: string; label: string }[] = [
    { value: ANY, label: t(message('Tất cả', 'All', '전체')) },
    ...STATES.map((state) => ({ value: state as string, label: campaignStateText(state, lang) })),
  ]
  const tabCounts = useQueries({
    queries: stateTabs.map((tab) =>
      campaignBookQuery({
        ...urlQuery,
        state: tab.value === ANY ? undefined : (tab.value as CampaignState),
        page: 1,
        size: 1,
      }),
    ),
  })
  return stateTabs.map((tab, i) => ({ ...tab, count: tabCounts[i]?.data?.total }))
}

export function CampaignsPage() {
  const { lang, t } = useI18n()
  const searchPlaceholder = t(TEXT.searchByCampaignNameOr)
  const chrome = useAppChrome({ searchPlaceholder })
  const navigate = useNavigate()

  /* HIDDEN, not greyed out: a read-only role never gets the chance. `useCan`
     asks the same E2 function the api layer asks, so button and fence agree. */
  const canWrite = useCan('campaign.edit')

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

  const tabs = useStateTabs(urlQuery)

  const { pageIndex } = useBookPageClamp(book, data?.total)
  const tableSort: TableSort = { key: query.sort, dir: query.dir }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title={t(message('Chiến dịch', 'Campaigns', '캠페인'))}
          actions={
            canWrite && (
              <Button size="md" className="pointer-coarse:h-12" onClick={() => setCreating(true)}>
                <Icon icon={Plus} size={16} />
                {t(message('Tạo chiến dịch', 'Create campaign', '캠페인 만들기'))}
              </Button>
            )
          }
          nav={<Module1Books />}
          tabs={
            <SegmentedControl
              label={t(message('Trạng thái chiến dịch', 'Campaign status', '캠페인 상태'))}
              hideLabel
              tone="quiet"
              value={query.state ?? ANY}
              options={tabs}
              onChange={(value) =>
                book.patch({ state: value === ANY ? undefined : (value as CampaignState) })
              }
            />
          }
          count={
            <BookCount
              total={total}
              noun={t(message('chiến dịch', 'campaigns', '개 캠페인'))}
              hidden={hidden}
            />
          }
          tools={
            <BookSearch value={book.text} onChange={book.setText} placeholder={searchPlaceholder} />
          }
          filters={filters.chips}
          onClearFilters={book.dirty ? book.clear : undefined}
          pending={isPending}
          failure={
            bookError
              ? {
                  message: `${t(message('Không tải được danh sách chiến dịch.', 'Could not load campaigns.', '캠페인 목록을 불러오지 못했습니다.'))} ${isApiError(bookError) ? userMessage(bookError) : t(message('Thử lại.', 'Try again.', '다시 시도하세요.'))}`,
                  onRetry: () => void refetchBook(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: book.dirty
                    ? t(TEXT.noCampaignsMatchTheseFilters)
                    : canWrite
                      ? t(TEXT.noCampaignsYet)
                      : t(TEXT.noCampaignsAreAvailableTo),
                  action: book.dirty
                    ? {
                        label: t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기')),
                        onClick: book.clear,
                      }
                    : canWrite
                      ? {
                          label: t(message('Tạo chiến dịch', 'Create campaign', '캠페인 만들기')),
                          onClick: () => setCreating(true),
                        }
                      : {
                          label: t(message('Xem sổ lô gửi', 'View mail runs', '발송 건 목록 보기')),
                          onClick: () => navigate('/sales/campaigns/mail-runs'),
                        },
                }
              : undefined
          }
          table={{
            sort: tableSort,
            pageSize: BOOK_PAGE_SIZE,
            tall: true,
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
            columns: campaignColumns(filters, lang),
            rows: rows.map((c) => ({
              id: c.code,
              onOpen: () => navigate(`/sales/campaigns/${c.code}`),
              cells: campaignCells(c, lang),
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
