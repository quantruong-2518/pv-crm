// @vitest-environment node
import 'reflect-metadata'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { Actor } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'
import type { CalendarOutcome, GoogleCalendar } from '@api/platform/google/google-calendar.client'
import { NotificationHub } from '../../../platform/notification/notification.hub'
import { NotificationPolicyRepository } from '../../../platform/notification/notification-policy.repository'
import { NotificationRepository } from '../../../platform/notification/notification.repository'
import { RolePermissionRepository } from '../../../platform/roles/role-permission.repository'
import { MeetingCalendar, calendarEventId } from './meeting-calendar'
import { MeetingCalendarRepository } from './meeting-calendar.repository'
import { MeetingCancel } from './meeting-cancel'
import { MeetingCancelSweeper } from './meeting-cancel.sweeper'
import { MeetingRepository } from './meeting.repository'
import { MeetingService } from './meeting.service'

/* vitest resolves no `@api` alias: each one the graph reaches is pointed at
   the real file by path, and the modules a drop does not touch are stubbed. */
vi.mock('@api/platform/db/db.module', () => ({ DB: 'DB' }))
vi.mock('../../../platform/db/db.module', () => ({ DB: 'DB' }))
vi.mock('@api/platform/db/platform.schema', () => import('../../../platform/db/platform.schema'))
vi.mock('@api/platform/db/fuzzy', () => import('../../../platform/db/fuzzy'))
vi.mock('@api/platform/http/problem', () => import('../../../platform/http/problem'))
vi.mock(
  '@api/platform/notification/notification.hub',
  () => import('../../../platform/notification/notification.hub'),
)
vi.mock('@api/platform/google/google-calendar.client', () => ({ GoogleCalendar: class {} }))
vi.mock('@api/platform/comms/comm-record.service', () => ({ CommRecordService: class {} }))
vi.mock('@api/platform/comms/comm-debrief.hook', () => ({ COMM_DEBRIEF_HOOK: 'HOOK' }))
vi.mock('@api/platform/session/actor.repository', () => ({ ActorRepository: class {} }))
vi.mock('../lead/lead-state', () => ({ LeadStateWriter: class {} }))
vi.mock('../opportunity/opportunity-acts', () => ({ editDetailsVerdict: () => ({ ok: true }) }))
vi.mock('./meeting.module', () => ({ MeetingModule: class {} }))
vi.mock('../touch/touch.service', () => ({ TouchService: class {}, byOf: () => ({}) }))

/** The durable Google mirror (0127) on the real migrations in memory PGlite:
 *  the dirty mark's compare-and-set, the streak alert, the drop tombstone.
 *  Google is a stub; the database, the repositories and the bell hub are real. */
const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../drizzle')
const BOOKER = 'actor-booker'
const LEAD = 'LD-0001'
const ID = '0b9c7a4e-3f1d-4c2a-9e8b-5a6d7c8e9f01'

let client: PGlite
let db: Db
let put: ReturnType<typeof vi.fn<GoogleCalendar['put']>>
let remove: ReturnType<typeof vi.fn<GoogleCalendar['remove']>>
let calendar: MeetingCalendar

