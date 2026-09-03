import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AccountBookQuery,
  type AccountBookResponse,
  type AccountCreate,
  type AccountProfile,
  type AccountRow,
  type AccountUpdate,
  type MaObject,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** Account module · the customer company book — `/sales/accounts`.
 *
 *  ------------------------------------------------------------------
 *  NO `load:` ON ANY QUERY IN THIS FILE
 *  ------------------------------------------------------------------
 *  This book was born after the server already had a door, so it never ate a
 *  fixture for even a day. By the convention in `app/api/client.ts`, an absent
 *  `load` means it goes over real HTTP — and that is the whole signal, no
 *  other flag exists.
 *
 *  ------------------------------------------------------------------
 *  NO `scoped` — AND THAT IS THE THING TO READ BEFORE COPYING THIS FILE
 *  ------------------------------------------------------------------
 *  Every other book in this branch declares `scoped: true` in its `need`. This
 *  one does not, on all four doors, because a company does not belong to any
 *  one seller. Tightening the scope axis here would hide the department's own
 *  customers from itself: a Sale opening a new enquiry would not see that the
 *  company is already a customer of the person at the next desk — the single
 *  most expensive thing this book exists to prevent.
 *
 *  Full reasoning lives where the company-book read permission is declared in
 *  `e2-access.ts`, and in the docblock of
 *  `packages/contracts/src/sales/account.ts`. */

const BOOK_PATH = '/sales/accounts'

export const ACCOUNT_BOOK_KEY = ['sales', 'accounts'] as const

const READ_NEED: ApiNeed = { branch: 'Sales', permission: 'khách-hàng.xem' }
const WRITE_NEED: ApiNeed = { branch: 'Sales', permission: 'khách-hàng.sửa' }

export const DEFAULT_ACCOUNT_BOOK_QUERY: AccountBookQuery = AccountBookQuery.parse({})

/** Only fields that DIFFER from the default make it into the URL.
 *
 *  Same rule as the lead book and the deal book: an address carrying all ten
 *  default parameters is an address nobody can paste for someone else to
 *  read, and it also makes `queryKey` change over something that never
 *  changed. */
export function accountBookQueryToParams(q: AccountBookQuery): string {
  const p = new URLSearchParams()
  if (q.page !== DEFAULT_ACCOUNT_BOOK_QUERY.page) p.set('page', String(q.page))
  if (q.size !== DEFAULT_ACCOUNT_BOOK_QUERY.size) p.set('size', String(q.size))
  if (q.sort !== DEFAULT_ACCOUNT_BOOK_QUERY.sort) p.set('sort', q.sort)
  if (q.dir !== DEFAULT_ACCOUNT_BOOK_QUERY.dir) p.set('dir', q.dir)
  if (q.q !== undefined) p.set('q', q.q)
  if (q.province !== undefined) p.set('province', q.province)
  if (q.category !== undefined) p.set('category', q.category)
  if (q.customer !== undefined) p.set('customer', String(q.customer))
  return p.toString()
}

/** URL → query. NEVER throws: an address someone edited by hand in the
 *  address bar must still open a book, not a blank screen. */
export function parseAccountBookQuery(params: URLSearchParams): AccountBookQuery {
  const parsed = AccountBookQuery.safeParse(Object.fromEntries(params))
  return parsed.success ? parsed.data : DEFAULT_ACCOUNT_BOOK_QUERY
}

export function accountBookQuery(q: AccountBookQuery) {
  return queryOptions({
    queryKey: [...ACCOUNT_BOOK_KEY, 'page', q] as const,
    queryFn: ({ signal }) =>
      api.read<AccountBookResponse>(`${BOOK_PATH}?${accountBookQueryToParams(q)}`, {
        need: READ_NEED,
        signal,
      }),
  })
}

export function accountProfileQuery(code: MaObject) {
  return queryOptions({
    queryKey: [...ACCOUNT_BOOK_KEY, code] as const,
    queryFn: ({ signal }) =>
      api.read<AccountProfile>(`${BOOK_PATH}/${code}`, { need: READ_NEED, signal }),
  })
}

// ---------------------------------------------------------------------------
// The two write doors
// ---------------------------------------------------------------------------

export function useCreateAccount() {
  const client = useQueryClient()

  return useMutation<AccountRow, ApiError, AccountCreate>({
    mutationFn: (body) =>
      api.write<AccountRow>(BOOK_PATH, { method: 'POST', body, need: WRITE_NEED }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ACCOUNT_BOOK_KEY })
    },
  })
}

