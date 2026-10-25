import {
  LEAD_LANE_BACKBONE,
  LEAD_STATE_LABEL,
  type JourneyLeadRung,
  type JourneyRungState,
  type LeadProfile,
  type OpportunityLiveDeal,
  type ContactListResponse,
  type TouchKind,
} from '@pv/contracts'
import { Pin, UserSwitch } from '@pv/ui'
import { dm, dmy } from '@/lib/date'
import { leadContactOf } from '@/data/comm-records'
import { stopReasonLabel } from '@/data/sales-config'
import type { StepSubject } from '@/data/next-step'
import type { TouchEvent } from '@/data/touches'
import type { AssignDoor } from '@/components/assign-door'
import type { BarContact } from '@/components/record/action-bar'
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
    mark: state === 'stopped' && lead.state === 'nurturing' ? 'waiting' : MARK[state],
    late: false,
    caption:
      state === 'stopped'
        ? stopCaption(lead, reasons)
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
  working: ['exchange-logged', 'verified'],
  converted: ['entered-pipeline'],
}

/** A passed rung nothing entered is a dateless `done`, never `skipped`; a
 *  parked lead stands on the last rung its trail reached, since a pool lead
 *  may never have been assigned. */
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
      ? days.reduce((last, at, i) => (at === null ? last : i), 0)
      : backbone.indexOf(lead.state)
  const standing: JourneyRungState =
    lead.state === 'nurturing' ? 'stopped' : lead.state === 'converted' ? 'done' : 'current'

  return LEAD_LANE_BACKBONE.map((key, i) => ({
    key,
    state: i < index ? 'done' : i > index ? 'upcoming' : standing,
    day: i > index ? null : (days[i] ?? (i === index ? dm(lead.stateSince) : null)),
  }))
}

/** "<state> · <reason> · <day>", read off the row's own park reason and moment. */
function stopCaption(lead: LeadProfile, reasons: Reasons) {
  return [
    LEAD_STATE_LABEL[lead.state],
    stopReasonLabel(reasons, lead.exitReason),
    dm(lead.exitedAt ?? lead.stateSince),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** `canAssign` is the reader's `lead.assign`: without it the doer is the holder. */
export function leadStepSubject(lead: LeadProfile, canAssign: boolean): StepSubject {
  return {
    kind: 'lead',
    code: lead.code,
    holder: lead.ownerId ? { id: lead.ownerId, name: lead.ownerName ?? lead.ownerId } : null,
    canAssign,
    holderHint: 'Người giữ lead.',
    noHolder: 'Chưa ai giữ lead, cần giao lead trước.',
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

/** The floating bar's people: the lead's contacts, or its own contact line
 *  while it has none on file. */
export function barPeopleOf(
  lead: LeadProfile,
  contacts: ContactListResponse['rows'] | undefined,
): BarContact[] {
  return contacts && contacts.length > 0
    ? contacts.map((c) => ({ ...c, primary: c.isPrimary, role: c.title }))
    : [{ ...leadContactOf(lead), primary: true }]
}

/** Why the bar's mail row is shut, or `undefined` when it is open. */
export function mailBlockedOf(canSendEmail: boolean): string | undefined {
  return canSendEmail ? undefined : 'Cần quyền gửi email cho lead.'
}

/** States a lead can be parked from, held-or-not aside (ADR 0109). */
const PARKABLE: ReadonlySet<string> = new Set(['new', 'assigned', 'working'])

/** States with a holder still being worked — where a hold starts. */
const WORKED: ReadonlySet<string> = new Set(['assigned', 'working'])

/** The bar's other moves: the state moves the header does not hold, the
 *  hand-over and the pin. Same gates as the old toolbar's `…` menu; a door
 *  this reader cannot use is left out rather than shown shut. */
export function leadMoreChoices(
  lead: LeadProfile,
  can: { write: boolean; claim: boolean; disqualify: boolean; disable: boolean },
  /** The hand-over drawer's own door (`assignDoorOf`), so the row reads its words. */
  assign: AssignDoor,
  pinned: boolean,
  /** Deal reach only (ADR 0071): the server pins for the lead's holder alone. */
  dealReach: boolean,
  liveDeal: OpportunityLiveDeal,
  doors: {
    onClaim: () => void
    onNurture: () => void
    onHold: () => void
    onAssign: () => void
    onPin: () => void
    onDisable: () => void
  },
): MenuChoice[] {
  /* A converted lead parks while it holds no open deal and has not signed — the
     same two refusals the park door answers 409 with. */
  const noDeal = liveDeal.codes.length === 0 && liveDeal.hidden === 0 && !lead.signed
  const parkable = PARKABLE.has(lead.state) || (lead.state === 'converted' && noDeal)
  /* A held lead's ways out sit on its hold strip (ADR 0097 §3), not here. */
  const free = can.write && lead.hold === null
  const choices: MenuChoice[] = []

  if (can.claim && lead.state === 'nurturing') {
    choices.push({ key: 'claim', label: 'Nhận lead', onSelect: doors.onClaim })
  }
  if (can.disqualify && lead.hold === null && parkable) {
    choices.push({
      key: 'nurture',
      label: `Chuyển vào ${LEAD_STATE_LABEL.nurturing}`,
      onSelect: doors.onNurture,
    })
  }
  if (free && lead.ownerId && WORKED.has(lead.state)) {
    choices.push({ key: 'hold', label: 'Tạm hoãn', onSelect: doors.onHold })
  }
  if (!assign.shut) {
    choices.push({
      key: 'assign',
      label: assign.label,
      icon: UserSwitch,
      onSelect: doors.onAssign,
    })
  }
  if (lead.disabledAt === undefined && !dealReach) {
    choices.push({
      key: 'pin',
      label: pinned ? 'Bỏ ghim' : 'Ghim lead',
      icon: Pin,
      active: pinned,
      onSelect: doors.onPin,
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
