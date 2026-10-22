import { useMemo } from 'react'
import { Contact, EyeOff, ImagePlus, Pin, Plus } from '@pv/ui'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell, Button, Icon, ScreenLayout, SegmentedControl } from '@pv/ui'
import { LeadBookQuery } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { openMasMail } from '@/app/mas-mail-composer'
import { useCan, useSession } from '@/app/auth'
import { useBookPageClamp, useBookQuery } from '@/app/book-query'
import { leadBookQuery, leadFacetsQuery, leadSearchQuery, leadsByCodesQuery } from '@/data/leads'
import { leadProfileQuery } from '@/data/lead-profile'
import { toast } from '@/app/toast'
import { isApiError, userMessage } from '@/app/api'
import { useDirectory } from '@/data/directory'
import { LEAD_SPEC, originTally, withPeople } from '@/data/intake'
import { leadImportSurvivors, useLeadImport } from '@/data/lead-import'
import { usePins } from '@/data/pins'
import { ImportZone, type ImportCommit } from '@/components/import-zone'
import { useLeadImportBatch } from '@/components/lead-import-batch'
import { LeadDisableAction } from '@/components/lead-disable'
import { PinSelectionAction } from '@/components/pin-cell'
import { BOOK_PAGE_SIZE } from '@/components/book-columns'
import { BookCount, BookPage, BookSearch, type BookTable } from '@/components/book-page'
import { BookQueueButton } from '@/components/book-queue-button'
import { useBookSelection } from '@/components/book-selection'
import { useRowIntent } from '@/components/row-intent'
import { BookSelectionBar, TableFooter } from '@/components/table-bits'
import { ScoreStrip } from './leads-parts'
import { leadCells, leadColumns } from './leads-columns'
import { useLeadFilterChips, useLeadFilters } from './leads-filters'
import { LEAD_FILTER_KEYS, STATE_TABS, stateTabOf, tabCount, tabPatch } from './leads-model'

/** Module 2 · Sổ lead — a list, not a workbench: a row opens `/sales/leads/:code`.
 *
 *  The layout every book follows lives in `components/book-page.tsx`; this file
 *  only hands it content. Cells and blocks live in `leads-parts.tsx`.
 *
 *  The book is server-side: `GET /sales/leads` returns one filtered, sorted page
 *  plus `total`, and every filter lives in the URL (`app/book-query.ts`) so F5, shared
 *  links and the back button keep it. Tab counts come from `facets.byState`;
 *  the pinned tab is the server's `pinned` filter, counted off `data/pins.ts`.
 *
 *  No ContextRail (law 10 debt): a chain built from a hard-coded anchor would
 *  describe a lead nobody picked. It returns once it can follow the chosen row. */

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

const SEARCH_PLACEHOLDER = 'Tìm theo tên công ty, người liên hệ, mã lead hoặc mã số thuế…'

