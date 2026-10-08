import { useMemo, useState } from 'react'
import { ImagePlus, Plus } from '@pv/ui'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  Checkbox,
  ColumnFilter,
  ColumnFilterList,
  ColumnFilterRange,
  Icon,
  ScreenLayout,
  SearchField,
  SegmentedControl,
} from '@pv/ui'
import {
  LEAD_OPEN_STATES,
  LeadBookQuery,
  LeadState,
  OWNER_NONE,
  type LeadRow,
  type LeadStateFilter,
} from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { openMasMail } from '@/app/mas-mail-composer'
import { pinsOf, useLeadDesk } from '@/app/desk'
import { useCan, useSession } from '@/app/auth'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { DEFAULT_LEAD_BOOK_QUERY } from '@/app/url'
import { leadBookQuery, leadFacetQuery, leadFacetsQuery } from '@/data/leads'
import { LEAD_STATE_FACE, isOpenState } from '@/data/lead-state'
import { toast, toastDone } from '@/app/toast'
import { isApiError, userMessage } from '@/app/api'
import { useDirectory, useSalesPeople } from '@/data/directory'
import { LEAD_SPEC, originTally, withPeople } from '@/data/intake'
import { leadImportSurvivors, useLeadImport } from '@/data/lead-import'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { useLeadImportBatch } from '@/components/lead-import-batch'
import { LeadDisableAction } from '@/components/lead-disable'
import { BookCount, BookPage, type BookTable } from '@/components/book-page'
import { useBookSelection } from '@/components/book-selection'
import { BookSelectionBar, SelectionCell, TableFooter } from '@/components/table-bits'
import {
  CompanyCell,
  DisabledAtCell,
  CreatedByCell,
  EnteredCell,
  LeadPicCell,
  PinCell,
  ScoreStrip,
  SourceCell,
  StatusCell,
} from './leads-parts'

/** Module 2 · Sổ lead — a list, not a workbench: a row opens `/sales/leads/:code`.
 *
 *  The layout every book follows lives in `components/book-page.tsx`; this file
 *  only hands it content. Cells and blocks live in `leads-parts.tsx`.
 *
 *  The book is server-side: `GET /sales/leads` returns one filtered, sorted page
 *  plus `total`, and every filter lives in the URL (`app/book-query.ts`) so F5, shared
 *  links and the back button keep it. Tab counts come from `facets.byState`.
 *  The pinned tab is the exception: pins are per person (`app/desk.ts`), so it
 *  lists them out of `leadFacetQuery`, whose limits are written there.
 *
 *  No ContextRail (law 10 debt): a chain built from a hard-coded anchor would
 *  describe a lead nobody picked. It returns once it can follow the chosen row. */

/** Số dòng một trang. Máy chủ cắt trang, nhưng con số vẫn do màn quyết —
 *  `size` đi kèm mọi lời gọi. */
const PAGE_SIZE = 10

/** Tiền tố đánh dấu một giá trị ô lọc Nguồn là `sourceKind` chứ không phải id
 *  chiến dịch — xem docblock `sourceFilterOptions` cho lý do một ô cần phân biệt hai
 *  loại giá trị. An toàn vì hai bảng mã không bao giờ đụng nhau: id chiến dịch
 *  luôn có tiền tố `SR-` (`ConfigCode`, sáu prefix theo danh mục), `LeadSourceKind`
 *  luôn viết hoa không dấu gạch (`MANUAL`/`IMPORT`/`APOLLO`/`LANDING_PAGE`). */

/** The state tabs (ADR 0058). `open` is the default because the book is a work
 *  list; a dropped lead is still one tab away, since that is where "why did we
 *  lose it" is answered. Each key is a `LeadStateFilter` value, so it goes onto
 *  the URL and the wire unchanged.
 *
 *  Narrowing to ONE open state (every `assigned` lead, say) is the state select
 *  in the filter menu, not a sixth to ninth tab: a row of nine tabs has no
 *  first tab on a tablet. */
