import { useQuery } from '@tanstack/react-query'
import {
  Button,
  CalendarCheck,
  CalendarDays,
  FileCheck,
  Icon,
  Pin,
  StatStrip,
  StatusDot,
  Target,
  UserRoundPlus,
  Users,
  cn,
  percent,
  type StatStripItem,
  type StatusDotState,
} from '@pv/ui'
import { sourceKindLabel, type LeadRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useSession } from '@/app/auth'
import { toast } from '@/app/toast'
import { STAGE_LABEL } from '@/components/ops-fields'
import { PicCell } from '@/components/table-bits'
import { NO_OWNER_TITLE, leadScorecardQuery } from '@/data/leads'
import { useSetLeadOwner } from '@/data/lead-owner'
import { useStageLimits } from '@/data/sales-config'

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
  const noMeeting = Boolean(data) && total > 0 && data?.firstMeetings === 0

  const items: StatStripItem[] = [
    { icon: Users, label: 'Tổng lead', value: count(data?.leads), context: 'Toàn bộ sổ lead' },
    {
      icon: CalendarCheck,
      label: 'Đã gặp mặt',
      value: count(data?.firstMeetings),
      suffix: data ? `/ ${total}` : undefined,
      tone: noMeeting ? 'warning' : 'default',
      context: noMeeting
        ? 'Chưa ghi nhận cuộc gặp nào'
        : `${per(data?.firstMeetings ?? 0)} số lead`,
    },
    {
      icon: Target,
      label: 'Thành cơ hội',
      value: per(data?.opportunities ?? 0),
      context: `${count(data?.opportunities)} cơ hội`,
    },
    {
      icon: FileCheck,
      label: 'Thành hợp đồng',
      value: per(data?.contracts ?? 0),
      context: `${count(data?.contracts)} hợp đồng`,
    },
  ]

  return <StatStrip label="Thẻ điểm sổ lead" items={items} />
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

/** Days past the column's configured limit, 0 when not late. A column with no
 *  limit set is never late: an empty config cell is not the seller's fault. */
function daysLate(lead: LeadRow, limits: Map<string, number | null>): number {
  if (!lead.stage) return 0
  const limit = limits.get(lead.stage)
  return limit === undefined || limit === null ? 0 : Math.max(0, lead.daysHere - limit)
}

function StatusLine({ dot, label }: { dot: StatusDotState; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[12.5px]">
      <StatusDot state={dot} />
      <span className="truncate">{label}</span>
    </span>
  )
}

/** Dot colour answers "does this row need me": green signed, red dropped,
 *  amber untouched or past its column limit, azure moving within its limit.
 *  A signed row carries no contract code — lead → contract is one-to-many now.
 *  One line: days-here and the late count move to the lead's own page. */
export function StatusCell({ lead }: { lead: LeadRow }) {
  const limits = useStageLimits()

  if (lead.signed) return <StatusLine dot="ok" label="Đã ký" />
  if (lead.exitReason) return <StatusLine dot="bad" label="Đã rơi" />
  if (!lead.stage) return <StatusLine dot="warning" label="Chưa xử lý" />

  const late = daysLate(lead, limits)
  return (
    <StatusLine
      dot={late > 0 ? 'warning' : 'current'}
      label={STAGE_LABEL.get(lead.stage) ?? lead.stage}
    />
  )
}

/** Lead PIC cell for the book row. A held lead prints the usual `PicCell`; an
 *  unheld one gets a one-click claim instead of the bare "—" — the book is
 *  where an unassigned lead is spotted, so taking it should not first require
 *  opening the lead's own page. Same write as `AssignMenu`'s self-claim button
 *  (`PATCH /sales/leads/:code/owner`, `useSetLeadOwner`); no separate claim
 *  endpoint. Stops the click from reaching the row, or claiming would also
 *  open the lead. */
export function LeadPicCell({ lead }: { lead: LeadRow }) {
  const me = useSession((s) => s.actor)
  const setOwner = useSetLeadOwner()

  if (lead.ownerEmail || lead.ownerName || !me) {
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
      {setOwner.isPending ? 'Đang giao…' : 'Giao PIC luôn'}
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
