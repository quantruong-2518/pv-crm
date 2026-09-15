import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { Permission, RoleId } from '@pv/contracts'
import type { RoleGrants, RoleGrantsPatch, RoleMatrixView } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** One Core · Admin · Roles — the two doors of `platform.role_permission`.
 *
 *  ------------------------------------------------------------------
 *  ONE PERMISSION, NO BRANCH — THE SAME DECISION THE PEOPLE BOOK MADE
 *  ------------------------------------------------------------------
 *  Both doors declare `{ permission: 'role.manage' }` and nothing else. No
 *  `branch`, because the matrix belongs to no product line: a company that
 *  bought only Supply still has to be able to say who may do what. No `scoped`,
 *  because there is no owner column to cut by — a role belongs to nobody.
 *
 *  `role.manage` is as wide as `user.manage` and wide in the same way: whoever
 *  holds it can grant themselves every other permission in one save. That is
 *  why there is no separate "read the matrix" gate — splitting read from write
 *  would build a door whose far side is the whole matrix anyway.
 *
 *  The two save refusals belong to the server and are printed verbatim —
 *  the argument is in `pages/roles.tsx`, which is where the printing happens.
 *  Do NOT re-implement either check here: a browser-side copy would need to
 *  know how many OTHER accounts hold a permission, a fact this screen never
 *  loads. */

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

const ROLES_NEED: ApiNeed = { permission: 'role.manage' }

export const ROLES_KEY = ['platform', 'roles'] as const

/** The whole matrix. `GET /roles`. Seven rows, no paging, no argument — the
 *  screen draws every cell at once, so there is no query to put in the key. */
export const roleMatrixQuery = queryOptions({
  queryKey: ROLES_KEY,
  queryFn: ({ signal }) => api.read<RoleMatrixView>('/roles', { need: ROLES_NEED, signal }),
})

/** Rewrite one role's whole grant set. `PATCH /roles/:roleId`.
 *
 *  One role per call because that is what the contract exposes, and the screen
 *  saves several by calling this several times in a row. Sequentially, not in
 *  parallel: the server's "somebody has to keep `user.manage`" check reads the
 *  state left by the previous write, and two concurrent writes would each be
 *  checked against a matrix the other is about to change.
 *
 *  The `roleId` travels in the variables rather than in a hook argument — one
 *  hook is mounted once and fires for whichever rows are dirty. */
export function useSaveRoleGrants() {
  const client = useQueryClient()

  return useMutation<RoleGrants, ApiError, { roleId: RoleId; permissions: Permission[] }>({
    mutationFn: ({ roleId, permissions }) =>
      api.write<RoleGrants>(`/roles/${encodeURIComponent(roleId)}`, {
        method: 'PATCH',
        body: { permissions } satisfies RoleGrantsPatch,
        need: ROLES_NEED,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ROLES_KEY })
    },
  })
}

// ---------------------------------------------------------------------------
// Vocabulary the screen prints
// ---------------------------------------------------------------------------

/** The resource half of a permission key, as a type — `campaign.view` yields
 *  `campaign`. Written as a generic so the conditional distributes over the
 *  union; inlining `Permission extends …` would test the whole union at once
 *  and collapse to `never`. */
type ResourceOf<P extends string> = P extends `${infer R}.${string}` ? R : never

export type Resource = ResourceOf<Permission>

/** Group headings, one per resource prefix.
 *
 *  `satisfies Record<Resource, string>` is the whole guard, and it is why there
 *  is no second "group → permissions" table anywhere: the groups are derived
 *  from the keys (`permission.split('.')[0]`), so the only thing left to write
 *  by hand is a word per prefix — and forgetting one is a red build. */
export const RESOURCE_LABEL = {
  campaign: 'Chiến dịch & sự kiện',
  lead: 'Sổ lead',
  account: 'Khách hàng công ty',
  opportunity: 'Cơ hội',
  contract: 'Hợp đồng & thu tiền',
  performance: 'Hiệu suất',
  plan: 'Số liệu & kế hoạch',
  config: 'Thiết lập Kinh doanh',
  comm: 'Sổ giao tiếp',
  'audit-log': 'Ghi vết',
  user: 'Tài khoản người dùng',
  role: 'Vai trò & quyền',
  approval: 'Phê duyệt',
  data: 'Xuất dữ liệu',
} as const satisfies Record<Resource, string>

