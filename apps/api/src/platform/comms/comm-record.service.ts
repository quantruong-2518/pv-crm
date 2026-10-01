import { Injectable } from '@nestjs/common'
import type { CommsChannel, ThreadChannel } from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { conflict, invalid } from '@api/platform/http/problem'
import { normaliseAddress, type NormalisedAddress } from './comms.mapper'
import { DebriefRepository } from './debrief.repository'
import { ThreadRepository } from './thread.repository'

/** Opens a comm record — a thread, one empty logged turn and the owner's open
 *  debrief — for the call / Zalo / mail buttons, the mobile log and a meeting
 *  that ended (ADR 0075 §3). All rows and the audit line commit together.
 *
 *  No permission is asked here: the HTTP door asks reach before calling, and a
 *  job has no caller. Exported through `CommRecordModule`, so a branch job can
 *  inject it without mounting `CommsModule`'s controllers a second time. */

/** Whom the comm was with, as the branch knows them (`CommDebriefHook.contactOf`):
 *  a contact, or a lead's own contact person, with the addresses on file.
 *  `sameLead` = that lead and all its contacts — people one address may share. */
export type CommContact = {
  code: string
  phone: string | null
  email: string | null
  sameLead: string[]
}

export type CommRecordOpen = {
  channel: ThreadChannel
  /** The lead, deal or contract the record belongs to; never moves. */
  subjectCode: string
  /** Owns the record and alone may confirm it. */
  ownerId: string
  /** Whose identity the turn is filed under; absent = the subject itself,
   *  i.e. a lead's own contact person. */
  contactCode?: string | undefined
  /** That person's addresses on file. With them, a missing identity on the
   *  channel is minted; without, a missing one is a 400 `contactCode`. */
  addresses?: Pick<CommContact, 'phone' | 'email'> | undefined
  /** An address already held by one of these codes is reused, not refused. */
  sameLead?: readonly string[] | undefined
  /** Exactly on `'meeting'`: the thread's external id, one thread per meeting. */
  meetingId?: string | undefined
  /** When the comm happened; defaults to now. A meeting passes its end. */
  at?: Date | undefined
}

/** `created: false` = a meeting already had a record of this owner. */
export type CommRecordOpened = { debriefId: string; threadId: string; created: boolean }

type Mint = { channel: CommsChannel; address: NormalisedAddress }
type NewIdentity = Mint &
  ({ side: 'guest'; objectCode: string } | { side: 'member'; actorId: string })

@Injectable()
export class CommRecordService {
  constructor(
    private readonly threads: ThreadRepository,
    private readonly debriefs: DebriefRepository,
    private readonly audit: AuditRepository,
  ) {}

  /** Idempotent per (meeting, owner); every button press is a new record.
   *  `also` runs inside the same transaction once the rows exist — the caller's
   *  own consequence of the comm (a lead moving to `working`). */
  async open(input: CommRecordOpen, also?: (tx: Db) => Promise<void>): Promise<CommRecordOpened> {
    const { channel, subjectCode, ownerId, meetingId } = input
    const holder = input.contactCode ?? subjectCode
    if ((channel === 'meeting') !== (meetingId !== undefined)) {
      throw new Error('comms: a meeting record needs its meeting id, and only a meeting has one')
    }
    /* Pool reads before the transaction: PGlite holds one connection. */
    const guest = await this.guestOf(channel, {
      code: holder,
      phone: null,
      email: null,
      sameLead: [...(input.sameLead ?? [])],
      ...input.addresses,
    })
    const member = await this.memberOf(ownerId, channel)
    const at = input.at ?? new Date()

    return this.debriefs.run(async (tx) => {
      let threadId: string
      if (meetingId !== undefined) {
        threadId = await this.threads.meetingThread(tx, meetingId, at)
        const existing = await this.debriefs.latestOn(tx, threadId, ownerId)
        if (existing) return { debriefId: existing, threadId, created: false }
        await this.threads.widenSpan(tx, threadId, at)
      } else {
        const row = { channel, subject: null, externalId: null, startedAt: at, lastAt: at }
        threadId = (await this.threads.insertThread(tx, row)).id
      }
      const to = 'id' in guest ? guest.id : await this.threads.insertIdentity(tx, guest)
      const from = 'id' in member ? member.id : await this.threads.insertIdentity(tx, member)
      await this.threads.ensureLink(tx, { threadId, objectCode: subjectCode, linkedBy: 'human' })
      const turn = await this.threads.insertMessage(tx, {
        threadId,
        at,
        direction: 'out',
        fromIdentityId: from,
        bodyText: null,
        durationSec: null,
        captureSource: 'manual',
      })
      await this.threads.insertParties(tx, [
        { messageId: turn.id, identityId: from, role: 'from' },
        { messageId: turn.id, identityId: to, role: 'to' },
      ])
      const debriefId = await this.debriefs.openOrJoin(tx, {
        threadId,
        ownerId,
        messageId: turn.id,
        subjectCode,
      })
      await this.audit.write(
        {
          actorId: ownerId,
          action: 'edit',
          code: subjectCode,
          note: `comms.debrief ${debriefId} opened empty · ${channel} thread ${threadId} · from ${from}${'id' in member ? '' : ' (minted)'} to ${to}${'id' in guest ? '' : ' (minted)'}`,
        },
        tx,
      )
      await also?.(tx)
      return { debriefId, threadId, created: true }
    })
  }

