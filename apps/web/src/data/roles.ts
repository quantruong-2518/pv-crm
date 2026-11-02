import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { Permission, RoleId } from '@pv/contracts'
import type { RoleGrants, RoleGrantsPatch, RoleMatrixView } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { message, translate, type Message } from '@/app/i18n'
import { cacheTier } from '@/app/query-client'

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
 *  holds it hands out everything they hold, up to their own rank. That is
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
  ...cacheTier.reference,
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

/** Getter per key, so a label read at any time follows the language on screen. */
function liveLabels<K extends string>(copy: Record<K, Message>): Record<K, string> {
  const out = {} as Record<K, string>
  for (const key of Object.keys(copy) as K[]) {
    Object.defineProperty(out, key, { get: () => translate(copy[key]), enumerable: true })
  }
  return out
}

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
const RESOURCE_COPY = {
  campaign: message('Chiến dịch & sự kiện', 'Campaigns & events', '캠페인 및 행사'),
  lead: message('Sổ lead', 'Lead book', '리드 목록'),
  workstream: message('Hành trình khách hàng', 'Customer journey', '고객 여정'),
  account: message('Khách hàng công ty', 'Company customers', '고객사'),
  opportunity: message('Cơ hội', 'Opportunities', '기회'),
  contract: message('Hợp đồng & thu tiền', 'Contracts & collections', '계약 및 수금'),
  performance: message('Hiệu suất', 'Performance', '성과'),
  kpi: message('KPI', 'KPI', 'KPI'),
  plan: message('Số liệu & kế hoạch', 'Figures & plans', '수치 및 계획'),
  config: message('Thiết lập bán hàng', 'Sales settings', '영업 설정'),
  'lead-origin': message('Nguồn lead', 'Lead sources', '리드 출처'),
  comm: message('Sổ giao tiếp', 'Communication log', '소통 기록'),
  setting: message('Thiết lập chung', 'General settings', '일반 설정'),
  cost: message('Chi phí', 'Costs', '비용'),
  'audit-log': message('Nhật ký thao tác', 'Activity log', '작업 기록'),
  'ai-read': message('Nhật ký AI đã đọc', 'AI read log', 'AI 열람 기록'),
  assistant: message('Trợ lý AI', 'AI assistant', 'AI 도우미'),
  user: message('Tài khoản người dùng', 'User accounts', '사용자 계정'),
  role: message('Vai trò & quyền', 'Roles & permissions', '역할 및 권한'),
  approval: message('Phê duyệt', 'Approvals', '승인'),
  data: message('Xuất dữ liệu', 'Data export', '데이터 내보내기'),
} as const satisfies Record<Resource, Message>

export const RESOURCE_LABEL = liveLabels(RESOURCE_COPY)

/** What each permission lets a person DO, in the words a sales manager uses.
 *
 *  Not a translation of the key. What `campaign.broadcast` grants is
 *  irreversible mail leaving the company, so the label names the customer as
 *  the receiver. The key itself stays on screen under every label, so nobody
 *  trusts the gloss alone.
 *
 *  `satisfies Record<Permission, string>` — a permission added to the contract
 *  without a label here is a red build, not a blank row in the matrix. */
