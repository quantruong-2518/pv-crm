import type { ObjectRef } from './types'

/** E4 · Notifications — THE DECIDER, AND NOTHING ELSE.
 *
 *  Holds: event → condition → audience → kind. A branch reports what happened
 *  and gets back a list of INTENTS; it never picks who is told or what they
 *  are told. That is why E4 is an engine and not a helper in `branches/sales`.
 *
 *  It keeps no delivery log. An in-memory one dies with the process and is
 *  per machine, so it cannot stop a duplicate; the UNIQUE on the ledger row
 *  (`platform.notification`) can. E4 only names the key.
 *
 *  Same input, same output, no I/O, no clock. The rule rows live in
 *  `e4-bell-rules.ts`; why the internal mails became bell rows is in
 *  `docs/decisions/0085-notifications-ring-the-in-app-bell.md`. */

export type Channel = 'zalo-oa' | 'telegram' | 'email' | 'in-app'

export type EventPayload = {
  /** What happened, e.g. `sales.lead.handed-over`. */
  name: string
  /** The thing this is about. `ref.code` is the last fixed segment of the
   *  event key, so an event without one produces no intent at all — a
   *  notification that cannot be de-duplicated must not be written. */
  ref?: Pick<ObjectRef, 'code'>
  /** Who caused it. Never told about their own action. Absent for the worker
   *  and for inbound signals, where nobody at a keyboard did it. */
  actorId?: string
  /** Who each audience is, resolved by the CALLER: the engine cannot read a
   *  table, and "everyone holding `lead.assign` in this branch" is a query. An
   *  audience missing here drops its rules. */
  audiences?: Record<string, readonly string[]>
  /** Tells apart two happenings of the same kind on the same thing — the id
   *  of the row the caller just wrote. Without it the second hand-over of one
   *  lead to one person is a duplicate of the first and silently vanishes. */
  occurrence?: string
  data?: Record<string, unknown>
}

export type NotificationRule = {
  id: string
  /** Event name this rule listens to. */
  event: string
  /** Extra filter. Omitted = every event of that name. */
  when?: (payload: EventPayload) => boolean
  channel: Channel
  /** What the recipient is told — a `NotificationKind` of `@pv/contracts`.
   *  A string here because this package depends on nothing. */
  kind: string
  /** Lookup key into `EventPayload.audiences`. */
  audience: string
}

/** One row the system intends to write. */
export type NotificationIntent = {
  ruleId: string
  channel: Channel
  kind: string
  to: string
  /** `<kind>/<code>[/<occurrence>]` — UNIQUE per recipient in the ledger.
   *  The audience is deliberately NOT a segment: a person who is both the
   *  sender and the holder of a failed letter is told once. */
  eventKey: string
}

/** Given an event, who does the system intend to tell?
 *
 *  Pure: same input, same output, no I/O, no clock, no memory between calls.
 *  Whether an intent is a duplicate is decided by the ledger, not here. */
export function plan(
  event: EventPayload,
  rules: readonly NotificationRule[],
): NotificationIntent[] {
  const code = event.ref?.code
  if (!code) return []

  const seen = new Set<string>()
  return rules.flatMap<NotificationIntent>((rule) => {
    if (rule.event !== event.name) return []
    if (rule.when && !rule.when(event)) return []

    const eventKey = [rule.kind, code, event.occurrence].filter(Boolean).join('/')
    return (event.audiences?.[rule.audience] ?? []).flatMap((to) => {
      if (!to || to === event.actorId || seen.has(`${to} ${eventKey}`)) return []
      seen.add(`${to} ${eventKey}`)
      return [{ ruleId: rule.id, channel: rule.channel, kind: rule.kind, to, eventKey }]
    })
  })
}
