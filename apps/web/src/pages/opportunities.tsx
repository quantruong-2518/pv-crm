import { useMemo, useState } from 'react'
import { Plus } from '@pv/ui'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, Button, Checkbox, Icon, ScreenLayout, type TableSort } from '@pv/ui'
import { OpportunityBookQuery, type OpportunityBookRow } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { openMasMail } from '@/app/mas-mail-composer'
import { toast } from '@/app/toast'
import { isApiError, userMessage } from '@/app/api'
import {
  bdOwnersOf,
  DEFAULT_OPPORTUNITY_BOOK_QUERY,
  opportunityBookQuery,
} from '@/data/opportunities'
import { OP_SPEC } from '@/data/intake'
import { usePins } from '@/data/pins'
import { useOpportunityImport } from '@/data/opportunity-import'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { useBookSelection } from '@/components/book-selection'
import { BookPage } from '@/components/book-page'
import { OpportunityCreateDialog } from '@/components/opportunity-create-dialog'
import { BookSelectionBar, SelectionCell, TableFooter } from '@/components/table-bits'
import { PinCell, PinSelectionAction } from '@/components/pin-cell'
import {
  bookColumns,
  emptyOf,
  FILTER_KEYS,
  mailTally,
  PAGE_SIZE,
  sortPatch,
  STICKY_LEAD,
  TABLE_MIN_WIDTH,
  useMailable,
} from './opportunities-model'
import { BookTabs, BookTools, ScoreCards } from './opportunities-parts'
import { useOpportunityFilters } from './opportunities-filters'
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

export function OpportunitiesPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const book = useBookQuery(OpportunityBookQuery, { size: PAGE_SIZE, filterKeys: FILTER_KEYS })
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

  /* The default order (`createdAt`) is no column, so no arrow lights then. */
  const tableSort: TableSort | undefined =
    query.sort === DEFAULT_OPPORTUNITY_BOOK_QUERY.sort
      ? undefined
      : { key: query.sort, dir: query.dir }

  const [creating, setCreating] = useState(false)
  /* Both write doors open a deal, which only BD seats and heads may (ADR 0071 §1). */
  const canCreate = useCan('opportunity.create')
  const canAccept = useCan('opportunity.accept')

  const filters = useOpportunityFilters(query, patch)
  const selection = useBookSelection(rows)
  const { selectedCodes, pageSelected, allPageSelected, clearSelection } = selection

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Sổ cơ hội"
          actions={
            canCreate && (
              <CreateDoors onCreate={() => setCreating(true)} onSeeResult={clearFilters} />
            )
          }
          score={<ScoreCards />}
          tabs={
            <BookTabs query={urlQuery} total={total} hidden={data?.hidden ?? 0} onPatch={patch} />
          }
          tools={<BookTools text={text} onText={setText} dirty={dirty} onClear={clearFilters} />}
          pending={isPending}
          failure={
            bookError
              ? {
                  message: `Không tải được danh sách cơ hội. ${
                    isApiError(bookError) ? userMessage(bookError) : 'Vui lòng thử lại.'
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
            minWidth: `${TABLE_MIN_WIDTH} ${STICKY_LEAD}`,
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
                    label={<span className="sr-only">Chọn cả trang</span>}
                    className="w-full justify-center gap-0 p-0"
                  />
                ),
                width: '48px',
              },
              ...bookColumns(filters),
              { header: <span className="sr-only">Ghim</span>, width: '48px' },
            ],
            rows: rows.map((o) => ({
              id: o.code,
              state: selectedCodes.has(o.code) ? ('selected' as const) : undefined,
              onOpen: () => open(o.code),
              onPointerEnter: (event) => selection.paintSelection(o.code, event),
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
            <TableFooter
              page={pageIndex}
              pageSize={PAGE_SIZE}
              total={total}
              noun="cơ hội"
              onPage={goPage}
            />
          }
        />

        {/* Straight to the new deal's profile: the book's filters may hide it. */}
        <OpportunityCreateDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(row) => open(row.code)}
        />

        {selectedCodes.size > 0 && <div aria-hidden className="h-24" />}
        {selectedCodes.size > 0 && (
          <BookSelectionBar
            count={selectedCodes.size}
            noun="cơ hội"
            meta={mailTally(selectedCodes, mailable)}
            onClear={clearSelection}
            onSend={() =>
              openMasMail({
                recipients,
                initialCodes: [...selectedCodes],
                subjectType: 'opportunity',
                onQueued: clearSelection,
              })
            }
            actions={
              <PinSelectionAction
                subject="opportunity"
                codes={[...selectedCodes]}
                noun="cơ hội"
                onDone={clearSelection}
              />
            }
          />
        )}
      </ScreenLayout>
    </AppShell>
  )
}

/** The book's two write doors. The create button opens a lead picker, then the
 *  lead profile's own `ConvertDialog` — a deal is still born from a lead. */
function CreateDoors({ onCreate, onSeeResult }: { onCreate: () => void; onSeeResult: () => void }) {
  const commitOps = useCommitOps()
  return (
    <>
      <ImportZone
        spec={OP_SPEC}
        existingKeys={NO_LOCAL_KEYS}
        buttonLabel="Nhập cơ hội từ tệp"
        onCommit={commitOps}
        onSeeResult={onSeeResult}
      />
      <Button size="md" onClick={onCreate} className="pointer-coarse:h-12 max-sm:flex-1">
        <Icon icon={Plus} size={16} />
        Mở cơ hội
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
    toast(run.failure ?? `${report.rows.length} cơ hội đã được thêm`, {
      tone: run.failure ? 'danger' : 'success',
      detail: [
        report.duplicates > 0 && `${report.duplicates} lead đã có cơ hội đang mở, bỏ qua`,
        report.dupInFile > 0 && `${report.dupInFile} dòng trùng nhau trong tệp`,
        report.errors.length > 0 && `${report.errors.length} dòng không nạp được`,
      ]
        .filter(Boolean)
        .join(' · '),
    })
    return report
  }
}

/** One row's eight cells, in `bookColumns` order. A lost deal is not mailed. */
function bookCells(op: OpportunityBookRow, canAccept: boolean, mail: () => void) {
  return [
    <DealCell key="deal" op={op} onEmail={op.state === 'lost' ? undefined : mail} />,
    <StageCell key="stage" op={op} />,
    <AmountCell key="amount" op={op} />,
    <CloseCell key="close" op={op} />,
    <PeopleCell key="bd" owners={bdOwnersOf(op)} missing="Chưa có BD phụ trách" />,
    <SaleCell key="sale" op={op} canAccept={canAccept} />,
    <LastActivityCell key="activity" op={op} />,
    <NextStepCell key="next" op={op} />,
  ]
}

export default OpportunitiesPage
