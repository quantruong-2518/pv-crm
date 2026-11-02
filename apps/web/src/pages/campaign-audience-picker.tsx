import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  ColumnFilter,
  ColumnFilterList,
  ColumnFilterRange,
  DataTable,
  EmptyState,
  GlassCard,
  Inbox,
  SearchField,
  Skeleton,
  type TableColumn,
  TriangleAlert,
} from '@pv/ui'
import { OWNER_NONE, type LeadBookQuery, type LeadBookResponse, type LeadTier } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { message, translate } from '@/app/i18n'
import { useSelectionGesture } from '@/components/book-selection'
import { CompanyCell, MomentCell } from '@/components/lead-cells'
import { LabelChips } from '@/components/lead-labels'
import { AvatarCell, PersonCell, SelectionCell } from '@/components/table-bits'
import { LEAD_TIERS } from '@/data/campaigns'
import { useSalesPeople } from '@/data/directory'
import { categoryOptions, leadIndustryOptionsQuery } from '@/data/industries'
import { leadLabelOptionsQuery } from '@/data/lead-labels'
import { leadBookQuery } from '@/data/leads'
import { searchableText } from '@/lib/search-box'

const msg = (vi: string, en: string, ko: string) => translate(message(vi, en, ko))

/** Module 1 · the campaign audience's PICKER — the lead table inside the
 *  add-recipients drawer. Split from `campaign-audience-parts.tsx` (max-lines); it wears
 *  the lead book's setup (select-page box, column filters, avatar owner, reset
 *  button) but keeps its own selection, owned by `AudienceTab`. */

const tierLabel = (key: string) => {
  const copy: Record<string, [string, string, string]> = {
    prospect: ['Đầu mối', 'Prospect', '잠재 고객'],
    mql: ['MQL', 'MQL', 'MQL'],
    sql: ['SQL', 'SQL', 'SQL'],
  }
  const [vi, en, ko] = copy[key] ?? [key, key, key]
  return msg(vi, en, ko)
}
const TIER_OPTIONS = LEAD_TIERS.map((t) => ({ value: t.key, label: tierLabel(t.key) }))

const AUDIENCE_PAGE_SIZE = 100

/** The server's own cap on `q`; a longer paste would only earn a 400. */
const SEARCH_MAX = 120

/** Same 300ms the lead and opportunity books use. The query object below IS the
 *  `queryKey`, so one keystroke would otherwise be one new key and one round
 *  trip: eight characters, eight requests, and the answer to the first seven
 *  arriving after the eighth. No address bar to keep in step here, so the letters
 *  stay in state (typing shows up at once) and only drip into the query. */
const SEARCH_DELAY_MS = 300

/** The picker's filters, in LOCAL state rather than the address: the picker
 *  lives in a drawer, and a filter left on the URL would outlive it and greet
 *  the next opening with a book narrowed by the last visit. `categoryId` and
 *  `tier` stay one value each because `LeadBookQuery` takes one of each. */
type PickerFilters = {
  categoryId?: string
  tier?: LeadTier
  owner: string[]
  /** Waiting label ids; a lead carrying ANY of them matches. */
  label: string[]
  createdFrom?: string
  createdTo?: string
}

const NO_PICKER_FILTERS: PickerFilters = { owner: [], label: [] }

/** THE DRAWER'S CANDIDATE LIST, AND THE ROWS IT MUST NOT OFFER AGAIN.
 *
 *  `alreadyIn` is the audience as it stands. A lead already in the campaign has
 *  nothing left for this table to do with it: ticking it a second time posts an
 *  `add` the server answers with `added: 0`, and the reader — who is looking at
 *  that same name in the card behind this drawer — reasonably reads the repeat
 *  as the screen having lost track of what it already holds. */
