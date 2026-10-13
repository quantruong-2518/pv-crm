import { z } from 'zod'
import { RoleId, type Permission } from './auth'
import { PageQuery, paged } from './pagination'
import { Moment } from './primitives'

/** The in-app bell: `GET /notifications` pages the caller's own rows newest
 *  first, `GET /notifications/unread-count` feeds the badge, and
 *  `POST /notifications/read` marks rows read. All three are session-only and
 *  scoped to the caller, so no id is an oracle for another person's bell.
 *
 *  Kind values are copied into a CHECK constraint on `platform.notification`;
 *  the engine decides the kind (`e4-bell-rules.ts`), this file only names them.
 *  `subject` and `detail` are snapshots taken when the row was written, so the
 *  bell never joins into another module to render a line. */
export const NotificationKind = z.enum([
  'lead-pooled',
  'lead-received',
  'lead-removed',
  'lead-re-entered',
  'lead-stopped',
  'lead-scan-ready',
  'lead-scan-committed',
  'lead-scan-failed',
  'opportunity-awaiting-accept',
  'opportunity-lost',
  'opportunity-accepted',
  'opportunity-assigned',
  'opportunity-unassigned',
  'next-step-assigned',
  'next-step-done',
  'comm-record-late',
  'approval-waiting',
  'approval-approved',
  'approval-rejected',
  'mail-run-sent',
  'mail-run-cancelled',
  'mail-failed',
  'customer-replied',
  'access-changed',
  'password-reset-by-admin',
  'google-link-broken',
])
export type NotificationKind = z.infer<typeof NotificationKind>

/** What a row points at; it decides where a click goes. */
export const NotificationSubject = z.enum([
  'lead',
  'lead-pool',
  'opportunity',
  'approval',
  'lead-scan',
  'mail-run',
  'user',
  'google-link',
  'comm-record',
])
export type NotificationSubject = z.infer<typeof NotificationSubject>

/** A whole sentence; the screen prints the subject's label on the line below. */
export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  'lead-pooled': 'Có lead mới ở kho chung',
  'lead-received': 'Bạn được giao lead',
  'lead-removed': 'Lead không còn giao cho bạn',
  'lead-re-entered': 'Khách của bạn liên hệ lại',
  'lead-stopped': 'Lead của bạn chuyển sang Ngừng chăm sóc',
  'lead-scan-ready': 'Nạp từ ảnh: đã đọc xong, chờ bạn xem',
  'lead-scan-committed': 'Nạp từ ảnh: lead đã vào Sổ lead',
  'lead-scan-failed': 'Nạp từ ảnh: chưa hoàn tất, cần làm lại',
  'opportunity-awaiting-accept': 'Có cơ hội đang chờ bạn nhận',
  'opportunity-lost': 'Cơ hội của bạn đã dừng',
  'opportunity-accepted': 'Cơ hội của bạn đã được nhận',
  'opportunity-assigned': 'Bạn được thêm vào cơ hội',
  'opportunity-unassigned': 'Bạn không còn phụ trách cơ hội',
  'next-step-assigned': 'Bạn được giao việc tiếp theo',
  'next-step-done': 'Việc bạn giao đã xong',
  'comm-record-late': 'Lượt liên hệ quá hạn chưa xác nhận',
  'approval-waiting': 'Có yêu cầu đang chờ bạn duyệt',
  'approval-approved': 'Yêu cầu của bạn đã được duyệt',
  'approval-rejected': 'Yêu cầu của bạn bị từ chối',
  'mail-run-sent': 'Lô gửi đã xong',
  'mail-run-cancelled': 'Lô gửi đã dừng',
  'mail-failed': 'Thư không gửi được',
  'customer-replied': 'Khách đã trả lời thư',
  'access-changed': 'Quyền của bạn vừa thay đổi',
  'password-reset-by-admin': 'Quản trị viên đã đặt lại mật khẩu của bạn',
  'google-link-broken': 'Tài khoản Google bị mất kết nối',
}

/** The filter chips on the bell screen. */
export const NotificationGroup = z.enum([
  'lead',
  'opportunity',
  'next-step',
  'approval',
  'mail',
  'account',
])
export type NotificationGroup = z.infer<typeof NotificationGroup>

export const NOTIFICATION_GROUP_LABEL: Record<NotificationGroup, string> = {
  lead: 'Lead',
  opportunity: 'Cơ hội',
  'next-step': 'Việc tiếp theo',
  approval: 'Phê duyệt',
  mail: 'Thư',
  account: 'Tài khoản',
}

/** One kind maps to exactly one group; `Record` makes a new kind fail to
 *  compile until it is grouped. */
