import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Chip,
  ColumnFilter,
  ColumnFilterList,
  DataTable,
  Drawer,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  Plus,
  SearchField,
  Skeleton,
  Trash2,
  Users,
} from '@pv/ui'
import type { CampaignMemberRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { listField, useClientBookFilter } from '@/app/client-book-filter'
import { toast } from '@/app/toast'
import { ROW_ICON } from '@/components/table-bits'
import { campaignMembersQuery, type useCampaignMembers } from '@/data/campaign-book'
import { AudiencePicker } from './campaign-audience-picker'

/** Module 1 · the campaign AUDIENCE — ONE card holding who the letters go to,
 *  and a `Drawer` (same shape as `WaveDrawer`) that adds more from the lead
 *  book.
 *
 *  Locked 28/09: the member list and the candidate picker used to stand as
 *  two stacked blocks, the top one reading empty on a fresh campaign before
 *  anyone had picked a soul — confusing order for the first thing a new
 *  campaign asks of its owner. The add flow now opens over the list instead
 *  of sitting under it, so the card the owner came to read never moves. */

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
        <div className="flex justify-end gap-2">
          <Button size="lg" variant="ghost" onClick={onClose} disabled={pending}>
            Huỷ
          </Button>
          <Button size="lg" onClick={onSubmit} disabled={selected.size === 0 || pending}>
            {pending ? 'Đang thêm…' : `Thêm ${selected.size} người`}
          </Button>
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

/** The member list's address keys — module level, as `useClientBookFilter`
 *  asks. `email` holds `present` / `missing`, either or both. */
const MEMBER_FILTERS = { email: listField() }
const EMAIL_PRESENT = 'present'
const EMAIL_MISSING = 'missing'

const memberMatches = (m: CampaignMemberRow, term: string) =>
  [m.leadCode, m.company, m.contactName, m.email ?? ''].some((v) => v.toLowerCase().includes(term))

/** WHO IS ALREADY IN — one `.glass-b` card: a toolbar, the table, and the door
 *  to take somebody out. Search and the email filter run on the rows already
 *  loaded here (cheap: this door loads the whole audience up to
 *  `MAS_MAX_RECIPIENTS` in one page) and live in the address, unlike the
 *  drawer's: this card IS the tab, so F5 and a shared link keep the narrowing.
 *  No industry or tier filter: `CampaignMemberRow` carries neither field.
 *
 *  It no longer counts missing addresses as a warning: `WavePreflight` in the
 *  fire dialog says it once for the WHOLE audience, read unscoped the way the
 *  send does. The filter's tallies count this loaded page and say nothing more. */
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
  const { filters, text, setText, patch, clear, dirty } = useClientBookFilter(MEMBER_FILTERS)

  const term = filters.q.toLowerCase()
  const searched = term === '' ? rows : rows.filter((m) => memberMatches(m, term))
  const withEmail = searched.filter((m) => m.email).length
  const visible =
    filters.email.length === 0
      ? searched
      : searched.filter((m) => filters.email.includes(m.email ? EMAIL_PRESENT : EMAIL_MISSING))

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

  const emailFilter = (
    <ColumnFilter label="Email" active={filters.email.length > 0}>
      {(close) => (
        <ColumnFilterList
          searchable={false}
          options={[
            { value: EMAIL_PRESENT, label: `Có email · ${withEmail}` },
            { value: EMAIL_MISSING, label: `Chưa có email · ${searched.length - withEmail}` },
          ]}
          selected={filters.email}
          close={close}
          onApply={(email) => patch({ email })}
        />
      )}
    </ColumnFilter>
  )

  return (
    <div className="flex flex-col gap-2">
      <GlassCard variant="b" className="flex flex-col p-0">
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <SearchField
            placeholder="Tìm theo công ty, người liên hệ hoặc mã lead…"
            value={text}
            onChange={setText}
            className="min-w-0 flex-1 sm:max-w-[320px]"
          />
          {dirty && (
            <Button size="md" variant="ghost" onClick={clear} className="pointer-coarse:h-12">
              Bỏ hết bộ lọc
            </Button>
          )}
          {canEdit && (
            <Button size="md" onClick={onAdd} className="pointer-coarse:h-12 ml-auto">
              <Icon icon={Plus} size={16} />
              Thêm người nhận
            </Button>
          )}
        </div>

        {/* `overflow-auto` with a floor: without it `DataTable` clips (it is
            `overflow-x-hidden`), and on a phone the email column — the whole
            reason this list exists — truncates to nothing. */}
        <div className="max-h-[50vh] overflow-auto">
          {isPending ? (
            <div className="flex flex-col gap-3 p-5">
              <Skeleton height={48} />
              <Skeleton height={48} delay={200} />
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
              message="Không có người nhận nào khớp bộ lọc hiện tại."
              action={{ label: 'Bỏ hết bộ lọc', onClick: clear }}
              className="py-8"
            />
          ) : (
            <MemberTable
              rows={visible}
              emailHeader={emailFilter}
              onRemove={canEdit ? removeOne : undefined}
              removing={members.isPending}
            />
          )}
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

/** The member rows. `onRemove` absent = a reader who cannot write, and then
 *  no remove column at all: a column of dashes says nothing. */
function MemberTable({
  rows,
  emailHeader,
  onRemove,
  removing,
}: {
  rows: CampaignMemberRow[]
  emailHeader: ReactNode
  onRemove?: (leadCode: string) => void
  removing: boolean
}) {
  return (
    <DataTable
      flush
      className="min-w-[720px]"
      columns={[
        { header: 'Mã', width: 'minmax(0,0.8fr)' },
        { header: 'Công ty', width: 'minmax(0,1.7fr)' },
        { header: 'Người liên hệ', width: 'minmax(0,1.3fr)' },
        { header: emailHeader, width: 'minmax(0,1.6fr)' },
        ...(onRemove
          ? [
              {
                header: <span className="sr-only">Gỡ</span>,
                width: '48px',
                align: 'center' as const,
              },
            ]
          : []),
      ]}
      rows={rows.map((m) => ({
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
          ...(onRemove
            ? [
                <Button
                  key="rm"
                  size="sm"
                  variant="ghost"
                  aria-label={`Gỡ ${m.company} khỏi danh sách người nhận`}
                  title="Gỡ khỏi danh sách người nhận"
                  className={ROW_ICON}
                  onClick={() => onRemove(m.leadCode)}
                  disabled={removing}
                >
                  <Icon icon={Trash2} size={16} />
                </Button>,
              ]
            : []),
        ],
      }))}
    />
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
  /* Stable identity: the Drawer re-focuses its panel whenever `onClose` changes. */
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

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
          onClose={closeDrawer}
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
