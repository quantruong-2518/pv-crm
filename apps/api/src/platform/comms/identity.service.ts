import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  IdentityListResponse,
  IdentityRow,
  type IdentityCreate,
  type IdentityMerge,
  type IdentityPatch,
  type IdentityQuery,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import { IdentityRepository, type IdentityInsert } from './identity.repository'
import { normaliseAddress, toContract } from './comms.mapper'
import type { IdentityRowDb } from './comms.schema'

/** The identity book — four doors, one permission (`comm.capture-manage`).
 *
 *  NO SCOPE AXIS, and that is a property of the thing rather than an omission.
 *  `comms.identity` has no owner column: an address belongs to a PERSON, not to
 *  a salesperson, and `comm.capture-manage` is by definition the
 *  whole-department permission — §9 of the vision doc defines it as running the
 *  intake doors for the whole room and reading the unmatched queue. So no door
 *  here declares `scoped`, and `hidden` in the page envelope is 0 because
 *  nothing was cut.
 *
 *  The refusals this service owns are the ones a schema structurally cannot:
 *  `amend`'s half check and `merge`'s same-person check both need the ROW read
 *  first.
 *
 *  A THIRD ONE IS GONE, and its absence is the point. Turn 0 refused a guest
 *  identity pointing at an `OP-` or contract-prefixed code, because the mirror
 *  rows behind those two were discipline with no foreign key under them and a
 *  write that succeeded today would have been a violation the day somebody
 *  forgot to mirror. Migration 0042 made both into real foreign keys, so the
 *  fence is now the key itself; a hand-kept prefix list beside it would be a
 *  second, staler copy of a rule the database already enforces.
 *
 *  ------------------------------------------------------------------
 *  EVERY WRITE LEAVES AN AUDIT LINE, INSIDE THE SAME TRANSACTION
 *  ------------------------------------------------------------------
 *  `AuditRepository.write` takes a `tx`, so the line and the row it explains
 *  commit or roll back together — no entry for a merge that did not happen, and
 *  no merge with nothing saying who ordered it. `merge` needs this most: it
 *  DELETES, and after the delete the losing row's channel and address cannot be
 *  recovered from anywhere, so the note carries them. */
@Injectable()
export class IdentityService {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly audit: AuditRepository,
  ) {}

  async book(q: IdentityQuery): Promise<IdentityListResponse> {
    const page = await this.repo.book(q)

    return IdentityListResponse.parse({
      rows: page.rows.map(toContract),
      total: page.total,
      hidden: 0,
    })
  }

  /** Mint one.
   *
   *  The address is folded BEFORE the insert, and nothing here looks first to
   *  see whether it already exists: a duplicate comes back from the table as
   *  `identity_channel_address_unique`, which `comms.constraints.ts` turns into
   *  a 409 with its own sentence. That is the repo's way of translating a
   *  database error, and it is the only way that stays correct when two people
   *  write the same address in the same second — a `SELECT` in front answers
   *  "not there" to both of them. */
  async create(who: Actor, body: IdentityCreate): Promise<IdentityRow> {
    const values: IdentityInsert = {
      channel: body.channel,
      address: normaliseAddress(body.channel, body.address),
      side: body.side,
      actorId: body.side === 'member' ? body.actorId : null,
      objectCode: body.side === 'guest' ? body.objectCode : null,
      verifiedAt: body.verifiedAt ? new Date(body.verifiedAt) : null,
    }

    const row = await this.repo.run(async (tx) => {
      const written = await this.repo.insert(tx, values)
      await this.trail(tx, who, written, `mint ${written.channel} ${written.address}`)
      return written
    })

    return IdentityRow.parse(toContract(row))
  }

  /** Correct one — `verifiedAt`, and the half this row ALREADY stands on.
   *
   *  `IdentityPatch` carries both `actorId` and `objectCode` because a schema
   *  cannot know which one this particular row is allowed to have; its docblock
   *  says so and hands the refusal here. Sending `objectCode` for a `member`
   *  row is not a correction, it is a different identity wearing the same
   *  address — `merge` is the door for the one legitimate version of that.
   *
   *  Read and write in ONE transaction: read outside it and the row can flip
   *  sides between the check and the update, which is exactly the case the
   *  check exists for. */
  async amend(who: Actor, id: string, body: IdentityPatch): Promise<IdentityRow> {
    const row = await this.repo.run(async (tx) => {
      const before = await this.repo.byId(tx, id)
      if (!before) throw notFound('định danh', id)

      refuseWrongHalf(before, body)

      const written = await this.repo.patch(tx, id, {
        ...(body.actorId === undefined ? {} : { actorId: body.actorId }),
        ...(body.objectCode === undefined ? {} : { objectCode: body.objectCode }),
        /* `null` is a VALUE here, not "leave alone": un-verifying an address
           somebody confirmed by mistake is a real correction, and the contract
           spells the field `.nullable().optional()` to keep the two apart. */
        ...(body.verifiedAt === undefined
          ? {}
          : { verifiedAt: body.verifiedAt === null ? null : new Date(body.verifiedAt) }),
      })
      if (!written) throw notFound('định danh', id)

      /* BEFORE and after, not just after. Re-pointing a guest address from one
         customer at another is the change worth reading six months later, and
         an entry holding only the new value cannot answer "whose was it". */
      await this.trail(tx, who, written, amendNote(before, written))
      return written
    })

    return IdentityRow.parse(toContract(row))
  }

  /** Two rows describing one person, folded into one. Returns the survivor.
   *
   *  ------------------------------------------------------------------
   *  TODAY THIS IS A DELETE, AND THE DAY `comms.thread` LANDS IT IS NOT
   *  ------------------------------------------------------------------
   *  Nothing in the database references `comms.identity` yet — turn 0 is the
   *  table alone — so folding the loser into the winner is arithmetic with no
   *  terms: confirm both rows exist, confirm they name the same PERSON, drop the
   *  loser. Whoever adds `comms.thread`, `comms.message_party` or
   *  `comms.inbox_unmatched` MUST repoint every reference at `keepId` inside
   *  this same transaction before the delete; a foreign key will start refusing
   *  the delete and the refusal is the reminder, but only if nobody "fixes" it
   *  with `ON DELETE CASCADE`, which would silently take the conversations with
   *  it. This paragraph is the handover, not a note for later.
   *
   *  ------------------------------------------------------------------
   *  SAME SIDE IS NOT ENOUGH — IT HAS TO BE THE SAME PERSON
   *  ------------------------------------------------------------------
   *  `UNIQUE (channel, address)` already forbids two rows sharing an address, so
   *  two `guest` rows pointing at two different `object_code`s are not a
   *  duplicate at all: they are two customers, each with a working
   *  address→person mapping. Merging them would delete one customer's mapping
   *  outright, and since the only wrong thing the caller did was mistype a UUID,
   *  nothing on screen would say a link had gone. The check is therefore on the
   *  half itself, not on `side`.
   *
   *  `keepId !== mergeId` is already the contract's refusal, so it is not
   *  repeated here. */
  async merge(who: Actor, body: IdentityMerge): Promise<IdentityRow> {
    const kept = await this.repo.run(async (tx) => {
      const keep = await this.repo.byId(tx, body.keepId)
      if (!keep) throw notFound('định danh', body.keepId)

      const loser = await this.repo.byId(tx, body.mergeId)
      if (!loser) throw notFound('định danh', body.mergeId)

      refuseDifferentPeople(keep, loser)

      await this.repo.remove(tx, body.mergeId)
      /* The losing row's channel and address go in the note because in one more
         statement they stop existing anywhere. An audit line that says only
         "merged two ids" explains nothing once the row it refers to is gone. */
      await this.trail(
        tx,
        who,
        keep,
        `merge keep=${body.keepId} drop=${body.mergeId} (${loser.channel} ${loser.address})`,
      )
      return keep
    })

    return IdentityRow.parse(toContract(kept))
  }

  /** One audit line, filed under the CUSTOMER's code where there is one.
   *
   *  `platform.audit` indexes `code`, and the question this trail answers is
   *  "what happened to this customer's addresses" — so a guest row files under
   *  its `object_code` and turns up on that customer's history. A member row has
   *  no object code and leaves the column empty rather than borrowing the
   *  colleague's actor id, which would put a person into a column every other
   *  writer fills with an object code. */
  private trail(tx: Db, who: Actor, row: IdentityRowDb, note: string): Promise<void> {
    return this.audit.write(
      {
        actorId: who.id,
        action: 'edit',
        ...(row.objectCode ? { code: row.objectCode } : {}),
        note: `comms.identity ${row.id} · ${note}`,
      },
      tx,
    )
  }
}

