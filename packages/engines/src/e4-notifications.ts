import type { ObjectRef } from './types'

/** E4 · Multi-channel notifications — THE DECIDER, AND NOTHING ELSE.
 *
 *  Holds: event → condition → channel → template. A branch emits an event and
 *  gets back a list of INTENTS; it never picks a channel, never picks a
 *  template, and never calls a provider. That is the whole reason E4 exists as
 *  an engine rather than as a helper inside `branches/sales`.
 *
 *  ------------------------------------------------------------------
 *  WHY THE IN-MEMORY DELIVERY LOG IS GONE
 *  ------------------------------------------------------------------
 *  The previous version kept a `Delivery[]` inside the bus and refused a
 *  second send within a 15-minute window by scanning it. That log could never
 *  be a real anti-duplicate: it died with the process, so a restart between
 *  two submits sent twice; and two machines meant two logs, so a load balancer
 *  sent twice by design. It also made `emit` impure, which is precisely what
 *  disqualifies an engine from running on both ends of the wire.
 *
 *  De-duplication now lives one layer down, where it can actually hold:
 *  `UNIQUE(event_key)` on `platform.email_delivery`. Postgres refuses the
 *  second row across processes, machines and restarts, and the same key is
 *  reused as the provider's idempotency key so even a crash between "provider
 *  accepted" and "database updated" cannot produce a second mail.
 *
 *  So E4's job shrank to the part that is genuinely a decision: given an
 *  event, which mails does the system intend to send, and under what key.
 *  Same input, same output, no I/O, no clock. */

export type Channel = 'zalo-oa' | 'telegram' | 'email' | 'in-app'

/** Event name emitted by the Sales branch when the public landing door has
 *  accepted a lead. Exported so the branch cannot hand-type a string that
 *  silently matches no rule. */
export const LEAD_INTAKE_ACCEPTED = 'sales.lead.intake.accepted'

/** Event name emitted by the Sales branch when a lead has been promoted into an
 *  opportunity — `POST /sales/opportunities`.
 *
 *  ONE event, not two, and the difference between "a deal just opened" and "a
 *  deal was booked already lost" is a `when` predicate on two rules below. The
 *  branch reports WHAT HAPPENED — an opportunity came into existence — and E4
 *  decides which letter that is worth. A branch choosing between two event
 *  names is a branch making a routing decision, which is the thing this engine
 *  exists to take off it. */
export const OPPORTUNITY_OPENED = 'sales.opportunity.opened'

/** Audience key: the company's own mailbox, not the customer's. */
export const AUDIENCE_INTERNAL = 'internal'

export type EventPayload = {
  /** What happened, e.g. `sales.lead.intake.accepted`. */
  name: string
  /** The object this is about. `ref.code` becomes the last segment of the
   *  event key, so an event without one produces no intent at all — a mail
   *  that cannot be de-duplicated must not be queued. */
  ref?: ObjectRef
  /** Where each audience actually receives, resolved by the CALLER from
   *  configuration. The engine must not read env, and a mailbox is deployment
   *  data, not a rule: staging and production run the same rule table and
   *  different addresses. An audience missing here (or blank) drops its rules,
   *  which is the correct behaviour on a machine that has not been told where
   *  to send. */
  audiences?: Record<string, string>
  /** Informational, for `when` predicates. Never used to make time-based
   *  decisions here — see the note about the delivery log above. */
  at?: string
  data?: Record<string, unknown>
}

