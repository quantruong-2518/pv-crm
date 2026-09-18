import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Badge,
  CalendarCheck,
  CalendarDays,
  FileCheck,
  Icon,
  Pin,
  StatCard,
  Target,
  UserRoundPlus,
  Users,
  cn,
  percent,
} from '@pv/ui'
import { sourceKindLabel, type LeadRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { toast } from '@/app/toast'
import { AssignMenu } from '@/components/assign-menu'
import { PicCell } from '@/components/table-bits'
import { NO_OWNER_TITLE, leadScorecardQuery } from '@/data/leads'
import { useSetLeadOwner } from '@/data/lead-owner'
import { LEAD_STATE_FACE } from '@/data/lead-state'

/** Module 2 · the cells and blocks of the lead book, split from `leads.tsx` so
 *  the screen file stays the layout: header, score strip, one list card.
 *
 *  Every cell here reads one `LeadRow` and nothing else — no lookup tables, no
 *  fixture-generated names. Where the row has nothing (no contact title, no
 *  campaign) the cell prints less rather than inventing a value. */

/** The header's period, as text rather than a button: the scorecard endpoint
 *  takes no date range yet, and a picker that changes nothing is a lie. */
export function PeriodLabel({ from, to }: { from: string; to: string }) {
  return (
    <span className="text-muted-foreground flex h-10 items-center gap-2 px-2 text-[12.5px] max-sm:hidden">
      <Icon icon={CalendarDays} size={16} />
      <span className="tnum text-foreground font-medium">
        {from} – {to}
      </span>
    </span>
  )
}

/** The book's four headline numbers, one block. Whole-book counts from
 *  `GET /sales/leads/scorecard`; they deliberately ignore the tab and filters —
 *  the count beside the tabs is what answers for those. No deltas: the endpoint
 *  has no previous period to compare against. */
export function ScoreStrip() {
  const { data } = useQuery(leadScorecardQuery)
  const total = data?.leads ?? 0
  const per = (n: number) => (!data || total === 0 ? '—' : percent(n / total))
  const count = (n: number | undefined) => (n === undefined ? '—' : String(n))
  /* Zero reads as "missing", not "fine" — warn per cell on its own count,
     not on `total`: zero leads is an empty book, zero opportunities on a
     full book is a different fact. */
  const zero = (n: number | undefined) => Boolean(data) && (n ?? 0) === 0

  /* EXPERIMENT (Aurora M-01 instead of M-17) — separate cards instead of one
     joined strip. No delta/sparkline: `leadScorecardQuery` has no prior
     period to compare against, and law 15 forbids inventing a trend. */
  const items = [
    {
      icon: Users,
      label: 'Tổng lead',
      value: count(data?.leads),
      hint: 'Toàn bộ sổ lead',
      warn: zero(data?.leads),
    },
    {
      icon: CalendarCheck,
      label: 'Đã gặp mặt',
      value: count(data?.firstMeetings),
      hint: zero(data?.firstMeetings)
        ? 'Chưa ghi nhận cuộc gặp nào'
        : `${per(data?.firstMeetings ?? 0)} số lead`,
      warn: zero(data?.firstMeetings),
    },
    {
      icon: Target,
      label: 'Thành cơ hội',
      value: per(data?.opportunities ?? 0),
      hint: `${count(data?.opportunities)} cơ hội`,
      warn: zero(data?.opportunities),
    },
    {
      icon: FileCheck,
      label: 'Thành hợp đồng',
      value: per(data?.contracts ?? 0),
      hint: `${count(data?.contracts)} hợp đồng`,
      warn: zero(data?.contracts),
    },
  ]

  return (
    <div
      role="group"
      aria-label="Thẻ điểm sổ lead"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {items.map((item) => (
        <StatCard
          key={item.label}
          size="compact"
          icon={item.icon}
          label={item.label}
          value={item.value}
          hint={item.hint}
          tone={item.warn ? 'warning' : 'default'}
        />
      ))}
    </div>
  )
}

/** Company over contact · title. The row already opens the lead's own code on
 *  click, so the cell prints the two things a person actually scans for. */
export function CompanyCell({ lead }: { lead: LeadRow }) {
  const meta = [lead.contactName, lead.contactTitle].filter(Boolean).join(' · ')
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[13px] font-semibold" title={lead.company}>
        {lead.company}
      </span>
      {meta && (
        <span className="text-muted-foreground truncate text-[11.5px]" title={meta}>
          {meta}
        </span>
      )}
    </span>
  )
}

