import { z } from 'zod'
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
  'approval-waiting': 'Có yêu cầu đang chờ bạn duyệt',
  'approval-approved': 'Yêu cầu của bạn đã được duyệt',
  'approval-rejected': 'Yêu cầu của bạn bị từ chối',
  'mail-run-sent': 'Lô thư đã gửi xong',
  'mail-run-cancelled': 'Lô thư bị dừng vì nhiều thư bị trả lại',
  'mail-failed': 'Thư không gửi được',
  'customer-replied': 'Khách đã trả lời thư',
  'access-changed': 'Quyền của bạn đã được thay đổi',
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
