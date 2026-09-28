import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  Chip,
  DataTable,
  Drawer,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  Plus,
  SearchField,
  Select,
  Skeleton,
  Trash2,
  Users,
} from '@pv/ui'
import type { LeadBookQuery, LeadBookResponse, LeadCategory, LeadTier } from '@pv/contracts'
import { LEAD_CATEGORIES, LEAD_TIERS } from '@pv/engines/fixtures/das-vina'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { useSelectionGesture } from '@/components/book-selection'
import { leadBookQuery } from '@/data/leads'
import { campaignMembersQuery, type useCampaignMembers } from '@/data/campaign-book'

/** Module 1 · the campaign AUDIENCE — ONE card holding who the letters go to,
 *  and a `Drawer` (same shape as `WaveDrawer`) that adds more from the lead
 *  book.
 *
 *  Locked 28/09: the member list and the candidate picker used to stand as
 *  two stacked blocks, the top one reading empty on a fresh campaign before
 *  anyone had picked a soul — confusing order for the first thing a new
 *  campaign asks of its owner. The add flow now opens over the list instead
 *  of sitting under it, so the card the owner came to read never moves. */

const CATEGORY_LABEL = new Map(LEAD_CATEGORIES.map((c) => [c.key, c.label]))
const TIER_LABEL = new Map(LEAD_TIERS.map((t) => [t.key, t.label]))

const AUDIENCE_PAGE_SIZE = 100

/** Same 300ms the lead and opportunity books use. The query object below IS the
 *  `queryKey`, so one keystroke would otherwise be one new key and one round
 *  trip: eight characters, eight requests, and the answer to the first seven
 *  arriving after the eighth. No address bar to keep in step here, so the letters
 *  stay in state (typing shows up at once) and only drip into the query. */
const SEARCH_DELAY_MS = 300

/** THE DRAWER'S CANDIDATE LIST, AND THE ROWS IT MUST NOT OFFER AGAIN.
 *
 *  `alreadyIn` is the audience as it stands. A lead already in the campaign has
 *  nothing left for this table to do with it: ticking it a second time posts an
 *  `add` the server answers with `added: 0`, and the reader — who is looking at
 *  that same name in the card behind this drawer — reasonably reads the repeat
 *  as the screen having lost track of what it already holds. */
function AudiencePicker({
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
  const [category, setCategory] = useState('')
  const [tier, setTier] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), SEARCH_DELAY_MS)
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
      ...(category === '' ? {} : { category: category as LeadCategory }),
      ...(tier === '' ? {} : { tier: tier as LeadTier }),
    }),
    [search, category, tier],
  )

  const { data, isPending } = useQuery(leadBookQuery(query))
  /* Filtered on the CLIENT: the server pages the lead book and knows nothing
     about this audience, so a page of 100 holding 3 members shows 97 rows. The
     sentence under the table owns up to it, or 97 reads as a miscount. */
  const page = data?.rows ?? []
  const rows = page.filter((l) => !alreadyIn.has(l.code))
  const alreadyOnPage = page.length - rows.length
  /* The DEBOUNCED word, not the live one: the table is answering `search`, so
     reading `text` would flip this 300ms early and tell a reader mid-clear that
     the whole book is empty. */
  const filtered = search !== '' || category !== '' || tier !== ''
  const clearFilters = () => {
    setText('')
    setCategory('')
    setTier('')
  }

  const { toggleSelection, beginDrag, paintSelection, changeSelection } = useSelectionGesture(
    selected,
    onSetOne,
  )

  return (
    <div className="flex flex-col gap-3">
      <PickerToolbar
        text={text}
        setText={setText}
        category={category}
        setCategory={setCategory}
        tier={tier}
        setTier={setTier}
        visible={rows.length}
        onSelectAll={() =>
          onSetMany(
            rows.map((r) => r.code),
            true,
          )
        }
      />

      <PickerTable
        pending={isPending}
        rows={rows}
        alreadyOnPage={alreadyOnPage}
        filtered={filtered}
        onClearFilters={clearFilters}
        selected={selected}
        onSetOne={changeSelection}
        onActivate={toggleSelection}
        onBeginDrag={beginDrag}
        onPaint={paintSelection}
      />
      <p className="text-muted-foreground text-[11px]">
        Hiện tới {AUDIENCE_PAGE_SIZE} lead khớp lọc, mới nhất trước
        {alreadyOnPage > 0 ? `, bỏ ${alreadyOnPage} lead đã có trong danh sách người nhận` : ''}.
        Bấm từng dòng để chọn — chạm cũng vậy. Riêng với chuột, giữ nút trái rồi rê qua nhiều dòng
        để bôi đen hàng loạt.
      </p>
    </div>
  )
}

