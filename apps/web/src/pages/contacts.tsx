import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, Badge, ScreenLayout, type TableSort } from '@pv/ui'
import { ContactBookQuery, ContactSortKey, type ContactBookRow } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { message, useI18n, type Lang } from '@/app/i18n'
import { isApiError, userMessage } from '@/app/api'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { contactBookQuery } from '@/data/contacts'
import { BookCount, BookPage, BookSearch, type BookTable } from '@/components/book-page'
import { TableFooter } from '@/components/table-bits'
import { CodeCell, PicCell } from '@/components/book-cells'
import { COL } from '@/components/book-columns'
import { phoneText } from '@/lib/phone'
import { SortSelect, ViewSwitch } from '@/components/book-cards'
import { GRID_PAGE_SIZE, useBookView } from '@/components/book-view'
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

const contactSorts = (t: (copy: ReturnType<typeof message>) => string) => [
  { value: 'best:asc', label: t(message('Phù hợp nhất', 'Best match', '관련도순')) },
  { value: 'name:asc', label: t(message('Tên A → Z', 'Name A → Z', '이름 A → Z')) },
  { value: 'name:desc', label: t(message('Tên Z → A', 'Name Z → A', '이름 Z → A')) },
  { value: 'company:asc', label: t(message('Công ty A → Z', 'Company A → Z', '회사 A → Z')) },
  {
    value: 'createdAt:desc',
    label: t(message('Mới thêm gần đây', 'Recently added', '최근 추가순')),
  },
]

/** The table view, as the book drew it before cards. */
function contactTable(
  rows: ContactBookRow[],
  filters: ReturnType<typeof useContactFilters>,
  sort: TableSort,
  onSort: (key: string) => void,
  navigate: (to: string) => void,
  lang: Lang,
  t: (copy: ReturnType<typeof message>) => string,
): BookTable {
  return {
    pageSize: PAGE_SIZE,
    sort,
    onSort,
    /* Tracks with a px floor (book-columns.ts) so the name never crushes under its badge. */
    columns: [
      { header: t(message('Mã', 'Code', '코드')), width: COL.code },
      {
        header: t(message('Họ và tên', 'Full name', '이름')),
        width: 'minmax(232px,1.8fr)',
        sortKey: 'name',
        filter: filters.primaryFilter,
      },
      { header: t(message('Chức danh', 'Job title', '직함')), width: COL.text },
      {
        header: t(message('Công ty', 'Company', '회사')),
        width: 'minmax(176px,1.6fr)',
        sortKey: 'company',
        filter: filters.account,
      },
      { header: filters.email, width: 'minmax(176px,1.4fr)' },
      { header: filters.phone, width: '136px' },
      {
        header: t(message('Ngày tạo', 'Created', '생성일')),
        width: COL.date,
        sortKey: 'createdAt',
        filter: filters.dateFilter,
      },
      { header: filters.owner, width: 'minmax(144px,1fr)' },
    ],
    rows: rows.map((c) => ({
      id: c.code,
      onOpen: () => navigate(`/sales/contacts/${c.code}`),
      cells: [
        <CodeCell key="c" code={c.code} />,
        <span key="n" className="flex min-w-0 items-center gap-2">
          <span className="truncate" title={c.name}>
            {c.name}
          </span>
          {c.isPrimary && (
            <Badge tone="success" className="shrink-0">
              {t(message('Liên hệ chính', 'Primary contact', '주 연락처'))}
            </Badge>
          )}
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
          {c.phone ? phoneText(c.phone) : '—'}
        </span>,
        <span key="d" className="tnum font-num block truncate">
          {new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : lang === 'ko' ? 'ko-KR' : 'en-US', {
            timeZone: 'Asia/Ho_Chi_Minh',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }).format(new Date(c.createdAt))}
        </span>,
        <PicCell
          key="o"
          people={[{ name: c.ownerName, email: c.ownerEmail }]}
          empty={t(message('Chưa có người phụ trách', 'No owner assigned', '담당자 미지정'))}
        />,
      ],
    })),
  }
}

export default function ContactsPage() {
  const { t, lang } = useI18n()
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const [view, setView] = useBookView('pv.contacts.view')
  const pageSize = view === 'grid' ? GRID_PAGE_SIZE : PAGE_SIZE
  const book = useBookQuery(ContactBookQuery, { size: pageSize, filterKeys: FILTER_KEYS })
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
        : { sort: parsed.data, dir: parsed.data === 'createdAt' ? 'desc' : 'asc' },
    )
  }

  const filters = useContactFilters(book)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title={t(message('Sổ người liên hệ', 'Contacts', '연락처'))}
          count={
            <BookCount total={total} noun={t(message('người liên hệ', 'contacts', '연락처'))} />
          }
          filters={filters.chips}
          onClearFilters={book.dirty ? book.clear : undefined}
          tools={
            <>
              <BookSearch
                placeholder={t(
                  message(
                    'Tìm theo tên, email hoặc số điện thoại…',
                    'Search by name, email, or phone…',
                    '이름, 이메일 또는 전화번호 검색…',
                  ),
                )}
                value={book.text}
                onChange={book.setText}
              />
              {view === 'grid' && (
                <>
                  <SortSelect
                    options={contactSorts(t)}
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
            </>
          }
          pending={isPending}
          failure={
            error
              ? {
                  message: `${t(message('Không tải được danh sách người liên hệ.', 'Could not load contacts.', '연락처 목록을 불러오지 못했습니다.'))} ${
                    isApiError(error)
                      ? userMessage(error)
                      : t(message('Thử lại.', 'Please try again.', '다시 시도해 주세요.'))
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? {
                  message: book.dirty
                    ? t(
                        message(
                          'Không có người liên hệ nào khớp bộ lọc.',
                          'No contacts match these filters.',
                          '필터와 일치하는 연락처가 없습니다.',
                        ),
                      )
                    : t(
                        message(
                          'Chưa có người liên hệ nào. Thêm từ hồ sơ lead.',
                          'No contacts yet. Add one from a lead profile.',
                          '연락처가 없습니다. 리드 프로필에서 추가하세요.',
                        ),
                      ),
                  action: book.dirty
                    ? {
                        label: t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기')),
                        onClick: book.clear,
                      }
                    : {
                        label: t(message('Xem sổ lead', 'View leads', '리드 보기')),
                        onClick: () => navigate('/sales/leads'),
                      },
                }
              : undefined
          }
          cards={view === 'grid' ? <ContactCardGrid rows={rows} /> : undefined}
          table={
            view === 'table'
              ? contactTable(rows, filters, tableSort, onSort, navigate, lang, t)
              : undefined
          }
          footer={
            <TableFooter page={pageIndex} pageSize={pageSize} total={total} onPage={book.goPage} />
          }
        />
      </ScreenLayout>
    </AppShell>
  )
}
