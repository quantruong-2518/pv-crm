import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Badge,
  CalendarCheck,
  CalendarDays,
  FileCheck,
  FileUp,
  Globe,
  Handshake,
  Icon,
  Inbox,
  Link,
  Megaphone,
  PenLine,
  Pin,
  RefreshCw,
  Send,
  StatCard,
  Target,
  UserRoundPlus,
  Users,
  Zap,
  cn,
  percent,
} from '@pv/ui'
import { sourceKindLabel, type LeadMotion, type LeadRow, type LeadSourceKind } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { toast } from '@/app/toast'
import { AssignMenu } from '@/components/assign-menu'
import { PicCell } from '@/components/table-bits'
import { NO_OWNER_TITLE, leadScorecardQuery } from '@/data/leads'
import { useSetLeadOwner } from '@/data/lead-owner'
import { LEAD_STATE_FACE } from '@/data/lead-state'
import { useMotionLabel } from '@/data/sales-motions'

/** Module 2 · the cells and blocks of the lead book, split from `leads.tsx` so
 *  the screen file stays the layout: header, score strip, one list card.
 *
 *  Every cell here reads one `LeadRow` and nothing else — no lookup tables, no
 *  fixture-generated names. Where the row has nothing (no contact title, no
 *  campaign) the cell prints less rather than inventing a value. */

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

/** Company over `contact · email`, small and italic. The email is a `mailto:`
 *  link that stops the click, or the row would open the lead as well. */
export function CompanyCell({ lead }: { lead: LeadRow }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[13px] font-semibold" title={lead.company}>
        {lead.company}
      </span>
      <span className="text-muted-foreground flex min-w-0 gap-1 text-[11.5px] italic">
        <span className="max-w-[45%] shrink-0 truncate" title={lead.contactName}>
          {lead.contactName}
        </span>
        <span aria-hidden>·</span>
        <a
          href={`mailto:${lead.email}`}
          title={`Gửi mail tới ${lead.email}`}
          onClick={(event) => event.stopPropagation()}
          className="hover:text-foreground truncate underline-offset-2 hover:underline"
        >
          {lead.email}
        </a>
      </span>
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

/** One icon and one hue per approach, so the column scans by shape and colour
 *  before it is read. Three hues over six motions: the icon carries the rest. */
const MOTION_FACE: Record<LeadMotion, { icon: typeof Inbox; className: string }> = {
  INBOUND: { icon: Inbox, className: 'text-primary' },
  REFERRAL: { icon: Users, className: 'text-success' },
  PARTNER: { icon: Handshake, className: 'text-success' },
  OUTBOUND: { icon: Send, className: 'text-warning' },
  EVENT: { icon: CalendarDays, className: 'text-warning' },
  RECYCLE: { icon: RefreshCw, className: 'text-muted-foreground' },
}

const KIND_ICON: Record<LeadSourceKind, typeof Inbox> = {
  MANUAL: PenLine,
  IMPORT: FileUp,
  APOLLO: Zap,
  LANDING_PAGE: Globe,
}

/** Two lines: the approach (motion) with its icon, over the source detail as a
 *  pill. The pill's icon and tone say WHAT the detail is: catalog origin,
 *  campaign, or — the last fallback for a lead with none of those — the
 *  intake kind. Leads written before the two-level origin carry no motion: the
 *  intake kind takes line one and the pill keeps whatever else there is. */
export function SourceCell({ lead }: { lead: LeadRow }) {
  const { kind, motion, origin, campaignName } = lead.source
  const motionLabel = useMotionLabel()

  const top = motion ? motionLabel(motion) : sourceKindLabel(lead.source)
  const kindLabel = motion && kind ? sourceKindLabel(lead.source) : undefined
  const detail = origin
    ? { label: origin.name, icon: Link, tone: 'running' as const }
    : campaignName
      ? { label: shortSourceName(campaignName), icon: Megaphone, tone: 'warning' as const }
      : kindLabel && kind
        ? { label: kindLabel, icon: KIND_ICON[kind], tone: 'draft' as const }
        : undefined
  const title = [top, origin?.name, campaignName ?? kindLabel].filter(Boolean).join(' · ')
  const face = motion && MOTION_FACE[motion]

  return (
    <span className="flex min-w-0 flex-col items-start gap-1" title={title}>
      <span className="flex max-w-full items-center gap-2 text-[13px] font-semibold">
        {face && <Icon icon={face.icon} size={16} className={face.className} />}
        <span className="truncate">{top}</span>
      </span>
      {detail && (
        <Badge tone={detail.tone} className="max-w-full gap-1">
          <Icon icon={detail.icon} size={14} />
          <span className="truncate">{detail.label}</span>
        </Badge>
      )}
    </span>
  )
}

/** The lead's stored lifecycle state (ADR 0058), shown as the same text pill
 *  table in `data/lead-state.ts`. How long it has sat there lives on the lead's
 *  own page: states carry no limit to be late against (ADR 0057 §4).
 *
 *  TRUNCATES inside its cell: the longest label is 23 characters and the column
 *  is an `fr` track, so an untruncated pill spills over the PIC column. */
export function StatusCell({ lead }: { lead: LeadRow }) {
  const face = LEAD_STATE_FACE[lead.state]
  return (
    <Badge
      tone={face.badge}
      className={face.badge === 'draft' ? 'text-foreground max-w-full' : 'max-w-full'}
      title={face.label}
    >
      <span className="truncate">{face.label}</span>
    </Badge>
  )
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