const PERMISSION_COPY = {
  'campaign.view': message(
    'Xem chiến dịch và sự kiện',
    'View campaigns and events',
    '캠페인과 행사 보기',
  ),
  'campaign.edit': message(
    'Tạo và sửa chiến dịch',
    'Create and edit campaigns',
    '캠페인 만들기 및 수정',
  ),
  'campaign.broadcast': message(
    'Gửi chiến dịch cho khách',
    'Send campaigns to customers',
    '고객에게 캠페인 발송',
  ),
  'lead.view': message('Xem sổ lead', 'View the lead book', '리드 목록 보기'),
  'workstream.view': message(
    'Xem hành trình khách hàng',
    'View customer journeys',
    '고객 여정 보기',
  ),
  'lead.edit': message('Sửa hồ sơ lead', 'Edit lead profiles', '리드 프로필 수정'),
  'lead.send-email': message(
    'Gửi thư cho lead mình phụ trách',
    'Email leads you own',
    '담당 리드에게 메일 발송',
  ),
  'lead.assign': message(
    'Giao việc trên lead cho người khác',
    'Assign lead tasks to others',
    '리드 업무를 다른 사람에게 배정',
  ),
  'lead.disqualify': message(
    'Chuyển lead vào Khách đã dừng',
    'Move a lead to Stopped customers',
    '리드를 중단된 고객으로 이동',
  ),
  'lead.disable': message(
    'Tắt và bật lại lead',
    'Disable and re-enable leads',
    '리드 비활성화 및 재활성화',
  ),
  'account.view': message('Xem khách hàng công ty', 'View company customers', '고객사 보기'),
  'account.edit': message(
    'Sửa hồ sơ khách hàng công ty',
    'Edit company customer profiles',
    '고객사 프로필 수정',
  ),
  'opportunity.view': message('Xem cơ hội', 'View opportunities', '기회 보기'),
  'opportunity.create': message(
    'Tạo cơ hội mới từ lead',
    'Create an opportunity from a lead',
    '리드에서 새 기회 만들기',
  ),
  'opportunity.edit': message(
    'Sửa cơ hội và báo giá',
    'Edit opportunities and quotations',
    '기회와 견적서 수정',
  ),
  'opportunity.accept': message(
    'Nhận phụ trách cơ hội mới',
    'Take ownership of new opportunities',
    '새 기회 담당 맡기',
  ),
  'opportunity.assign': message(
    'Giao hoặc đổi Sale phụ trách cơ hội',
    'Assign or change the salesperson on an opportunity',
    '기회의 영업 담당자 지정 또는 변경',
  ),
  'opportunity.close': message(
    'Chốt thắng hoặc dừng một cơ hội',
    'Close an opportunity as won or stop it',
    '기회 수주 확정 또는 중단',
  ),
  'contract.view': message('Xem hợp đồng', 'View contracts', '계약 보기'),
  'contract.edit': message(
    'Sửa hợp đồng và đợt thanh toán',
    'Edit contracts and installments',
    '계약 및 납부 회차 수정',
  ),
  'contract.record-payment': message(
    'Ghi nhận khách đã thanh toán',
    'Record customer payments',
    '고객 결제 기록',
  ),
  'contract.approve-overdue-reason': message(
    'Duyệt lý do quá hạn',
    'Approve overdue reasons',
    '연체 사유 승인',
  ),
  'contract.terminate': message(
    'Chấm dứt hợp đồng đã ký',
    'Terminate a signed contract',
    '체결된 계약 해지',
  ),
  'performance.view': message(
    'Xem hiệu suất cả phòng',
    'View whole-department performance',
    '부서 전체 성과 보기',
  ),
  'kpi.view': message('Xem KPI của mình', 'View your own KPIs', '내 KPI 보기'),
  'kpi.view-all': message('Xem KPI của mọi người', 'View everyone’s KPIs', '모든 사람의 KPI 보기'),
  'kpi.set-target': message(
    'Đặt và chốt chỉ tiêu KPI',
    'Set and lock KPI targets',
    'KPI 목표 설정 및 확정',
  ),
  'plan.view': message('Xem số liệu và kế hoạch', 'View figures and plans', '수치와 계획 보기'),
  'plan.submit': message('Gửi kế hoạch đi duyệt', 'Submit a plan for approval', '계획 승인 요청'),
  'config.view': message('Xem Thiết lập bán hàng', 'View sales settings', '영업 설정 보기'),
  'config.propose': message(
    'Đề nghị thay đổi Thiết lập bán hàng',
    'Propose changes to sales settings',
    '영업 설정 변경 제안',
  ),
  'lead-origin.manage': message('Quản lý nguồn lead', 'Manage lead sources', '리드 출처 관리'),
  'audit-log.view': message('Xem nhật ký thao tác', 'View the activity log', '작업 기록 보기'),
  'ai-read.view': message(
    'Xem nhật ký AI đã đọc hồ sơ',
    'View the log of records the AI read',
    'AI가 열람한 기록 이력 보기',
  ),
  'assistant.use': message('Hỏi Trợ lý AI', 'Ask the AI assistant', 'AI 도우미에게 질문'),
  'assistant.review': message(
    'Đọc câu trả lời bị báo sai',
    'Read answers reported as wrong',
    '잘못 신고된 답변 읽기',
  ),
  'user.manage': message(
    'Tạo và sửa tài khoản, chọn vai trò',
    'Create and edit accounts, assign roles',
    '계정 생성 및 수정, 역할 지정',
  ),
  'role.manage': message(
    'Sửa quyền của từng vai trò',
    'Edit each role’s permissions',
    '역할별 권한 수정',
  ),
  'approval.decide': message(
    'Duyệt hoặc từ chối đề nghị',
    'Approve or reject requests',
    '요청 승인 또는 거절',
  ),
  'comm.view': message(
    'Xem lịch sử trao đổi với khách',
    'View communication history with customers',
    '고객과의 소통 이력 보기',
  ),
  'comm.view-content': message(
    'Đọc nội dung thư, tin nhắn, bản ghi',
    'Read email, message and recording content',
    '메일, 메시지, 녹음 내용 읽기',
  ),
  'comm.capture-manage': message(
    'Gắn email, chat, số điện thoại với đúng người',
    'Link emails, chats and phone numbers to the right person',
    '메일, 채팅, 전화번호를 해당 인물에 연결',
  ),
  'setting.manage': message(
    'Chỉnh ngưỡng, thời hạn và thông báo theo vai trò',
    'Adjust thresholds, deadlines and notifications by role',
    '역할별 기준, 기한, 알림 조정',
  ),
  'cost.view': message('Xem chi phí', 'View costs', '비용 보기'),
  'data.export': message(
    'Tải dữ liệu về máy',
    'Download data to your device',
    '데이터를 기기로 다운로드',
  ),
} as const satisfies Record<Permission, Message>