export function AudiencePicker({
  selected,
  onSetOne,
  onSetMany,
  alreadyIn,
}: {
  selected: ReadonlySet<string>
  onSetOne: (code: string, on: boolean) => void
  onSetMany: (codes: string[], on: boolean) => void
  alreadyIn: ReadonlySet<string>
}) {
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(NO_PICKER_FILTERS)

  useEffect(() => {
    const typed = searchableText(text.trim().slice(0, SEARCH_MAX)) ?? ''
    const timer = setTimeout(() => setSearch(typed), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])

  const query: LeadBookQuery = useMemo(
    () => ({
      page: 1,
      size: AUDIENCE_PAGE_SIZE,
      state: 'open',
      sort: 'createdAt',
      dir: 'desc',
      ...(search === '' ? {} : { q: search }),
      categoryId: filters.categoryId,
      tier: filters.tier,
      owner: filters.owner.length > 0 ? filters.owner.join(',') : undefined,
      label: filters.label.length > 0 ? filters.label.join(',') : undefined,
      createdFrom: filters.createdFrom,
      createdTo: filters.createdTo,
    }),
    [search, filters],
  )

  const { data, isPending, error, refetch } = useQuery(leadBookQuery(query))
  /* Filtered on the CLIENT: the server pages the lead book and knows nothing
     about this audience, so a page of 100 holding 3 members shows 97 rows. The
     drawer's subtitle owns up to it, or 97 reads as a miscount. */
  const page = data?.rows ?? []
  const rows = page.filter((l) => !alreadyIn.has(l.code))
  const alreadyOnPage = page.length - rows.length
  const narrowed = Boolean(
    filters.categoryId ||
    filters.tier ||
    filters.owner.length > 0 ||
    filters.label.length > 0 ||
    filters.createdFrom ||
    filters.createdTo,
  )
  /* The DEBOUNCED word, not the live one: the table is answering `search`, so
     reading `text` would flip this 300ms early and tell a reader mid-clear that
     the whole book is empty. The reset button, unlike it, shows from the first key. */
  const filtered = search !== '' || narrowed
  const dirty = text.trim() !== '' || narrowed
  const patch = (next: Partial<PickerFilters>) => setFilters((cur) => ({ ...cur, ...next }))
  const clearFilters = () => {
    setText('')
    setSearch('')
    setFilters(NO_PICKER_FILTERS)
  }

  const { toggleSelection, beginDrag, paintSelection, changeSelection } = useSelectionGesture(
    selected,
    onSetOne,
  )

  const salesPeople = useSalesPeople()
  const ownerOptions = [
    { value: OWNER_NONE, label: msg('Chưa có người phụ trách', 'No owner', '담당자 없음') },
    ...salesPeople.map((a) => ({ value: a.id, label: a.name })),
  ]
  const { data: labelCatalog } = useQuery(leadLabelOptionsQuery)
  const labelOptions = (labelCatalog?.rows ?? [])
    .filter((l) => l.active)
    .map((l) => ({ value: l.id, label: l.name }))
  const { data: industries } = useQuery(leadIndustryOptionsQuery)
  const groupOptions = categoryOptions(industries, filters.categoryId)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          placeholder={msg(
            'Tìm theo công ty, người liên hệ hoặc mã lead…',
            'Search by company, contact, or lead ID…',
            '회사, 담당자 또는 리드 ID로 검색…',
          )}
          value={text}
          onChange={setText}
          className="min-w-0 flex-1"
        />
        {dirty && (
          <Button size="md" variant="ghost" onClick={clearFilters} className="pointer-coarse:h-12">
            {msg('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기')}
          </Button>
        )}
      </div>

      <PickerTable
        pending={isPending}
        failure={
          error
            ? msg(
                `Không tải được danh sách lead. ${isApiError(error) ? userMessage(error) : 'Hãy thử lại.'}`, // i18n-ignore
                `Could not load leads. ${isApiError(error) ? userMessage(error) : 'Please try again.'}`,
                `리드 목록을 불러올 수 없습니다. ${isApiError(error) ? userMessage(error) : '다시 시도해 주세요.'}`,
              )
            : undefined
        }
        onRetry={() => void refetch()}
        rows={rows}
        columns={pickerColumns({
          rows,
          selected,
          onSetMany,
          filters,
          patch,
          ownerOptions,
          labelOptions,
          groupOptions,
        })}
        alreadyOnPage={alreadyOnPage}
        wholeMatchShown={(data?.total ?? 0) <= page.length}
        filtered={filtered}
        dirty={dirty}
        onClearFilters={clearFilters}
        selected={selected}
        onSetOne={changeSelection}
        onActivate={toggleSelection}
        onBeginDrag={beginDrag}
        onPaint={paintSelection}
      />
      <p className="text-muted-foreground text-[11px]">
        {msg(
          `Đang hiển thị tối đa ${AUDIENCE_PAGE_SIZE} lead mới nhất.`,
          `Showing up to the ${AUDIENCE_PAGE_SIZE} most recent leads.`,
          `최근 리드 최대 ${AUDIENCE_PAGE_SIZE}개를 표시합니다.`,
        )}
      </p>
    </div>
  )
}

