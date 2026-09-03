import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ContactBookQuery,
  type ContactBookResponse,
  type ContactBookRow,
  type ContactCreate,
  type ContactListResponse,
  type ContactPatch,
  type ContactRow,
  type MaObject,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** Contacts — TWO path shapes, and both are real.
 *
 *  ------------------------------------------------------------------
 *  WHY TWO PREFIXES INSTEAD OF ONE
 *  ------------------------------------------------------------------
 *      GET  /sales/leads/:code/contacts     the list for ONE lead
 *      POST /sales/leads/:code/contacts     add a person to that lead
 *      GET  /sales/contacts                 the whole book, paged
 *      GET  /sales/contacts/:code           one person, with their company
 *      PATCH  · DELETE  · POST :code/primary
 *
 *  The first two doors talk about the WHOLE SET of people on one lead, so the
 *  lead code naturally sits on the path — and `@Need` is static metadata, so
 *  the scope axis has to live right there. The last four doors talk about one
 *  specific person or the whole book, and that person has their own code that
 *  reads aloud (`CT-0391`). Full reasoning and its cost live in the docblock
 *  of `packages/contracts/src/sales/contact.ts`.
 *
 *  ------------------------------------------------------------------
 *  THE PERMISSION BELONGS TO THE LEAD, NOT A NEW DOMAIN
 *  ------------------------------------------------------------------
 *  The lead read permission to read, the lead write permission to touch —
 *  unlike the account book right next door, which has a customer domain of its
 *  own. A contact is part of ONE lead's profile; a company sits above the whole
 *  lead book. */

const LEAD_PATH = '/sales/leads'
const BOOK_PATH = '/sales/contacts'

export const CONTACT_BOOK_KEY = ['sales', 'contacts'] as const

const READ_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.xem', scoped: true }
const WRITE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.sửa', scoped: true }

export const DEFAULT_CONTACT_BOOK_QUERY: ContactBookQuery = ContactBookQuery.parse({})

export function contactBookQueryToParams(q: ContactBookQuery): string {
  const p = new URLSearchParams()
  if (q.page !== DEFAULT_CONTACT_BOOK_QUERY.page) p.set('page', String(q.page))
  if (q.size !== DEFAULT_CONTACT_BOOK_QUERY.size) p.set('size', String(q.size))
  if (q.sort !== DEFAULT_CONTACT_BOOK_QUERY.sort) p.set('sort', q.sort)
  if (q.dir !== DEFAULT_CONTACT_BOOK_QUERY.dir) p.set('dir', q.dir)
  if (q.q !== undefined) p.set('q', q.q)
  if (q.primary !== undefined) p.set('primary', q.primary)
  if (q.account !== undefined) p.set('account', q.account)
  return p.toString()
}

export function parseContactBookQuery(params: URLSearchParams): ContactBookQuery {
  const parsed = ContactBookQuery.safeParse(Object.fromEntries(params))
  return parsed.success ? parsed.data : DEFAULT_CONTACT_BOOK_QUERY
}

export function contactBookQuery(q: ContactBookQuery) {
  return queryOptions({
    queryKey: [...CONTACT_BOOK_KEY, 'page', q] as const,
    queryFn: ({ signal }) =>
      api.read<ContactBookResponse>(`${BOOK_PATH}?${contactBookQueryToParams(q)}`, {
        need: READ_NEED,
        signal,
      }),
  })
}

export function contactProfileQuery(code: MaObject) {
  return queryOptions({
    queryKey: [...CONTACT_BOOK_KEY, code] as const,
    queryFn: ({ signal }) =>
      api.read<ContactBookRow>(`${BOOK_PATH}/${code}`, { need: READ_NEED, signal }),
  })
}

/** The contact list for ONE lead — for the panel on the lead profile.
 *
 *  The cache key hangs under the lead's key rather than under
 *  `CONTACT_BOOK_KEY`: the four write doors below invalidate both, and a
 *  nested key does that with one prefix instead of two constants that have to
 *  be kept in sync by hand. */
export function leadContactsQuery(leadCode: MaObject) {
  return queryOptions({
    queryKey: ['sales', 'leads', leadCode, 'contacts'] as const,
    queryFn: ({ signal }) =>
      api.read<ContactListResponse>(`${LEAD_PATH}/${leadCode}/contacts`, {
        need: READ_NEED,
        signal,
      }),
  })
}

// ---------------------------------------------------------------------------
// The four write doors
// ---------------------------------------------------------------------------

/** Invalidates exactly THREE places after every write, and all three matter.
 *
 *  · the lead's list — the panel open right in front of the person who just
 *    clicked;
 *  · the global book — it holds the very row that just changed;
 *  · the LEAD profile — because writing a PRIMARY contact also overwrites the
 *    lead's five mirrored contact columns (`ContactRepository.mirrorOntoLead`).
 *    Dropping the third spot would leave the lead profile printing the old
 *    phone number right next to the panel that just printed the new one. */