/** The picker's filter row. Lifted out of `AudiencePicker` on 20/09 to bring
 *  that function back under the 150-line cap — the state it reads still lives
 *  one level up, because the query is built there. */
function PickerToolbar({
  text,
  setText,
  category,
  setCategory,
  tier,
  setTier,
  visible,
  onSelectAll,
}: {
  text: string
  setText: (v: string) => void
  category: string
  setCategory: (v: string) => void
  tier: string
  setTier: (v: string) => void
  /** Rows the table is drawing right now — what "select all showing" means. */
  visible: number
  onSelectAll: () => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:items-center">
      <SearchField
        size="topbar"
        placeholder="Tìm theo công ty, người liên hệ hoặc mã lead…"
        value={text}
        onChange={setText}
        className="w-full sm:col-span-2"
      />
      <Select
        label="Ngành"
        value={category}
        onChange={setCategory}
        options={[
          { value: '', label: 'Mọi ngành' },
          ...LEAD_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
        ]}
      />
      <Select
        label="Bậc"
        value={tier}
        onChange={setTier}
        options={[
          { value: '', label: 'Mọi bậc' },
          ...LEAD_TIERS.map((t) => ({ value: t.key, label: t.label })),
        ]}
      />
      <Button
        size="md"
        variant="ghost"
        onClick={onSelectAll}
        disabled={visible === 0}
        className="pointer-coarse:h-12 w-full sm:col-span-2"
      >
        Chọn tất cả {visible} đang hiện
      </Button>
    </div>
  )
}

/** The picker's rows. Same lift, same reason as `PickerToolbar`: every handler
 *  it takes is owned by `AudiencePicker`, which is where the drag state lives. */
function PickerTable({
  pending,
  rows,
  alreadyOnPage,
  filtered,
  onClearFilters,
  selected,
  onSetOne,
  onActivate,
  onBeginDrag,
  onPaint,
}: {
  pending: boolean
  rows: LeadBookResponse['rows']
  alreadyOnPage: number
  filtered: boolean
  onClearFilters: () => void
  selected: ReadonlySet<string>
  onSetOne: (code: string, on: boolean) => void
  onActivate: (code: string) => void
  onBeginDrag: (code: string, event: ReactPointerEvent<HTMLDivElement>) => void
  onPaint: (code: string, event: ReactPointerEvent<HTMLDivElement>) => void
}) {
  return (
    <GlassCard variant="b" className="max-h-[50vh] select-none overflow-y-auto px-4 py-3 lg:px-5">
      {pending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message={
            alreadyOnPage > 0
              ? 'Mọi lead khớp bộ lọc đều đã có trong danh sách người nhận rồi.'
              : filtered
                ? 'Không có lead nào khớp bộ lọc đang chọn.'
                : 'Sổ lead đang mở (trạng thái ĐANG CHẠY) hiện chưa có dòng nào.'
          }
          action={{ label: 'Bỏ hết bộ lọc', onClick: onClearFilters }}
          className="py-8"
        />
      ) : (
        <DataTable
          columns={[
            { header: 'Chọn', width: '48px' },
            { header: 'Mã', width: '0.8fr' },
            { header: 'Account', width: '1.7fr' },
            { header: 'Người liên hệ', width: '1.4fr' },
            { header: 'Ngành · Bậc', width: '1.2fr' },
          ]}
          rows={rows.map((l) => ({
            id: l.code,
            state: selected.has(l.code) ? ('selected' as const) : undefined,
            onOpen: () => onActivate(l.code),
            onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => onBeginDrag(l.code, event),
            onPointerEnter: (event: ReactPointerEvent<HTMLDivElement>) => onPaint(l.code, event),
            cells: [
              <span
                key="chk"
                className="flex w-full justify-center"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selected.has(l.code)}
                  onChange={(on) => onSetOne(l.code, on)}
                  label={<span className="sr-only">Chọn {l.company}</span>}
                  className="w-full justify-center gap-0 p-0"
                />
              </span>,
              <Chip key="c">{l.code}</Chip>,
              <span key="n" className="block truncate" title={l.company}>
                {l.company}
              </span>,
              <span key="ct" className="block truncate">
                {l.contactName}
              </span>,
              <span key="cat" className="text-muted-foreground">
                {l.category ? (CATEGORY_LABEL.get(l.category) ?? l.category) : '—'} ·{' '}
                {l.tier ? (TIER_LABEL.get(l.tier) ?? l.tier) : '—'}
              </span>,
            ],
          }))}
        />
      )}
    </GlassCard>
  )
}

