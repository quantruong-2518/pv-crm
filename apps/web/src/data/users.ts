import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { Branch } from '@pv/contracts'
import type {
  InviteView,
  RoleId,
  UserCreate,
  UserListResponse,
  UserPatch,
  UserRow,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** Quản trị · Người dùng — the four doors of `platform.actor`.
 *
 *  ------------------------------------------------------------------
 *  ONE PERMISSION, NO BRANCH, NO SCOPE — AND EACH ABSENCE IS A DECISION
 *  ------------------------------------------------------------------
 *  All four doors declare `{ permission: 'người-dùng.quản-lý' }` and nothing
 *  else, spelled the same way `apps/api` writes `@Need(...)` so a route and a
 *  query that drifted apart can be found by diffing two lines.
 *
 *   · **No `branch`.** `platform.actor` belongs to no product line — Sales
 *     reads it, Supply will read it, neither owns it. Hanging it off a Sales
 *     licence would shut the people book of a company that bought only Supply,
 *     and the person locked out would be the one who opens accounts.
 *     `AccessNeed` reads `branch ?? ref?.branch ?? null`, so leaving the field
 *     out turns the licence axis off entirely, which is the intent.
 *   · **No `scoped`.** There is no owner column to cut by: every row IS a
 *     person. The two roles that hold this permission see the whole book or
 *     none of it, and a flag claiming otherwise would be a promise the server
 *     cannot keep.
 *
 *  The permission itself is the widest one in the matrix — whoever holds it can
 *  grant themselves every other permission by editing their own `roleId` — so
 *  only `director` and `head-of-sales` have it. The reasoning lives beside the
 *  entry in `packages/engines/src/e2-access.ts`; it is not repeated here.
 *
 *  ------------------------------------------------------------------
 *  `roleId` NEVER MEETS E2 ON THIS SCREEN
 *  ------------------------------------------------------------------
 *  `@pv/contracts` and `@pv/engines` spell roles identically, so `UserRow.roleId`
 *  needs no translation at all — this screen only ever PRINTS it (via
 *  `ROLE_LABEL`) or sends it back unchanged. `ROLE_LABEL` is `satisfies
 *  Record<RoleId, string>` so a role added to the contract without a Vietnamese
 *  label here is a red build rather than a blank cell in the people book. */

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

const USERS_NEED: ApiNeed = { permission: 'người-dùng.quản-lý' }

/** Everything this screen caches, under one prefix.
 *
 *  The list is the only read. Create, patch and lock each answer with the row
 *  they just wrote, and every one of them still invalidates this key rather
 *  than splicing that row into the cached array: a people book is a handful of
 *  rows, one refetch costs nothing, and a splice would be a second copy of the
 *  server's ordering living in the browser. Two copies of an ordering is how a
 *  freshly renamed person jumps to the bottom of a list that is sorted by name
 *  everywhere else. */
export const USERS_KEY = ['platform', 'users'] as const

/** The whole book. `GET /users`.
 *
 *  Not paged and takes no argument, because the endpoint is neither: a company
 *  has as many accounts as it has employees, and the screen filters nothing —
 *  there is no query to put in the key. */
export const usersQuery = queryOptions({
  queryKey: USERS_KEY,
  queryFn: ({ signal }) => api.read<UserListResponse>('/users', { need: USERS_NEED, signal }),
})

/** Open an account. `POST /users`.
 *
 *  The 201 carries the whole row, and the caller is handed it — but the list is
 *  invalidated all the same, because the new person has to appear in the table
 *  BEHIND the panel, not only in the panel that created them.
 *
 *  No password anywhere in this call, by contract (`UserCreate`): a manager who
 *  types somebody's first password knows it, and from then on nothing that
 *  account does can be pinned on its owner alone. The invite door below is the
 *  only way in.
 *
 *  No retry, and none should be added — `mayReplay` already refuses to replay a
 *  POST that reached the wire, because a person inserted twice is two accounts
 *  that audit rows will point at interchangeably. Guarding the second HUMAN
 *  click is the panel's job (`isPending`). */
export function useCreateUser() {
  const client = useQueryClient()

  return useMutation<UserRow, ApiError, UserCreate>({
    mutationFn: (body) => api.write<UserRow>('/users', { method: 'POST', body, need: USERS_NEED }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: USERS_KEY })
    },
  })
}

/** Edit a person. `PATCH /users/:id`.
 *
 *  The id travels in the VARIABLES rather than in a hook argument, and that is
 *  not a style choice: the panel is mounted once and does double duty for every
 *  row, so a `useSaveUser(id)` would have to be called with `''` while the panel
 *  is in create mode — a hook quietly holding a URL of `/users/` waiting for
 *  somebody to fire it.
 *
 *  `UserPatch` refuses an empty body at the contract level ("Không có gì để
 *  sửa."). `diffUser` below is the browser-side half of that refusal: it builds
 *  the patch out of what actually changed, so the user hears about a no-op edit
 *  without a round trip. */
