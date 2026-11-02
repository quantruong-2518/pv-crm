import { useMemo, useState } from 'react'
import { Plus } from '@pv/ui'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, Button, Checkbox, Icon, ScreenLayout, type TableSort } from '@pv/ui'
import { OpportunityBookQuery, type OpportunityBookRow } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { message, translate, useI18n } from '@/app/i18n'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { openMasMail } from '@/app/mas-mail-composer'
import { toast } from '@/app/toast'
import { isApiError, userMessage } from '@/app/api'
import {
  bdOwnersOf,
  NO_BD_COPY,
  DEFAULT_OPPORTUNITY_BOOK_QUERY,
  opportunityBookQuery,
  opportunityProfileQuery,
} from '@/data/opportunities'
import { OP_SPEC } from '@/data/intake'
import type { MasRecipient } from '@/data/mas-mail-draft'
import { usePins } from '@/data/pins'
import { useOpportunityImport } from '@/data/opportunity-import'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { useBookSelection } from '@/components/book-selection'
import { useRowIntent } from '@/components/row-intent'
import { BookPage, BookSearch } from '@/components/book-page'
import { BOOK_PAGE_SIZE, COL } from '@/components/book-columns'
import { OpportunityCreateDialog } from '@/components/opportunity-create-dialog'
import { BookSelectionBar, SelectionCell, TableFooter } from '@/components/table-bits'
import { PinCell, PinSelectionAction } from '@/components/pin-cell'
import {
  bookColumns,
  closeDayOf,
  emptyOf,
  FILTER_KEYS,
  mailTally,
  sortPatch,
  STICKY_LEAD,
  useMailable,
} from './opportunities-model'
import { BookCounts, BookTabs, ScoreCards } from './opportunities-parts'
import { useOpportunityFilterChips, useOpportunityFilters } from './opportunities-filters'
import {
  AmountCell,
  CloseCell,
  DealCell,
  LastActivityCell,
  NextStepCell,
  PeopleCell,
  SaleCell,
  StageCell,
} from './opportunities-cells'

/** Module 3 · the deal book — `GET /sales/opportunities`, filtered, sorted and
 *  paged by the server; the filter lives in the address (`app/book-query.ts`).
 *
 *  The screen hands CONTENT to `BookPage`, the shape every book shares. Eight
 *  columns in the order ADR 0077 set (`bookColumns`), then the row's pin; every
 *  verdict a cell prints — overdue, activity freshness — is the server's.
 *
 *  LAW 10 DEBT, on purpose: no ContextRail. A book has no OPEN object, and a
 *  rail seeded from a fixed row would show a chain the user never picked. Pay
 *  it off once the rail can be built from the selected row.
 *
 *  Reaching this screen needs the Sales branch (`app/guard.tsx`); scope is cut
 *  by the server and `hidden` is the number it reports. */

/** The import panel does not dedupe in the browser: the server dedupes by lead
 *  code, which a file's "Account" cell does not carry. */
const NO_LOCAL_KEYS: ReadonlySet<string> = new Set()

/** Exactly the fields the server matches: deal name, deal code, company. */
const SEARCH_PLACEHOLDER = message(
  'Tìm theo tên cơ hội, mã cơ hội hoặc khách hàng…',
  'Search by opportunity name, code, or account…',
  '기회명, 코드 또는 고객사로 검색…',
)