export const PERMISSION_LABEL = liveLabels(PERMISSION_COPY)

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
const ROLE_COLUMN_COPY = {
  director: message('Giám đốc', 'Director', '이사'),
  'head-of-sales': message('TP Kinh doanh', 'Head of Sales', '영업 부서장'),
  marketing: message('Marketing', 'Marketing', '마케팅'),
  bd: message('BD', 'BD', 'BD'),
  presales: message('Presales', 'Presales', '프리세일즈'),
  sale: message('Sale', 'Sales', '영업'),
  'account-executive': message('AE', 'AE', 'AE'),
} as const satisfies Record<RoleId, Message>

export const ROLE_COLUMN_LABEL = liveLabels(ROLE_COLUMN_COPY)

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
        get label() {
          return RESOURCE_LABEL[resource]
        },
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

export const SELF_GRANTING_TAG = message('Tự cấp', 'Self-granting', '자체 부여')

export const SELF_GRANTING_WHY = message(
  'Người có quyền này tự cấp được cho mình mọi quyền khác.',
  'Anyone with this permission can grant themselves every other permission.',
  '이 권한이 있으면 다른 모든 권한을 스스로 부여할 수 있습니다.',
)

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
  const [perms, roles] = [Permission.options.length, ROLE_IDS.length]
  return translate(
    message(
      `${perms} quyền · ${roles} vai · ${granted} ô đang bật`,
      `${perms} permissions · ${roles} roles · ${granted} cells on`,
      `권한 ${perms}개 · 역할 ${roles}개 · 켜진 칸 ${granted}개`,
    ),
  )
}