/** The half check, as a sentence naming the field the caller sent.
 *
 *  400 rather than 409: nothing out there changed under the caller, they sent a
 *  field this row has no column for. That is a bad body, and the screen needs
 *  to redden that box. */
function refuseWrongHalf(row: IdentityRowDb, body: IdentityPatch): void {
  if (body.actorId !== undefined && row.side !== 'member') {
    throw invalid(
      { actorId: ['Định danh này là của khách, không gắn được mã nhân sự.'] },
      'Không sửa được nửa của phía kia.',
    )
  }

  if (body.objectCode !== undefined && row.side !== 'guest') {
    throw invalid(
      { objectCode: ['Định danh này là của người mình, không gắn được mã object khách hàng.'] },
      'Không sửa được nửa của phía kia.',
    )
  }
}

/** Two rows are the same person only when the half they stand on names the same
 *  one. Both codes go in the sentence — the caller mistyped one of them, and
 *  which one is the whole question. */
function refuseDifferentPeople(keep: IdentityRowDb, loser: IdentityRowDb): void {
  if (keep.side !== loser.side) {
    throw conflict(
      'Hai định danh này đứng hai phía khác nhau — một của người mình, một của khách — nên không gộp được.',
    )
  }

  if (keep.side === 'guest' && keep.objectCode !== loser.objectCode) {
    throw conflict(
      `Hai định danh này thuộc hai khách khác nhau (${keep.objectCode} và ${loser.objectCode}) nên không gộp được — gộp là xoá mất đường nối địa chỉ của một trong hai.`,
    )
  }

  if (keep.side === 'member' && keep.actorId !== loser.actorId) {
    throw conflict(
      `Hai định danh này thuộc hai người khác nhau (${keep.actorId} và ${loser.actorId}) nên không gộp được — gộp là xoá mất đường nối địa chỉ của một trong hai.`,
    )
  }
}

/** What an amend actually changed, before → after. */
function amendNote(before: IdentityRowDb, after: IdentityRowDb): string {
  const parts: string[] = []

  if (before.objectCode !== after.objectCode) {
    parts.push(`object ${before.objectCode ?? '∅'} → ${after.objectCode ?? '∅'}`)
  }
  if (before.actorId !== after.actorId) {
    parts.push(`actor ${before.actorId ?? '∅'} → ${after.actorId ?? '∅'}`)
  }
  if (before.verifiedAt?.getTime() !== after.verifiedAt?.getTime()) {
    parts.push(`verified ${mark(before.verifiedAt)} → ${mark(after.verifiedAt)}`)
  }

  return parts.length > 0 ? `amend ${parts.join(' · ')}` : 'amend (no field changed)'
}

const mark = (at: Date | null): string => at?.toISOString() ?? '∅'
