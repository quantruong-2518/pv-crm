import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  CalendarCheck,
  CalendarDays,
  Checkbox,
  FileCheck,
  Filter,
  Icon,
  Mail,
  Pin,
  StatStrip,
  StatusDot,
  Target,
  Users,
  cn,
  percent,
  type StatStripItem,
  type StatusDotState,
} from '@pv/ui'
import { sourceKindLabel, type LeadRow, type LeadSourceKind } from '@pv/contracts'
import { dm } from '@/lib/date'
import { STAGE_LABEL } from '@/components/ops-fields'
import { EXIT_REASON_LABEL, leadScorecardQuery } from '@/data/leads'
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

/** Company over code · contact · title. The contact is required by the
 *  contract; the title is often not dug out yet, and then it is simply absent. */
export function CompanyCell({ lead }: { lead: LeadRow }) {
  const meta = [lead.contactName, lead.contactTitle].filter(Boolean).join(' · ')
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[13px] font-semibold" title={lead.company}>
        {lead.company}
      </span>
      <span className="text-muted-foreground truncate text-[11.5px]" title={meta}>
        <span className="font-mono">{lead.code}</span>
        {meta && ` · ${meta}`}
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

/** Bought data (APOLLO) needs checking before anyone calls, and a landing-page
 *  lead came on its own — the two kinds worth catching while scanning. Not
 *  azure: law 3 keeps it for AI, the primary button and the active state. */
const SOURCE_KIND_TEXT = {
  MANUAL: 'text-muted-foreground',
  IMPORT: 'text-muted-foreground',
  APOLLO: 'text-warning',
  LANDING_PAGE: 'text-success',
} as const satisfies Record<LeadSourceKind, string>

/** Campaign first — it tells two neighbouring rows apart, the kind does not —
 *  then the kind and the day the lead entered the book. */
export function SourceCell({ lead }: { lead: LeadRow }) {
  const kind = sourceKindLabel(lead.source)
  const name = lead.source.campaignName
  const kindText = lead.source.kind ? SOURCE_KIND_TEXT[lead.source.kind] : 'text-muted-foreground'

  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[12.5px] font-semibold" title={name ?? kind}>
        {name ? shortSourceName(name) : kind}
      </span>
      <span className="text-muted-foreground truncate text-[11.5px]">
        {name && <span className={kindText}>{kind} · </span>}
        vào sổ {dm(lead.createdAt)}
      </span>
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

function StatusLine({
  dot,
  label,
  children,
}: {
  dot: StatusDotState
  label: string
  children?: ReactNode
}) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex min-w-0 items-center gap-2 text-[12.5px]">
        <StatusDot state={dot} />
        <span className="truncate">{label}</span>
      </span>
      {children && (
        <span className="text-muted-foreground truncate pl-4 text-[11.5px]">{children}</span>
      )}
    </span>
  )
}

/** Dot colour answers "does this row need me": green signed, red dropped,
 *  amber untouched or past its column limit, azure moving within its limit.
 *  A signed row carries no contract code — lead → contract is one-to-many now. */
export function StatusCell({ lead }: { lead: LeadRow }) {
  const limits = useStageLimits()

  if (lead.signed) return <StatusLine dot="ok" label="Đã ký" />

  if (lead.exitReason) {
    return (
      <StatusLine dot="bad" label="Đã rơi">
        {EXIT_REASON_LABEL[lead.exitReason] ?? lead.exitReason}
      </StatusLine>
    )
  }

  const stay = `tồn ${lead.daysHere} ngày`
  if (!lead.stage) {
    return (
      <StatusLine dot="warning" label="Chưa xử lý">
        {stay}
      </StatusLine>
    )
  }

  const late = daysLate(lead, limits)
  return (
    <StatusLine
      dot={late > 0 ? 'warning' : 'current'}
      label={STAGE_LABEL.get(lead.stage) ?? lead.stage}
    >
      {late > 0 && <span className="text-warning">Trễ {late} ngày · </span>}
      {stay}
    </StatusLine>
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

/** The row's checkbox. Pressing it starts a paint-drag across rows; the click
 *  that follows the same press is ignored by the screen (`suppressClick`), so a
 *  press toggles once, not twice. */
export function SelectionCell({
  checked,
  company,
  onChange,
  onPress,
}: {
  checked: boolean
  company: string
  onChange: (checked: boolean) => void
  onPress: (event: PointerEvent<HTMLSpanElement>) => void
}) {
  return (
    <span
      className="flex w-full justify-center"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={onPress}
    >
      <Checkbox
        checked={checked}
        onChange={onChange}
        label={<span className="sr-only">Chọn {company}</span>}
        className="h-12 w-full justify-center gap-0 bg-transparent p-0 hover:bg-transparent"
      />
    </span>
  )
}

/** The source filter and the reset, behind one button — the toolbar row keeps
 *  room for the tabs. `active` counts filters in force, printed on the button. */
export function FilterMenu({ active, children }: { active: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      /* The source select portals its listbox to `body`: a press there is still ours. */
      const target = e.target as Element
      if (!root.current?.contains(target) && !target.closest('[role="listbox"]')) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0">
      <Button
        size="md"
        variant="ghost"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon icon={Filter} size={16} />
        Bộ lọc
        {active > 0 && (
          <span className="bg-primary/24 text-on-tint-primary tnum rounded-sm px-1 text-[11px] font-semibold">
            {active}
          </span>
        )}
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Bộ lọc sổ lead"
          className="glass-overlay absolute right-0 top-[calc(100%+8px)] z-30 flex w-[min(320px,calc(100vw-32px))] flex-col gap-3 rounded-lg p-4"
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function LeadSelectionBar({
  leads,
  emails,
  onClear,
  onSend,
}: {
  leads: number
  emails: number
  onClear: () => void
  onSend: () => void
}) {
  return (
    <div
      className="glass-overlay shadow-panel fixed bottom-[calc(84px+env(safe-area-inset-bottom)+8px)] left-1/2 z-30 flex w-[min(760px,calc(100vw-32px))] -translate-x-1/2 flex-wrap items-center justify-between gap-4 rounded-lg p-3 lg:bottom-6"
      role="region"
      aria-label="Các lead đang chọn"
    >
      <div className="flex min-w-0 items-center gap-3" aria-live="polite">
        <span className="bg-accent text-accent-foreground font-num tnum flex size-10 shrink-0 items-center justify-center rounded-md text-[16px] font-semibold">
          {leads}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[13px] font-semibold">{leads} lead đã chọn</span>
          <span className="text-muted-foreground text-[11.5px]">{emails} địa chỉ email</span>
        </span>
      </div>
      <div className="flex flex-1 justify-end gap-2 max-sm:w-full">
        <Button size="lg" variant="ghost" onClick={onClear}>
          Bỏ chọn hết
        </Button>
        <Button size="lg" onClick={onSend}>
          <Icon icon={Mail} size={16} />
          Gửi email
        </Button>
      </div>
    </div>
  )
}