function invalidateAround(client: ReturnType<typeof useQueryClient>, leadCode?: string) {
  void client.invalidateQueries({ queryKey: CONTACT_BOOK_KEY })
  if (leadCode !== undefined) {
    void client.invalidateQueries({ queryKey: ['sales', 'leads', leadCode, 'contacts'] })
    void client.invalidateQueries({ queryKey: ['sales', 'leads', leadCode] })
  }
}

export function useAddContact(leadCode: MaObject) {
  const client = useQueryClient()

  return useMutation<ContactRow, ApiError, ContactCreate>({
    mutationFn: (body) =>
      api.write<ContactRow>(`${LEAD_PATH}/${leadCode}/contacts`, {
        method: 'POST',
        body,
        need: WRITE_NEED,
      }),
    onSuccess: () => invalidateAround(client, leadCode),
  })
}

export function useEditContact(code: MaObject, leadCode?: string) {
  const client = useQueryClient()

  return useMutation<ContactRow, ApiError, ContactPatch>({
    mutationFn: (body) =>
      api.write<ContactRow>(`${BOOK_PATH}/${code}`, { method: 'PATCH', body, need: WRITE_NEED }),
    onSuccess: (row) => {
      void client.invalidateQueries({ queryKey: [...CONTACT_BOOK_KEY, code] })
      invalidateAround(client, leadCode ?? row.leadCode)
    },
  })
}

export function useDropContact(code: MaObject, leadCode?: string) {
  const client = useQueryClient()

  return useMutation<void, ApiError, void>({
    mutationFn: () =>
      api.write<void>(`${BOOK_PATH}/${code}`, { method: 'DELETE', need: WRITE_NEED }),
    onSuccess: () => invalidateAround(client, leadCode),
  })
}

/** Change the primary contact.
 *
 *  `POST`, not `PATCH { isPrimary: true }` — the operation touches TWO rows
 *  (demote whoever holds it, promote this one) and only runs in exactly one
 *  order, or it dies on `contact_primary_uniq`. The contract also CUTS
 *  `isPrimary` out of `ContactPatch` entirely so that wrong call cannot even
 *  compile. */
export function useSetPrimaryContact(code: MaObject, leadCode?: string) {
  const client = useQueryClient()

  return useMutation<ContactRow, ApiError, void>({
    mutationFn: () =>
      api.write<ContactRow>(`${BOOK_PATH}/${code}/primary`, { method: 'POST', need: WRITE_NEED }),
    onSuccess: (row) => {
      void client.invalidateQueries({ queryKey: [...CONTACT_BOOK_KEY, code] })
      invalidateAround(client, leadCode ?? row.leadCode)
    },
  })
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

export type ContactDraft = {
  name: string
  title: string
  email: string
  phone: string
  channel: string
  note: string
}

export const BLANK_CONTACT: ContactDraft = {
  name: '',
  title: '',
  email: '',
  phone: '',
  channel: '',
  note: '',
}

export function contactDraftOf(row: ContactRow | ContactBookRow): ContactDraft {
  return {
    name: row.name,
    title: row.title ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    channel: row.channel ?? '',
    note: row.note ?? '',
  }
}

const some = (s: string) => (s.trim() === '' ? undefined : s.trim())

/** Form → `POST` body.
 *
 *  `isPrimary` is always `false` from the screen, and that does NOT mean the
 *  screen can never create a primary: the server promotes the FIRST person on
 *  a lead to primary regardless of what the request body says
 *  (`ContactService.add`). That half of the rule cannot be stated by an index,
 *  so it lives in the service — and the screen must not guess at it. */
export function contactCreateBodyOf(draft: ContactDraft): ContactCreate {
  return {
    name: draft.name.trim(),
    ...(some(draft.title) === undefined ? {} : { title: some(draft.title) }),
    ...(some(draft.email) === undefined ? {} : { email: some(draft.email) }),
    ...(some(draft.phone) === undefined ? {} : { phone: some(draft.phone) }),
    ...(draft.channel === ''
      ? {}
      : { channel: draft.channel as NonNullable<ContactCreate['channel']> }),
    ...(some(draft.note) === undefined ? {} : { note: some(draft.note) }),
    isPrimary: false,
  }
}

/** Form → `PATCH` body.
 *
 *  Sends the WHOLE set of fields every time, even though the contract allows
 *  a sparse body. The reason is a limit already noted in `contact.mapper.ts`:
 *  an absent field means "leave as is", so clearing a title entirely cannot be
 *  said through this door. Sending the whole set at least keeps "what is each
 *  field right now" independent of which field the user happened to touch. */
export function contactPatchBodyOf(draft: ContactDraft): ContactPatch {
  return contactCreateBodyOf(draft)
}

export function changedContactFields(base: ContactDraft, work: ContactDraft): string[] {
  return (Object.keys(base) as (keyof ContactDraft)[]).filter((k) => base[k] !== work[k])
}
