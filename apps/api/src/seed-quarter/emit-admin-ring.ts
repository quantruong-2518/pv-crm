import { NOTIFICATION_KINDS_DIGESTED, type NotificationSubject } from '@pv/contracts'
import { NOTIFICATION_RULES, plan, type EventPayload } from '@pv/engines'
import { sql } from 'drizzle-orm'
import { notification } from '@api/platform/notification/notification.schema'
import type { Db } from '@api/platform/db/db.module'
import { KPI } from './params'
import type { Ctx } from './types'
import type { Rng } from './rng'

/** Bell candidates, thinned and written the way the live hub would have left
 *  them. Every key comes out of E4's own `plan`, so it can never drift from
 *  what the worker's sweeps compute. Digested kinds are skipped: the hub
 *  writes them already read, and the brief does not want them. */

export type Cand = {
  recipientId: string
  kind: string
  eventKey: string
  subjectKind: NotificationSubject
  subjectCode: string
  subjectLabel: string | null
  actorId: string | null
  detail: Record<string, unknown> | null
  createdAt: Date
  /** A line somebody still has to act on: it stays unread whatever its age. */
  pending: boolean
}

export type Ring = {
  event: EventPayload
  subject: { kind: NotificationSubject; code: string; label?: string | null }
  detail?: Record<string, unknown> | null
  at: Date
  pending?: boolean
}

const DAY = 86_400_000
const MIN = 60_000
/** The hourly purge drops read lines 90 days after `read_at`; stay well inside. */
const HORIZON_DAYS = 80

export function ring(r: Ring): Cand[] {
  return plan(r.event, NOTIFICATION_RULES)
    .filter((i) => i.channel === 'in-app' && !NOTIFICATION_KINDS_DIGESTED.has(i.kind as never))
    .map((i) => ({
      recipientId: i.to,
      kind: i.kind,
      eventKey: i.eventKey,
      subjectKind: r.subject.kind,
      subjectCode: r.subject.code,
      subjectLabel: r.subject.label ?? null,
      actorId: r.event.actorId ?? null,
      detail: r.detail ?? null,
      createdAt: r.at,
      pending: r.pending ?? false,
    }))
}

const STAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:\d{2})?|Z)?$/

/** Postgres text to ISO: `T` for the space, `:00` after a bare hour offset, `Z` when none. */
const stampIso = (v: string): string => {
  const iso = v.replace(' ', 'T')
  const off = /[+-]\d{2}$/.test(iso) ? `${iso}:00` : iso
  return /(Z|[+-]\d{2}:\d{2})$/.test(off) ? off : `${off}Z`
}

/** Raw `execute` hands timestamps back as text; turn them into `Date`s. */
export async function rowsOf<T>(tx: Db, query: ReturnType<typeof sql>): Promise<T[]> {
  const rows = ((await tx.execute(query)) as unknown as { rows: Record<string, unknown>[] }).rows
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        typeof v === 'string' && STAMP.test(v) ? new Date(stampIso(v)) : v,
      ]),
    ),
  ) as T[]
}

/** Share of each kind's lines that survive; a deal moves through several
 *  columns and a bell for each would drown the rest. */
const KEEP: Record<string, number> = {
  'opportunity-stage-moved': 0.3,
  'contract-installment-paid': 0.7,
  'next-step-assigned': 0.6,
  'opportunity-awaiting-accept': 0.7,
  'opportunity-accepted': 0.7,
}

const PER_PERSON = 48
/** Each person keeps at least this many of every kind they ever got, so no kind goes missing. */
const PER_KIND_FLOOR = 2

/** Pulls a time inside the purge horizon and not past `now`. */
export const within = (at: Date, now: Date): Date =>
  new Date(Math.min(Math.max(at.getTime(), now.getTime() - HORIZON_DAYS * DAY), now.getTime()))

/** Per recipient: drop by kind rate, keep pending lines and a floor per kind, fill to `PER_PERSON` newest. */
export function thin(cands: Cand[], rng: Rng, now: Date): Cand[] {
  const known = new Map<string, Cand>()
  for (const c of cands) {
    const at = within(c.createdAt, now)
    if (!c.pending && c.createdAt.getTime() < at.getTime()) continue
    known.set(`${c.recipientId}|${c.eventKey}`, { ...c, createdAt: at })
  }
  const byPerson = new Map<string, Cand[]>()
  for (const c of known.values()) {
    if (!c.pending && !rng.chance(KEEP[c.kind] ?? 1)) continue
    byPerson.set(c.recipientId, [...(byPerson.get(c.recipientId) ?? []), c])
  }
  return [...byPerson.values()].flatMap((list) => {
    const sorted = list.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
    const seen = new Map<string, number>()
    const keep = new Set(
      sorted.filter((c) => {
        const n = seen.get(c.kind) ?? 0
        seen.set(c.kind, n + 1)
        return c.pending || n < PER_KIND_FLOOR
      }),
    )
    const room = Math.max(0, PER_PERSON - keep.size)
    const rest = sorted.filter((c) => !keep.has(c)).slice(0, room)
    return [...keep, ...rest]
  })
}

/** Old lines are mostly read, minutes to two days after they arrived. */
export function readAt(c: Cand, rng: Rng, now: Date): Date | null {
  if (c.pending) return null
  const age = (now.getTime() - c.createdAt.getTime()) / DAY
  if (age <= KPI.readAfterDays) return null
  const share = 0.92
  if (!rng.chance(share)) return null
  const wait = rng.int(5, 2 * 24 * 60)
  return new Date(Math.min(c.createdAt.getTime() + wait * MIN, now.getTime()))
}

/** Rows are written whole, as the hub writes them; a repeat key is left alone. */
export async function writeBells(
  tx: Db,
  ctx: Ctx,
  cands: Cand[],
  read: (c: Cand) => Date | null,
): Promise<number> {
  const live = cands.filter((c) => ctx.world.actors.has(c.recipientId))
  const rows = live.map((c) => ({
    recipientId: c.recipientId,
    kind: c.kind as never,
    eventKey: c.eventKey,
    subjectKind: c.subjectKind,
    subjectCode: c.subjectCode,
    subjectLabel: c.subjectLabel,
    actorId: c.actorId && ctx.world.actors.has(c.actorId) ? c.actorId : null,
    detail: c.detail,
    createdAt: c.createdAt,
    readAt: read(c),
  }))
  let written = 0
  for (let i = 0; i < rows.length; i += 500) {
    const got = await tx
      .insert(notification)
      .values(rows.slice(i, i + 500))
      .onConflictDoNothing({ target: [notification.recipientId, notification.eventKey] })
      .returning({ id: notification.id })
    written += got.length
  }
  return written
}