type StateTab = 'open' | 'converted' | 'disqualified' | 'all'

const STATE_TABS: { key: StateTab; label: string }[] = [
  { key: 'open', label: 'Đang hoạt động' },
  { key: 'converted', label: LEAD_STATE_FACE.converted.label },
  { key: 'disqualified', label: LEAD_STATE_FACE.disqualified.label },
  { key: 'all', label: 'Tất cả' },
]

/** Filter axes that count as "dirty" and that "clear all" resets — the schema's
 *  own keys; `disabled`, sort and tier/category are not among them. */
const FILTER_KEYS = [
  'campaign',
  'sourceKind',
  'motion',
  'origin',
  'createdBy',
  'states',
  'owner',
  'createdFrom',
  'createdTo',
  'state',
] as const

/** The pinned tab's value — not a `LeadStateFilter`, so it never reaches the URL. */
const PINNED = 'pinned'

/** The switched-off tab's value — `disabled=true` on the URL, not a state. */
const DISABLED = 'disabled'

/** Panel nạp tệp KHÔNG chống trùng trong trình duyệt nữa — tập rỗng là một
 *  quyết định, không phải một chỗ chưa nối.
 *
 *  Hai bên chống trùng bằng hai khoá khác nhau và trả lời hai câu khác nhau:
 *  panel khoá theo `mst:` rồi `ten:company|tỉnh` ("có phải cùng một CÔNG TY"),
 *  máy chủ khoá theo `email:lower(email)` trong các lead chưa rơi ("có phải
 *  cùng một LEAD ĐANG SỐNG"). Giữ cả hai thì một dòng bị trình duyệt loại
 *  không bao giờ tới được máy chủ, mà bốn con số panel vẽ lại là số của máy
 *  chủ — bảng kết quả sẽ báo "0 dòng trùng" cho một lô vừa bị loại ba dòng.
 *  Một cửa chống trùng, và đó là cửa có index đứng sau.
 *
 *  Cả ba sổ nay đi đường này: cơ hội qua `/sales/opportunities/import`, và sổ
 *  người nhận của hai màn Nguồn dẫn qua chính hai cửa trên (31/08). `leadBookKeys`
 *  không còn chỗ gọi nào — nó ở lại `data/intake.ts` cho tới lượt dọn. */
const NO_LOCAL_KEYS: ReadonlySet<string> = new Set()