export function OpportunitiesPage() {
  const { t } = useI18n()
  const chrome = useAppChrome({ searchPlaceholder: t(SEARCH_PLACEHOLDER) })
  const navigate = useNavigate()
  const book = useBookQuery(OpportunityBookQuery, { size: BOOK_PAGE_SIZE, filterKeys: FILTER_KEYS })
  const { urlQuery, query, text, setText, patch, goPage, clear: clearFilters, dirty } = book

  /* `error` is read: a dead server must not read as "no deal matches". */
  const { data, isPending, error: bookError, refetch } = useQuery(opportunityBookQuery(query))
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const { pageIndex } = useBookPageClamp(book, data?.total)

  const pinCount = usePins('opportunity').codes.length
  const mailable = useMailable(data?.rows)
  const recipients = useMemo(() => [...mailable.values()], [mailable])

  const open = (code: string) => navigate(`/sales/opportunities/${code}`)
  const intent = useRowIntent(opportunityProfileQuery, () => import('@/pages/opportunity-detail'))

  /* The default order (`createdAt`) is no column, so no arrow lights then. */
  const tableSort: TableSort | undefined =
    query.sort === DEFAULT_OPPORTUNITY_BOOK_QUERY.sort
      ? undefined
      : { key: query.sort, dir: query.dir }

  const [creating, setCreating] = useState(false)
  /* Both write doors open a deal (BD, Sale, account-executive and heads: ADR 0088 §16). */
  const canCreate = useCan('opportunity.create')
  const canAccept = useCan('opportunity.accept')

  const filters = useOpportunityFilters(query, patch)
  const filterChips = useOpportunityFilterChips(query, patch, rows)
  const selection = useBookSelection(rows)
  const { selectedCodes, pageSelected, allPageSelected, clearSelection } = selection

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title={t(message('Sổ cơ hội', 'Opportunities', '기회'))}
          actions={
            canCreate && (
              <CreateDoors onCreate={() => setCreating(true)} onSeeResult={clearFilters} />
            )
          }
          score={<ScoreCards />}
          tabs={<BookTabs query={urlQuery} onPatch={patch} />}
          count={data && <BookCounts query={urlQuery} total={total} hidden={data.hidden} />}
          tools={<BookSearch value={text} onChange={setText} placeholder={t(SEARCH_PLACEHOLDER)} />}
          onClearFilters={dirty ? clearFilters : undefined}
          filters={filterChips}
          pending={isPending}
          failure={
            bookError
              ? {
                  message: `${t(message('Không tải được danh sách cơ hội.', 'Could not load opportunities.', '기회를 불러오지 못했습니다.'))} ${
                    isApiError(bookError)
                      ? userMessage(bookError)
                      : t(message('Thử lại.', 'Try again.', '다시 시도하세요.'))
                  }`,
                  onRetry: () => void refetch(),
                }
              : undefined
          }
          empty={
            rows.length === 0
              ? emptyOf({
                  pinnedView: query.pinned === true && pinCount === 0,
                  dirty,
                  onClear: clearFilters,
                  onSeeLeads: () => navigate('/sales/leads'),
                })
              : undefined
          }
          table={{
            className: STICKY_LEAD,
            pageSize: BOOK_PAGE_SIZE,
            sort: tableSort,
            onSort: (key) => {
              const next = sortPatch(query, key)
              if (next) patch(next)
            },
            columns: [
              {
                header: (
                  <Checkbox
                    checked={allPageSelected}
                    indeterminate={pageSelected > 0 && !allPageSelected}
                    onChange={selection.selectPage}
                    label={
                      <span className="sr-only">
                        {t(message('Chọn cả trang', 'Select page', '페이지 선택'))}
                      </span>
                    }
                    className="w-full justify-center gap-0 p-0"
                  />
                ),
                width: COL.select,
              },
              ...bookColumns(filters, closeDayOf(book.query) === 'closed'),
              {
                header: <span className="sr-only">{t(message('Ghim', 'Pin', '고정'))}</span>,
                width: COL.pin,
              },
            ],
            rows: rows.map((o) => ({
              id: o.code,
              state: selectedCodes.has(o.code) ? ('selected' as const) : undefined,
              onOpen: () => open(o.code),
              ...intent(o.code, (event) => selection.paintSelection(o.code, event)),
              cells: [
                <SelectionCell
                  key="select"
                  checked={selectedCodes.has(o.code)}
                  label={o.name}
                  onPress={(event) => selection.beginDrag(o.code, event)}
                  onChange={(on) => selection.changeSelection(o.code, on)}
                />,
                ...bookCells(o, canAccept, () =>
                  openMasMail({ recipients, initialCodes: [o.code], subjectType: 'opportunity' }),
                ),
                <PinCell key="pin" subject="opportunity" code={o.code} label={o.name} />,
              ],
            })),
          }}
          footer={
            <TableFooter page={pageIndex} pageSize={BOOK_PAGE_SIZE} total={total} onPage={goPage} />
          }
        />

        {/* Straight to the new deal's profile: the book's filters may hide it. */}
        <OpportunityCreateDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(row) => open(row.code)}
        />

        <OpportunitySelectionBar
          selectedCodes={selectedCodes}
          mailable={mailable}
          recipients={recipients}
          onClear={clearSelection}
        />
      </ScreenLayout>
    </AppShell>
  )
}

