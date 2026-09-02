import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Inbox, TriangleAlert, X } from '@pv/ui'
import { Badge, Button, Chip, Drawer, EmptyState, Icon, SearchField, Skeleton, cn } from '@pv/ui'
import type { LeadRow, LeadTier, OpportunityCreateResponse } from '@pv/contracts'
import { LEAD_TIERS } from '@pv/engines/fixtures/das-vina'
import { isApiError, userMessage } from '@/app/api'
import { DEFAULT_LEAD_BOOK_QUERY } from '@/app/url'
import { leadProfileQuery } from '@/data/lead-profile'
import { leadBookQuery } from '@/data/leads'
import { opportunitiesOfLeadQuery } from '@/data/opportunities'
import { ConvertDialog } from './convert-dialog'

/** Module 3 · one opportunity typed by hand, opened from the opportunity book.
 *
 *  ------------------------------------------------------------------
 *  TWO STEPS, BECAUSE THE FORM CANNOT EXIST BEFORE THE LEAD DOES
 *  ------------------------------------------------------------------
 *  `POST /sales/opportunities` requires a `leadCode` and the column carries a
 *  foreign key, so a blank ticket is not a shape this door accepts. The lead
 *  profile is also what seeds the fourteen cells (`draftOpportunity`) — pick
 *  the lead first and the form opens most of the way filled in; a form that
 *  asked for the lead last would have nothing to seed from.
 *
 *  So step two is `ConvertDialog` ITSELF, unchanged. The lead profile has been
 *  opening that same panel since day one; a second copy of the fourteen cells
 *  here is a second place they drift apart.
 *
 *  ------------------------------------------------------------------
 *  WHY THE ROWS ASK ABOUT LIVE DEALS ONE BY ONE
 *  ------------------------------------------------------------------
 *  One lead may hold one live deal, and the server refuses the second inside
 *  the write transaction (`OpportunityService.create`). Finding that out AFTER
 *  the form is filled in is a 409 landing on fourteen typed cells, so the
 *  picker asks first — per row, because `live-deal` takes one code and the
 *  book cannot answer instead: its scope axis hides other people's deals from
 *  a Sale, which is the exact case this check exists to catch. */

/** Rows the picker draws. Deliberately short: this list is for confirming the
 *  lead you already have in mind, and the search box above it is how you get
 *  there — not scrolling. */
const PICK_SIZE = 8

/** Same beat as the two books: type at full speed, ask the server once. */
const SEARCH_DELAY_MS = 300

/** `LeadBookQuery.q` is `.max(120)`. Cut here rather than let the extra
 *  characters ride: the server answers a longer one with a 400, which this
 *  panel can only render as "the lead book could not be fetched" — a sentence
 *  about the server, for something the person typed. Cutting silently is right
 *  for a search box: the 121st character of a company name narrows nothing. */
const SEARCH_MAX = 120

const TIER_LABEL = new Map(LEAD_TIERS.map((t) => [t.key, t.label]))
const TIER_TONE: Record<LeadTier, 'draft' | 'running' | 'success'> = {
  'dau-moi': 'draft',
  mql: 'running',
  sql: 'success',
}

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (row: OpportunityCreateResponse) => void
}

export function OpportunityCreateDialog({ open, onClose, onCreated }: Props) {
  const [picked, setPicked] = useState<LeadRow | null>(null)
  const [wasOpen, setWasOpen] = useState(open)

  /* Cleared on the way IN, not on the way out. Dropping the lead the moment
     `open` goes false unmounts the panel mid-slide, and `Drawer` runs its exit
     animation only while it is still mounted. Adjusted during render rather
     than in an effect so a reopened panel never flashes step two for one frame
     before the effect catches up. */
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setPicked(null)
  }

  return picked === null ? (
    <LeadPicker open={open} onClose={onClose} onPick={setPicked} />
  ) : (
    <ConvertStep lead={picked} open={open} onClose={onClose} onCreated={onCreated} />
  )
}

// ---------------------------------------------------------------------------