/** What each permission lets a person DO, in the words a sales manager uses.
 *
 *  Not a translation of the key. What `campaign.broadcast` grants is
 *  irreversible mail leaving the company, so the label says it is fired
 *  OUTWARDS; a neutral "send" would hide the part that cannot be undone. The
 *  key itself stays on screen under every label, so nobody trusts the gloss
 *  alone.
 *
 *  `satisfies Record<Permission, string>` — a permission added to the contract
 *  without a label here is a red build, not a blank row in the matrix. */
export const PERMISSION_LABEL = {
  'campaign.view': 'Xem chiến dịch và sự kiện',
  'campaign.edit': 'Dựng và sửa chiến dịch',
  'campaign.broadcast': 'Bắn chiến dịch ra ngoài',
  'lead.view': 'Xem sổ lead',
  'lead.edit': 'Sửa hồ sơ lead',
  'lead.send-email': 'Gửi thư cho lead đang giữ',
  'lead.assign': 'Giao việc trên lead cho người khác',
  'lead.convert': 'Chuyển lead thành cơ hội',
  'lead.disqualify': 'Đưa lead ra khỏi luồng',
  'account.view': 'Xem sổ khách hàng công ty',
  'account.edit': 'Sửa hồ sơ khách hàng công ty',
  'opportunity.view': 'Xem sổ cơ hội',
  'opportunity.edit': 'Sửa cơ hội và bảng giá',
  'opportunity.close': 'Chốt hoặc buông một cơ hội',
  'contract.view': 'Xem hợp đồng',
  'contract.edit': 'Sửa hợp đồng và đợt thanh toán',
  'contract.record-payment': 'Ghi nhận tiền về',
  'performance.view': 'Xem hiệu suất cả phòng',
  'plan.view': 'Xem số liệu và kế hoạch',
  'plan.submit': 'Chốt kế hoạch gửi lên duyệt',
  'config.view': 'Xem thiết lập Kinh doanh',
  'config.propose': 'Đề nghị đổi thiết lập Kinh doanh',
  'audit-log.view': 'Đọc nhật ký ghi vết',
  'user.manage': 'Mở tài khoản, gán vai, khoá người',
  'role.manage': 'Sửa chính bảng vai → quyền này',
  'approval.decide': 'Gật hoặc bác một đề nghị',
  'comm.capture-manage': 'Nối địa chỉ thư, chat, số máy với đúng người',
  'data.export': 'Tải dữ liệu ra ngoài',
} as const satisfies Record<Permission, string>

/** The seven role keys in the contract's own order — widest reach first, which
 *  is the order both the grid's columns and the sheet's picker read in. */
export const ROLE_IDS = RoleId.options

/** Which role the sheet opens on when the reader's own is unavailable — only
 *  while a session is being torn down.
 *
 *  Read off `ROLE_IDS` rather than written out, so it follows the contract's
 *  order instead of being a second copy of it: a literal `'director'` stays a
 *  valid `RoleId` after somebody reorders the enum, so nothing would catch it
 *  drifting. The `??` is there only because `noUncheckedIndexedAccess` widens
 *  an index read to `undefined`; the array is never empty. */
export const FIRST_ROLE: RoleId = ROLE_IDS[0] ?? 'director'

/** Role names cut to fit a 104px matrix column.
 *
 *  A SECOND label table, and the one place that is worth it: the grid header
 *  and the picker have nothing in common but the word. `satisfies` keeps it
 *  honest — a role added to the contract without a short name is a red build,
 *  not a column headed `undefined`. */
export const ROLE_COLUMN_LABEL = {
  director: 'Giám đốc',
  'head-of-sales': 'TP Kinh doanh',
  marketing: 'Marketing',
  bd: 'BD',
  presales: 'Presales',
  sale: 'Sale',
  'account-executive': 'AE',
} as const satisfies Record<RoleId, string>

