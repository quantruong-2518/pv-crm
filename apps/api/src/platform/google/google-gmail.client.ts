import { Injectable, Logger } from '@nestjs/common'
import { z } from 'zod'
import { GoogleAccess, type GoogleToken } from './google-access'
import { GOOGLE_TIMEOUT_MS } from './google-oauth.client'

/** The ONLY file that knows Gmail's REST endpoints. Plain `fetch`, never
 *  throws: every failure is a typed outcome the mail path maps to a verdict.
 *
 *  Built for the `gmail.metadata` scope, and the limits are Google's, not a
 *  preference: `q` is refused on list calls and `format=full|raw` on reads, so
 *  this file asks for `format=metadata` with named headers and nothing else.
 *  `fields` keeps `snippet` (the first words of a body) out of the response
 *  altogether — it is never parsed, stored or logged here.
 *
 *  Logs name the step and the status only: no token, no address, no subject. */

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

/** Correlates a sent letter with its ledger row — Gmail has no idempotency key. */
export const DELIVERY_HEADER = 'X-PV-Delivery'

/** Everything the reply sweep may look at. Lower-cased keys on the way out. */
const THREAD_HEADERS = [
  'From',
  'Subject',
  'Auto-Submitted',
  'Precedence',
  'X-Autoreply',
  'X-Failed-Recipients',
  DELIVERY_HEADER,
]

/** `findSent`'s budget. The mail job expires at 60 s (`boss.provider.ts`) and
 *  a batch is two jobs in sequence: 2 × (12 s walk + 8 s send) leaves margin. */
const FIND_SENT_DEADLINE_MS = 12_000
const FIND_SENT_CALL_MS = 4_000
const FIND_SENT_PAGE = 100
/** A metadata read costs 5 quota units of the person's 250 per second. */
const FIND_SENT_PARALLEL = 8

/** `unlinked` no usable link (off, never connected, revoked, 401) ·
 *  `no_consent` the Gmail boxes were not ticked · `transient` worth a retry ·
 *  `rejected` Google refused this request for good. */
export type GmailFailure = {
  ok: false
  kind: 'unlinked' | 'no_consent' | 'transient' | 'rejected'
  status: number | null
}

export type GmailRef = { id: string; threadId: string }
export type GmailThreadMessage = { id: string; at: Date; headers: Record<string, string> }
export type GmailMailbox = { ok: true; email: string; token: string }

const Ref = z.object({ id: z.string().min(1), threadId: z.string().min(1) })
const SentList = z.object({
  messages: z.array(Ref).optional(),
  nextPageToken: z.string().optional(),
})
const Message = z.object({
  id: z.string().min(1),
  internalDate: z.string().regex(/^\d+$/),
  payload: z
    .object({ headers: z.array(z.object({ name: z.string(), value: z.string() })).optional() })
    .optional(),
})
const Thread = z.object({ messages: z.array(Message).optional() })
const MESSAGE_FIELDS = 'id,internalDate,payload/headers'

@Injectable()
export class GoogleGmail {
  private readonly log = new Logger('google')

  constructor(private readonly access: GoogleAccess) {}

  get configured(): boolean {
    return this.access.configured
  }

  /** `rawRfc822` is the whole message as text; Gmail wants it base64url. */
  async send(
    actorId: string,
    mailbox: string,
    rawRfc822: string,
  ): Promise<({ ok: true } & GmailRef) | GmailFailure> {
    const signal = AbortSignal.timeout(GOOGLE_TIMEOUT_MS)
    const box = await this.open(actorId, mailbox, signal)
    if (!box.ok) return box
    const body = JSON.stringify({ raw: Buffer.from(rawRfc822, 'utf8').toString('base64url') })
    const sent = await this.call('send', `${API}/messages/send`, box.token, signal, Ref, body)
    return sent.ok ? { ok: true, ...sent.data } : sent
  }

  /** The letter carrying this delivery id in the person's SENT label, walked
   *  page by page until a whole page is older than `since` — Gmail lists
   *  newest first, but one stray old message must not end the walk early.
   *  A failed or timed-out lookup is a FAILURE, never "not found": this is the
   *  only duplicate guard, and the caller must not send on a guess. */
  async findSent(
    actorId: string,
    mailbox: string,
    deliveryId: string,
    since: Date,
  ): Promise<{ ok: true; found: GmailRef | null } | GmailFailure> {
    const deadline = AbortSignal.timeout(FIND_SENT_DEADLINE_MS)
    const step = () => AbortSignal.any([deadline, AbortSignal.timeout(FIND_SENT_CALL_MS)])
    const box = await this.open(actorId, mailbox, step())
    if (!box.ok) return box

    const get = `format=metadata&metadataHeaders=${DELIVERY_HEADER}&fields=${MESSAGE_FIELDS}`
    let page: string | undefined
    do {
      const list = await this.call(
        'list',
        `${API}/messages?labelIds=SENT&maxResults=${FIND_SENT_PAGE}` +
          `&fields=nextPageToken,messages(id,threadId)` +
          (page ? `&pageToken=${encodeURIComponent(page)}` : ''),
        box.token,
        step(),
        SentList,
      )
      if (!list.ok) return list
      const refs = list.data.messages ?? []

      let inWindow = false
      for (let at = 0; at < refs.length; at += FIND_SENT_PARALLEL) {
        const batch = refs.slice(at, at + FIND_SENT_PARALLEL)
        const got = await Promise.all(
          batch.map((ref) =>
            this.call(
              'get',
              `${API}/messages/${encodeURIComponent(ref.id)}?${get}`,
              box.token,
              step(),
              Message,
            ),
          ),
        )
        for (const [i, one] of got.entries()) {
          /* Deleted between the list and the read: it cannot be our letter. */
          if (!one.ok && one.status === 404) continue
          if (!one.ok) return one
          const message = messageOf(one.data)
          if (message.at >= since) inWindow = true
          if (message.headers[DELIVERY_HEADER.toLowerCase()]?.trim() === deliveryId) {
            return { ok: true, found: batch[i] ?? null }
          }
        }
      }
      page = inWindow ? list.data.nextPageToken : undefined
    } while (page)
    return { ok: true, found: null }
  }