/** The picker's header row: the lead book's select-page box and column
 *  filters, minus what a drawer has no use for (sort, pins, creator). */
function pickerColumns({
  rows,
  selected,
  onSetMany,
  filters,
  patch,
  ownerOptions,
  labelOptions,
  groupOptions,
}: {
  rows: LeadBookResponse['rows']
  selected: ReadonlySet<string>
  onSetMany: (codes: string[], on: boolean) => void
  filters: PickerFilters
  patch: (next: Partial<PickerFilters>) => void
  ownerOptions: { value: string; label: string }[]
  labelOptions: { value: string; label: string }[]
  groupOptions: { value: string; label: string }[]
}): TableColumn[] {
  const shownSelected = rows.filter((r) => selected.has(r.code)).length
  const allShown = rows.length > 0 && shownSelected === rows.length
  return [
    {
      header: (
        <Checkbox
          checked={allShown}
          indeterminate={shownSelected > 0 && !allShown}
          onChange={(on) =>
            onSetMany(
              rows.map((r) => r.code),
              on,
            )
          }
          label={
            <span className="sr-only">
              {msg(
                'Chọn tất cả lead đang hiện',
                'Select all visible leads',
                '현재 표시된 리드 모두 선택',
              )}
            </span>
          }
          className="pointer-coarse:h-12 w-full justify-center gap-0 p-0"
        />
      ),
      /* 48px, not the lead book's 32px: the box is 48px tall on touch, and header
         and cells share one grid template. */
      width: '48px',
    },
    {
      header: msg('Công ty / Người liên hệ', 'Company / Contact', '회사 / 담당자'),
      width: 'minmax(0,2.4fr)',
    },
    {
      header: (
        <ColumnFilter
          label={msg('Nhóm ngành', 'Industry group', '산업 분야')}
          active={Boolean(filters.categoryId)}
        >
          {(close) => (
            <ColumnFilterList
              options={groupOptions}
              selected={filters.categoryId ? [filters.categoryId] : []}
              close={close}
              onApply={(v) => patch({ categoryId: v.length === 1 ? v[0] : undefined })}
            />
          )}
        </ColumnFilter>
      ),
      width: 'minmax(0,1fr)',
    },
    {
      header: (
        <ColumnFilter label={msg('Bậc', 'Tier', '등급')} active={Boolean(filters.tier)}>
          {(close) => (
            <ColumnFilterList
              searchable={false}
              options={TIER_OPTIONS}
              selected={filters.tier ? [filters.tier] : []}
              close={close}
              onApply={(v) => patch({ tier: v.length === 1 ? (v[0] as LeadTier) : undefined })}
            />
          )}
        </ColumnFilter>
      ),
      width: 'minmax(0,0.8fr)',
    },
    {
      header: (
        <ColumnFilter label={msg('Nhãn', 'Labels', '라벨')} active={filters.label.length > 0}>
          {(close) => (
            <ColumnFilterList
              options={labelOptions}
              selected={filters.label}
              close={close}
              onApply={(label) => patch({ label })}
              emptyText={msg(
                'Chưa có nhãn nào.',
                'No labels available.',
                '사용할 수 있는 라벨이 없습니다.',
              )}
            />
          )}
        </ColumnFilter>
      ),
      width: 'minmax(0,1fr)',
    },
    {
      header: (
        <ColumnFilter
          label={msg('Ngày tạo', 'Created', '생성일')}
          active={Boolean(filters.createdFrom || filters.createdTo)}
        >
          {(close) => (
            <ColumnFilterRange
              from={filters.createdFrom}
              to={filters.createdTo}
              close={close}
              onApply={({ from, to }) => patch({ createdFrom: from, createdTo: to })}
            />
          )}
        </ColumnFilter>
      ),
      width: '104px',
    },
    {
      header: (
        <ColumnFilter
          label={msg('Người phụ trách', 'Owner', '담당자')}
          active={filters.owner.length > 0}
        >
          {(close) => (
            <ColumnFilterList
              options={ownerOptions}
              selected={filters.owner}
              close={close}
              onApply={(owner) => patch({ owner })}
            />
          )}
        </ColumnFilter>
      ),
      width: '140px',
      align: 'center',
    },
  ]
}

/** The picker's rows. Every handler it takes is owned by `AudiencePicker`,
 *  which is where the drag state lives. */