/** THE ADD-RECIPIENTS DRAWER — the only door in this module that writes.
 *
 *  Selection resets to empty every time it opens (`AudienceTab` clears it in
 *  the same click that opens the drawer): a stale tick from three opens ago
 *  reads as the screen having picked something the owner never touched. */
function AudienceDrawer({
  open,
  onClose,
  selected,
  onSetOne,
  onSetMany,
  alreadyIn,
  onSubmit,
  pending,
}: {
  open: boolean
  onClose: () => void
  selected: ReadonlySet<string>
  onSetOne: (code: string, on: boolean) => void
  onSetMany: (codes: string[], on: boolean) => void
  alreadyIn: ReadonlySet<string>
  onSubmit: () => void
  pending: boolean
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Thêm người nhận"
      subtitle="Chỉ hiện lead chưa có trong danh sách của chiến dịch."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="text-[13px] font-medium">Đã chọn {selected.size}</span>
          <div className="flex gap-2">
            <Button size="lg" variant="ghost" onClick={onClose} disabled={pending}>
              Huỷ
            </Button>
            <Button size="lg" onClick={onSubmit} disabled={selected.size === 0 || pending}>
              {pending ? 'Đang thêm…' : `Thêm ${selected.size} người`}
            </Button>
          </div>
        </div>
      }
    >
      <AudiencePicker
        selected={selected}
        onSetOne={onSetOne}
        onSetMany={onSetMany}
        alreadyIn={alreadyIn}
      />
    </Drawer>
  )
}

/** WHO IS ALREADY IN — one `.glass-b` card: a toolbar, the table, and the door
 *  to take somebody out. The toolbar's search runs on the rows already loaded
 *  here (cheap: this door loads the whole audience up to `MAS_MAX_RECIPIENTS`
 *  in one page); the industry and tier selects stay OUT of it because
 *  `CampaignMemberRow` carries neither field, only the lead book behind the
 *  drawer does.
 *
 *  It no longer counts missing addresses. That count used to live here because
 *  the only preflight ran scoped and so lied about a campaign holding somebody
 *  else's leads; `POST /sales/campaigns/:code/preflight` reads unscoped, the
 *  way the send does, and `WavePreflight` in the fire dialog says it once for
 *  the WHOLE audience. Counting a second time over one loaded page produced a
 *  smaller number one tab away from the right one. */
