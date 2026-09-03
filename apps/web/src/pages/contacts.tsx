import { useMemo } from 'react'
import { Inbox, TriangleAlert } from '@pv/ui'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Chip,
  DataTable,
  EmptyState,
  GlassCard,
  ScreenHeader,
  ScreenLayout,
  ScreenToolbar,
  SearchField,
  Select,
  Skeleton,
  type TableSort,
} from '@pv/ui'
import { ContactSortKey, type ContactBookQuery } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { pageIndexFromQueryPage, queryPageFromPageIndex } from '@/app/url'
import {
  contactBookQuery,
  contactBookQueryToParams,
  DEFAULT_CONTACT_BOOK_QUERY,
  parseContactBookQuery,
} from '@/data/contacts'
import { Pager } from '@/components/table-bits'

/** The contact book — `/sales/contacts`.
 *
 *  ------------------------------------------------------------------
 *  THIS BOOK ANSWERS "HAVE WE EVER MET THIS PERSON"
 *  ------------------------------------------------------------------
 *  The list on the lead profile answers "who is at THIS COMPANY" — bounded by
 *  one customer, unpaged, and read from a screen that already knows which
 *  lead. This book asks the opposite question: a name, a phone number, no
 *  known lead. That is exactly the question `meeting_attendee` could not ask
 *  for as long as the customer side was a typed-in string, and it is why the
 *  contact table has its own code.
 *
 *  ------------------------------------------------------------------
 *  IT HAS A SCOPE AXIS, UNLIKE THE COMPANY BOOK RIGHT NEXT DOOR
 *  ------------------------------------------------------------------
 *  The company book is open to the whole department because a company is a
 *  fact about the market. A person with a name and a phone number is a fact
 *  about ONE PERSON'S customer, so this book is cut by lead: a `ownOnly` Sale
 *  only sees people from leads they hold. Dropping that axis would turn a
 *  directory screen into a data-export door.
 *
 *  Effect: there is NO "N hidden by your permissions" line, even though the
 *  scope axis is cutting. The server deliberately returns `hidden: 0` —
 *  printing how many people we cannot see would tell the reader exactly how
 *  many customers the department has that they cannot touch, and for a
 *  directory that number is itself a leak. Full reasoning is in
 *  `ContactService.book`. */

const PAGE_SIZE = DEFAULT_CONTACT_BOOK_QUERY.size

export default function ContactsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm người liên hệ…' })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const query = useMemo(() => parseContactBookQuery(params), [params])

  const patch = (next: Partial<ContactBookQuery>) => {
    const merged = { ...query, ...next, page: next.page ?? 1 }
    setParams(new URLSearchParams(contactBookQueryToParams(merged)), { replace: true })
  }

  const { data, isPending, error, refetch } = useQuery(contactBookQuery(query))

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const dirty = query.q !== undefined || query.primary !== undefined || query.account !== undefined

  const tableSort: TableSort = { key: query.sort, dir: query.dir }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="Kinh doanh · Khách hàng"
          title="Sổ người liên hệ"
          description="Mọi người mình đã ghi được ở phía khách. Một công ty có thể có nhiều người; một lead có đúng một người chính."
          meta={<Badge tone="draft">{total} người</Badge>}
        />

        <ScreenToolbar label="Lọc sổ người liên hệ">
          <SearchField
            placeholder="Tên, email, số điện thoại"
            value={query.q ?? ''}
            onChange={(v) => patch({ q: v.trim() === '' ? undefined : v })}
          />
          <Select
            label="Lọc"
            value={query.primary ?? ''}
            neutralValue=""
            onChange={(v) => patch({ primary: v === '1' ? '1' : undefined })}
            options={[
              { value: '', label: 'Tất cả mọi người' },
              { value: '1', label: 'Chỉ người liên hệ chính' },
            ]}
          />
        </ScreenToolbar>

        <GlassCard variant="b" className="p-0">
          <div className="overflow-x-auto p-4 lg:p-5">
            {isPending ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : error ? (
              <EmptyState
                icon={TriangleAlert}
                message={`Không lấy được sổ người liên hệ. ${
                  isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                }`}
                action={{ label: 'Thử lại', onClick: () => void refetch() }}
                className="py-12"
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Inbox}
                message={
                  dirty
                    ? 'Không có ai khớp bộ lọc đang chọn.'
                    : 'Chưa ghi được người liên hệ nào. Thêm người ở hồ sơ lead — thẻ "Người liên hệ".'
                }
                action={
                  dirty
                    ? {
                        label: 'Bỏ hết bộ lọc',
                        onClick: () => setParams(new URLSearchParams(), { replace: true }),
                      }
                    : { label: 'Về sổ lead', onClick: () => navigate('/sales/leads') }
                }
                className="py-12"
              />
            ) : (
              <DataTable
                className="min-w-[900px]"
                sort={tableSort}
                onSort={(key) => {
                  const parsed = ContactSortKey.safeParse(key)
                  if (!parsed.success) return
                  patch(
                    query.sort === parsed.data
                      ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
                      : { sort: parsed.data, dir: 'asc' },
                  )
                }}
                columns={[
                  { header: 'Mã', width: '0.8fr' },
                  { header: 'Tên', width: '1.6fr', sortKey: 'name' },
                  { header: 'Chức danh', width: '1.2fr' },
                  { header: 'Công ty', width: '1.6fr', sortKey: 'company' },
                  { header: 'Email', width: '1.6fr' },
                  { header: 'Điện thoại', width: '1fr' },
                ]}
                rows={rows.map((c) => ({
                  id: c.code,
                  onOpen: () => navigate(`/sales/contacts/${c.code}`),
                  cells: [
                    <Chip key="c">{c.code}</Chip>,
                    <span key="n" className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{c.name}</span>
                      {c.isPrimary && <Badge tone="success">Chính</Badge>}
                    </span>,
                    <span key="t" className="block truncate">
                      {c.title ?? '—'}
                    </span>,
                    /* The REAL company name once the lead is attached,
                       falling back to the lead's own `company` column if not.
                       Two sources for one line of text, and that priority
                       order is deliberate: the account row is a maintained
                       record, while the lead's column is whatever someone
                       typed at intake. */
                    <span key="a" className="block truncate">
                      {c.accountName ?? c.company}
                    </span>,
                    <span key="e" className="block truncate">
                      {c.email ?? '—'}
                    </span>,
                    <span key="p" className="tnum font-num block truncate">
                      {c.phone ?? '—'}
                    </span>,
                  ],
                }))}
              />
            )}
          </div>
        </GlassCard>

        {total > PAGE_SIZE && (
          <div className="flex justify-end">
            <Pager
              page={pageIndexFromQueryPage(query.page)}
              pageCount={pageCount}
              onPage={(p) => patch({ page: queryPageFromPageIndex(p) })}
            />
          </div>
        )}
      </ScreenLayout>
    </AppShell>
  )
}