export const NOTIFICATION_KIND_GROUP: Record<NotificationKind, NotificationGroup> = {
  'lead-pooled': 'lead',
  'lead-received': 'lead',
  'lead-removed': 'lead',
  'lead-re-entered': 'lead',
  'lead-stopped': 'lead',
  'lead-scan-ready': 'lead',
  'lead-scan-committed': 'lead',
  'lead-scan-failed': 'lead',
  'opportunity-awaiting-accept': 'opportunity',
  'opportunity-lost': 'opportunity',
  'opportunity-accepted': 'opportunity',
  'opportunity-assigned': 'opportunity',
  'opportunity-unassigned': 'opportunity',
  'next-step-assigned': 'next-step',
  'next-step-done': 'next-step',
  'comm-record-late': 'next-step',
  'approval-waiting': 'approval',
  'approval-approved': 'approval',
  'approval-rejected': 'approval',
  'mail-run-sent': 'mail',
  'mail-run-cancelled': 'mail',
  'mail-failed': 'mail',
  'customer-replied': 'mail',
  'access-changed': 'account',
  'password-reset-by-admin': 'account',
  'google-link-broken': 'account',
}

/** Defaults of ADR 0093 §1 when no `notification_kind_policy` row exists (or
 *  its `important` is null). A locked kind can never be muted; `Record` makes
 *  a new kind fail to compile until it is classified. Role-wide audiences are
 *  never important. */
export const NOTIFICATION_KIND_POLICY: Record<
  NotificationKind,
  { important: boolean; locked: boolean }
> = {
  'lead-pooled': { important: false, locked: false },
  'lead-received': { important: true, locked: false },
  'lead-removed': { important: false, locked: false },
  'lead-re-entered': { important: false, locked: false },
  'lead-stopped': { important: false, locked: false },
  'lead-scan-ready': { important: false, locked: false },
  'lead-scan-committed': { important: false, locked: false },
  'lead-scan-failed': { important: false, locked: false },
  'opportunity-awaiting-accept': { important: false, locked: false },
  'opportunity-lost': { important: false, locked: false },
  'opportunity-accepted': { important: false, locked: false },
  'opportunity-assigned': { important: false, locked: false },
  'opportunity-unassigned': { important: false, locked: false },
  'next-step-assigned': { important: false, locked: false },
  'next-step-done': { important: false, locked: false },
  'comm-record-late': { important: false, locked: false },
  'approval-waiting': { important: true, locked: true },
  'approval-approved': { important: false, locked: false },
  'approval-rejected': { important: false, locked: false },
  'mail-run-sent': { important: false, locked: false },
  'mail-run-cancelled': { important: false, locked: false },
  'mail-failed': { important: true, locked: false },
  'customer-replied': { important: true, locked: false },
  'access-changed': { important: false, locked: true },
  'password-reset-by-admin': { important: false, locked: true },
  'google-link-broken': { important: false, locked: true },
}

/** A stored `important` of `null` (or no row) follows the contract default,
 *  so a mute saved today does not freeze importance if the default moves. */
export const effectiveImportant = (
  kind: NotificationKind,
  stored: boolean | null | undefined,
): boolean => stored ?? NOTIFICATION_KIND_POLICY[kind].important

/** The permission needed to OPEN a subject; `null` where none gates it (the
 *  reader's own account, or a requester's own approval). The admin grid prints
 *  its "not applicable" cell from it, and ADR 0093 §7 (wave 2) reuses it as a hub backstop. */
export const NOTIFICATION_SUBJECT_PERMISSION: Record<NotificationSubject, Permission | null> = {
  lead: 'lead.view',
  'lead-pool': 'lead.view',
  opportunity: 'opportunity.view',
  approval: null,
  'lead-scan': 'lead.edit',
  'mail-run': 'campaign.view',
  user: null,
  'google-link': null,
  'comm-record': 'comm.view',
}

/** Every subject each kind is written with, read off the emitters' `announce`
 *  calls. A role cannot use a kind when it may open none of these (ADR 0093
 *  §2); a new emitter that adds a subject must add it here. */
export const NOTIFICATION_KIND_SUBJECTS: Record<NotificationKind, readonly NotificationSubject[]> =
  {
    'lead-pooled': ['lead', 'lead-pool'],
    'lead-received': ['lead'],
    'lead-removed': ['lead'],
    'lead-re-entered': ['lead'],
    'lead-stopped': ['lead'],
    'lead-scan-ready': ['lead-scan'],
    'lead-scan-committed': ['lead-scan'],
    'lead-scan-failed': ['lead-scan'],
    'opportunity-awaiting-accept': ['opportunity'],
    'opportunity-lost': ['opportunity'],
    'opportunity-accepted': ['opportunity'],
    'opportunity-assigned': ['opportunity'],
    'opportunity-unassigned': ['opportunity'],
    'next-step-assigned': ['lead', 'opportunity'],
    'next-step-done': ['lead', 'opportunity'],
    'comm-record-late': ['comm-record'],
    'approval-waiting': ['approval'],
    'approval-approved': ['approval'],
    'approval-rejected': ['approval'],
    'mail-run-sent': ['mail-run'],
    'mail-run-cancelled': ['mail-run'],
    'mail-failed': ['lead', 'opportunity'],
    'customer-replied': ['lead', 'opportunity'],
    'access-changed': ['user'],
    'password-reset-by-admin': ['user'],
    'google-link-broken': ['google-link'],
  }

