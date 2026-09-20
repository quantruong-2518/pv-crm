import type { ObjectRef } from '@pv/engines'
import type { ContactCreate, ContactPatch, ContactRow } from '@pv/contracts'
import type { contact, ContactRowDb } from './contact.schema'
import type { LeadContactMirror } from './contact.repository'

export type ContactValues = Omit<typeof contact.$inferInsert, 'code' | 'createdAt' | 'updatedAt'>

/** Both halves of "who wrote this down" are filled in, and they are not a
 *  duplication: `by` is the NAME as it read on the day (an old row keeps it
 *  even after the person leaves the book), `createdBy` is the actor ID (a
 *  report can group by a real person, and the foreign key keeps it honest).
 *
 *  The 123 rows migration 0018 backfilled carry `by = 'backfill 0018'` and a
 *  NULL id, which is the truthful record: no person wrote those down. */
export function fromCreate(
  leadCode: string,
  body: ContactCreate,
  who: { id: string; name: string },
  isPrimary: boolean,
): ContactValues {
  return {
    leadCode,
    name: body.name,
    title: body.title ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    channel: body.channel ?? null,
    note: body.note ?? null,
    isPrimary,
    by: who.name,
    createdBy: who.id,
  }
}

/** A newborn lead's own five columns → its first, primary `sales.contact` row.
 *
 *  Both write doors of `sales.lead` (`fromCreate`, the import batch) collect
 *  `contactName`/`contactTitle`/… onto the lead row itself — a lead cannot be
 *  born without them. Nothing turned that into a contact row, so the profile's
 *  "person" tab (`ContactsCard`, which reads ONLY `sales.contact`) printed
 *  nobody for every lead born after the one-time 0018/0026 backfill, while the
 *  book kept reading the lead's own columns and printed the name correctly —
 *  two screens, two truths for one customer. `ContactService.seedPrimary` is
 *  the one call site that closes the gap, at birth, once. */
export function fromLeadBirth(
  leadCode: string,
  mirror: LeadContactMirror,
  by: { id: string; name: string },
): ContactValues {
  return {
    leadCode,
    name: mirror.contactName,
    title: mirror.contactTitle,
    email: mirror.email,
    phone: mirror.phone,
    channel: mirror.contactChannel,
    note: null,
    isPrimary: true,
    by: by.name,
    createdBy: by.id,
  }
}

/** `PATCH` is SPARSE where the account form is total, and the asymmetry is not
 *  an oversight in one of the two.
 *
 *  `AccountUpdate` carries the whole editable set, so its mapper can turn every
 *  absent field into `null` and know that is what the body meant. `ContactPatch`
 *  is `.partial()` — a body may legitimately name only `phone` — so an absent
 *  key here means "leave it alone" and must NOT become `null`. Only the keys
 *  actually present are copied, which is the one spelling that keeps both
 *  meanings available: absent leaves the column, `''` arrives as `undefined`
 *  from `textInputOptional` and is therefore also "leave alone".
 *
 *  Clearing a contact's title is consequently not expressible today, and that
 *  is a real limit rather than a hidden one. It costs less than the alternative,
 *  which is a body where every unmentioned field silently wipes a column. */
export function fromPatch(body: ContactPatch): Partial<ContactValues> {
  return {
    ...(body.name === undefined ? {} : { name: body.name }),
    ...(body.title === undefined ? {} : { title: body.title }),
    ...(body.email === undefined ? {} : { email: body.email }),
    ...(body.phone === undefined ? {} : { phone: body.phone }),
    ...(body.channel === undefined ? {} : { channel: body.channel }),
    ...(body.note === undefined ? {} : { note: body.note }),
  }
}

/** The mirror row in E1's graph.
 *
 *  `owner` carries the lead code rather than a person, because the "owner" of a
 *  contact object is the enquiry it hangs off — that is what a reader following
 *  the rail needs next. `state` says whether this is the person we actually
 *  talk to, which is the one thing that distinguishes two `CT-…` rows at a
 *  glance. */
export function refOf(
  code: string,
  leadCode: string,
  values: Pick<ContactValues, 'name' | 'isPrimary'>,
): ObjectRef {
  return {
    code,
    kind: 'CT',
    branch: 'Sales',
    label: values.name,
    owner: leadCode,
    state: values.isPrimary ? 'primary-contact' : 'contact',
  }
}

export function toContract(row: ContactRowDb): ContactRow {
  return {
    code: row.code,
    leadCode: row.leadCode,
    name: row.name,
    ...(row.title ? { title: row.title } : {}),
    ...(row.email ? { email: row.email } : {}),
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.channel ? { channel: row.channel } : {}),
    isPrimary: row.isPrimary,
    ...(row.note ? { note: row.note } : {}),
    by: row.by,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
