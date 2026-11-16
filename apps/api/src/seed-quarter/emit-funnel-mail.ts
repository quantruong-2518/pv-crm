import { eventKeyOf } from '@api/branches/sales/campaign/mas.service'
import { loadEnv } from '@api/platform/config/env'
import { addDays, vnAt } from './clock'
import { LETTERS } from './emit-funnel-data'
import {
  wavesOf,
  type Campaign,
  type Member,
  type Recipient,
  type Wave,
} from './emit-funnel-members'
import { CAMPAIGNS, MAIL, WINDOW_START } from './params'
import type { Ctx } from './types'

/** One mail_run per wave, one email_delivery per recipient, then what each
 *  recipient did. Nothing is left in a state the worker would act on: every
 *  sent letter is terminal, a draft wave has no letters. Waves are walked in
 *  send order so an unsubscribe in wave 1 is a suppressed letter in wave 2. */

/** `MasService` snapshots these two from the environment; a seeded DRAFT wave that a
 *  demo user starts must go out from a sender the provider accepts. The URL
 *  fallback only lets `loadEnv` validate where the harness set none. */
function senderOf(): { from: string; replyTo: string | null } {
  const env = loadEnv({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'pglite://memory',
  })
  return {
    from: env.PV_EMAIL_MAS_FROM || env.PV_EMAIL_FROM,
    replyTo: env.PV_EMAIL_MAS_REPLY_TO || null,
  }
}

/** Same pair `MasService` writes; copied, not imported, because they are private constants. */
const TEMPLATE = 'mas-v1'
const EVENT = 'sales.mas.run.queued'

type Fate = 'delivered' | 'bounced' | 'complained' | 'failed_permanent' | 'suppressed' | 'withheld'
type Job = { c: Campaign; wave: Wave; letterNo: number; runId: string; people: Member[] }
type Forced = { fate?: Fate; reply?: boolean; unsubscribe?: boolean; click?: boolean }

const minutes = (at: Date, m: number): Date => new Date(at.getTime() + m * 60_000)
const merged = (text: string, r: Recipient): string =>
  text.replaceAll('{{company}}', r.company).replaceAll('{{contactName}}', r.contactName)

export function emitMail(ctx: Ctx, members: Map<string, Member[]>): void {
  const { plan, rng } = ctx
  const owner = (c: Campaign): string => c.owner
  const jobs: Job[] = []
  for (const c of CAMPAIGNS) {
    for (const wave of wavesOf(c, ctx.today)) {
      const letters = LETTERS[c.key] ?? []
      const live = (members.get(c.key) ?? []).filter(
        (m) => !m.removed && m.addedAt <= wave.createdAt,
      )
      if (letters[wave.no - 1])
        jobs.push({ c, wave, letterNo: wave.no - 1, runId: rng.uuid(), people: live })
    }
  }
  jobs.sort(
    (a, b) => (a.wave.sendAt?.getTime() ?? Infinity) - (b.wave.sendAt?.getTime() ?? Infinity),
  )

  const suppressed = new Map<string, Date>()
  const everyone = [...new Set(jobs.flatMap((j) => j.people.map((m) => m.who.email)))]
  everyone.forEach((email, i) => {
    if (!rng.chance(MAIL.suppressed / 4) && i !== 3) return
    const [reason, source] = rng.weighted([
      [['manual', 'operator'], 3],
      [['hard_bounce', 'resend'], 2],
      [['unsubscribe', 'operator'], 1],
    ] as const)
    const createdAt = addDays(WINDOW_START, -rng.int(20, 200))
    suppressed.set(email, vnAt(createdAt, 11))
    plan.emailSuppression.push({
      recipient: email,
      reason: reason as 'manual',
      source: source as 'operator',
      createdAt: vnAt(createdAt, 11),
    })
  })

  const forced = pickForced(jobs, suppressed)
  const replied = new Map<string, Date>() // `${campaign}|${lead}` -> first reply
  const state: State = {
    suppressed,
    replied,
    forced,
    owner,
    lastSend: new Map(),
    sender: senderOf(),
  }
  for (const job of jobs) writeWave(ctx, job, state)
  for (const c of CAMPAIGNS) writeSequence(ctx, c)
}

type State = {
  suppressed: Map<string, Date>
  replied: Map<string, Date>
  forced: Map<string, Forced>
  /** Last wave sent per campaign: the gate asks who met us since then. */
  lastSend: Map<string, Date>
  owner: (c: Campaign) => string
  sender: ReturnType<typeof senderOf>
}

/** One campaign with two sent waves gets a scripted first wave, so the gate and
 *  the suppression path are always demonstrable whatever the dice say. */
