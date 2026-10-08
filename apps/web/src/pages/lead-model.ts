import {
  LEAD_LANE_BACKBONE,
  LEAD_STATE_LABEL,
  LEAD_STOP_REASON_OTHER,
  type JourneyLeadRung,
  type JourneyRungState,
  type LeadProfile,
  type OpportunityLiveDeal,
  type TouchKind,
} from '@pv/contracts'
import { dm, dmy } from '@/lib/date'
import { isOpenState } from '@/data/lead-state'
import { stopReasonLabel } from '@/data/sales-config'
import type { StepSubject } from '@/data/next-step'
import type { TouchEvent } from '@/data/touches'
import type { AssignDoor } from '@/components/assign-door'
import type { MenuChoice } from '@/components/record/menu-button'
import type { RungMark, TodoRung } from '@/components/record/todo-card'

/** Module 2 · what the lead profile derives before it paints — no JSX here.
 *
 *  The rungs are the run journey's (ADR 0078 §3); this file only words their
 *  captions — the current rung's clock, a park or stop with its reason. When
 *  the run cannot be read, `derivedSteps` rebuilds them off the touch trail
 *  by the server's own rules (`leadOf` in `workstream-lanes.ts`). */

type Rung = (typeof LEAD_LANE_BACKBONE)[number]
type Step = { key: Rung; state: JourneyRungState; day: string | null }
type Reasons = readonly { id: string; name: string }[] | undefined

const MARK: Record<JourneyRungState, RungMark> = {
  done: 'done',
  current: 'current',
  skipped: 'skipped',
  upcoming: 'future',
  stopped: 'stopped',
}

export function leadRungsOf(
  lead: LeadProfile,
  /** The run journey's rungs; `undefined` = not readable, derive them. */
  served: readonly JourneyLeadRung[] | undefined,
  /** Newest first, as the server sends them; `undefined` = not answered yet. */
  touches: readonly TouchEvent[] | undefined,
  /** The day the lead was first held — the holder chain's first `held` step. */
  firstHeld: string | undefined,
  reasons: Reasons,
): TodoRung[] {
  const steps =
    served?.map((r): Step => ({ key: r.key, state: r.state, day: r.at ? dm(r.at) : null })) ??
    derivedSteps(lead, touches, firstHeld)
  return steps.map(({ key, state, day }) => ({
    key,
    label: LEAD_STATE_LABEL[key],
    mark: MARK[state],
    late: false,
    caption:
      state === 'stopped'
        ? stopCaption(lead, touches, reasons)
        : state === 'current'
          ? `từ ${dm(lead.stateSince)} · ${lead.daysHere} ngày`
          : state === 'skipped'
            ? 'bỏ qua'
            : day,
  }))
}

/** The same entry kinds the server's lane writer reads (`RUNG_HIT`). */
const ENTRY_KINDS: Record<Exclude<Rung, 'assigned'>, readonly TouchKind[]> = {
  new: ['created'],
  verifying: ['care-planned', 'first-action'],
  working: ['exchange-logged', 'verified'],
  converted: ['entered-pipeline'],
}

/** A passed rung nothing entered is a dateless `done`, never `skipped`; a
 *  parked lead stands where resuming would put it back (`stateByWork`); a
 *  dropped one on the last rung its trail reached. */
function derivedSteps(
  lead: LeadProfile,
  touches: readonly TouchEvent[] | undefined,
  firstHeld: string | undefined,
): Step[] {
  const oldestFirst = [...(touches ?? [])].reverse()
  const entryOf = (key: Rung): string | null => {
    if (key === 'assigned') return firstHeld ?? null
    const hit = oldestFirst.find((t) => ENTRY_KINDS[key].includes(t.kind))
    return hit ? dm(hit.at) : key === 'new' ? dm(lead.createdAt) : null
  }
  const days = LEAD_LANE_BACKBONE.map(entryOf)
  const backbone = LEAD_LANE_BACKBONE as readonly string[]
  const index =
    lead.state === 'nurturing'
      ? backbone.indexOf(entryOf('working') ? 'working' : 'verifying')
      : lead.state === 'disqualified'
        ? days.reduce((last, at, i) => (at === null ? last : i), 0)
        : backbone.indexOf(lead.state)
  const parked = lead.state === 'nurturing' || lead.state === 'disqualified'
  const standing: JourneyRungState = parked
    ? 'stopped'
    : lead.state === 'converted'
      ? 'done'
      : 'current'

  return LEAD_LANE_BACKBONE.map((key, i) => ({
    key,
    state: i < index ? 'done' : i > index ? 'upcoming' : standing,
    day: i > index ? null : (days[i] ?? (i === index ? dm(lead.stateSince) : null)),
  }))
}

