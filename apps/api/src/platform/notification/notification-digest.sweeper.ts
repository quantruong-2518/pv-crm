import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  effectiveImportant,
  NOTIFICATION_DETAIL_HIT,
  NOTIFICATION_DETAIL_METRIC_COUNT,
  NOTIFICATION_DETAIL_PROPOSED,
  NOTIFICATION_DETAIL_RESOLVED,
  NOTIFICATION_DETAIL_SLIP,
  NOTIFICATION_KINDS_DIGESTED,
  type NotificationKind,
} from '@pv/contracts'
import { NOTIFICATION_DIGEST } from '@pv/engines'
import { DB, type Db } from '../db/db.module'
import { NotificationPolicyRepository } from './notification-policy.repository'
import { NotificationHub } from './notification.hub'
import { NotificationRepository, type DigestibleRow } from './notification.repository'

const RETRY_MS = 5 * 60_000
const FROM_HOUR = 8
const DAY_MS = 24 * 60 * 60_000
/** Neither scan looks further back, so a stale recipient cannot pull months of rows;
 *  4 days is the Friday-to-Monday gap plus one working day, so a missed
 *  Monday or Friday pass still sees the digest before it. */
const LOOKBACK_MS = 4 * DAY_MS
const VIETNAM_MS = 7 * 60 * 60_000

/** Which `detail` key counts each digested kind (the contract's four keys). */
const COUNT_KEY: Partial<Record<NotificationKind, string>> = {
  'kpi-about-to-miss': NOTIFICATION_DETAIL_SLIP,
  'kpi-about-to-hit': NOTIFICATION_DETAIL_HIT,
  'kpi-counter-proposed': NOTIFICATION_DETAIL_PROPOSED,
  'kpi-counter-resolved': NOTIFICATION_DETAIL_RESOLVED,
}

/** Lower wins the digest's link: something to decide beats something decided
 *  beats a forecast (ADR 0145 §3). */
const rank = (kind: NotificationKind): number =>
  kind === 'kpi-counter-proposed' ? 0 : kind === 'kpi-counter-resolved' ? 1 : 2

/** Vietnam is UTC+7 all year; the same fixed shift `kpi-rules.ts` uses, local
 *  here because `platform/` may not import a branch. */
const vietnamClock = (at: number): { day: string; hour: number } => {
  const shifted = new Date(at + VIETNAM_MS)
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() }
}

/** The 08:00 Vietnam cut of a Vietnam day. */
const cutOf = (day: string): number => Date.parse(`${day}T08:00:00+07:00`)

/** Saturday or Sunday of a Vietnam day (`YYYY-MM-DD`). */
const isWeekend = (day: string): boolean => {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return weekday === 0 || weekday === 6
}

/** A forecast line covers several metrics and says how many; a line written
 *  before that key existed counts as one. */
const weightOf = (line: DigestibleRow): number => {
  const metrics = line.detail?.[NOTIFICATION_DETAIL_METRIC_COUNT]
  return typeof metrics === 'number' && metrics > 0 ? metrics : 1
}

/** Sums the digested lines (`NOTIFICATION_KINDS_DIGESTED`) into one `kpi-digest`
 *  line per person a day (ADR 0145). Rides the worker tick (`worker.ts`) and
 *  fires from Vietnam 08:00 on, Monday to Friday only (the owner's answer to
 *  open question 174); Monday's window reaches back to Friday's cut.
 *
 *  No claim table: the ledger is the state. The window is the lines created in
 *  `[the 08:00 cut of the last digest's day, today's 08:00)`, else back to the
 *  previous working day's cut; later lines wait for tomorrow. The event key
 *  `kpi-digest/<person>/<day>` makes a rerun a no-op, and a bell write the hub
 *  swallowed is picked up on the next pass: a missed day is caught up as long
 *  as the person's last digest is within 4 days.
 *  Goes through the hub, so mute applies to the digest too. A pass that
 *  succeeded sleeps until tomorrow's cut; one that threw retries in 5 minutes. */