export function useSaveUser() {
  const client = useQueryClient()

  return useMutation<UserRow, ApiError, { id: string; patch: UserPatch }>({
    mutationFn: ({ id, patch }) =>
      api.write<UserRow>(`/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: patch,
        need: USERS_NEED,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: USERS_KEY })
    },
  })
}

/** Lock or unlock an account. The same `PATCH /users/:id`, one field.
 *
 *  A separate hook from `useSaveUser` even though it is the same door, because
 *  the two buttons sit side by side in one footer and share nothing else: one
 *  `isPending` for both would grey out "Lưu" while a lock is in flight and read
 *  as though the form itself were saving.
 *
 *  There is no delete here and there will not be. `lead.owner_id` and
 *  `platform.audit.actor_id` both point at an actor, so removing a person
 *  erases who held which lead and who did what — locking keeps the trail and
 *  still ends the access, which is the thing actually being asked for. */
export function useLockUser() {
  const client = useQueryClient()

  return useMutation<UserRow, ApiError, { id: string; disabled: boolean }>({
    mutationFn: ({ id, disabled }) =>
      api.write<UserRow>(`/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { disabled },
        need: USERS_NEED,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: USERS_KEY })
    },
  })
}

/** Send somebody a set-password link. `POST /users/:id/invite`.
 *
 *  Deliberately does NOT invalidate the list: an invite changes nothing on the
 *  row. `passwordSet` flips when the person follows the link and types a
 *  password, which happens minutes or days later and in another browser — a
 *  refetch here would redraw the same seven rows and teach the next reader that
 *  sending mail edits an account.
 *
 *  The answer is `{ sent, link? }` and the `link` half only exists on a machine
 *  whose outbound mail door is shut. See `InviteView` in `@pv/contracts` for why
 *  a working mail door must never put that link on a screen. */
export function useInviteUser() {
  return useMutation<InviteView, ApiError, string>({
    mutationFn: (id) =>
      api.write<InviteView>(`/users/${encodeURIComponent(id)}/invite`, { need: USERS_NEED }),
  })
}

// ---------------------------------------------------------------------------
// Vocabulary the screen prints
// ---------------------------------------------------------------------------

/** The Vietnamese name of every role key — ONE table, and it lives here rather
 *  than in `@pv/contracts` on purpose.
 *
 *  `SOURCE_KIND_LABEL` sits in the contract because it has readers outside the
 *  browser: an export, a digest mail, an audit line all have to call a lead
 *  source the same thing. This table has exactly one reader — the role column
 *  and the role picker of this screen — because the API never renders a role
 *  name for anybody. A label with one reader belongs next to that reader; put
 *  it in the shared contract and it becomes a second place to look for a string
 *  only one screen prints.
 *
 *  `satisfies Record<RoleId, string>` is the whole guard: adding a seventh role
 *  to the contract without naming it here is a red build, not a picker that
 *  quietly offers six of seven roles. Order follows `RoleId` — widest reach
 *  first — because the picker renders in this order and a manager scanning it
 *  should meet the dangerous options first, not find them buried. */
export const ROLE_LABEL = {
  director: 'Giám đốc',
  'head-of-sales': 'Trưởng phòng Kinh doanh',
  marketing: 'Marketing',
  bd: 'BD',
  presales: 'Presales',
  sale: 'Sale',
  'account-executive': 'Account Executive',
} as const satisfies Record<RoleId, string>

/** The role picker's list, built FROM the label table so the two can never
 *  disagree about which roles exist. */
export const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as RoleId[]).map((id) => ({
  value: id,
  label: ROLE_LABEL[id],
}))

/** What a brand-new account gets before anybody touches the picker.
 *
 *  The NARROWEST role in the matrix, and that is the point: a form left on its
 *  default and submitted in a hurry opens the least it can. Defaulting to the
 *  role the manager happens to hold would mean every mis-click mints a second
 *  person who can open accounts. */
export const DEFAULT_ROLE: RoleId = 'sale'

/** Every licensed product line, in the contract's own order.
 *
 *  Read off the schema instead of being re-listed here: the day a sixth branch
 *  is licensed it has to appear in this form, and a hand-copied list is one
 *  somebody has to remember to grow. Branch names stay English — luật 14 fixes
 *  them as product names, so the wire key and the label are already one string. */
export const BRANCH_OPTIONS = Branch.options

