import { randomUUID } from 'node:crypto'
import { mailSequenceRun } from '@api/branches/sales/mail-sequence.schema'
import { mailRun } from '@api/platform/mail/mail-run.schema'
import { emailDelivery, mailEvent } from '@api/platform/mail/mail.schema'
import { WAVES, letterFate, type SourceKey } from './seed-book'

/** THE DEMO MAIL HISTORY — one `mail_run` per wave, one `email_delivery` per
 *  recipient, and the open/click/unsubscribe rows every campaign counter is
 *  summed from.
 *
 *  Split out of `seed.ts` on 20/09 when that file passed the 700-line ceiling.
 *  It takes what it needs and returns rows rather than reaching into the
 *  seed's accumulator: that keeps the arithmetic testable without a database,
 *  which is what `seed-book.test.ts` locks. */

/** Copied from `campaign/mas.service.ts` rather than imported: that file is a
 *  Nest provider and this is a plain script. The `.example` domain is the same
 *  reserved one every seeded mailbox uses — nothing here can be posted. */
const MAS_FROM = 'PV One <no-reply@pv-one.example>'
const MAS_TEMPLATE = 'mas-v1'
const MAS_EVENT = 'sales.mas.run.queued'

export type MailHistoryInput = {
  leads: readonly { code: string; email: string }[]
  members: readonly { campaignCode: string; leadCode: string }[]
  campaignCodeOf: ReadonlyMap<SourceKey, string>
  ownerId: string
  /** The seed's own clock: every demo time is DAYS AGO from the run, never a
   *  calendar date, so the book reads the same whichever day it is planted. */
  ago: (days: number) => Date
}

export type MailHistory = {
  runs: (typeof mailRun.$inferInsert)[]
  sequenceRuns: (typeof mailSequenceRun.$inferInsert)[]
  deliveries: (typeof emailDelivery.$inferInsert)[]
  events: (typeof mailEvent.$inferInsert)[]
}

export function mailHistory(input: MailHistoryInput): MailHistory {
  const emailOf = new Map(input.leads.map((l) => [l.code, l.email]))
  const out: MailHistory = { runs: [], sequenceRuns: [], deliveries: [], events: [] }

  for (const w of WAVES) {
    const campaignCode = input.campaignCodeOf.get(w.source)
    if (!campaignCode) continue

    const audience = input.members.filter((m) => m.campaignCode === campaignCode)
    const runId = randomUUID()
    const sentAt = input.ago(w.daysAgo)

    out.runs.push({
      id: runId,
      label: w.label,
      subject: w.subject,
      body: w.body,
      fromAddress: MAS_FROM,
      state: 'SENT',
      scheduledAt: sentAt,
      startedAt: sentAt,
      finishedAt: new Date(sentAt.getTime() + 4 * 60_000),
      audienceCount: audience.length,
      createdBy: input.ownerId,
      createdAt: sentAt,
      updatedAt: sentAt,
    })

    out.sequenceRuns.push({
      subjectType: 'campaign',
      subjectCode: campaignCode,
      mailRunId: runId,
      waveNo: w.no,
      expected: audience.length,
    })

    audience.forEach((m, i) => {
      const email = emailOf.get(m.leadCode)
      if (!email) return
      const fate = letterFate(i, w.no)
      const deliveryId = randomUUID()
      /* The same key shape `MasService.intentOf` writes, so a seeded letter and
         a real one are the same row to every reader downstream. */
      const key = `mas/campaign/v1/${runId}:${m.leadCode}`

      out.deliveries.push({
        id: deliveryId,
        eventKey: key,
        eventType: MAS_EVENT,
        aggregateType: 'campaign',
        aggregateId: m.leadCode,
        template: MAS_TEMPLATE,
        templateVersion: 1,
        recipient: email,
        state: fate.state,
        idempotencyKey: key,
        attemptCount: 1,
        acceptedAt: fate.state === 'suppressed' ? null : sentAt,
        deliveredAt: fate.state === 'delivered' ? new Date(sentAt.getTime() + 90_000) : null,
        mailRunId: runId,
        createdAt: sentAt,
        updatedAt: sentAt,
      })

      /* Minutes apart and in the only order that can happen: a click is a click
         INSIDE a letter somebody opened. */
      const at = (mins: number) => new Date(sentAt.getTime() + mins * 60_000)
      if (fate.opened) out.events.push({ deliveryId, kind: 'OPEN', at: at(140 + i) })
      if (fate.clicked) {
        out.events.push({
          deliveryId,
          kind: 'CLICK',
          at: at(150 + i),
          url: 'https://pv-one.example/case-study',
        })
      }
      if (fate.unsubscribed) out.events.push({ deliveryId, kind: 'UNSUBSCRIBE', at: at(160 + i) })
    })
  }

  return out
}
