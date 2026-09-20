import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Avatar, Button, Icon, Plus, Separator, StatusDot, cn, type StatusDotState } from '@pv/ui'
import {
  SOURCE_KIND_LABEL,
  SOURCE_KIND_UNKNOWN,
  type WorkstreamHolder,
  type WorkstreamLeadLane,
  type WorkstreamStep,
  type WorkstreamStepState,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { dm } from '@/lib/date'
import { leadProfileQuery } from '@/data/lead-profile'
import { type StepRef, type WorkstreamLane } from '@/data/workstreams'
import { ConvertDialog } from '@/components/convert-dialog'
import { QUIET_ACTION, exitReasonOf, unreachedWord } from './workstream-lane-model'

/** The pieces the journey tree and its side panel are built from.
 *
 *  They are built here rather than bent out of `StageTrack` or `Stepper`: a
 *  lane has four states including "dropped", and every rung is a selection
 *  button — neither pattern carries both (see their docblocks). */

/* `current` maps to the WARNING dot, not `StatusDot`'s own `current`: that one
   is brand blue, which on this screen is the colour of the SELECTED node, so
   the two read as one thing. Warm is also what the design system reserves for
   "the work is here" (`status-todo`). */
const DOT: Record<Exclude<WorkstreamStepState, 'upcoming'>, StatusDotState> = {
  done: 'ok',
  current: 'warning',
  dropped: 'bad',
}

/** `halo` marks the one rung a LIVE lane is standing on, so the eye finds it
 *  without reading every node. A closed lane gets no halo: it stands nowhere. */
export function StepDot({ state, halo }: { state: WorkstreamStepState; halo?: boolean }) {
  if (state === 'upcoming') {
    /* `StatusDot`'s own `next` state — a solid dim fill, not a 1.5px ring: the
       ring read as almost nothing against `bg-muted` and made the rail look
       broken rather than "not there yet". */
    return <StatusDot state="next" className="size-2.5" />
  }
  return (
    <StatusDot
      state={DOT[state]}
      className={cn(
        'relative size-2.5',
        halo && 'shadow-[0_0_0_4px_color-mix(in_srgb,var(--warning)_22%,transparent)]',
      )}
    />
  )
}

/** Truncating, both ways: this sits in a node foot beside a badge that never
 *  shrinks, and the narrowest column has 168px of room for the pair. */
export function Holder({ owner }: { owner: WorkstreamHolder | null }) {
  const label = owner?.name ?? 'Chưa có người giữ'
  return (
    <span className="flex min-w-0 items-center gap-2 text-[11.5px]" title={label}>
      {owner && <Avatar name={owner.name} size="sm" />}
      <span className={cn('truncate', !owner && 'text-muted-foreground')}>{label}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// THE ONE WRITE DOOR OF THE TREE
// ---------------------------------------------------------------------------

/** Opens the same convert form the lead profile opens; that form seeds from a
 *  `LeadProfile`, which this screen only reads once somebody asks for it. */
export function CreateDealButton({
  leadCode,
  onCreated,
}: {
  leadCode: string
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [asked, setAsked] = useState(false)
  const profile = useQuery({ ...leadProfileQuery(leadCode), enabled: asked })
  const waiting = open && profile.data === undefined && !profile.isError

  return (
    <>
      <Button
        variant="ghost"
        size="lg"
        className={cn(QUIET_ACTION, 'w-full px-4')}
        disabled={waiting}
        onClick={() => {
          if (profile.isError) void profile.refetch()
          setAsked(true)
          setOpen(true)
        }}
      >
        <Icon icon={Plus} size={16} />
        {waiting ? 'Đang mở…' : 'Tạo cơ hội từ lead này'}
      </Button>
      {open && profile.isError && (
        <span className="text-destructive-foreground text-[11px]">
          {isApiError(profile.error) ? userMessage(profile.error) : 'Không mở được hồ sơ lead.'}
        </span>
      )}
      {profile.data && (
        <ConvertDialog
          profile={profile.data}
          open={open}
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// THE SIDE PANEL — every rung of the picked lane, not just the picked one
// ---------------------------------------------------------------------------

/** One row of the panel's ladder. A rung nobody reached prints its name and
 *  nothing else: there is no date, no mover and no day count to print. */
function Rung({
  step,
  lane,
  selected,
  onSelect,
}: {
  step: WorkstreamStep
  lane: WorkstreamLane
  selected: boolean
  onSelect: (ref: StepRef) => void
}) {
  const reached = step.state !== 'upcoming'
  const facts = [
    step.at === null ? null : dm(step.at),
    step.by,
    step.days === null || step.days === 0 ? null : `${step.days} ngày`,
  ].filter(Boolean)

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect({ lane: lane.code, step: step.key })}
      className={cn(
        'motion-std flex min-h-12 w-full items-start gap-3 rounded-md px-2 py-2 text-left',
        selected
          ? 'bg-primary/16 shadow-[inset_0_0_0_1px_var(--accent-foreground)]'
          : 'hover:bg-surface-ink/8',
      )}
    >
      <span className="pt-1">
        <StepDot state={step.state} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            'text-[12.5px]',
            selected && 'font-semibold',
            !reached && 'text-muted-foreground',
          )}
        >
          {step.label}
        </span>
        {facts.length > 0 ? (
          <span className="text-muted-foreground tnum font-mono text-[10.5px]">
            {facts.join(' · ')}
          </span>
        ) : (
          <span className="text-muted-foreground text-[10.5px]">{unreachedWord(lane.open)}</span>
        )}
      </span>
    </button>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground text-[11.5px]">{label}</span>
      <span className="text-[12.5px]">{value}</span>
    </div>
  )
}

/** The lead facts that ride beside the backbone rather than on it — source,
 *  tier and the nurture loop (ADR 0058) — plus why the lead left, if it did.
 *  They live here and not on the node: the node has room for one line. */
function LeadFacts({ lead }: { lead: WorkstreamLeadLane }) {
  const reason = exitReasonOf(lead)
  return (
    <div className="flex flex-col gap-3">
      <Fact
        label="Nguồn"
        value={lead.sourceKind ? SOURCE_KIND_LABEL[lead.sourceKind] : SOURCE_KIND_UNKNOWN}
      />
      {lead.campaignName !== null && <Fact label="Chiến dịch" value={lead.campaignName} />}
      <Fact
        label="Nuôi dài hạn"
        value={
          lead.nurture === null
            ? 'chưa lần nào'
            : `${lead.nurture.count} lần · ${lead.nurture.totalDays} ngày`
        }
      />
      {reason !== null && <Fact label="Lý do loại" value={reason} />}
    </div>
  )
}

/** Everything the drawer shows below its own header — the header itself
 *  (owner name, open/closed badge, "since dd/mm") moved up to `Drawer`'s
 *  `title`/`subtitle`/`meta` props, computed at the call site: the panel no
 *  longer owns the object's identity, only its rungs and their detail. */
export function LanePanel({
  lane,
  step,
  lead,
  onSelect,
}: {
  lane: WorkstreamLane
  step: WorkstreamStep
  /** Present only while the picked lane IS the lead lane. */
  lead: WorkstreamLeadLane | null
  onSelect: (ref: StepRef) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[12px] font-semibold">Các bậc</span>
        {lane.steps.map((s) => (
          <Rung
            key={s.key}
            step={s}
            lane={lane}
            selected={s.key === step.key}
            onSelect={onSelect}
          />
        ))}
      </div>

      {lead && (
        <>
          <Separator />
          <LeadFacts lead={lead} />
        </>
      )}
    </div>
  )
}
