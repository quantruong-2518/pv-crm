import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, Badge, Button, Chip, ScreenLayout, SearchField, type TableSort } from '@pv/ui'
import { ContactBookQuery, ContactSortKey, type ContactBookRow } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { contactBookQuery } from '@/data/contacts'
import { BookCount, BookPage, type BookTable } from '@/components/book-page'
import { AvatarCell, TableFooter } from '@/components/table-bits'
import { SortSelect, ViewSwitch } from '@/components/book-cards'
import { useBookView } from '@/components/book-view'
import { ContactCardGrid } from '@/components/contact-cards'
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

const CONTACT_SORTS = [
  { value: 'best:asc', label: 'Phù hợp nhất' },
  { value: 'name:asc', label: 'Tên A → Z' },
  { value: 'name:desc', label: 'Tên Z → A' },
  { value: 'company:asc', label: 'Công ty A → Z' },
  { value: 'createdAt:desc', label: 'Mới thêm gần đây' },
]

const DAY = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** The table view, as the book drew it before cards. */
function contactTable(
  rows: ContactBookRow[],
  filters: ReturnType<typeof useContactFilters>,
  sort: TableSort,
  onSort: (key: string) => void,
  navigate: (to: string) => void,
): BookTable {
  return {
    minWidth: 'min-w-[1100px]',
    sort,
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
        width: '140px',
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
        <span key="d" className="tnum font-num block truncate">
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
  }
}

export default function ContactsPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const book = useBookQuery(ContactBookQuery, { size: PAGE_SIZE, filterKeys: FILTER_KEYS })
  const { query, patch } = book
  const [view, setView] = useBookView('pv.contacts.view')

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
              {view === 'grid' && (
                <>
                  <SortSelect
                    options={CONTACT_SORTS}
                    sort={query.sort}
                    dir={query.dir}
                    onChange={(sort, dir) =>
                      patch({ sort: ContactSortKey.catch('best').parse(sort), dir })
                    }
                  />
                  {filters.menu}
                </>
              )}
              <ViewSwitch value={view} onChange={setView} />
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
                    isApiError(error) ? userMessage(error) : 'Thử lại.'
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: book.dirty
                    ? 'Không có người liên hệ nào khớp bộ lọc.'
                    : 'Chưa có người liên hệ nào. Thêm từ hồ sơ lead.',
                  action: book.dirty
                    ? { label: 'Bỏ hết bộ lọc', onClick: book.clear }
                    : { label: 'Xem sổ lead', onClick: () => navigate('/sales/leads') },
                }
              : undefined
          }
          cards={view === 'grid' ? <ContactCardGrid rows={rows} /> : undefined}
          table={
            view === 'table' ? contactTable(rows, filters, tableSort, onSort, navigate) : undefined
          }
          footer={
            <TableFooter page={pageIndex} pageSize={PAGE_SIZE} total={total} onPage={book.goPage} />
          }
        />
      </ScreenLayout>
    </AppShell>
  )
}