/** Shorten a campaign name to its lead-in clause, everything before the first
 *  em dash or middle dot. Cut at the separator's position, never at a fixed length,
 *  which could land inside a Vietnamese diacritic. */
function shortSourceName(name: string): string {
  const cut = name.search(/[—·]/)
  return cut === -1 ? name : name.slice(0, cut).trimEnd()
}

/** Campaign name when there is one — it tells two neighbouring rows apart,
 *  the kind does not — else the kind itself. One line: the day the lead
 *  entered the book lives in the sort order, not in every row's text. */
export function SourceCell({ lead }: { lead: LeadRow }) {
  const kind = sourceKindLabel(lead.source)
  const name = lead.source.campaignName

  return (
    <span className="truncate text-[12.5px] font-semibold" title={name ?? kind}>
      {name ? shortSourceName(name) : kind}
    </span>
  )
}

/** The lead's stored lifecycle state (ADR 0058), shown as the same text pill
 *  table in `data/lead-state.ts`. How long it has sat there lives on the lead's
 *  own page: states carry no limit to be late against (ADR 0057 §4). */
export function StatusCell({ lead }: { lead: LeadRow }) {
  const face = LEAD_STATE_FACE[lead.state]
  return <Badge tone={face.badge}>{face.label}</Badge>
}

/** Lead PIC cell for the book row.
 *
 *  Holder of `lead.assign` (director, head-of-sales, account-executive) gets
 *  `AssignMenu` right in the row — same component as the lead's own page, so
 *  a manager can hand a lead to a specific report without opening it first.
 *  Everyone else keeps the plain one-click claim: unheld gets a button that
 *  always claims for self, held gets the bare `PicCell`. Both paths write
 *  through `PATCH /sales/leads/:code/owner` (`useSetLeadOwner`); no separate
 *  claim or assign endpoint. Stops the click from reaching the row, or
 *  claiming/assigning would also open the lead. */
export function LeadPicCell({ lead }: { lead: LeadRow }) {
  const me = useSession((s) => s.actor)
  const mayAssign = useCan('lead.assign')
  const setOwner = useSetLeadOwner()
  const held = Boolean(lead.ownerEmail || lead.ownerName)

  if (me && mayAssign) {
    return (
      <span onClick={(event) => event.stopPropagation()} className="flex items-center gap-2">
        {held && (
          <PicCell avatar email={lead.ownerEmail} name={lead.ownerName} empty={NO_OWNER_TITLE} />
        )}
        <AssignMenu
          lead={lead}
          profile={lead}
          size="sm"
          buttonVariant={held ? 'ghost' : 'default'}
          iconOnly={held}
        />
      </span>
    )
  }

  if (held || !me) {
    return <PicCell avatar email={lead.ownerEmail} name={lead.ownerName} empty={NO_OWNER_TITLE} />
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={setOwner.isPending}
      onClick={(event) => {
        event.stopPropagation()
        setOwner.mutate(
          { code: lead.code, ownerId: me.id },
          {
            onSuccess: () =>
              toast('Bạn đã nhận lead này', {
                tone: 'success',
                detail: `${lead.code} · ${lead.company}`,
              }),
            onError: (error) =>
              toast(isApiError(error) ? userMessage(error) : 'Không giao được, vui lòng thử lại.', {
                tone: 'danger',
              }),
          },
        )
      }}
    >
      <Icon icon={UserRoundPlus} size={16} />
      {setOwner.isPending ? 'Đang nhận…' : 'Nhận lead'}
    </Button>
  )
}

/** Pins are per person (`app/desk.ts`). Off, the button shows on row hover
 *  only — always on where there is no hover to reveal it. It stops the click
 *  from reaching the row, or pinning would also open the lead. */
export function PinCell({
  on,
  company,
  onToggle,
}: {
  on: boolean
  company: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Bỏ ghim ${company}` : `Ghim ${company}`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={cn(
        'motion-std pointer-coarse:size-12 flex size-8 items-center justify-center rounded-md',
        on
          ? 'text-accent-foreground bg-primary/24'
          : 'text-muted-foreground hover:bg-surface-ink/9 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
      )}
    >
      <Icon icon={Pin} size={16} />
    </button>
  )
}