const synced: CalendarOutcome = { state: 'synced', eventId: 'pvx', eventUrl: 'https://g/e' }
const rowOf = async () => {
  const { rows } = await client.query<{
    calendar_dirty_at: string | null
    calendar_attempts: number
    calendar_alerted_at: string | null
    google_event_id: string | null
  }>(
    `SELECT calendar_dirty_at::text, calendar_attempts, calendar_alerted_at::text, google_event_id
       FROM sales.meeting WHERE id = $1`,
    [ID],
  )
  return rows[0]
}
const bells = async () =>
  (
    await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM platform.notification
        WHERE kind = 'meeting-calendar-failed' AND recipient_id = $1`,
      [BOOKER],
    )
  ).rows[0]?.n
/** Moves the mark back so every backoff step is due. */
const age = (minutes: number) =>
  client.query(
    `UPDATE sales.meeting SET calendar_dirty_at = calendar_dirty_at - make_interval(mins => $1) WHERE id = $2`,
    [minutes, ID],
  )

beforeAll(async () => {
  client = new PGlite()
  db = drizzle(client) as unknown as Db
  await migrate(drizzle(client), { migrationsFolder: FOLDER })
  await client.exec(`
    INSERT INTO platform.actor (id, name, email, role, role_ids, branches)
      VALUES ('${BOOKER}', 'Người đặt', 'booker@pebblevina.com', 'sale', '{sale}', '{Sales}');
    INSERT INTO platform.role_permission (role_id, permission) VALUES ('sale', 'lead.view')
      ON CONFLICT DO NOTHING;
    INSERT INTO platform.object (code, kind, branch, label)
      VALUES ('${LEAD}', 'lead', 'Sales', 'Công ty An Phát');`)
}, 120_000)

afterAll(async () => client?.close())

beforeEach(async () => {
  await client.exec(`DELETE FROM sales.meeting; DELETE FROM sales.meeting_calendar_drop;
    DELETE FROM platform.notification;`)
  await client.query(
    `INSERT INTO sales.meeting (id, subject_code, at, title, mode, by, created_by, calendar_dirty_at)
     VALUES ($1, $2, now() + interval '2 days', 'Chốt báo giá', 'onsite', 'Người đặt', $3, $4)`,
    [ID, LEAD, BOOKER, new Date()],
  )
  put = vi.fn<GoogleCalendar['put']>()
  remove = vi.fn<GoogleCalendar['remove']>()
  const repo = new MeetingRepository(db)
  const hub = new NotificationHub(
    new NotificationRepository(db),
    new RolePermissionRepository(db),
    new NotificationPolicyRepository(db),
  )
  const google = { put, remove } as unknown as GoogleCalendar
  calendar = new MeetingCalendar(repo, new MeetingCalendarRepository(db), google, hub)
})

describe('MeetingCalendar push', () => {
  it('leaves a failed inline push dirty, and the sweep clears it', async () => {
    put.mockResolvedValueOnce({ state: 'failed' })
    expect(await calendar.push(ID)).toBe('pending')
    expect((await rowOf())?.calendar_dirty_at).not.toBeNull()
    expect(put.mock.calls[0]?.[2]).toBe(calendarEventId(ID))
    expect(calendarEventId(ID)).toMatch(/^[a-v0-9]{5,1024}$/)

    expect(await calendar.retryDue()).toBe(0)
    await age(2)
    put.mockResolvedValueOnce(synced)
    expect(await calendar.retryDue()).toBe(1)
    expect(await rowOf()).toMatchObject({
      calendar_dirty_at: null,
      calendar_attempts: 0,
      google_event_id: 'pvx',
    })
  })

  it('keeps the row dirty when a write lands during the push', async () => {
    put.mockImplementationOnce(async () => {
      await client.query(`UPDATE sales.meeting SET calendar_dirty_at = $1 WHERE id = $2`, [
        new Date(Date.now() + 1),
        ID,
      ])
      return synced
    })
    expect(await calendar.push(ID)).toBe('synced')
    const row = await rowOf()
    expect(row?.google_event_id).toBe('pvx')
    expect(row?.calendar_dirty_at).not.toBeNull()
  })

  it('pushes once more when an overlapping push of an older edit may have landed last', async () => {
    put.mockImplementationOnce(async () => {
      /* An amend lands, and its own push clears the mark before this one settles. */
      await client.query(
        `UPDATE sales.meeting SET title = 'Chốt báo giá (sửa)', updated_at = $1,
           calendar_dirty_at = NULL WHERE id = $2`,
        [new Date(Date.now() + 5), ID],
      )
      return synced
    })
    await calendar.push(ID)
    expect((await rowOf())?.calendar_dirty_at).not.toBeNull()

    put.mockResolvedValueOnce(synced)
    await calendar.push(ID)
    expect((await rowOf())?.calendar_dirty_at).toBeNull()
  })

  it('converges when another push of the same row cleared the mark first', async () => {
    put.mockImplementationOnce(async () => {
      await client.query(`UPDATE sales.meeting SET calendar_dirty_at = NULL WHERE id = $1`, [ID])
      return synced
    })
    await calendar.push(ID)
    expect((await rowOf())?.calendar_dirty_at).toBeNull()
  })

  it('keeps the mark of a stored event whose owner lost the link', async () => {
    await client.query(
      `UPDATE sales.meeting SET google_event_id = 'pvx', google_owner_id = $1 WHERE id = $2`,
      [BOOKER, ID],
    )
    await age(2)
    put.mockResolvedValueOnce({ state: 'not_connected' })
    await calendar.retryDue()
    expect(await rowOf()).toMatchObject({ calendar_attempts: 1, google_event_id: 'pvx' })
    expect((await rowOf())?.calendar_dirty_at).not.toBeNull()
  })

  it('clears the mark when the booker has no Google link', async () => {
    put.mockResolvedValueOnce({ state: 'not_connected' })
    expect(await calendar.push(ID)).toBe('not_connected')
    expect((await rowOf())?.calendar_dirty_at).toBeNull()
  })

  it('rings the booker once at the fifth failure, and again after a success', async () => {
    await age(24 * 60)
    put.mockResolvedValue({ state: 'failed' })
    for (let i = 0; i < 4; i++) await calendar.retryDue()
    expect(await bells()).toBe(0)
    await calendar.retryDue()
    expect(await bells()).toBe(1)
    await calendar.retryDue()
    await calendar.retryDue()
    expect(await rowOf()).toMatchObject({ calendar_attempts: 7 })
    expect(await bells()).toBe(1)

    put.mockResolvedValueOnce(synced)
    await calendar.retryDue()
    expect(await rowOf()).toMatchObject({ calendar_attempts: 0, calendar_alerted_at: null })
    await client.query(`UPDATE sales.meeting SET calendar_dirty_at = now() - interval '1 day'`)
    for (let i = 0; i < 5; i++) await calendar.retryDue()
    expect(await bells()).toBe(2)
  })
})

describe('MeetingService drop', () => {
  const who = { id: BOOKER, name: 'Người đặt', roleIds: ['sale'] } as unknown as Actor
  const tombstones = async () =>
    (
      await client.query<{ event_id: string; owner_id: string }>(
        `SELECT event_id, owner_id FROM sales.meeting_calendar_drop`,
      )
    ).rows

  const service = () =>
    new MeetingService(
      new MeetingRepository(db),
      {} as never,
      {} as never,
      { dropBooked: async () => [], forgetFiles: async () => undefined } as never,
      { byId: async () => ({ actor: who }) } as never,
      calendar,
      new MeetingCalendarRepository(db),
      {} as never,
    )

  it('writes a tombstone with the row, and the sweep removes the event', async () => {
    remove.mockResolvedValueOnce(false)
    await service().drop(who, LEAD, ID)
    expect((await client.query(`SELECT 1 FROM sales.meeting`)).rows).toHaveLength(0)
    expect(await tombstones()).toEqual([{ event_id: calendarEventId(ID), owner_id: BOOKER }])

    expect(await calendar.retryDropped()).toBe(0)
    await client.query(
      `UPDATE sales.meeting_calendar_drop SET created_at = now() - interval '2 minutes'`,
    )
    remove.mockResolvedValueOnce(true)
    expect(await calendar.retryDropped()).toBe(1)
    expect(await tombstones()).toEqual([])
    expect(remove).toHaveBeenLastCalledWith(BOOKER, calendarEventId(ID))
  })

  it('writes no tombstone for a stored event whose owner is gone', async () => {
    await client.query(`UPDATE sales.meeting SET google_event_id = 'pvx' WHERE id = $1`, [ID])
    await service().drop(who, LEAD, ID)
    expect(await tombstones()).toEqual([])
  })

  it('restarts the retry count on an edit and keeps the alert mark', async () => {
    await client.query(
      `UPDATE sales.meeting SET calendar_attempts = 4, calendar_alerted_at = now() WHERE id = $1`,
      [ID],
    )
    put.mockResolvedValueOnce({ state: 'failed' })
    expect(await service().amend(who, LEAD, ID, { title: 'Chốt báo giá lần 2' })).toMatchObject({
      calendar: 'pending',
    })
    const row = await rowOf()
    expect(row).toMatchObject({ calendar_attempts: 0 })
    expect(row?.calendar_alerted_at).not.toBeNull()
  })

  it('gives a tombstone up after ten failed removals', async () => {
    remove.mockResolvedValue(false)
    await service().drop(who, LEAD, ID)
    await client.query(`UPDATE sales.meeting_calendar_drop
      SET created_at = now() - interval '2 days', attempts = 9`)
    await calendar.retryDropped()
    expect(await tombstones()).toEqual([])
  })
})

describe('MeetingCancel retryForget', () => {
  it('removes the stable-id event of a cancelled row that still owed a push', async () => {
    await client.query(
      `UPDATE sales.meeting SET cancelled_at = now() - interval '2 minutes',
      cancel_cause = 'lead-disabled' WHERE id = $1`,
      [ID],
    )
    const cancel = new MeetingCancel(new MeetingRepository(db), {} as never, calendar, {} as never)
    remove.mockResolvedValueOnce(false)
    expect(await cancel.retryForget()).toBe(1)
    expect(remove).toHaveBeenLastCalledWith(BOOKER, calendarEventId(ID))
    expect(await rowOf()).toMatchObject({ calendar_attempts: 1 })
    expect(await cancel.retryForget()).toBe(0)

    await client.query(`UPDATE sales.meeting SET cancelled_at = now() - interval '1 hour'`)
    remove.mockResolvedValueOnce(true)
    expect(await cancel.retryForget()).toBe(1)
    expect((await rowOf())?.calendar_dirty_at).toBeNull()
    expect(await cancel.retryForget()).toBe(0)
  })
})

describe('MeetingCancelSweeper', () => {
  it('passes at most once a minute, the cancelled pass once an hour, never overlapping', async () => {
    const stub = { retryDue: vi.fn(async () => 1), retryDropped: vi.fn(async () => 0) }
    const cancel = { retryForget: vi.fn(async () => 0) }
    const s = new MeetingCancelSweeper(stub as never, cancel as never)
    const t0 = 1_000_000
    const first = s.sweep(t0)
    expect(await s.sweep(t0)).toBeNull()
    expect(await first).toBe(1)
    expect(await s.sweep(t0 + 30_000)).toBeNull()
    expect(await s.sweep(t0 + 60_000)).toBe(1)
    expect(stub.retryDue).toHaveBeenCalledTimes(2)
    expect(cancel.retryForget).toHaveBeenCalledTimes(1)
    await s.sweep(t0 + 60 * 60_000)
    expect(cancel.retryForget).toHaveBeenCalledTimes(2)
  })
})