export function LeadsPage() {
  const chrome = useAppChrome({ searchPlaceholder: SEARCH_PLACEHOLDER })
  const navigate = useNavigate()
  /* Hides rather than greys out — same call the create route's own gate makes
     (`routes.tsx`, `permission: 'lead.edit'`), so the button and the fence
     never disagree. Precedent: `campaigns.tsx`'s `canWrite`. */
  const canWrite = useCan('lead.edit')
  const canDisable = useCan('lead.disable')
  const meId = useSession((s) => s.actor?.id)

  /* The address is the source of truth; the hook owns patch, the debounced
     search box, the page reset and "clear all". `size` is the page size, kept off it. */
  const book = useBookQuery(LeadBookQuery, { size: BOOK_PAGE_SIZE, filterKeys: LEAD_FILTER_KEYS })
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

  /* Bảng tra mã → tên ĐÃ BỎ. Nó tồn tại vì dòng sổ chỉ chở một mã trần và màn
     phải tự đi tìm tên; nay `source.campaignName` về cùng dòng, nên không còn
     gì để tra. Cũng mất theo là cả một lớp lỗi: một nguồn vừa bị tắt không còn
     làm ô Nguồn của lead cũ thành "không rõ", vì tên nó đã ở trên dây rồi. */

  const pinCount = usePins('lead').codes.length

  const open = (code: string) => navigate(`/sales/leads/${code}`)
  const intent = useRowIntent(leadProfileQuery, () => import('@/pages/lead-detail'))

  const { pageIndex } = useBookPageClamp(book, bookPage?.total)

  const pinnedView = query.pinned === true
  /* Quick filter over the `owner` axis: pressed only while the book shows
     exactly the viewer's own leads, so a hand-picked owner list stays as is. */
  const mineOnly = meId !== undefined && query.owner === meId
  const disabledView = query.disabled === true
  const heldView = !disabledView && query.state === 'held'

  /* One read answers every tab — `byState` under the current search and source
     filter; `open` and `all` are sums the screen takes — and feeds the
     origin filter's choices. See `LeadFacets`. */
  /* Asked WITHOUT `disabled`, so the state tabs keep counting the live book
     while the switched-off view is on — and `LeadFacetsQuery.parse` takes the
     wire's 'true'/'false', not the boolean the URL parse already produced. */
  const { data: counts } = useQuery(leadFacetsQuery({ ...urlQuery, disabled: undefined }))
  const tabs = STATE_TABS.map((t) => ({
    value: t.key,
    label: t.label,
    count: tabCount(counts, t.key),
  }))
  const tabValue = stateTabOf(query.state)
  const onTab = (value: string) => patch(tabPatch(value, query.states))
  /* The switched-off view lists every state, and its action flips, so a
     selection never crosses its edge. */
  const onDisabledView = () => {
    clearSelection()
    patch(
      disabledView ? { disabled: undefined } : { disabled: true, state: 'all', pinned: undefined },
    )
  }

  const filters = useLeadFilters(query, patch, counts, tabValue)
  const canEmail = useCan('lead.send-email')
  const filterChips = useLeadFilterChips(query, patch, counts, rows)

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
  } = useBookSelection(rows)

  /* Ticked rows are read by code; the mail window looks further recipients up
     by typing. The page never holds the whole book. */
  const client = useQueryClient()
  const searchLeads = (text: string) =>
    client.fetchQuery(leadSearchQuery(text)).then((page) => page.rows)
  const { data: picked } = useQuery({
    ...leadsByCodesQuery([...selectedCodes]),
    enabled: selectedCodes.size > 0,
  })
  const selectedLeads = useMemo(
    () => (picked?.rows ?? []).filter((lead) => selectedCodes.has(lead.code)),
    [picked, selectedCodes],
  )
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

    toast(run.failure ?? `Đã thêm ${report.rows.length} lead`, {
      tone: run.failure ? 'danger' : 'success',
      detail: [
        report.attached &&
          report.attached.length > 0 &&
          `${report.attached.length} người gộp vào lead chung`,
        report.duplicates > 0 && `${report.duplicates} dòng đã có sẵn, không nạp`,
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

  const view = { heldView, disabledView }
  const table: BookTable = {
    pageSize: BOOK_PAGE_SIZE,
    /* The default order (`createdAt desc`) lights the entry-date arrow. */
    sort: query.sort === 'daysHere' ? undefined : { key: query.sort, dir: query.dir },
    onSort: (key) => {
      /* Only these two columns sort; any other key would die at the server's
         zod gate as a 400. */
      if (key !== 'company' && key !== 'createdAt') return
      patch(
        query.sort === key
          ? { dir: query.dir === 'asc' ? 'desc' : 'asc' }
          : { sort: key, dir: key === 'company' ? 'asc' : 'desc' },
      )
    },
    columns: leadColumns(view, filters, {
      checked: allPageSelected,
      indeterminate: pageSelected > 0 && !allPageSelected,
      onChange: selectPage,
    }),
    rows: rows.map((l) => ({
      id: l.code,
      state: selectedCodes.has(l.code) ? ('selected' as const) : undefined,
      onOpen: () => open(l.code),
      ...intent(l.code, (event) => paintSelection(l.code, event)),
      cells: leadCells(l, view, {
        selected: selectedCodes.has(l.code),
        onPress: (event) => beginDrag(l.code, event),
        onSelect: (on) => changeSelection(l.code, on),
        onEmail:
          canEmail && !disabledView
            ? () =>
                openMasMail({
                  recipients: [l],
                  searchRecipients: searchLeads,
                  initialCode: l.code,
                })
            : undefined,
      }),
    })),
  }

  /* A failed read says so and offers a retry, not "clear filters": the filters
     are not what broke. `userMessage` keeps the server's own words. */
  const failure = bookError
    ? {
        message: `Không tải được danh sách lead. ${
          isApiError(bookError) ? userMessage(bookError) : 'Thử lại.'
        }`,
        onRetry: () => void refetchBook(),
      }
    : undefined

  const empty =
    rows.length === 0
      ? pinnedView && pinCount === 0
        ? {
            message: 'Chưa ghim lead nào. Bấm biểu tượng ghim ở cuối dòng để thêm vào đây.',
            action: { label: 'Xem tất cả lead', onClick: clearFilters },
          }
        : dirty
          ? {
              message: 'Không có lead nào khớp bộ lọc.',
              action: { label: 'Bỏ hết bộ lọc', onClick: clearFilters },
            }
          : disabledView
            ? {
                message: 'Chưa có lead nào bị vô hiệu hoá.',
                action: { label: 'Tải lại', onClick: () => void refetchBook() },
              }
            : {
                message: 'Chưa có lead nào.',
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
                onSeeResult={clearFilters}
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
              value={tabValue}
              options={tabs}
              onChange={onTab}
            />
          }
          count={<BookCount total={total} noun="lead" hidden={bookPage?.hidden} />}
          filters={filterChips}
          onClearFilters={dirty ? clearFilters : undefined}
          tools={
            <>
              <BookSearch value={text} onChange={setText} placeholder={SEARCH_PLACEHOLDER} />
              {meId && (
                <BookQueueButton
                  icon={Contact}
                  label="Lead của tôi"
                  count={undefined}
                  active={mineOnly}
                  onPress={() => patch({ owner: mineOnly ? undefined : meId })}
                />
              )}
              <BookQueueButton
                icon={Pin}
                label="Đã ghim"
                count={undefined}
                active={pinnedView}
                onPress={() => patch({ pinned: pinnedView ? undefined : true })}
              />
              {canDisable && (
                <BookQueueButton
                  icon={EyeOff}
                  label="Đã vô hiệu"
                  count={undefined}
                  active={disabledView}
                  onPress={onDisabledView}
                />
              )}
            </>
          }
          pending={isPending}
          failure={failure}
          empty={empty}
          table={table}
          footer={
            <TableFooter page={pageIndex} pageSize={BOOK_PAGE_SIZE} total={total} onPage={onPage} />
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
                      ? ` · bỏ qua ${selectedCodes.size - selectedEmailCount} lead chưa có email`
                      : ''
                  }`
            }
            onClear={clearSelection}
            onSend={
              disabledView
                ? undefined
                : async () =>
                    openMasMail({
                      recipients: await client
                        .ensureQueryData(leadsByCodesQuery([...selectedCodes]))
                        .then((page) => page.rows),
                      searchRecipients: searchLeads,
                      initialCodes: [...selectedCodes],
                      onQueued: clearSelection,
                    })
            }
            actions={
              <>
                {!disabledView && (
                  <PinSelectionAction
                    subject="lead"
                    codes={[...selectedCodes]}
                    noun="lead"
                    onDone={clearSelection}
                  />
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