  /** One access token for a whole sweep pass over one person's threads. */
  async mailbox(actorId: string, mailbox: string): Promise<GmailMailbox | GmailFailure> {
    return this.open(actorId, mailbox, AbortSignal.timeout(GOOGLE_TIMEOUT_MS))
  }

  /** Headers of every message in one thread — `THREAD_HEADERS` and no other. */
  async thread(
    box: GmailMailbox,
    threadId: string,
  ): Promise<{ ok: true; messages: GmailThreadMessage[] } | GmailFailure> {
    const headers = THREAD_HEADERS.map((h) => `metadataHeaders=${h}`).join('&')
    const got = await this.call(
      'thread',
      `${API}/threads/${encodeURIComponent(threadId)}?format=metadata&${headers}` +
        `&fields=messages(${MESSAGE_FIELDS})`,
      box.token,
      AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      Thread,
    )
    return got.ok ? { ok: true, messages: (got.data.messages ?? []).map(messageOf) } : got
  }

  /** `mailbox` is the address the letter was FILED from. A link that now
   *  points elsewhere, or lost its consent or its company domain, is not that
   *  mailbox any more: nothing is sent from it and nothing is read in it. */
  private async open(
    actorId: string,
    mailbox: string,
    signal: AbortSignal,
  ): Promise<GmailMailbox | GmailFailure> {
    const expected = mailbox.trim().toLowerCase()
    const link = await this.access.mailReadiness(actorId)
    if (link?.readiness !== 'ready' || link.email.trim().toLowerCase() !== expected) {
      return { ok: false, kind: 'unlinked', status: null }
    }
    const access: GoogleToken = await this.access.tokenFor(actorId, signal)
    /* `failed` is a refresh that timed out or a key we mistyped — not the person's doing. */
    if (access.state === 'failed') return { ok: false, kind: 'transient', status: null }
    /* Read again off the row the token came from: a relink can land in between. */
    if (access.state !== 'ok' || access.email.trim().toLowerCase() !== expected) {
      return { ok: false, kind: 'unlinked', status: null }
    }
    return { ok: true, email: access.email, token: access.token }
  }

  private async call<T>(
    step: string,
    url: string,
    token: string,
    signal: AbortSignal,
    shape: z.ZodType<T>,
    body?: string,
  ): Promise<{ ok: true; data: T } | GmailFailure> {
    try {
      const response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body }),
        signal,
      })
      const json: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const kind = failureKind(response.status, json)
        this.log.warn(`gmail ${step} refused — status=${response.status} kind=${kind}`)
        return { ok: false, kind, status: response.status }
      }
      const parsed = shape.safeParse(json)
      if (parsed.success) return { ok: true, data: parsed.data }
      this.log.warn(`gmail ${step} reply has an unexpected shape`)
      return { ok: false, kind: 'transient', status: response.status }
    } catch {
      this.log.warn(`gmail ${step} unreachable — timeout or network`)
      return { ok: false, kind: 'transient', status: null }
    }
  }
}

function messageOf(m: z.infer<typeof Message>): GmailThreadMessage {
  const headers: Record<string, string> = {}
  /* First occurrence wins: a header repeated by a relay must not overwrite the original. */
  for (const h of m.payload?.headers ?? []) headers[h.name.toLowerCase()] ??= h.value
  return { id: m.id, at: new Date(Number(m.internalDate)), headers }
}

const ErrorBody = z.object({
  error: z.object({
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
    details: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
})

/** Google answers 403 for three unrelated things — a missing scope, a usage
 *  limit and a policy refusal — and only the machine `reason` tells them apart.
 *  The human `message` is never read: it can quote an address. */
export function failureKind(status: number, body: unknown): GmailFailure['kind'] {
  if (status === 401) return 'unlinked'
  if (status === 429 || status >= 500) return 'transient'
  if (status !== 403) return 'rejected'
  const parsed = ErrorBody.safeParse(body)
  const reasons = parsed.success
    ? [...(parsed.data.error.errors ?? []), ...(parsed.data.error.details ?? [])].map(
        (e) => e.reason ?? '',
      )
    : []
  if (reasons.some((r) => /limit/i.test(r))) return 'transient'
  if (reasons.some((r) => /insufficient/i.test(r))) return 'no_consent'
  return 'rejected'
}
