import { makeKit, type Kit, type Person } from './emit-comms-kit'
import { emitMeeting, type Booking, type MeetingBeat } from './emit-comms-meeting'
import { emitTalk } from './emit-comms-talk'
import type { Beat, Story } from './story.types'
import type { AfterWrite, Ctx } from './types'

/** Comms: every first-touch / care beat becomes a logged exchange with its
 *  record, and every meeting beat a meeting with its booked record. Subjects
 *  come from the leads and deals emitters (codes in `ctx.ids`); a journey the
 *  leads emitter did not run is skipped, a deal meeting without a deal too. */

const first = <K extends Beat['kind']>(s: Story, kind: K): Extract<Beat, { kind: K }> | undefined =>
  s.beats.find((b): b is Extract<Beat, { kind: K }> => b.kind === kind)

function cancelOf(s: Story, on: 'lead' | 'deal'): Booking['cancel'] {
  if (on === 'deal') {
    const lost = first(s, 'deal-lost')
    return lost ? { at: lost.at, cause: 'opportunity-lost' } : null
  }
  const off = first(s, 'disabled')
  if (off) return { at: off.at, cause: 'lead-disabled' }
  const parked = s.beats.filter((b) => b.kind === 'parked').pop()
  return parked ? { at: parked.at, cause: 'lead-nurtured' } : null
}

function bookings(ctx: Ctx, s: Story, ld: string, people: Person[]): Booking[] {
  const op = ctx.ids.opportunity.get(s.key)
  const company = ctx.companies[s.knobs.company]!.shortName
  const since = {
    lead: first(s, 'lead-claimed')?.at ?? s.bornAt,
    deal: (first(s, 'deal-accepted') ?? first(s, 'deal-opened'))?.at ?? s.bornAt,
  }
  const gone = {
    lead: s.knobs.lead.state === 'nurturing' || s.knobs.disabled,
    deal: s.knobs.deal?.end.kind === 'lost',
  }
  const meetings = s.beats.filter((b): b is MeetingBeat => b.kind === 'meeting')
  const firstHeld = meetings.find((b) => b.on === 'lead' && b.state === 'held')
  const out: Booking[] = []
  for (const beat of meetings) {
    const subject = beat.on === 'lead' ? ld : op
    if (!subject || (beat.state === 'scheduled' && gone[beat.on])) continue
    const cancel = beat.state === 'cancelled' ? cancelOf(s, beat.on) : null
    if (beat.state === 'cancelled' && !cancel) continue
    out.push({
      beat,
      subject,
      company,
      people: people.filter((p) => (p.createdAt ?? s.bornAt) <= beat.at),
      since: since[beat.on],
      cancel,
      first: beat === firstHeld,
      presales: s.knobs.deal?.presales ?? null,
    })
  }
  return out
}

function emitJourney(kit: Kit, s: Story, byLead: Map<string, Person[]>): void {
  const ctx = kit.ctx
  const ld = ctx.ids.lead.get(s.key)
  if (!ld) return
  const people = byLead.get(ld) ?? []
  const primary = people.find((p) => p.isPrimary) ?? people[0]
  if (!primary) return
  for (const b of s.beats) {
    if (b.kind === 'first-touch' || b.kind === 'care') emitTalk(kit, ld, primary, b)
  }
  const lead = ctx.plan.lead.find((l) => l.code === ld)
  for (const bk of bookings(ctx, s, ld, people)) {
    emitMeeting(kit, { ...bk, people: bk.people.length > 0 ? bk.people : [primary] })
    const held = bk.beat.state === 'held'
    if (held && lead && bk.subject === ld && (!lead.lastTouchAt || lead.lastTouchAt < bk.beat.at)) {
      lead.lastTouchAt = bk.beat.at
    }
  }
}

export function emitComms(ctx: Ctx): void {
  const byLead = new Map<string, Person[]>()
  for (const c of ctx.plan.contact) byLead.set(c.leadCode, [...(byLead.get(c.leadCode) ?? []), c])
  for (const list of byLead.values()) {
    list.sort((a, b) => Number(!!b.isPrimary) - Number(!!a.isPrimary))
  }
  const kit = makeKit(ctx)
  for (const s of ctx.stories) {
    emitJourney(kit, s, byLead)
    if (s.growth) emitJourney(kit, s.growth, byLead)
  }
}

/** Optional: runs inside the write transaction after every row is in (use `tx` only). */
export const afterWrite: AfterWrite | undefined = undefined