export function LeadsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  /* Hides rather than greys out — same call the create route's own gate makes
     (`routes.tsx`, `permission: 'lead.edit'`), so the button and the fence
     never disagree. Precedent: `campaigns.tsx`'s `canWrite`. */
  const canWrite = useCan('lead.edit')
  const canDisable = useCan('lead.disable')

  /* The address is the source of truth; the hook owns patch, the debounced
     search box, the page reset and "clear all". `size` is PAGE_SIZE, kept off it. */
  const book = useBookQuery(LeadBookQuery, { size: PAGE_SIZE, filterKeys: FILTER_KEYS })
  const { urlQuery, text, setText, patch, dirty, clear: clearFilters } = book
  /* A hand-typed `?disabled=true` without the permission is dropped here, as
     the server drops it: the reader gets the ordinary book. */
  const query = useMemo(
    () => (canDisable ? book.query : { ...book.query, disabled: undefined }),
    [book.query, canDisable],
  )

  /* `error` đọc ra, KHÔNG bỏ.
     Bỏ nó đi thì một máy chủ chết hiện ra thành "Không có lead nào khớp bộ lọc
     đang chọn" kèm nút "Bỏ hết bộ lọc", console sạch trơn: người dùng đi sửa
     bộ lọc cho một sự cố hạ tầng, và chỉ dừng lại khi đã bỏ hết bộ lọc mà sổ
     vẫn trống. "Không có dòng nào" và "không hỏi được" là hai câu khác nhau và
     dẫn tới hai việc khác nhau — xem nhánh `bookError` ở chỗ vẽ bảng. */
  const {
    data: bookPage,
    isPending,
    error: bookError,
    refetch: refetchBook,
  } = useQuery(leadBookQuery(query))
  const rows = bookPage?.rows ?? []
  const total = bookPage?.total ?? 0

  /* The WHOLE book, read once — a patch whose limits are in `leadFacetQuery`'s
     docblock. The pinned tab and the mail modal need rows beyond this page. */
  const {
    data: facets,
    isPending: facetsPending,
    error: facetsError,
    refetch: refetchFacets,
  } = useQuery(leadFacetQuery)
  const wholeBook = useMemo(() => facets?.rows ?? [], [facets])

  /* Bảng tra mã → tên ĐÃ BỎ. Nó tồn tại vì dòng sổ chỉ chở một mã trần và màn
     phải tự đi tìm tên; nay `source.campaignName` về cùng dòng, nên không còn
     gì để tra. Cũng mất theo là cả một lớp lỗi: một nguồn vừa bị tắt không còn
     làm ô Nguồn của lead cũ thành "không rõ", vì tên nó đã ở trên dây rồi. */

  const me = useSession((s) => s.actor)
  const pins = useLeadDesk((s) => pinsOf(s, me?.id))
  const togglePin = useLeadDesk((s) => s.togglePin)
  const setPins = useLeadDesk((s) => s.setPins)

  const open = (code: string) => navigate(`/sales/leads/${code}`)

  const { pageIndex } = useBookPageClamp(book, bookPage?.total)

  const pinned = useMemo(
    () =>
      pins
        .map((code) => wholeBook.find((l) => l.code === code))
        .filter((l): l is LeadRow => Boolean(l)),
    [pins, wholeBook],
  )

  const [pinnedView, setPinnedView] = useState(false)
  const shown = pinnedView ? pinned : rows
  const disabledView = !pinnedView && query.disabled === true

  /* One read answers every tab — `byState` under the current search and source
     filter; `open` and `all` are sums the screen takes — and feeds the
     no-campaign half of the source select (`sourceKinds`). See `LeadFacets`. */
  /* Asked WITHOUT `disabled`, so the state tabs keep counting the live book
     while the switched-off tab is open — and `LeadFacetsQuery.parse` takes the
     wire's 'true'/'false', not the boolean the URL parse already produced. */
  const { data: counts } = useQuery(leadFacetsQuery({ ...urlQuery, disabled: undefined }))
  const byState = counts?.byState
  const sumOf = (states: readonly LeadState[]) =>
    byState && states.reduce((sum, state) => sum + (byState[state] ?? 0), 0)
  const countOf = (key: StateTab) =>
    key === 'open'
      ? sumOf(LEAD_OPEN_STATES)
      : key === 'all'
        ? sumOf(LeadState.options)
        : byState?.[key]
  const tabs = [
    ...STATE_TABS.map((t) => ({ value: t.key, label: t.label, count: countOf(t.key) })),
    { value: PINNED, label: 'Đã ghim', count: pinned.length },
    ...(canDisable ? [{ value: DISABLED, label: 'Đã vô hiệu', count: counts?.disabled }] : []),
  ]
  /* One open state picked in the filter menu still lights the `open` tab. */
  const oneOpenState = isOpenState(query.state)
  const tabValue = query.disabled ? DISABLED : oneOpenState ? 'open' : query.state
  const onTab = (value: string) => {
    /* A selection never crosses the switched-off tab's edge: its action flips. */
    if ((value === DISABLED) !== disabledView) clearSelection()
    setPinnedView(value === PINNED)
    /* The switched-off tab REPLACES the state filter — it lists every state. */
    if (value === DISABLED)
      patch({ disabled: true, state: DEFAULT_LEAD_BOOK_QUERY.state, states: undefined })
    /* The state-list filter is hidden off the open tab but would still filter: drop it. */
    else if (value !== PINNED)
      patch({
        state: value as LeadStateFilter,
        states: value === 'open' ? query.states : undefined,
        disabled: undefined,
      })
  }

  /* Options come from the facets, so a filter never offers a value no lead
     carries. The column filters send several values as one comma list. */
  const salesPeople = useSalesPeople()
  const ownerOptions = [
    { value: OWNER_NONE, label: 'Chưa có người phụ trách' },
    ...salesPeople.map((a) => ({ value: a.id, label: a.name })),
  ]
  const creatorOptions = [
    { value: OWNER_NONE, label: 'Chưa ghi nhận' },
    ...salesPeople.map((a) => ({ value: a.id, label: a.name })),
  ]
  const originOptions = (counts?.origins ?? []).map((o) => ({ value: o.id, label: o.name }))
  const csvOf = (v?: string) => (v ? v.split(',') : [])
  const listFilter = (
    label: string,
    key: 'owner' | 'createdBy' | 'origin' | 'states',
    options: { value: string; label: string }[],
  ) => (
    <ColumnFilter label={label} active={Boolean(query[key])}>
      {(close) => (
        <ColumnFilterList
          options={options}
          selected={csvOf(query[key])}
          close={close}
          onApply={(v) => patch({ [key]: v.length ? v.join(',') : undefined })}
        />
      )}
    </ColumnFilter>
  )
  const stateOptions = LEAD_OPEN_STATES.map((state) => ({
    value: state,
    label:
      byState === undefined
        ? LEAD_STATE_FACE[state].label
        : `${LEAD_STATE_FACE[state].label} · ${byState[state] ?? 0}`,
  }))
  const dateFilter = (
    <ColumnFilter label="Ngày tạo" active={Boolean(query.createdFrom || query.createdTo)}>
      {(close) => (
        <ColumnFilterRange
          from={query.createdFrom}
          to={query.createdTo}
          close={close}
          onApply={({ from, to }) => patch({ createdFrom: from, createdTo: to })}
        />
      )}
    </ColumnFilter>
  )

  const canEmail = useCan('lead.send-email')

  /* Shared by every bulk-action book: selection outlives paging and keeps the
     mouse/pen paint gesture identical between the lead and opportunity books. */
  const {
    selectedCodes,
    pageSelected,
    allPageSelected,
    changeSelection,
    beginDrag,
    paintSelection,
    selectPage,
    clearSelection,
  } = useBookSelection(shown)

  const selectedLeads = useMemo(
    () => wholeBook.filter((lead) => selectedCodes.has(lead.code)),
    [wholeBook, selectedCodes],
  )
  const allSelectedPinned = [...selectedCodes].every((code) => pins.includes(code))
  const selectedEmailCount = selectedLeads.filter((lead) => Boolean(lead.email)).length

  /* Bản vẽ nạp tệp + sổ người của máy chủ. Ô "Lead PIC" là danh sách đóng, và
     danh sách đó là những người ĐANG làm ở đây — không phải bảy cái tên từng
     nằm trong fixture. */
  const staff = useDirectory()
  const leadSpec = useMemo(() => withPeople(LEAD_SPEC, staff), [staff])

  const loadFile = useLeadImport()

  /* Lô nạp GHI THẲNG lên máy chủ — hai cửa, đúng vai từng cửa, cả hai nằm ở
     `data/lead-import.ts`. Kho `intake-desk` không còn nhận lô của sổ lead:
     dòng đã nằm trên máy chủ rồi, giữ thêm một bản cục bộ là mỗi dòng nạp hiện
     hai lần mà không có gì nói cho người xem biết vì sao. Hai sổ kia còn dùng
     kho đó, nên `app/intake-desk.ts` vẫn đứng nguyên.

     Trả BÁO CÁO CỦA MÁY CHỦ về cho panel: bốn con số ở bước 3 phải là số của
     bên đã ghi thật — xem docblock `onCommit` ở `components/import-zone.tsx`.
     Hàm này không bao giờ ném, vì `runLeadImport` đã đổi mọi lời từ chối thành
     một báo cáo nói đúng những gì đã vào sổ. */
  /* The batch-wide origin / campaign / partner pick — drawn inside the import
     panel, held here because the commit below is where it goes onto the wire. */
  const importBatch = useLeadImportBatch()

  const commitLeads = async ({
    rows,
    motion,
    fileName,
    scope,
  }: ImportCommit & { scope?: string }) => {
    const run = await loadFile({ rows, motion, fileName, ...importBatch.wireOf(motion, scope) })
    /* The codes ride ALONG with the report rather than inside it, because
       `runLeadImport` has to answer for the preview-only path too — where rows
       survived and nothing was written. Joining them here is what lets step 3
       print the lead code beside each row it actually created; an empty list
       stays absent, and the panel then draws no code column at all. */
    const report = { ...run.report, ...(run.codes.length > 0 ? { codes: run.codes } : {}) }

    toast(run.failure ?? `${report.rows.length} lead đã được thêm`, {
      tone: run.failure ? 'danger' : 'success',
      detail: [
        report.attached &&
          report.attached.length > 0 &&
          `${report.attached.length} người gộp vào lead chung`,
        report.duplicates > 0 && `${report.duplicates} dòng đã có trong hệ thống, không nạp`,
        report.dupInFile > 0 && `${report.dupInFile} dòng trùng nhau trong tệp`,
        report.errors.length > 0 && `${report.errors.length} dòng không nạp được`,
        report.origins && originTally(report.origins),
      ]
        .filter(Boolean)
        .join(' · '),
    })

    return report
  }

  const onPage = book.goPage

  /* The pinned list does not read the URL, so it gets no sort control at all. */
  const sortable = !pinnedView

  const table: BookTable = {
    minWidth: 'min-w-[960px]',
    /* The arrow lights only while the book sorts by this column; the default
       order (`createdAt desc`) is no column on the table. */
    sort: sortable && query.sort === 'company' ? { key: 'company', dir: query.dir } : undefined,
    onSort: sortable
      ? (key) => {
          /* The only sortable column; any other key would die at the server's
             zod gate as a 400. */
          if (key !== 'company') return
          patch(
            query.sort === 'company'
              ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
              : { sort: 'company', dir: 'asc' },
          )
        }
      : undefined,
    columns: [
      {
        header: (
          <Checkbox
            checked={allPageSelected}
            indeterminate={pageSelected > 0 && !allPageSelected}
            onChange={selectPage}
            label={<span className="sr-only">Chọn cả trang</span>}
            className="w-full justify-center gap-0 p-0"
          />
        ),
        width: '32px',
      },
      { header: 'Công ty / Người liên hệ', width: 'minmax(0,2.2fr)', sortKey: 'company' },
      { header: listFilter('Nguồn lead', 'origin', originOptions), width: 'minmax(0,1.3fr)' },
      {
        header:
          tabValue === 'open' ? listFilter('Trạng thái', 'states', stateOptions) : 'Trạng thái',
        width: 'minmax(0,1.2fr)',
      },
      { header: dateFilter, width: 'minmax(0,0.8fr)' },
      /* A switched-off lead takes no hand-over and no pin: the two action
         columns give way to the one fact that tab adds. */
      ...(disabledView
        ? [{ header: 'Ngày vô hiệu hóa', width: 'minmax(0,1.1fr)' }]
        : [
            {
              header: listFilter('Người tạo', 'createdBy', creatorOptions),
              width: '140px',
              align: 'center' as const,
            },
            {
              header: listFilter('Người phụ trách', 'owner', ownerOptions),
              width: '140px',
              align: 'center' as const,
            },
            { header: <span className="sr-only">Ghim</span>, width: '48px' },
          ]),
    ],
    rows: shown.map((l) => ({
      id: l.code,
      state: selectedCodes.has(l.code) ? ('selected' as const) : undefined,
      onOpen: () => open(l.code),
      onPointerEnter: (event) => paintSelection(l.code, event),
      cells: [
        <SelectionCell
          key="select"
          checked={selectedCodes.has(l.code)}
          label={l.company}
          onPress={(event) => beginDrag(l.code, event)}
          onChange={(on) => changeSelection(l.code, on)}
        />,
        <CompanyCell
          key="c"
          lead={l}
          onEmail={
            canEmail && !disabledView && l.state !== 'disqualified'
              ? () =>
                  openMasMail({
                    recipients: wholeBook,
                    initialCode: l.code,
                  })
              : undefined
          }
        />,
        <SourceCell key="s" lead={l} />,
        <StatusCell key="w" lead={l} />,
        <EnteredCell key="d" lead={l} />,
        ...(disabledView
          ? [<DisabledAtCell key="x" lead={l} />]
          : [
              <CreatedByCell key="b" lead={l} />,
              <LeadPicCell key="o" lead={l} />,
              <PinCell
                key="p"
                on={pins.includes(l.code)}
                company={l.company}
                onToggle={() => me && togglePin(me.id, l.code)}
              />,
            ]),
      ],
    })),
  }

  /* Two bodies, one card: the pinned tab answers out of `leadFacetQuery`, the
     book out of `leadBookQuery`, so every draw state picks its own source. */
  const pending = pinnedView ? facetsPending : isPending

  /* A failed read says so and offers a retry, not "clear filters": the filters
     are not what broke. `userMessage` keeps the server's own words. */
  const failure = pinnedView
    ? facetsError
      ? {
          message: `Không tải được danh sách lead đã ghim. ${
            isApiError(facetsError) ? userMessage(facetsError) : 'Vui lòng thử lại.'
          }`,
          onRetry: () => void refetchFacets(),
        }
      : undefined
    : bookError
      ? {
          message: `Không tải được danh sách lead. ${
            isApiError(bookError) ? userMessage(bookError) : 'Vui lòng thử lại.'
          }`,
          onRetry: () => void refetchBook(),
        }
      : undefined

  const empty = pinnedView
    ? pinned.length === 0
      ? {
          message: 'Chưa ghim lead nào. Bấm biểu tượng ghim ở cuối một dòng để giữ nó ở đây.',
          action: { label: 'Xem tất cả lead', onClick: () => setPinnedView(false) },
        }
      : undefined
    : rows.length === 0
      ? dirty
        ? {
            message: 'Không có lead nào phù hợp với bộ lọc hiện tại.',
            action: { label: 'Bỏ hết bộ lọc', onClick: clearFilters },
          }
        : disabledView
          ? {
              message: 'Chưa có lead nào bị vô hiệu hoá.',
              action: { label: 'Tải lại', onClick: () => void refetchBook() },
            }
          : {
              message: 'Chưa có lead nào. Hãy thêm lead đầu tiên để bắt đầu theo dõi.',
              action: canWrite
                ? { label: 'Thêm lead', onClick: () => navigate('/sales/leads/new') }
                : { label: 'Tải lại', onClick: () => void refetchBook() },
            }
      : undefined

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <BookPage
          title="Khách hàng tiềm năng"
          actions={
            <>
              <ImportZone
                spec={leadSpec}
                existingKeys={NO_LOCAL_KEYS}
                batchExtra={importBatch.extra}
                buttonLabel="Nhập từ tệp"
                onCommit={commitLeads}
                onPrecheck={({ rows, motion, fileName, scope }) =>
                  leadImportSurvivors({
                    rows,
                    motion,
                    fileName,
                    ...importBatch.wireOf(motion, scope),
                  })
                }
                onSeeResult={() => {
                  setPinnedView(false)
                  clearFilters()
                }}
              />
              {canWrite && (
                <Button
                  size="md"
                  variant="ghost"
                  onClick={() => navigate('/sales/leads/scan')}
                  className="pointer-coarse:h-12 max-sm:flex-1"
                >
                  <Icon icon={ImagePlus} size={16} />
                  Nhập từ ảnh
                </Button>
              )}
              {/* Typing a lead by hand is a PAGE now (`/sales/leads/new`), not a
                  drawer: it asks the very questions the lead profile asks, so it
                  uses that same form — see `pages/lead-new.tsx`. */}
              {canWrite && (
                <Button
                  size="md"
                  onClick={() => navigate('/sales/leads/new')}
                  className="pointer-coarse:h-12 max-sm:flex-1"
                >
                  <Icon icon={Plus} size={16} />
                  Thêm lead
                </Button>
              )}
            </>
          }
          score={<ScoreStrip />}
          tabs={
            <SegmentedControl
              label="Nhóm lead"
              hideLabel
              tone="quiet"
              value={pinnedView ? PINNED : tabValue}
              options={tabs}
              onChange={onTab}
            />
          }
          count={<BookCount total={pinnedView ? pinned.length : total} noun="lead" />}
          tools={
            !pinnedView && (
              <>
                <SearchField
                  placeholder="Tìm theo tên công ty, người liên hệ hoặc mã lead…"
                  value={text}
                  onChange={setText}
                  className="min-w-0 flex-1 sm:max-w-[320px]"
                />
                {dirty && (
                  <Button
                    size="md"
                    variant="ghost"
                    onClick={clearFilters}
                    className="pointer-coarse:h-12"
                  >
                    Bỏ hết bộ lọc
                  </Button>
                )}
              </>
            )
          }
          pending={pending}
          failure={failure}
          empty={empty}
          table={table}
          footer={
            pinnedView ? (
              /* The pinned list is one page by definition — it is as long as the
                 person's own pins, so there is nothing to page through. */
              <TableFooter
                page={0}
                pageSize={pinned.length}
                total={pinned.length}
                onPage={onPage}
              />
            ) : (
              <TableFooter page={pageIndex} pageSize={PAGE_SIZE} total={total} onPage={onPage} />
            )
          }
        />

        {selectedCodes.size > 0 && <div aria-hidden className="h-24" />}
        {selectedCodes.size > 0 && (
          <BookSelectionBar
            count={selectedCodes.size}
            noun="lead"
            meta={
              disabledView
                ? undefined
                : `Sẽ gửi ${selectedEmailCount} email${
                    selectedEmailCount < selectedCodes.size
                      ? ` · bỏ qua ${selectedCodes.size - selectedEmailCount} lead chưa có địa chỉ email`
                      : ''
                  }`
            }
            onClear={clearSelection}
            onSend={
              disabledView
                ? undefined
                : () =>
                    openMasMail({
                      recipients: wholeBook,
                      initialCodes: [...selectedCodes],
                      onQueued: clearSelection,
                    })
            }
            actions={
              <>
                {me && !disabledView && (
                  <Button
                    size="lg"
                    variant="ghost"
                    onClick={() => {
                      setPins(me.id, [...selectedCodes], !allSelectedPinned)
                      toastDone(
                        `Đã ${allSelectedPinned ? 'bỏ ghim' : 'ghim'} ${selectedCodes.size} lead`,
                      )
                      clearSelection()
                    }}
                  >
                    {allSelectedPinned ? 'Bỏ ghim' : 'Ghim'}
                  </Button>
                )}
                {canDisable && (
                  <LeadDisableAction
                    codes={[...selectedCodes]}
                    restoring={disabledView}
                    onDone={clearSelection}
                  />
                )}
              </>
            }
          />
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default LeadsPage