/** "<state> · <reason> · <day>". A dropped lead carries its reason key; a
 *  parked one only in its `nurtured` note, "<prefix> · <key>[ · note]" — and
 *  either stop's free text only there (no structured field yet). The
 *  catch-all reason prints that free text. */
function stopCaption(
  lead: LeadProfile,
  touches: readonly TouchEvent[] | undefined,
  reasons: Reasons,
) {
  const kind = lead.state === 'nurturing' ? 'nurtured' : 'exited'
  const last = touches?.find((t) => t.kind === kind)
  const [, noteKey, ...rest] = last?.note.split(' · ') ?? []
  const key = lead.state === 'nurturing' ? noteKey : lead.exitReason
  const label = stopReasonLabel(reasons, key)
  const note = rest.join(' · ')
  const at =
    last?.at ?? (lead.state === 'disqualified' ? lead.exitedAt : undefined) ?? lead.stateSince
  return [
    LEAD_STATE_LABEL[lead.state],
    key === LEAD_STOP_REASON_OTHER && note ? `${label}: ${note}` : label,
    dm(at),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Openings that cover most of what follows a first conversation. A chip FILLS
 *  the box and saves nothing, and stands down once the box holds anything —
 *  overwriting somebody's typing on one mis-tap is how a screen loses work. */
const LEAD_SUGGESTIONS = ['Gọi lại', 'Gửi hồ sơ năng lực', 'Hẹn khảo sát']

/** `canAssign` is the reader's `lead.assign`: without it the doer is the holder. */
export function leadStepSubject(lead: LeadProfile, canAssign: boolean): StepSubject {
  return {
    kind: 'lead',
    code: lead.code,
    holder: lead.ownerId ? { id: lead.ownerId, name: lead.ownerName ?? lead.ownerId } : null,
    canAssign,
    holderHint: 'Người giữ lead.',
    noHolder: 'Chưa ai giữ lead, cần giao lead trước.',
    suggestions: LEAD_SUGGESTIONS,
  }
}

const HOUR = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** Hour first, then the day with its year — a moment said inside a sentence.
 *  The reader's own zone, like every other date on the profile (`lib/date`). */
export function momentText(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return `${HOUR.format(at)} ngày ${dmy(iso)}`
}

/** The bar's more menu: the state moves the todo card does not hold, the
 *  hand-over and the pin. Same gates as the old toolbar's `…` menu; a door
 *  this reader cannot use is left out rather than shown shut. */
export function leadMoreChoices(
  lead: LeadProfile,
  can: { write: boolean; disqualify: boolean; disable: boolean },
  /** The hand-over drawer's own door (`assignDoorOf`), so the row reads its words. */
  assign: AssignDoor,
  pinned: boolean,
  /** Deal reach only (ADR 0071): the server pins for the lead's holder alone. */
  dealReach: boolean,
  liveDeal: OpportunityLiveDeal,
  doors: {
    onResume: () => void
    onNurture: () => void
    onAssign: () => void
    onPin: () => void
    onExit: () => void
    onReopen: () => void
    onDisable: () => void
  },
): MenuChoice[] {
  /* A converted lead may still be dropped while it holds no open deal and has
     not signed — the same two refusals the exit door answers 409 with. */
  const noDeal = liveDeal.codes.length === 0 && liveDeal.hidden === 0 && !lead.signed
  const droppable = isOpenState(lead.state) || (lead.state === 'converted' && noDeal)
  const choices: MenuChoice[] = []

  if (can.write && lead.state === 'nurturing') {
    choices.push({ key: 'resume', label: 'Chăm lại', onSelect: doors.onResume })
  }
  if (can.write && (lead.state === 'verifying' || lead.state === 'working')) {
    choices.push({
      key: 'nurture',
      label: `Chuyển sang ${LEAD_STATE_LABEL.nurturing}`,
      onSelect: doors.onNurture,
    })
  }
  if (!assign.shut) {
    choices.push({ key: 'assign', label: assign.label, onSelect: doors.onAssign })
  }
  if (lead.disabledAt === undefined && !dealReach) {
    choices.push({ key: 'pin', label: pinned ? 'Bỏ ghim' : 'Ghim lead', onSelect: doors.onPin })
  }
  if (can.disqualify && lead.state === 'disqualified') {
    choices.push({ key: 'reopen', label: 'Mở lại lead', onSelect: doors.onReopen })
  } else if (can.disqualify && droppable) {
    choices.push({
      key: 'exit',
      label: LEAD_STATE_LABEL.disqualified,
      tone: 'danger',
      onSelect: doors.onExit,
    })
  }
  if (can.disable) {
    choices.push({
      key: 'disable',
      label: 'Vô hiệu hoá lead',
      tone: 'danger',
      onSelect: doors.onDisable,
    })
  }
  return choices
}