/** The floating bar over a non-empty selection, with the spacer that keeps the last row clear of it. */
function OpportunitySelectionBar({
  selectedCodes,
  mailable,
  recipients,
  onClear,
}: {
  selectedCodes: ReadonlySet<string>
  mailable: ReadonlyMap<string, MasRecipient>
  recipients: MasRecipient[]
  onClear: () => void
}) {
  const { t } = useI18n()
  if (selectedCodes.size === 0) return null
  return (
    <>
      <div aria-hidden className="h-24" />
      <BookSelectionBar
        count={selectedCodes.size}
        noun={t(message('cơ hội', 'opportunities', '기회'))}
        meta={mailTally(selectedCodes, mailable)}
        onClear={onClear}
        onSend={() =>
          openMasMail({
            recipients,
            initialCodes: [...selectedCodes],
            subjectType: 'opportunity',
            onQueued: onClear,
          })
        }
        actions={
          <PinSelectionAction
            subject="opportunity"
            codes={[...selectedCodes]}
            noun={t(message('cơ hội', 'opportunities', '기회'))}
            onDone={onClear}
          />
        }
      />
    </>
  )
}

/** The book's two write doors. The create button opens a lead picker, then the
 *  lead profile's own `ConvertDialog` — a deal is still born from a lead. */
function CreateDoors({ onCreate, onSeeResult }: { onCreate: () => void; onSeeResult: () => void }) {
  const { t } = useI18n()
  const commitOps = useCommitOps()
  return (
    <>
      <ImportZone
        spec={OP_SPEC}
        existingKeys={NO_LOCAL_KEYS}
        buttonLabel={t(
          message('Nhập cơ hội từ tệp', 'Import opportunities from file', '파일에서 기회 가져오기'),
        )}
        onCommit={commitOps}
        onSeeResult={onSeeResult}
      />
      <Button size="md" onClick={onCreate} className="pointer-coarse:h-12 max-sm:flex-1">
        <Icon icon={Plus} size={16} />
        {t(message('Mở cơ hội', 'Open opportunity', '기회 열기'))}
      </Button>
    </>
  )
}

/** A file import writes straight to the server; the panel gets the SERVER's
 *  report back so its four numbers are what was really written. Never throws:
 *  `runOpportunityImport` turns every refusal into a report. */
function useCommitOps() {
  const loadFile = useOpportunityImport()
  return async ({ rows, fileName }: ImportCommit & { scope?: string }) => {
    const run = await loadFile({ rows, fileName })
    const { report } = run
    const added = message(
      `Đã thêm ${report.rows.length} cơ hội`,
      `Added ${report.rows.length} opportunities`,
      `기회 ${report.rows.length}건을 추가했습니다`,
    )
    toast(run.failure ?? translate(added), {
      tone: run.failure ? 'danger' : 'success',
      detail: [
        report.duplicates > 0 &&
          translate(
            message(
              `${report.duplicates} dòng chưa nạp: lead có cơ hội đang chạy`,
              `${report.duplicates} rows not loaded: the lead has an active opportunity`,
              `${report.duplicates}개 행 미등록: 리드에 진행 중인 기회가 있습니다`,
            ),
          ),
        report.dupInFile > 0 &&
          translate(
            message(
              `${report.dupInFile} dòng trùng nhau trong tệp`,
              `${report.dupInFile} duplicate rows in the file`,
              `파일 내 중복 행 ${report.dupInFile}개`,
            ),
          ),
        report.errors.length > 0 &&
          translate(
            message(
              `${report.errors.length} dòng không nạp được`,
              `${report.errors.length} rows could not be loaded`,
              `${report.errors.length}개 행을 등록하지 못했습니다`,
            ),
          ),
      ]
        .filter(Boolean)
        .join(' · '),
    })
    return run.failure ? { ...report, failure: run.failure } : report
  }
}

/** One row's eight cells, in `bookColumns` order. A lost or terminated deal is not mailed. */
function bookCells(op: OpportunityBookRow, canAccept: boolean, mail: () => void) {
  const final = op.state === 'lost' || op.state === 'terminated'
  return [
    <DealCell key="deal" op={op} onEmail={final ? undefined : mail} />,
    <StageCell key="stage" op={op} />,
    <AmountCell key="amount" op={op} />,
    <CloseCell key="close" op={op} />,
    <PeopleCell key="bd" owners={bdOwnersOf(op)} missing={translate(NO_BD_COPY)} />,
    <SaleCell key="sale" op={op} canAccept={canAccept} />,
    <LastActivityCell key="activity" op={op} />,
    <NextStepCell key="next" op={op} />,
  ]
}

export default OpportunitiesPage