@Injectable()
export class NotificationDigestSweeper {
  private readonly log = new Logger('notification')
  private notBefore = 0
  private running = false

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly repo: NotificationRepository,
    private readonly policies: NotificationPolicyRepository,
    private readonly hub: NotificationHub,
  ) {}

  /** Called on every worker tick. `null` = this tick was not a pass. */
  async sweep(now = Date.now()): Promise<number | null> {
    if (this.running || now < this.notBefore || vietnamClock(now).hour < FROM_HOUR) return null
    this.running = true
    try {
      const cut = cutOf(vietnamClock(now).day)
      if (isWeekend(vietnamClock(now).day)) {
        this.notBefore = cut + DAY_MS
        return null
      }
      const told = await this.pass(cut)
      this.notBefore = cut + DAY_MS
      return told
    } catch (error: unknown) {
      this.notBefore = now + RETRY_MS
      throw error
    } finally {
      this.running = false
    }
  }

  private pass(cut: number): Promise<number> {
    const day = vietnamClock(cut).day
    const isMonday = new Date(`${day}T00:00:00Z`).getUTCDay() === 1
    return this.db.transaction(async (tx) => {
      const lastDigest = await this.repo.lastCreated(tx, 'kpi-digest', new Date(cut - LOOKBACK_MS))
      const kinds = await this.counted(tx)
      const rows = await this.repo.digestible(tx, kinds, new Date(cut - LOOKBACK_MS), new Date(cut))
      const byPerson = new Map<string, DigestibleRow[]>()
      for (const row of rows) {
        const last = lastDigest.get(row.recipientId)
        const from = last
          ? cutOf(vietnamClock(last.getTime()).day)
          : cut - (isMonday ? 3 : 1) * DAY_MS
        if (row.createdAt.getTime() < from) continue
        byPerson.set(row.recipientId, [...(byPerson.get(row.recipientId) ?? []), row])
      }
      for (const [id, lines] of byPerson) await this.tell(tx, id, lines, day)
      if (byPerson.size > 0) this.log.log(`Announced ${byPerson.size} morning digests.`)
      return byPerson.size
    })
  }

  /** The kinds born read, by the hub's rule: one an admin made important rang instant. */
  private async counted(tx: Db): Promise<NotificationKind[]> {
    const all = [...NOTIFICATION_KINDS_DIGESTED]
    const switches = await this.policies.importance(tx, all)
    return all.filter((k) => !effectiveImportant(k, switches.get(k)))
  }

  /** `lines` arrive newest first, so the first of the best rank is the newest of it. */
  private tell(tx: Db, id: string, lines: DigestibleRow[], day: string): Promise<void> {
    const counts: Record<string, string | number> = {
      [NOTIFICATION_DETAIL_SLIP]: 0,
      [NOTIFICATION_DETAIL_HIT]: 0,
      [NOTIFICATION_DETAIL_PROPOSED]: 0,
      [NOTIFICATION_DETAIL_RESOLVED]: 0,
    }
    for (const line of lines) {
      const key = COUNT_KEY[line.kind]
      if (key) counts[key] = Number(counts[key]) + (rank(line.kind) === 2 ? weightOf(line) : 1)
    }
    const top = lines.reduce((best, line) => (rank(line.kind) < rank(best.kind) ? line : best))
    /* A team line opens on its month; the web reads `period` off the row. */
    const period = top.detail?.period
    return this.hub.announce(tx, {
      event: {
        name: NOTIFICATION_DIGEST,
        ref: { code: id },
        occurrence: day,
        audiences: { recipient: [id] },
      },
      /* No label: one line's name ("Win rate · 11/2026") would misdescribe the sum. */
      subject: { kind: top.subjectKind, code: top.subjectCode, label: null },
      detail: typeof period === 'string' ? { ...counts, period } : counts,
    })
  }
}
