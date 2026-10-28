import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Badge,
  CalendarCheck,
  CalendarDays,
  FileCheck,
  Handshake,
  Icon,
  Inbox,
  PillOverflow,
  RefreshCw,
  Send,
  StatCard,
  cn,
  Target,
  UserRoundPlus,
  Users,
  percent,
} from '@pv/ui'
import { sourceKindLabel, type LeadMotion, type LeadRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { toast } from '@/app/toast'
import { AssignMenu } from '@/components/assign-menu'
import { ClaimLeadButton } from '@/components/lead-claim'
import { MomentCell } from '@/components/lead-cells'
import { HoldMark } from '@/components/hold-strip'
import { LabelChips } from '@/components/lead-labels'
import { PicCell } from '@/components/book-cells'
import { ROW_ICON } from '@/components/table-bits'
import { NO_CREATOR_TITLE, NO_OWNER_TITLE, leadScorecardQuery } from '@/data/leads'
import { BADGE_INK } from '@/data/opportunities'
import { useSetLeadOwner } from '@/data/lead-owner'
import { LEAD_STATE_FACE } from '@/data/lead-state'
import { sourcePartnerLabel } from '@/data/partners'
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
      warn: zero(data?.leads),
    },
    {
      icon: CalendarCheck,
      label: 'Đã liên hệ lần đầu',
      value: count(data?.contacted),
      hint:
        total === 0
          ? 'Chưa có lead để tính tỷ lệ'
          : `${count(data?.contacted)}/${total} lead đã được liên hệ`,
      warn: zero(data?.contacted),
    },
    {
      icon: Target,
      label: 'Thành cơ hội',
      value: per(data?.opportunities ?? 0),
      hint:
        total === 0
          ? 'Chưa có lead để tính tỷ lệ'
          : `${count(data?.opportunities)}/${total} lead đã tạo cơ hội`,
      warn: zero(data?.opportunities),
    },
    {
      icon: FileCheck,
      label: 'Đã ký hợp đồng',
      value: per(data?.contracts ?? 0),
      hint:
        total === 0
          ? 'Chưa có lead để tính tỷ lệ'
          : `${count(data?.contracts)}/${total} lead đã ký hợp đồng`,
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

/** Two lines: the approach (motion) with its icon, over the source detail as
 *  small italic text behind a dash: partner, else catalog origin, else campaign,
 *  else — the last fallback for a lead with none of those — the intake kind.
 *  Leads written before the two-level origin carry no motion: the intake kind
 *  takes line one and the detail keeps whatever else there is. */
export function SourceCell({ lead }: { lead: LeadRow }) {
  const { kind, motion, origin, campaignName } = lead.source
  const motionLabel = useMotionLabel()

  const partner = sourcePartnerLabel(lead.source)
  const top = motion ? motionLabel(motion) : sourceKindLabel(lead.source)
  const kindLabel = motion && kind ? sourceKindLabel(lead.source) : undefined
  const detail =
    partner ?? origin?.name ?? (campaignName ? shortSourceName(campaignName) : kindLabel)
  const title = [top, origin?.name, partner, campaignName ?? kindLabel].filter(Boolean).join(' · ')
  const face = motion && MOTION_FACE[motion]

  return (
    <span className="flex min-w-0 flex-col gap-1" title={title}>
      <span className="flex max-w-full items-center gap-2 text-[13px] font-semibold">
        {face && <Icon icon={face.icon} size={16} className={face.className} />}
        <span className="truncate">{top}</span>
      </span>
      {detail && (
        <span className="text-muted-foreground truncate text-[11.5px] italic">– {detail}</span>
      )}
    </span>
  )
}

/** Day the lead entered the book (`createdAt`), the hour beneath it. Pinned to
 *  Vietnam time so two machines in two zones print the same day. */
export function EnteredCell({ lead }: { lead: LeadRow }) {
  return <MomentCell iso={lead.createdAt} />
}

/** Who created the lead; blank for leads that predate the column. */
export function CreatedByCell({ lead }: { lead: LeadRow }) {
  const people = lead.createdByName ? [{ name: lead.createdByName }] : []
  return <PicCell people={people} empty={NO_CREATOR_TITLE} />
}

/** When the lead was switched off — only rows of the switched-off tab carry it. */
export function DisabledAtCell({ lead }: { lead: LeadRow }) {
  return <MomentCell iso={lead.disabledAt} />
}

/** The lead's stored lifecycle state (ADR 0058), shown as the same text pill
 *  table in `data/lead-state.ts`. How long it has sat there lives on the lead's
 *  own page: states carry no limit to be late against (ADR 0057 §4).
 *
 *  TRUNCATES inside its cell: the longest label is 23 characters and the column
 *  is an `fr` track, so an untruncated pill spills over the PIC column. */
export function StatusCell({ lead }: { lead: LeadRow }) {
  const face = LEAD_STATE_FACE[lead.state]
  const badge = (
    <Badge tone={face.badge} className={cn(BADGE_INK, 'max-w-full')} title={face.label}>
      <span className="truncate">{face.label}</span>
    </Badge>
  )
  if (lead.labels.length === 0 && !lead.hold) return badge
  /* Hold mark and waiting labels share ONE line under the pill: the row height
     is fixed. The mark keeps its room; labels shrink to one and a "+N". */
  return (
    <span className="flex min-w-0 max-w-full flex-col items-start gap-1">
      {badge}
      <span className="flex min-w-0 max-w-full flex-nowrap items-center gap-1 overflow-hidden">
        <HoldMark hold={lead.hold} className="max-w-full shrink-0" />
        <LabelChips
          labels={lead.labels}
          max={lead.hold ? 1 : 2}
          className="max-w-full flex-nowrap"
        />
      </span>
    </span>
  )
}

/** Lead PIC cell for the book row.
 *
 *  Holder of `lead.assign` gets `AssignMenu` right in the row, the same
 *  component as the lead's own page. Everyone else keeps the one-click claim on
 *  an unheld lead. Both write through `PATCH /sales/leads/:code/owner`
 *  (`useSetLeadOwner`) and stop the click, or the row would open as well.
 *
 *  A lead in the nurturing pool has no holder to hand over: it shows the claim
 *  button instead, which takes it through the resume door (ADR 0109). */
export function LeadPicCell({ lead }: { lead: LeadRow }) {
  const me = useSession((s) => s.actor)
  const mayAssign = useCan('lead.assign')
  const canClaim = useCan('lead.edit')
  const setOwner = useSetLeadOwner()
  const holder = lead.ownerEmail || lead.ownerName
  const people = holder ? [{ id: lead.ownerId, name: lead.ownerName, email: lead.ownerEmail }] : []

  if (lead.state === 'nurturing') {
    return canClaim ? (
      <PicCell
        people={people}
        empty={NO_OWNER_TITLE}
        max={2}
        action={<ClaimLeadButton code={lead.code} />}
      />
    ) : (
      <PicCell people={people} empty="Lead chờ người nhận" />
    )
  }

  if (me && mayAssign) {
    return (
      <PicCell
        people={people}
        empty={NO_OWNER_TITLE}
        max={2}
        action={
          <span onClick={(event) => event.stopPropagation()} className="flex items-center">
            <AssignMenu lead={lead} profile={lead} size="sm" buttonVariant="ghost" iconOnly />
          </span>
        }
      />
    )
  }

  const claim =
    !holder && me ? (
      <Button
        size="sm"
        variant="ghost"
        className={ROW_ICON}
        disabled={setOwner.isPending}
        aria-label="Nhận lead"
        title="Nhận lead"
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
                toast(isApiError(error) ? userMessage(error) : 'Không nhận được lead. Thử lại.', {
                  tone: 'danger',
                }),
            },
          )
        }}
      >
        <Icon icon={UserRoundPlus} size={16} />
      </Button>
    ) : undefined

  return <PicCell people={people} empty={NO_OWNER_TITLE} max={2} action={claim} />
}

/** The first industry, the rest behind "+N"; the category names the popover. */
export function IndustryCell({ lead }: { lead: LeadRow }) {
  if (lead.industries.length === 0) return <span className="text-muted-foreground">—</span>
  const n = lead.industries.length
  return (
    <PillOverflow
      items={lead.industries.map((i) => ({ id: i.id, label: i.name }))}
      max={1}
      label={`Ngành của ${lead.company}`}
      moreLabel={(total) => `Xem cả ${total} ngành`}
      heading={lead.category ? `${n} ngành · nhóm ${lead.category.name}` : `${n} ngành`}
      className="flex-nowrap"
    />
  )
}
