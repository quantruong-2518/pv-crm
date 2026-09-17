import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Inbox, TriangleAlert } from '@pv/ui'
import { Badge, Chip, EmptyState, SearchField, Skeleton } from '@pv/ui'
import type { LeadRow, LeadTier } from '@pv/contracts'
import { LEAD_TIERS } from '@pv/engines/fixtures/das-vina'
import { isApiError, userMessage } from '@/app/api'
import { DEFAULT_LEAD_BOOK_QUERY } from '@/app/url'
import { leadBookQuery } from '@/data/leads'
import { opportunitiesOfLeadQuery } from '@/data/opportunities'

/** WHICH LEAD this deal comes out of — a search box and a short list.
 *
 *  Its own file since 17/09 because two doors ask the question: the drawer
 *  opened from the deal book, and `/sales/opportunities/new` reached without
 *  `?lead=`. `POST /sales/opportunities` requires a `leadCode` and the form is
 *  seeded from the lead profile, so neither door can open the form first.
 *
 *  The rows show existing open deals, and that is INFORMATION rather than a
 *  gate: a lead may hold several at once and opening one more is never refused
 *  for that reason. It asks per row rather than through the book because the
 *  book's scope axis would hide a colleague's deal from a Sale. */

/** Rows drawn at once. Deliberately short: this list is for confirming the
 *  lead already in mind, and the search box is how you get there. */
const PICK_SIZE = 8

/** Same beat as the two books: type at full speed, ask the server once. */
const SEARCH_DELAY_MS = 300

/** `LeadBookQuery.q` is `.max(120)`. Cut here rather than let the extra
 *  characters ride: a longer one earns a 400 the panel can only render as "the
 *  lead book could not be fetched" — a sentence about the server, for
 *  something the person typed. */
const SEARCH_MAX = 120

const TIER_LABEL = new Map(LEAD_TIERS.map((t) => [t.key, t.label]))
const TIER_TONE: Record<LeadTier, 'draft' | 'running' | 'success'> = {
  prospect: 'draft',
  mql: 'running',
  sql: 'success',
}

export function LeadPickList({
  /** Live only while the panel holding it is open — the drawer stays mounted
   *  while closed for its exit animation, and without this every visit to the
   *  book fires a lead query nobody asked for. */
  enabled = true,
  onPick,
  onGiveUp,
}: {
  enabled?: boolean
  onPick: (lead: LeadRow) => void
  /** Where "there is nothing here" leads. */
  onGiveUp: () => void
}) {
  const [text, setText] = useState('')
  const [q, setQ] = useState<string | undefined>(undefined)

  useEffect(() => {
    const typed = text.trim().slice(0, SEARCH_MAX)
    const wanted = typed === '' ? undefined : typed
    if (wanted === q) return
    const timer = setTimeout(() => setQ(wanted), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text, q])

  const { data, isPending, error, refetch } = useQuery({
    ...leadBookQuery({ ...DEFAULT_LEAD_BOOK_QUERY, q, size: PICK_SIZE }),
    enabled,
  })

  const rows = data?.rows ?? []
  const total = data?.total ?? 0

  return (
    <div className="flex flex-col gap-4">
      <SearchField
        size="page"
        placeholder="Tìm theo tên công ty hoặc mã lead…"
        value={text}
        onChange={setText}
        className="w-full"
      />

      {error ? (
        <EmptyState
          icon={TriangleAlert}
          message={`Không lấy được sổ lead. ${
            isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
          }`}
          action={{ label: 'Thử lại', onClick: () => void refetch() }}
          className="py-12"
        />
      ) : isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message={
            q === undefined
              ? 'Sổ lead chưa có dòng nào đang chạy — chưa có khách nào để mở đơn.'
              : `Không có lead nào khớp "${q}".`
          }
          action={
            q === undefined
              ? { label: 'Đóng', onClick: onGiveUp }
              : { label: 'Xoá ô tìm', onClick: () => setText('') }
          }
          className="py-12"
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {rows.map((lead) => (
              <LeadPickRow key={lead.code} lead={lead} onPick={() => onPick(lead)} />
            ))}
          </div>
          {/* The list is CUT SHORT, and says so: left unsaid, eight rows read
              as the whole book, and somebody who cannot see their customer
              stops looking instead of narrowing the search. */}
          <p className="text-muted-foreground text-[11px] leading-[1.5]">
            Hiện <span className="tnum font-num">{rows.length}</span> trên{' '}
            <span className="tnum font-num">{total}</span> lead đang chạy. Gõ vào ô tìm để thu hẹp.
          </p>
        </>
      )}
    </div>
  )
}

/** One line of the picker — and, when the lead already holds one or more open
 *  deals, information about how many. */
function LeadPickRow({ lead, onPick }: { lead: LeadRow; onPick: () => void }) {
  const { data: live } = useQuery(opportunitiesOfLeadQuery(lead.code))
  const openCount = (live?.codes.length ?? 0) + (live?.hidden ?? 0)

  return (
    <button
      type="button"
      onClick={onPick}
      className="motion-std bg-surface-ink/9 hover:bg-surface-ink/16 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left"
    >
      <Chip>{lead.code}</Chip>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{lead.company}</span>
      {openCount > 0 ? (
        <Badge tone="warning" className="text-on-tint-warning-strong">
          Đang mở · {openCount} cơ hội
        </Badge>
      ) : (
        lead.tier !== undefined && (
          <Badge tone={TIER_TONE[lead.tier]}>{TIER_LABEL.get(lead.tier)}</Badge>
        )
      )}
    </button>
  )
}