export type PermissionGroup = {
  resource: Resource
  label: string
  permissions: Permission[]
}

const resourceOf = (permission: Permission): Resource => permission.split('.')[0] as Resource

/** The 27 permissions, cut into groups by the prefix of the key itself.
 *
 *  Built once at module load, from `Permission.options`, so the grid and the
 *  sheet render the same groups in the same order without either of them
 *  holding a list. Keyed by a `Map` rather than by "is this the same prefix as
 *  the previous one" so a resource that reappears later in the contract joins
 *  its own group instead of opening a second one with the same heading. */
export const PERMISSION_GROUPS: PermissionGroup[] = (() => {
  const byResource = new Map<Resource, PermissionGroup>()

  for (const permission of Permission.options) {
    const resource = resourceOf(permission)
    const group = byResource.get(resource)
    if (group) group.permissions.push(permission)
    else
      byResource.set(resource, {
        resource,
        label: RESOURCE_LABEL[resource],
        permissions: [permission],
      })
  }

  return [...byResource.values()]
})()

/** The two permissions that hand out every other permission.
 *
 *  Marked on screen rather than blocked, because an administrator does
 *  legitimately move them — but never by accident. The reasoning is the
 *  engine's (`PERMISSIONS` in `@pv/engines`), and it is one sentence here
 *  rather than a paraphrase of that docblock. */
export const SELF_GRANTING: readonly Permission[] = ['user.manage', 'role.manage']

export const isSelfGranting = (permission: Permission): boolean =>
  SELF_GRANTING.includes(permission)

export const SELF_GRANTING_TAG = 'Tự cấp'

export const SELF_GRANTING_WHY =
  'Ai có quyền này tự cấp được cho mình mọi quyền còn lại. Trao nó cho một vai là trao cả bảng.'

// ---------------------------------------------------------------------------
// The draft the screen edits
// ---------------------------------------------------------------------------

/** The matrix as the screen holds it: every role present, even one the server
 *  sent no row for. A missing row means "this role may do nothing", which is a
 *  perfectly good answer, and defaulting it to an empty list keeps every cell
 *  in the grid readable instead of leaving a column undefined. */
export type RoleDraft = Record<RoleId, Permission[]>

export function draftOf(view: RoleMatrixView): RoleDraft {
  const draft = Object.fromEntries(ROLE_IDS.map((id) => [id, [] as Permission[]])) as RoleDraft
  for (const row of view.rows) draft[row.roleId] = [...row.permissions]
  return draft
}

/** One cell, flipped. Returns a new draft rather than mutating, so React sees
 *  the change without the screen having to bump a version counter. */
export function toggleGrant(
  draft: RoleDraft,
  roleId: RoleId,
  permission: Permission,
  on: boolean,
): RoleDraft {
  const row = draft[roleId]
  return { ...draft, [roleId]: on ? [...row, permission] : row.filter((p) => p !== permission) }
}

/** Grant lists are SETS — the server stores them in its own order and the
 *  screen appends in click order, so comparing them as sequences would report
 *  an edit on a row nobody touched. */
const sameGrants = (a: readonly Permission[], b: readonly Permission[]): boolean =>
  a.length === b.length && a.every((permission) => b.includes(permission))

/** Which rows still differ from what the server last said — the save list, and
 *  also what the header counts. Recomputed from the two drafts rather than
 *  tracked as a flag, so a row toggled off and back on stops being dirty. */
export const dirtyRoles = (server: RoleDraft, draft: RoleDraft): RoleId[] =>
  ROLE_IDS.filter((id) => !sameGrants(server[id], draft[id]))

/** The one line under the screen title.
 *
 *  The third number is the one that moves: total permissions and total roles
 *  are constants of the product, and printing them says how big the grid the
 *  reader is looking at actually is. */
export const matrixLine = (draft: RoleDraft): string => {
  const granted = ROLE_IDS.reduce((sum, id) => sum + draft[id].length, 0)
  return `${Permission.options.length} quyền · ${ROLE_IDS.length} vai · ${granted} ô đang bật`
}