/** Step one — which lead this deal comes out of. */
function LeadPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (lead: LeadRow) => void
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

  /* `enabled` because this panel stays mounted while closed, for the exit
     animation — without it every visit to the book fires a lead query nobody
     asked for, and eight live-deal reads behind it. `status` keeps its default
     `running`: a lead that has left the book is not a deal waiting to open. */
  const { data, isPending, error, refetch } = useQuery({
    ...leadBookQuery({ ...DEFAULT_LEAD_BOOK_QUERY, q, size: PICK_SIZE }),
    enabled: open,
  })

  const rows = data?.rows ?? []
  const total = data?.total ?? 0

  return (
    <Drawer
      open={open}
      onClose={onClose}
      /* `lg`, the width step two uses. Picking a lead swaps one panel for the
         other with no animation in between, so a narrower step one would read
         as the panel jerking wider rather than as one form moving on. */
      width="lg"
      title="Tạo cơ hội"
      subtitle="Một cơ hội mọc ra từ một lead. Chọn lead trước — phiếu điền mở ngay sau, đã mồi sẵn tên, tiền và người bán của khách đó."
      footer={
        <div className="flex justify-end">
          <Button size="md" variant="ghost" onClick={onClose}>
            <Icon icon={X} size={16} />
            Huỷ
          </Button>
        </div>
      }
    >
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
                ? { label: 'Đóng', onClick: onClose }
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
            {/* The list is CUT SHORT, and says so. Left unsaid, eight rows read
                as the whole book, and somebody who cannot see their customer
                concludes it is not in the book rather than typing one more
                letter into the search box. */}
            <p className="text-muted-foreground text-[11px] leading-[1.5]">
              Hiện <span className="tnum font-num">{rows.length}</span> trên{' '}
              <span className="tnum font-num">{total}</span> lead đang chạy. Gõ vào ô tìm để thu
              hẹp.
            </p>
          </>
        )}
      </div>
    </Drawer>
  )
}

/** One line of the picker — and the answer to "does this customer already hold
 *  a deal". */
function LeadPickRow({ lead, onPick }: { lead: LeadRow; onPick: () => void }) {
  const { data: live, isError } = useQuery(opportunitiesOfLeadQuery(lead.code))

  const openDeal = live?.[0]?.code
  /* `undefined` is "still reading", and it is NOT the empty array that means
     "no live deal" — see the `select` of `opportunitiesOfLeadQuery`. The row
     stays shut until the difference is known, because opening the form on a
     lead that already holds a deal spends fourteen cells to earn a 409.

     A FAILED read is a third answer, and it must not read as the second one:
     `data` is `undefined` there too, so treating it as "still checking" locks
     every row of the list for good, under a tooltip that says a wait is in
     progress when nothing is waiting. The row opens instead — the fence that
     matters is the one inside the write transaction, and it is still up. */
  const checking = live === undefined && !isError
  const blocked = checking || openDeal !== undefined

  return (
    <button
      type="button"
      disabled={blocked}
      onClick={onPick}
      title={
        openDeal !== undefined
          ? `Đã có cơ hội ${openDeal} đang mở — đóng đơn đó trước khi mở đơn mới.`
          : checking
            ? 'Đang kiểm tra khách này đã có đơn nào chưa…'
            : undefined
      }
      className={cn(
        'motion-std flex w-full items-center gap-3 rounded-md px-3 py-2 text-left',
        blocked ? 'bg-white/4 opacity-60' : 'bg-white/9 hover:bg-white/16',
      )}
    >
      <Chip>{lead.code}</Chip>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{lead.company}</span>
      {openDeal !== undefined ? (
        <Badge tone="warning">Đã có {openDeal}</Badge>
      ) : (
        lead.tier !== undefined && (
          <Badge tone={TIER_TONE[lead.tier]}>{TIER_LABEL.get(lead.tier)}</Badge>
        )
      )}
    </button>
  )
}

/** Step two — the lead's profile, then the panel that has always filled this
 *  form in. The profile is a second read because `ConvertDialog` seeds from a
 *  `LeadProfile` and a book row is not one; `profileForm` is the only
 *  translation into the form's shape, and it takes the profile. */
function ConvertStep({
  lead,
  open,
  onClose,
  onCreated,
}: {
  lead: LeadRow
  open: boolean
  onClose: () => void
  onCreated: (row: OpportunityCreateResponse) => void
}) {
  const { data: profile, error, refetch } = useQuery(leadProfileQuery(lead.code))

  if (profile !== undefined) {
    return <ConvertDialog profile={profile} open={open} onClose={onClose} onCreated={onCreated} />
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Đổi lead thành cơ hội"
      subtitle={
        <>
          <span className="font-mono">{lead.code}</span> · {lead.company}
        </>
      }
      footer={
        <div className="flex justify-end">
          <Button size="md" variant="ghost" onClick={onClose}>
            <Icon icon={X} size={16} />
            Huỷ
          </Button>
        </div>
      }
    >
      {error ? (
        <EmptyState
          icon={TriangleAlert}
          message={`Không mở được hồ sơ lead ${lead.code}. ${
            isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
          }`}
          action={{ label: 'Thử lại', onClick: () => void refetch() }}
          className="py-12"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
    </Drawer>
  )
}
