import { and, eq, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import type { PinSubject } from '@pv/contracts'
import { userPin } from './pin.schema'

/** The books' `pinned` filter: THIS actor pinned the row's `code`. One
 *  spelling for the lead and the deal book, and the actor id is part of it, so
 *  no caller can ask the question about somebody else's pins. `EXISTS`, not a
 *  join: the primary key answers it, and a join could not change `total`
 *  anyway but would still have to be proven not to. */
export const pinnedBy = (actorId: string, subject: PinSubject, code: SQLWrapper): SQL =>
  sql`EXISTS (SELECT 1 FROM ${userPin} WHERE ${and(
    eq(userPin.actorId, actorId),
    eq(userPin.subjectType, subject),
    eq(userPin.code, code),
  )})`