/** The Save button on a company's profile.
 *
 *  Differs from `useSaveOpportunity` in one place, and for a reason: it does
 *  NOT `setQueryData` onto the profile cache. The `PATCH` door returns an
 *  `AccountRow` — the form's nine fields plus four counts — while the profile
 *  cache holds an `AccountProfile`, which also carries three child lists
 *  (leads · deals · contacts). Overwriting with the shorter shape would make
 *  those three lists disappear from the screen until the next read.
 *
 *  So this is `invalidateQueries` for both the profile and the book: one
 *  extra read, in exchange for the screen never drawing a profile missing its
 *  bottom half. */
export function useSaveAccount(code: MaObject) {
  const client = useQueryClient()

  return useMutation<AccountRow, ApiError, AccountUpdate>({
    mutationFn: (body) =>
      api.write<AccountRow>(`${BOOK_PATH}/${code}`, { method: 'PATCH', body, need: WRITE_NEED }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...ACCOUNT_BOOK_KEY, code] })
      void client.invalidateQueries({ queryKey: ACCOUNT_BOOK_KEY })
    },
  })
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

/** The FORM shape of a company — nine fields, all strings or numbers.
 *
 *  Differs from `AccountRow` exactly where `OpportunityDraft` differs from
 *  `OpportunityRow`, and for the same reason: the wire uses `undefined` for
 *  "absent", while an `<input>` cannot accept `undefined` without becoming
 *  uncontrolled. The boundary between the two conventions lives in
 *  `draftOf`/`bodyOf` below, and only there. */
export type AccountDraft = {
  name: string
  legalName: string
  taxCode: string
  address: string
  province: string
  category: string
  headcount: string
  plants: string
  note: string
}

export const BLANK_ACCOUNT: AccountDraft = {
  name: '',
  legalName: '',
  taxCode: '',
  address: '',
  province: '',
  category: '',
  headcount: '',
  plants: '',
  note: '',
}

/** Two NUMBER fields kept as STRINGS in the form, and that is not laziness.
 *
 *  `headcount` left blank means "nobody has counted", while 0 means "nobody
 *  works here" — two different statements about a company. A `number | null`
 *  in state would need converting both ways on every keystroke, and the input
 *  loses its cursor when the user clears all the digits. Keeping it a string
 *  until right before submit is the cheapest way to let "empty" flow straight
 *  through to `undefined`. */
export function accountDraftOf(row: AccountRow | AccountProfile): AccountDraft {
  return {
    name: row.name,
    legalName: row.legalName ?? '',
    taxCode: row.taxCode ?? '',
    address: row.address ?? '',
    province: row.province ?? '',
    category: row.category ?? '',
    headcount: row.headcount === null ? '' : String(row.headcount),
    plants: row.plants === null ? '' : String(row.plants),
    note: row.note ?? '',
  }
}

const some = (s: string) => (s.trim() === '' ? undefined : s.trim())

const someInt = (s: string) => {
  const t = s.trim()
  if (t === '') return undefined
  const n = Number(t)
  /* Not a number sends `undefined`, never `NaN`: zod rejects `NaN` with a type
     error ("Expected number"), which cannot tell the user they just typed
     letters into a headcount field. The input is `type="number"`, so this
     only happens on paste. */
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

export function accountBodyOf(draft: AccountDraft): AccountCreate {
  return {
    name: draft.name.trim(),
    ...(some(draft.legalName) === undefined ? {} : { legalName: some(draft.legalName) }),
    ...(some(draft.taxCode) === undefined ? {} : { taxCode: some(draft.taxCode) }),
    ...(some(draft.address) === undefined ? {} : { address: some(draft.address) }),
    ...(some(draft.province) === undefined ? {} : { province: some(draft.province) }),
    ...(draft.category === ''
      ? {}
      : { category: draft.category as NonNullable<AccountCreate['category']> }),
    ...(someInt(draft.headcount) === undefined ? {} : { headcount: someInt(draft.headcount) }),
    ...(someInt(draft.plants) === undefined ? {} : { plants: someInt(draft.plants) }),
    ...(some(draft.note) === undefined ? {} : { note: some(draft.note) }),
  }
}

/** Which fields changed. Same trick the deal profile uses — compare field by
 *  field rather than the whole object, since two objects always differ by
 *  reference. */
export function changedAccountFields(base: AccountDraft, work: AccountDraft): string[] {
  return (Object.keys(base) as (keyof AccountDraft)[]).filter((k) => base[k] !== work[k])
}
