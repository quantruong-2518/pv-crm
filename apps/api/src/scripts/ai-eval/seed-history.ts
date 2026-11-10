import { meeting, meetingAttendee } from '@api/branches/sales/meeting/meeting.schema'
import { touch } from '@api/branches/sales/touch/touch.schema'
import { debrief, identity, message, thread } from '@api/platform/comms/comms.schema'
import type { Db } from '@api/platform/db/db.module'
import { canariesOf, RICH_COMMS, RICH_TOUCHES, SUMMARY_MAX, type ChainSpec } from './seed-data'
import type { Chain } from './seed'

/** What happened with a record, written straight into the tables the three doors read:
 *  touches, contact records (thread, turn and close-out) and one held meeting. Rows are
 *  rewritten by hand rather than made through the services, because a service would
 *  stamp `now()` and the order of the rows is part of what the tool is held to.
 *
 *  A transcript and a cut row each carry a canary the tool must never print: the
 *  transcript is never read, the cut rows lie past its 20. */

const BASE = Date.parse('2026-10-01T08:00:00.000Z')
const HOUR = 3_600_000
const at = (i: number, extra = 0): Date => new Date(BASE + i * HOUR + extra)

/** Most Vietnamese letters are three bytes in UTF-8, which is what the token estimate counts. */
const SENTENCE =
  'Khách hàng đề nghị điều chỉnh tiến độ giao hàng, xác nhận lại đơn giá theo từng đợt và gửi bản báo giá điều chỉnh trước cuối tuần. '

/** `wide` is the worst a summary can be: every character three bytes. */
function summaryOf(canary: string, wide: boolean): string {
  const head = `${canary} `
  const filler = wide ? 'ệ' : SENTENCE
  return (head + filler.repeat(Math.ceil(SUMMARY_MAX / filler.length))).slice(0, SUMMARY_MAX)
}

type Subject = { code: string; kind: 'lead' | 'opportunity'; owner: string }

/** One member identity per owner, made when first needed. */
export class HistorySeeder {
  private readonly members = new Map<string, string>()

  constructor(private readonly db: Db) {}

  private async memberOf(owner: string): Promise<string> {
    const known = this.members.get(owner)
    if (known) return known
    const [row] = await this.db
      .insert(identity)
      .values({ channel: 'phone', address: `owner-${owner}`, side: 'member', actorId: owner })
      .returning({ id: identity.id })
    if (!row) throw new Error('seed: no identity returned')
    this.members.set(owner, row.id)
    return row.id
  }

  private async touches(s: Subject, n: number, count: number): Promise<void> {
    const c = canariesOf(n)
    const cuts = Math.max(0, count - 20)
    await this.db.insert(touch).values(
      Array.from({ length: count }, (_, i) => ({
        at: at(i),
        subjectCode: s.code,
        subjectKind: s.kind,
        kind: 'contacted' as const,
        by: `Nhân viên ${s.owner}`,
        /* The oldest rows are the ones the tool's cut leaves out; the newest holds a phone. */
        note:
          i === count - 1
            ? `Gọi ${c.typedPhone}, ${c.touchNote}`
            : i < cuts
              ? `Lần ${i + 1} ${c.cut}`
              : `Lần ${i + 1}`,
      })),
    )
  }

  /** `unreached` is the way to a close-out with no summary: the row says nobody answered. */
  private async comm(
    s: Subject,
    i: number,
    text: string | null,
    title: string | null,
  ): Promise<void> {
    const identityId = await this.memberOf(s.owner)
    const [t] = await this.db
      .insert(thread)
      .values({ channel: 'phone', startedAt: at(i), lastAt: at(i) })
      .returning({ id: thread.id })
    if (!t) throw new Error('seed: no thread returned')
    const [m] = await this.db
      .insert(message)
      .values({
        threadId: t.id,
        at: at(i),
        direction: 'out',
        fromIdentityId: identityId,
        captureSource: 'manual',
      })
      .returning({ id: message.id })
    if (!m) throw new Error('seed: no message returned')
    await this.db.insert(debrief).values({
      threadId: t.id,
      messageId: m.id,
      ownerId: s.owner,
      createdAt: at(i, HOUR / 2),
      closedAt: at(i, HOUR / 2),
      subjectCode: s.code,
      title,
      ...(text === null
        ? { unreached: true }
        : {
            summary: text,
            nextKindId: 'SK-01',
            nextKindName: 'Gọi lại',
            nextText: 'Gọi lại để chốt đơn giá',
            nextDue: '2026-12-20',
          }),
    })
  }

  private async meeting(s: Subject, n: number): Promise<void> {
    const c = canariesOf(n)
    const [row] = await this.db
      .insert(meeting)
      .values({
        subjectCode: s.code,
        at: at(0),
        heldAt: at(0),
        title: `Họp ${c.meetingTitle}`,
        transcript: `Lời gỡ băng ${c.transcript}`,
        durationMinutes: 60,
        mode: 'online',
        goal: 'Chốt phạm vi',
        by: `Nhân viên ${s.owner}`,
      })
      .returning({ id: meeting.id })
    if (!row) throw new Error('seed: no meeting returned')
    await this.db.insert(meetingAttendee).values([
      { meetingId: row.id, side: 'host', actorId: s.owner, name: `Nhân viên ${s.owner}` },
      { meetingId: row.id, side: 'guest', name: 'Chị Lan' },
    ])
  }

  /** A small history on every chain; the rich one passes the cut, the wide one the byte cap. */
  async seed(spec: ChainSpec, chain: Chain): Promise<void> {
    const c = canariesOf(chain.n)
    const subjects: Subject[] = [
      { code: chain.lead, kind: 'lead', owner: spec.leadOwner ?? 'rival' },
      { code: chain.opportunity, kind: 'opportunity', owner: spec.dealOwners[0]?.id ?? 'rival' },
    ]
    for (const s of subjects) {
      if (spec.history === 'wide') {
        if (s.kind === 'lead') {
          for (let i = 0; i < 20; i += 1) await this.comm(s, i, summaryOf(c.summary, true), null)
        }
        continue
      }
      const rich = spec.history === 'rich'
      await this.touches(s, chain.n, rich ? RICH_TOUCHES : 2)
      const comms = rich ? RICH_COMMS : 1
      for (let i = 0; i < comms; i += 1) {
        const cut = i < comms - 20
        const text = summaryOf(cut ? c.cut : c.summary, false)
        await this.comm(s, i, rich ? text : `Đã trao đổi ${c.summary}`, `Cuộc gọi ${i + 1}`)
      }
      /* A bare close-out, newest of all: a record that says nothing of what was said. */
      if (!rich) await this.comm(s, comms, null, null)
      await this.meeting(s, chain.n)
    }
  }
}
