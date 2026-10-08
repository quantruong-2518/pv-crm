import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, Badge, Button, Chip, ScreenLayout, SearchField, type TableSort } from '@pv/ui'
import { ContactBookQuery, ContactSortKey } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { contactBookQuery } from '@/data/contacts'
import { BookCount, BookPage } from '@/components/book-page'
import { AvatarCell, TableFooter } from '@/components/table-bits'
import { useContactFilters } from './contacts-filters'

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

const PAGE_SIZE = ContactBookQuery.parse({}).size
const FILTER_KEYS = [
  'primary',
  'account',
  'owner',
  'hasEmail',
  'hasPhone',
  'createdFrom',
  'createdTo',
] as const

const DAY = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export default function ContactsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm người liên hệ…' })
  const navigate = useNavigate()
  const book = useBookQuery(ContactBookQuery, { size: PAGE_SIZE, filterKeys: FILTER_KEYS })
  const { query, patch } = book

  const { data, isPending, error, refetch } = useQuery(contactBookQuery(query))
  const { pageIndex } = useBookPageClamp(book, data?.total)

  const rows = data?.rows ?? []
  const total = data?.total ?? 0

  const tableSort: TableSort = { key: query.sort, dir: query.dir }

  const onSort = (key: string) => {
    const parsed = ContactSortKey.safeParse(key)
    if (!parsed.success) return
    patch(
      query.sort === parsed.data
        ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
        : { sort: parsed.data, dir: 'asc' },
    )
  }

  const filters = useContactFilters(book)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Sổ người liên hệ"
          count={<BookCount total={total} noun="người liên hệ" />}
          tools={
            <>
              <SearchField
                placeholder="Tìm theo tên, email hoặc số điện thoại…"
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
            error
              ? {
                  message: `Không tải được danh sách người liên hệ. ${
                    isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: book.dirty
                    ? 'Không có người liên hệ nào phù hợp với bộ lọc hiện tại.'
                    : 'Chưa có người liên hệ nào. Hãy thêm người liên hệ từ hồ sơ lead.',
                  action: book.dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: book.clear }
                    : { label: 'Xem sổ lead', onClick: () => navigate('/sales/leads') },
                }
              : undefined
          }
          table={{
            minWidth: 'min-w-[1100px]',
            sort: tableSort,
            onSort,
            columns: [
              { header: 'Mã', width: '0.8fr' },
              {
                header: 'Họ và tên',
                width: '1.6fr',
                sortKey: 'name',
                filter: filters.primaryFilter,
              },
              { header: 'Chức danh', width: '1.2fr' },
              {
                header: 'Công ty',
                width: '1.6fr',
                sortKey: 'company',
                filter: filters.account,
              },
              { header: filters.email, width: '1.6fr' },
              { header: filters.phone, width: '1fr' },
              {
                header: 'Ngày tạo',
                width: '0.9fr',
                sortKey: 'createdAt',
                filter: filters.dateFilter,
              },
              {
                header: filters.owner,
                width: '120px',
                align: 'center',
              },
            ],
            rows: rows.map((c) => ({
              id: c.code,
              onOpen: () => navigate(`/sales/contacts/${c.code}`),
              cells: [
                <Chip key="c">{c.code}</Chip>,
                <span key="n" className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{c.name}</span>
                  {c.isPrimary && <Badge tone="success">Liên hệ chính</Badge>}
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
                <span key="d" className="block truncate">
                  {DAY.format(new Date(c.createdAt))}
                </span>,
                <AvatarCell
                  key="o"
                  name={c.ownerName}
                  email={c.ownerEmail}
                  empty="Chưa có người phụ trách"
                />,
              ],
            })),
          }}
          footer={
            <TableFooter page={pageIndex} pageSize={PAGE_SIZE} total={total} onPage={book.goPage} />
          }
        />
      </ScreenLayout>
    </AppShell>
  )
}