/** The branch nobody can be without.
 *
 *  Every account needs the core to see any screen at all, and a person who
 *  cannot open the home page is not a useful account — so the server adds `One`
 *  when a create body omits it (`UserCreate`). The form therefore draws it
 *  ticked and frozen rather than lettting somebody untick a box whose value the
 *  server is about to overrule; a control that does not do what it appears to
 *  do is worse than no control. */
export const CORE_BRANCH = 'One' as const satisfies Branch

export const SCOPE_ALL = 'Cả sổ'
export const SCOPE_OWN = 'Chỉ của mình'

/** Axis 3 of E2, in the two words the table column has room for. `ownOnly`
 *  cuts a person down to the rows standing in their own name — it is not a
 *  permission and cannot be granted around, which is why it reads as a scope
 *  rather than as a role. */
export const scopeLabel = (ownOnly: boolean): string => (ownOnly ? SCOPE_OWN : SCOPE_ALL)

/** The contract's own words for an edit that edits nothing (`UserPatch`'s
 *  refine). Repeated here so the sentence the user reads is the same one
 *  whether the browser caught it or the server did. */
export const NOTHING_TO_SAVE = 'Không có gì để sửa.'

// ---------------------------------------------------------------------------
// Small derivations the screen needs
// ---------------------------------------------------------------------------

export type UserTally = {
  total: number
  /** Accounts that can be signed into at all. */
  passworded: number
  /** Accounts locked out, whenever that happened. */
  locked: number
}

/** Three counts in one pass over the book.
 *
 *  Derived rather than typed into the header, because the header is the only
 *  place anybody checks these numbers and a hand-written one goes stale the
 *  first time somebody is invited. */
export function userTally(rows: readonly UserRow[]): UserTally {
  let passworded = 0
  let locked = 0
  for (const row of rows) {
    if (row.passwordSet) passworded += 1
    if (row.disabledAt !== null) locked += 1
  }
  return { total: rows.length, passworded, locked }
}

/** The one line under the screen title.
 *
 *  Three counts and not one, because they answer three different questions a
 *  manager opens this screen with: how many people are in the book, how many of
 *  them ever finished setting up, and how many are shut out right now. A single
 *  "7 tài khoản" hides both of the states that need somebody to do something. */
export const tallyLine = (t: UserTally): string =>
  `${t.total} tài khoản · ${t.passworded} đã đặt mật khẩu · ${t.locked} đang khoá`

/** What the panel holds while somebody is typing — the editable half of a row.
 *
 *  `email` is absent, and so is `disabled`: neither is edited through the form.
 *  A mailbox cannot be patched at all (`UserPatch` has no such field, by
 *  design), and the lock is its own button because it is not a field somebody
 *  fills in on the way to saving something else. */
export type UserDraft = {
  name: string
  role: string
  roleId: RoleId
  branches: readonly Branch[]
  ownOnly: boolean
}

/** Branch lists are SETS, so compare them as sets. The form renders checkboxes
 *  in the contract's order while a row comes back in whatever order the server
 *  stored, and comparing the two as sequences would report an edit every time
 *  somebody opened a panel and closed it again. */
const sameBranches = (a: readonly Branch[], b: readonly Branch[]): boolean =>
  a.length === b.length && a.every((branch) => b.includes(branch))

/** What actually changed, or `null` when nothing did.
 *
 *  Sending the whole draft on every save would work and would be wrong in one
 *  specific way: `PATCH` means "these fields", so a full body says the manager
 *  re-asserted every field, and the next person to read an audit line cannot
 *  tell a rename from a role change. A minimal patch says exactly what was
 *  touched.
 *
 *  `null` is the browser half of the contract's own refusal — it lets the panel
 *  say "Không có gì để sửa." without spending a round trip on a 400 that says
 *  the same thing more slowly.
 *
 *  Text is trimmed before comparing because the contract trims on the way in:
 *  without it, a trailing space nobody can see counts as an edit. Internal runs
 *  of whitespace are NOT collapsed here — the server does that — so the worst
 *  case is one no-op PATCH, not a wrong answer. */
export function diffUser(row: UserRow, draft: UserDraft): UserPatch | null {
  const patch: UserPatch = {}

  const name = draft.name.trim()
  const role = draft.role.trim()

  if (name !== row.name) patch.name = name
  if (role !== row.role) patch.role = role
  if (draft.roleId !== row.roleId) patch.roleId = draft.roleId
  if (!sameBranches(row.branches, draft.branches)) patch.branches = [...draft.branches]
  if (draft.ownOnly !== row.ownOnly) patch.ownOnly = draft.ownOnly

  return Object.keys(patch).length === 0 ? null : patch
}