function MemberCard({
  code,
  members,
  canEdit,
  onAdd,
}: {
  code: string
  members: ReturnType<typeof useCampaignMembers>
  canEdit: boolean
  onAdd: () => void
}) {
  const { data, isPending, refetch } = useQuery(campaignMembersQuery(code))
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const [search, setSearch] = useState('')

  const term = search.trim().toLowerCase()
  const visible =
    term === ''
      ? rows
      : rows.filter((m) =>
          [m.leadCode, m.company, m.contactName, m.email ?? ''].some((v) =>
            v.toLowerCase().includes(term),
          ),
        )

  const removeOne = (leadCode: string) =>
    members.mutate(
      { remove: [leadCode] },
      {
        onSuccess: (res) =>
          toast('Đã gỡ khỏi danh sách người nhận', {
            tone: 'success',
            detail: `Danh sách người nhận nay có ${res.audienceCount} người.`,
          }),
        onError: (err) =>
          toast('Không gỡ được người nhận', {
            tone: 'danger',
            detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
          }),
      },
    )

  return (
    <div className="flex flex-col gap-2">
      <GlassCard variant="b" className="flex flex-col gap-3 p-0">
        <div className="flex flex-wrap items-center gap-3 px-4 pt-4 lg:px-5">
          <SearchField
            size="topbar"
            placeholder="Tìm theo công ty, người liên hệ hoặc mã lead…"
            value={search}
            onChange={setSearch}
            className="min-w-[240px] flex-1"
          />
          {canEdit && (
            <Button size="md" onClick={onAdd} className="pointer-coarse:h-12">
              <Icon icon={Plus} size={16} />
              Thêm người nhận
            </Button>
          )}
        </div>

        {/* `overflow-x-auto` with a floor: without it `DataTable` clips (it is
            `overflow-x-hidden`), and on a phone the email column — the whole
            reason this list exists — truncates to nothing. */}
        <div className="max-h-[50vh] overflow-x-auto overflow-y-auto px-4 pb-4 lg:px-5">
          <div className="min-w-[720px]">
            {isPending ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : total === 0 ? (
              <EmptyState
                icon={Users}
                message="Danh sách người nhận còn rỗng."
                action={
                  canEdit
                    ? { label: 'Thêm người nhận', onClick: onAdd }
                    : { label: 'Tải lại', onClick: () => void refetch() }
                }
                className="py-8"
              />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={Inbox}
                message="Không có người nhận nào khớp tìm kiếm."
                action={{ label: 'Xoá tìm kiếm', onClick: () => setSearch('') }}
                className="py-8"
              />
            ) : (
              <DataTable
                columns={[
                  { header: 'Mã', width: '0.8fr' },
                  { header: 'Account', width: '1.7fr' },
                  { header: 'Người liên hệ', width: '1.3fr' },
                  { header: 'Email', width: '1.6fr' },
                  { header: 'Gỡ', width: '96px', align: 'right' },
                ]}
                rows={visible.map((m) => ({
                  id: m.leadCode,
                  cells: [
                    <Chip key="c">{m.leadCode}</Chip>,
                    <span key="n" className="block truncate" title={m.company}>
                      {m.company}
                    </span>,
                    <span key="ct" className="block truncate">
                      {m.contactName}
                    </span>,
                    m.email ? (
                      <span key="e" className="block truncate" title={m.email}>
                        {m.email}
                      </span>
                    ) : (
                      <span key="e" className="text-warning">
                        Chưa có email
                      </span>
                    ),
                    canEdit ? (
                      <Button
                        key="rm"
                        size="sm"
                        variant="ghost"
                        className="pointer-coarse:h-12"
                        onClick={() => removeOne(m.leadCode)}
                        disabled={members.isPending}
                      >
                        <Icon icon={Trash2} size={14} />
                        Gỡ
                      </Button>
                    ) : (
                      <span key="rm" className="text-muted-foreground">
                        —
                      </span>
                    ),
                  ],
                }))}
              />
            )}
          </div>
        </div>
      </GlassCard>

      {rows.length < total && (
        <p className="text-muted-foreground text-[12px]">
          Đang hiện {rows.length} trên {total} người trong danh sách — {total - rows.length} dòng
          còn lại chưa nạp ở màn này.
        </p>
      )}
    </div>
  )
}

export function AudienceTab({
  code,
  members,
  canEdit,
}: {
  code: string
  members: ReturnType<typeof useCampaignMembers>
  canEdit: boolean
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())

  /* A fresh sheet every time it opens — see `AudienceDrawer`'s docblock for why
     stale ticks from an earlier visit must not survive to this one. */
  const openDrawer = () => {
    setSelected(new Set())
    setDrawerOpen(true)
  }

  const setOne = (leadCode: string, on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (on) next.add(leadCode)
      else next.delete(leadCode)
      return next
    })
  const setMany = (codes: string[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur)
      for (const c of codes) {
        if (on) next.add(c)
        else next.delete(c)
      }
      return next
    })

  /* The SAME query `MemberCard` below is drawing — one key, one trip, no second
     definition of "already in" able to disagree with the list on screen. */
  const { data: audience } = useQuery(campaignMembersQuery(code))
  const alreadyIn = useMemo(
    () => new Set((audience?.rows ?? []).map((m) => m.leadCode)),
    [audience],
  )

  const submit = () => {
    if (selected.size === 0) return
    members.mutate(
      { add: [...selected] },
      {
        onSuccess: (res) => {
          toast(`Danh sách người nhận nay có ${res.audienceCount} người`, {
            tone: 'success',
            detail: `Đã thêm ${res.added} lead.`,
          })
          setSelected(new Set())
          setDrawerOpen(false)
        },
        onError: (err) =>
          toast('Không thêm được người nhận', {
            tone: 'danger',
            detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
          }),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <MemberCard code={code} members={members} canEdit={canEdit} onAdd={openDrawer} />

      {/* No drawer at all for a reader who cannot write it — the button that
          opens it is already hidden on the card above, so there is nothing
          left in here for a read-only role to reach. */}
      {canEdit && (
        <AudienceDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          selected={selected}
          onSetOne={setOne}
          onSetMany={setMany}
          alreadyIn={alreadyIn}
          onSubmit={submit}
          pending={members.isPending}
        />
      )}
    </div>
  )
}
