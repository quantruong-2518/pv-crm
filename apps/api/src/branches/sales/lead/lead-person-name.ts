import type { LeadKeyPerson } from '@pv/engines'

/** A leaf on purpose: the lead mappers and the contact module both need these
 *  two, and neither may import the other's mapper to get them. */

/** A scanned person with no readable name still has to print, and to store. */
export const UNKNOWN_NAME = 'Chưa rõ tên'

/** The scan's "no name" label is not a name: such a person keys on mailbox or
 *  phone only. Every person compared by the gate passes here, so the
 *  placeholder is spelled in one place. */
export const keyable = <P extends LeadKeyPerson>(person: P): P & LeadKeyPerson =>
  person.name === UNKNOWN_NAME ? { ...person, name: null } : person