function pickForced(jobs: Job[], suppressed: Map<string, Date>): Map<string, Forced> {
  const chains = jobs.filter(
    (j) =>
      j.wave.no === 1 &&
      jobs.some((k) => k.c === j.c && k.wave.no === 2 && k.wave.state === 'sent'),
  )
  const first = [...chains].sort((a, b) => b.people.length - a.people.length)[0]
  const forced = new Map<string, Forced>()
  if (!first) return forced
  const open = first.people.filter((m) => !suppressed.has(m.who.email))
  const script: Forced[] = [
    { reply: true },
    { unsubscribe: true },
    { fate: 'complained' },
    { fate: 'failed_permanent' },
    { fate: 'bounced' },
    { click: true },
  ]
  script.forEach((f, i) => {
    const m = open[i]
    if (m) forced.set(`${first.runId}|${m.who.code}`, f)
  })
  return forced
}

function fateOf(ctx: Ctx, job: Job, who: Recipient, st: State): Fate {
  const sendAt = job.wave.sendAt!
  const f = st.forced.get(`${job.runId}|${who.code}`)?.fate
  if (f) return f
  const asked = st.replied.get(`${job.c.key}|${who.code}`)
  const met = who.heldAts.some((d) => d <= sendAt && d >= (st.lastSend.get(job.c.key) ?? sendAt))
  if (job.wave.no >= 2 && (asked || met)) return 'withheld'
  const blocked = st.suppressed.get(who.email)
  if (blocked && blocked <= sendAt) return 'suppressed'
  const u = ctx.rng.next()
  const edges: [Fate, number][] = [
    ['bounced', MAIL.bounced],
    ['complained', MAIL.complained],
    ['failed_permanent', MAIL.failedPermanent],
  ]
  let at = 0
  for (const [fate, p] of edges) {
    at += p
    if (u < at) return fate
  }
  return 'delivered'
}

function writeWave(ctx: Ctx, job: Job, st: State): void {
  const { plan } = ctx
  const { c, wave } = job
  const letter = LETTERS[c.key]![job.letterNo]!
  const code = ctx.ids.campaign.get(c.key)!
  const sendAt = wave.sendAt
  const gated = wave.no >= 2
  const base = {
    id: job.runId,
    label: letter.label,
    subject: letter.subject,
    body: letter.body,
    ctaLabel: letter.cta[0],
    ctaUrl: letter.cta[1],
    fromAddress: st.sender.from,
    replyTo: st.sender.replyTo,
    kind: 'bulk' as const,
    transport: 'resend' as const,
    awaitsRelease: gated,
    createdBy: st.owner(c),
    createdAt: wave.createdAt,
  }
  if (!sendAt) {
    plan.mailRun.push({ ...base, state: 'DRAFT', audienceCount: 0, updatedAt: wave.createdAt })
    return
  }
  const letters = dedupe(job.people.filter((m) => !m.who.disabledAt || m.who.disabledAt > sendAt))
  let last = sendAt
  letters.forEach((m, i) => {
    const at = minutes(sendAt, 0.02 * i)
    last = at
    writeLetter(ctx, job, m.who, at, st)
  })
  const finishedAt = minutes(last, 2)
  plan.mailRun.push({
    ...base,
    state: 'SENT',
    releasedAt: gated ? sendAt : null,
    scheduledAt: sendAt,
    startedAt: minutes(sendAt, 0.1),
    finishedAt,
    audienceCount: letters.length,
    updatedAt: finishedAt,
  })
  st.lastSend.set(c.key, sendAt)
  plan.mailSequenceRun.push({
    subjectType: 'campaign',
    subjectCode: code,
    mailRunId: job.runId,
    waveNo: wave.no,
    phase: letter.label,
    expected: letters.length,
  })
}

const dedupe = (people: Member[]): Member[] => {
  const seen = new Set<string>()
  return people.filter((m) => (seen.has(m.who.email) ? false : (seen.add(m.who.email), true)))
}

function writeLetter(ctx: Ctx, job: Job, who: Recipient, acceptedBase: Date, st: State): void {
  const { plan, rng } = ctx
  const sendAt = job.wave.sendAt!
  const fate = fateOf(ctx, job, who, st)
  const script = st.forced.get(`${job.runId}|${who.code}`)
  const key = eventKeyOf('lead', job.runId, who.code)
  const posted = fate === 'delivered' || fate === 'bounced' || fate === 'complained'
  const acceptedAt = posted ? acceptedBase : null
  const deliveredAt =
    fate === 'delivered' || fate === 'complained' ? minutes(acceptedBase, rng.real(0.2, 3)) : null
  const id = rng.uuid()
  const failure: Record<string, [string, string]> = {
    bounced: ['bounce.hard', 'Thư bị trả lại: hộp thư người nhận không tồn tại.'],
    failed_permanent: ['rejected', 'Nhà cung cấp từ chối: địa chỉ người nhận không hợp lệ.'],
    withheld: [
      st.replied.has(`${job.c.key}|${who.code}`) ? 'replied' : 'met',
      'Người nhận bị giữ lại, chưa gửi.',
    ],
    suppressed: ['unsubscribe', 'recipient suppressed: unsubscribe'],
  }
  const [errCode, errSummary] = failure[fate] ?? [null, null]
  plan.emailDelivery.push({
    id,
    eventKey: key,
    eventType: EVENT,
    aggregateType: 'lead',
    aggregateId: who.code,
    template: TEMPLATE,
    templateVersion: 1,
    recipient: who.email,
    state: fate,
    provider: 'resend',
    providerEmailId: posted ? rng.uuid() : null,
    idempotencyKey: key,
    attemptCount:
      fate === 'suppressed' || fate === 'withheld' ? 0 : fate === 'failed_permanent' ? 3 : 1,
    lastErrorCode: errCode,
    lastErrorSummary: errSummary,
    acceptedAt,
    deliveredAt,
    mailRunId: job.runId,
    role: 'recipient',
    merge: {
      company: who.company,
      account: who.company,
      contactName: who.contactName,
      contact_name: who.contactName,
      email: who.email,
    },
    createdAt: job.wave.createdAt,
    updatedAt: deliveredAt ?? acceptedAt ?? sendAt,
  })
  if (fate === 'bounced' || fate === 'failed_permanent' || fate === 'complained')
    suppress(ctx, who.email, fate, deliveredAt ?? minutes(acceptedBase, 1), st)
  if (fate === 'delivered' || fate === 'complained')
    engage(ctx, job, who, id, deliveredAt!, fate, script, st)
}