/** Key of the failed-letter count in `detail` on a closing `mail-run-sent` or
 *  `mail-run-cancelled` row (ADR 0093 §4); absent when no letter failed. */
export const NOTIFICATION_DETAIL_FAILED = 'failed'

/** `detail` holds small display facts only (a count, a reason sentence), so
 *  its values are flat strings or numbers; anything bigger belongs on the
 *  subject's own screen. */
export const NotificationRow = z.object({
  id: z.string().min(1),
  kind: NotificationKind,
  subject: z.object({
    kind: NotificationSubject,
    code: z.string().min(1),
    label: z.string().nullable(),
  }),
  actor: z.object({ id: z.string().min(1), name: z.string().min(1) }).nullable(),
  detail: z.record(z.string(), z.union([z.string(), z.number()])).nullable(),
  createdAt: Moment,
  readAt: Moment.nullable(),
  /** The kind's live policy, so the admin's switch decides the popup. */
  important: z.boolean(),
})
export type NotificationRow = z.infer<typeof NotificationRow>

/** Same paging as every book, plus three optional filters: `unread` (only `1`,
 *  since a coerced boolean would read "0" as true), `group`, and a text `q`.
 *  `hidden` is always 0 here because no permission cut applies to a person's
 *  own bell. */
export const NotificationListQuery = PageQuery.extend({
  unread: z.enum(['1']).optional(),
  group: NotificationGroup.optional(),
  q: z.string().trim().min(1).max(120).optional(),
})
export type NotificationListQuery = z.infer<typeof NotificationListQuery>
export const NotificationListResponse = paged(NotificationRow)
export type NotificationListResponse = z.infer<typeof NotificationListResponse>

export const NotificationUnreadCount = z.object({ count: z.number().int().nonnegative() })
export type NotificationUnreadCount = z.infer<typeof NotificationUnreadCount>

export const NOTIFICATION_READ_MAX = 200

/** Either named rows or everything: `all` is a literal `true` so `{ all: false }`
 *  is a 400 instead of a silent no-op. Strict, so a typo cannot fall through
 *  to the other branch. */
export const NotificationReadBody = z.union([
  z.strictObject({ ids: z.array(z.uuid()).min(1).max(NOTIFICATION_READ_MAX) }),
  z.strictObject({ all: z.literal(true) }),
])
export type NotificationReadBody = z.infer<typeof NotificationReadBody>

/** Rows that flipped from unread to read; already-read rows are not counted. */
export const NotificationReadResponse = z.object({ changed: z.number().int().nonnegative() })
export type NotificationReadResponse = z.infer<typeof NotificationReadResponse>

/**
 * Server-Sent Events stream signals notification row changes. The stream
 * carries only event names—never row data—because permission cuts and row
 * mapping stay in one place: the existing GET endpoints. The browser
 * refetches on each signal to read fresh, authorized rows.
 */
export const NotificationStreamEvent = z.enum(['ready', 'changed'])
export type NotificationStreamEvent = z.infer<typeof NotificationStreamEvent>

export const NOTIFICATION_STREAM_PATH = '/notifications/stream'

/** Admin policy, permission `setting.manage`: `GET /admin/notifications` lists
 *  every kind, `PUT /admin/notifications/:kind` writes one (ADR 0093 §1-§2). */
export const NOTIFICATION_POLICY_PATH = '/admin/notifications'

export const NotificationPolicyParams = z.object({ kind: NotificationKind })
export type NotificationPolicyParams = z.infer<typeof NotificationPolicyParams>

/** `locked` comes from `NOTIFICATION_KIND_POLICY`, never from storage, and
 *  `important` is already effective. `inapplicableRoleIds` are roles whose
 *  live grants open none of the kind's subjects; the grid prints them as
 *  "not applicable", never as a mute. */
export const NotificationPolicyRow = z.object({
  kind: NotificationKind,
  important: z.boolean(),
  mutedRoleIds: z.array(RoleId),
  inapplicableRoleIds: z.array(RoleId),
  locked: z.boolean(),
  updatedAt: Moment.nullable(),
  updatedBy: z.object({ id: z.string().min(1), name: z.string().min(1) }).nullable(),
})
export type NotificationPolicyRow = z.infer<typeof NotificationPolicyRow>

/** The server fills the defaults for kinds that have no row yet. */
export const NotificationPolicyResponse = z.object({ rows: z.array(NotificationPolicyRow) })
export type NotificationPolicyResponse = z.infer<typeof NotificationPolicyResponse>

/** A locked kind with any muted role is refused by the server, since
 *  muting `approval-waiting` would silently stall approvals. `important`
 *  is `null` to follow the contract default (`effectiveImportant`). */
export const NotificationPolicyBody = z.strictObject({
  important: z.boolean().nullable(),
  mutedRoleIds: z
    .array(RoleId)
    .refine((r) => new Set(r).size === r.length, { message: 'Vai trò bị trùng.' }),
})
export type NotificationPolicyBody = z.infer<typeof NotificationPolicyBody>