export type NotificationRule = {
  id: string
  /** Event name this rule listens to. */
  event: string
  /** Extra filter. Omitted = every event of that name. */
  when?: (payload: EventPayload) => boolean
  channel: Channel
  /** First segment of the event key — the business flow, stable across
   *  template rewrites. */
  flow: string
  /** Second segment of the event key, and the lookup key into
   *  `EventPayload.audiences`. */
  audience: string
  template: string
  /** Third segment of the event key, as `v<n>`.
   *
   *  Key version and template version are deliberately the SAME number: a body
   *  rewritten hard enough to earn a new version is a different mail, and
   *  de-duplication should not hide it. The consequence to know before bumping
   *  it: a code that already received v1 becomes eligible for v2. Split the
   *  two fields the day that consequence stops being what you want. */
  templateVersion: number
  /** Display only, for the rules table on screen 05. Neither is used for
   *  routing — `audience` routes. */
  timing?: string
  role?: string
}

/** One mail the system intends to send. Everything the persistence layer needs
 *  to write a ledger row, and nothing it does not. */
export type NotificationIntent = {
  ruleId: string
  channel: Channel
  template: string
  templateVersion: number
  to: string
  /** `<flow>/<audience>/v<n>/<code>` — UNIQUE in the ledger, reused as the
   *  provider idempotency key. This string is the anti-duplicate spine. */
  eventKey: string
}

/** The rule table. Data, not code: adding a notification is adding a row. */
export const NOTIFICATION_RULES: readonly NotificationRule[] = [
  {
    id: 'lead-intake-internal',
    event: LEAD_INTAKE_ACCEPTED,
    channel: 'email',
    flow: 'lead-intake',
    audience: AUDIENCE_INTERNAL,
    template: 'lead-intake-internal',
    templateVersion: 1,
    timing: 'ngay',
    role: 'Sales',
  },

  /* Hai rule dưới đây nghe CÙNG một event và loại trừ nhau bằng `when`, đọc
     đúng một trường: `data.lost`. Nhánh đặt trường đó từ `state === 'close-lost'`
     của chính dòng vừa ghi — nó là một sự thật về đơn, không phải một lựa chọn
     về mail.

     `flow` khác nhau nên khoá event cũng khác nhau: một đơn mở rồi thua sau
     này vẫn nhận được lá thứ hai, trong khi `UNIQUE(event_key)` vẫn chặn hai lá
     cùng loại cho cùng một mã. Gộp chung một `flow` thì lá thứ hai bị coi là
     trùng và im lặng biến mất — đúng loại lỗi mà bảng này khó nhìn ra nhất. */
  {
    id: 'opportunity-opened-internal',
    event: OPPORTUNITY_OPENED,
    when: (payload) => payload.data?.lost !== true,
    channel: 'email',
    flow: 'opportunity-open',
    audience: AUDIENCE_INTERNAL,
    template: 'opportunity-opened',
    templateVersion: 1,
    timing: 'ngay',
    role: 'Sales',
  },
  {
    id: 'opportunity-lost-internal',
    event: OPPORTUNITY_OPENED,
    when: (payload) => payload.data?.lost === true,
    channel: 'email',
    flow: 'opportunity-lost',
    audience: AUDIENCE_INTERNAL,
    template: 'opportunity-lost',
    templateVersion: 1,
    timing: 'ngay',
    role: 'Sales',
  },
]

/** Given an event, what does the system intend to send?
 *
 *  Pure: same input, same output, no I/O, no clock, no memory between calls.
 *  Whether any of these intents becomes a real mail — and whether it is a
 *  duplicate — is decided by the ledger, not here. */
export function plan(
  event: EventPayload,
  rules: readonly NotificationRule[] = NOTIFICATION_RULES,
): NotificationIntent[] {
  const code = event.ref?.code
  if (!code) return []

  return rules.flatMap<NotificationIntent>((rule) => {
    if (rule.event !== event.name) return []
    if (rule.when && !rule.when(event)) return []

    const to = event.audiences?.[rule.audience]?.trim()
    if (!to) return []

    return [
      {
        ruleId: rule.id,
        channel: rule.channel,
        template: rule.template,
        templateVersion: rule.templateVersion,
        to,
        eventKey: `${rule.flow}/${rule.audience}/v${rule.templateVersion}/${code}`,
      },
    ]
  })
}