  /** The customer's identity for this turn, or the guest row to mint. Zalo
   *  falls back to the PHONE channel: an OA address is a platform user id only
   *  a webhook knows, and a party on another channel than its thread is allowed. */
  private async guestOf(
    channel: ThreadChannel,
    person: CommContact,
  ): Promise<{ id: string } | NewIdentity> {
    const known =
      (await this.threads.guestIdentity(person.code, channel === 'meeting' ? null : channel)) ??
      (channel === 'zalo-oa' ? await this.threads.guestIdentity(person.code, 'phone') : null)
    if (known) return known
    const mint = mintFor(channel, person)
    const taken = await this.threads.identityByAddress(mint.channel, mint.address)
    /* The lead's own person and its contact often share one phone: same people. */
    if (taken?.side === 'guest' && taken.objectCode && person.sameLead.includes(taken.objectCode)) {
      return taken
    }
    /* Otherwise `ThreadService.refuseUnreachableParties`'s rule: never file a
       turn under an address the book gives to a colleague or another customer. */
    if (taken) {
      throw invalid(
        {
          contactCode: [
            `Địa chỉ ${mint.address} trong sổ định danh thuộc người khác, không phải ${person.code}.`,
          ],
        },
        'Địa chỉ của người liên hệ đang thuộc người khác.',
      )
    }
    return { ...mint, side: 'guest', objectCode: person.code }
  }

  /** The owner's own identity — the `from` of a turn they started. Same channel
   *  first, else any of theirs; none = minted on `email` from `platform.actor.email`,
   *  the one address every colleague is guaranteed to have. */
  private async memberOf(
    ownerId: string,
    channel: ThreadChannel,
  ): Promise<{ id: string } | NewIdentity> {
    const known = await this.threads.memberIdentity(ownerId, channel === 'meeting' ? null : channel)
    if (known) return known
    const mailbox = await this.threads.actorEmail(ownerId)
    if (!mailbox) throw new Error(`comms: comm owner ${ownerId} is not in platform.actor`)
    const address = normaliseAddress('email', mailbox)
    if (await this.threads.identityByAddress('email', address)) {
      throw conflict(
        `Hòm thư ${address} của người tạo comm đang thuộc người khác trong sổ định danh — báo người giữ sổ định danh sửa lại.`,
      )
    }
    return { channel: 'email', address, side: 'member', actorId: ownerId }
  }
}

/** The address to mint: a phone for a call or Zalo (on the phone channel),
 *  the mailbox for mail, either for a meeting. Refuses when the person has none. */
function mintFor(channel: ThreadChannel, contact: CommContact): Mint {
  const byMail = channel === 'email' || (channel === 'meeting' && !contact.phone)
  const raw = byMail ? contact.email : contact.phone
  const on: CommsChannel = byMail ? 'email' : 'phone'
  if (raw) return { channel: on, address: normaliseAddress(on, raw) }
  const missing =
    channel === 'meeting' ? 'số điện thoại hay email' : byMail ? 'email' : 'số điện thoại'
  throw invalid(
    {
      contactCode: [
        `${contact.code} chưa có ${missing} — thêm vào hồ sơ người liên hệ trước khi tạo comm.`,
      ],
    },
    'Người liên hệ chưa có địa chỉ cho kênh này.',
  )
}