function suppress(ctx: Ctx, email: string, fate: Fate, at: Date, st: State): void {
  if (st.suppressed.has(email)) return
  const reason =
    fate === 'bounced' ? 'hard_bounce' : fate === 'complained' ? 'complaint' : 'send_failed'
  st.suppressed.set(email, at)
  ctx.plan.emailSuppression.push({ recipient: email, reason, source: 'resend', createdAt: at })
}

/** Opens, clicks, unsubscribes and replies, every one after the letter arrived and never after `now`. */
function engage(
  ctx: Ctx,
  job: Job,
  who: Recipient,
  deliveryId: string,
  deliveredAt: Date,
  fate: Fate,
  script: Forced | undefined,
  st: State,
): void {
  const { plan, rng } = ctx
  const letter = LETTERS[job.c.key]![job.letterNo]!
  const live = (at: Date): boolean => at <= ctx.now
  const replies = script?.reply || (fate === 'delivered' && rng.chance(MAIL.reply / MAIL.delivered))
  const unsubscribes =
    script?.unsubscribe || (fate === 'delivered' && rng.chance(MAIL.unsubscribe / MAIL.delivered))
  const opens =
    script?.reply ||
    script?.unsubscribe ||
    script?.click ||
    replies ||
    unsubscribes ||
    rng.chance(MAIL.open)
  if (!opens) return
  const openAt = minutes(deliveredAt, rng.int(3, 1500))
  if (!live(openAt)) return
  plan.mailEvent.push({ deliveryId, kind: 'OPEN', at: openAt })
  if (rng.chance(0.25)) {
    const again = minutes(openAt, rng.int(30, 2400))
    if (live(again)) plan.mailEvent.push({ deliveryId, kind: 'OPEN', at: again })
  }
  if (script?.click || rng.chance(MAIL.clickOfOpened)) {
    const at = minutes(openAt, rng.int(1, 30))
    if (live(at)) plan.mailEvent.push({ deliveryId, kind: 'CLICK', at, url: letter.cta[1] })
  }
  if (unsubscribes) {
    const at = minutes(openAt, rng.int(2, 60))
    if (live(at)) {
      plan.mailEvent.push({ deliveryId, kind: 'UNSUBSCRIBE', at })
      if (!st.suppressed.has(who.email)) {
        st.suppressed.set(who.email, at)
        plan.emailSuppression.push({
          recipient: who.email,
          reason: 'unsubscribe',
          source: 'operator',
          createdAt: at,
        })
      }
    }
  }
  if (replies) {
    const at = minutes(openAt, rng.int(20, 3000))
    if (live(at)) {
      plan.mailReply.push({
        deliveryId,
        fromAddress: who.email,
        subject: `Re: ${merged(letter.subject, who)}`.slice(0, 200),
        receivedAt: at,
        providerEmailId: `inbound-${rng.uuid()}`,
        createdAt: at,
      })
      const k = `${job.c.key}|${who.code}`
      if (!st.replied.has(k)) st.replied.set(k, at)
    }
  }
}

/** The DRAFT wave's sequence row is what stops `CampaignSweeper` closing a RUNNING campaign. */
function writeSequence(ctx: Ctx, c: Campaign): void {
  const code = ctx.ids.campaign.get(c.key)!
  const have = new Set(
    ctx.plan.mailSequenceRun.filter((s) => s.subjectCode === code).map((s) => s.waveNo),
  )
  for (const wave of wavesOf(c, ctx.today)) {
    if (wave.state !== 'draft' || have.has(wave.no)) continue
    const run = ctx.plan.mailRun.find(
      (r) => r.state === 'DRAFT' && r.label === LETTERS[c.key]?.[wave.no - 1]?.label,
    )
    if (!run?.id) continue
    ctx.plan.mailSequenceRun.push({
      subjectType: 'campaign',
      subjectCode: code,
      mailRunId: run.id,
      waveNo: wave.no,
      phase: run.label,
      expected: null,
    })
  }
}