function PickerTable({
  pending,
  failure,
  onRetry,
  rows,
  columns,
  alreadyOnPage,
  wholeMatchShown,
  filtered,
  dirty,
  onClearFilters,
  selected,
  onSetOne,
  onActivate,
  onBeginDrag,
  onPaint,
}: {
  pending: boolean
  failure?: string
  onRetry: () => void
  rows: LeadBookResponse['rows']
  columns: TableColumn[]
  alreadyOnPage: number
  /** The server's whole match fits on this page, so "all already in" is true. */
  wholeMatchShown: boolean
  filtered: boolean
  dirty: boolean
  onClearFilters: () => void
  selected: ReadonlySet<string>
  onSetOne: (code: string, on: boolean) => void
  onActivate: (code: string) => void
  onBeginDrag: (code: string, event: ReactPointerEvent<HTMLElement>) => void
  onPaint: (code: string, event: ReactPointerEvent<HTMLElement>) => void
}) {
  return (
    <GlassCard variant="b" className="max-h-[50vh] select-none overflow-auto p-0">
      {pending ? (
        <div className="flex flex-col gap-3 p-5">
          <Skeleton height={56} />
          <Skeleton height={56} delay={200} />
          <Skeleton height={56} delay={400} />
        </div>
      ) : failure ? (
        <EmptyState
          tone="danger"
          icon={TriangleAlert}
          message={failure}
          action={{ label: msg('Tải lại', 'Reload', '새로고침'), onClick: onRetry }}
          className="py-8"
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message={
            alreadyOnPage > 0
              ? wholeMatchShown
                ? msg(
                    'Tất cả lead khớp bộ lọc đã có trong danh sách.',
                    'All matching leads are already on the list.',
                    '조건에 맞는 리드가 모두 이미 목록에 있습니다.',
                  )
                : msg(
                    `${alreadyOnPage} lead mới nhất đã có trong danh sách. Thu hẹp bộ lọc để thấy lead cũ hơn.`,
                    `The ${alreadyOnPage} newest leads are already listed. Narrow the filters to find older leads.`,
                    `최신 리드 ${alreadyOnPage}개가 이미 목록에 있습니다. 필터를 좁혀 이전 리드를 찾아보세요.`,
                  )
              : filtered
                ? msg(
                    'Không có lead nào khớp bộ lọc.',
                    'No leads match these filters.',
                    '필터와 일치하는 리드가 없습니다.',
                  )
                : msg(
                    'Chưa có lead nào đang hoạt động.',
                    'There are no active leads yet.',
                    '활성 리드가 아직 없습니다.',
                  )
          }
          action={
            dirty
              ? {
                  label: msg('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'),
                  onClick: onClearFilters,
                }
              : { label: msg('Tải lại', 'Reload', '새로고침'), onClick: onRetry }
          }
          className="py-8"
        />
      ) : (
        <DataTable
          flush
          rowHeight="h-14"
          className="min-w-[760px]"
          columns={columns}
          rows={rows.map((l) => ({
            id: l.code,
            state: selected.has(l.code) ? ('selected' as const) : undefined,
            onOpen: () => onActivate(l.code),
            onPointerDown: (event) => onBeginDrag(l.code, event),
            onPointerEnter: (event) => onPaint(l.code, event),
            cells: [
              <SelectionCell
                key="select"
                checked={selected.has(l.code)}
                label={l.company}
                /* The row's own pointerdown starts the paint — doing it here too would run it twice. */
                onPress={() => undefined}
                onChange={(on) => onSetOne(l.code, on)}
              />,
              <CompanyCell key="c" lead={l} />,
              <PersonCell
                key="cat"
                value={l.category?.name}
                missing={msg('Chưa chọn nhóm ngành', 'No industry group', '산업 분야 미선택')}
              />,
              <PersonCell
                key="tier"
                value={l.tier && tierLabel(l.tier)}
                missing={msg('Chưa xếp bậc', 'No tier', '등급 미지정')}
              />,
              l.labels.length > 0 ? (
                <LabelChips
                  key="labels"
                  labels={l.labels}
                  max={2}
                  className="max-w-full flex-nowrap"
                />
              ) : (
                <PersonCell key="labels" missing={msg('Chưa gắn nhãn', 'No labels', '라벨 없음')} />
              ),
              <MomentCell key="d" iso={l.createdAt} />,
              <AvatarCell
                key="o"
                email={l.ownerEmail}
                name={l.ownerName}
                empty={msg('Chưa có người phụ trách', 'No owner', '담당자 없음')}
              />,
            ],
          }))}
        />
      )}
    </GlassCard>
  )
}
