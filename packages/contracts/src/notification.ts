import { z } from 'zod'
import { RoleId, type Permission } from './auth'
import { PageQuery, paged } from './pagination'
import { Moment } from './primitives'
import { LEAD_STATE_LABEL } from './sales/enums'

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
  'meeting-cancelled',
  'hold-due-soon',
  'hold-due',
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
  'opportunity-stage-moved',
  'opportunity-primary-changed',
  'contract-signed',
  'quotation-new-round',
  'quotation-superseded',
  'contract-installment-paid',
  'contract-installment-undone',
  'contract-schedule-replaced',
  'contract-condition-done',
  'campaign-stopped',
  'campaign-finished',
  'kpi-target-proposed',
  'kpi-target-agreed',
  'comm-closed-by-other',
  'lead-nurtured',
  'lead-resumed',
  'lead-reopened',
  'mail-run-replied',
  'contract-installment-overdue',
  'kpi-target-allocated',
  'kpi-counter-resolved',
  'kpi-allocation-returned',
  'kpi-about-to-miss',
  'kpi-about-to-hit',
  'overdue-reason-waiting',
  'overdue-reason-decided',
  'kpi-team-share-assigned',
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
  'contract',
  'campaign',
  'kpi-target',
  'comm',
  'lead-batch',
  'opportunity-batch',
  'comm-record',
  'kpi-scorecard',
  'kpi-allocation',
  'kpi-team',
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
  'meeting-cancelled': 'Lịch họp của bạn đã bị huỷ',
  'hold-due-soon': 'Sắp tới ngày hẹn gặp lại',
  'hold-due': 'Hôm nay là ngày hẹn gặp lại',
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
  'opportunity-stage-moved': 'Cơ hội chuyển sang giai đoạn mới',
  'opportunity-primary-changed': 'Sale chính của cơ hội đã đổi',
  'contract-signed': 'Cơ hội đã ký hợp đồng',
  'quotation-new-round': 'Cơ hội có lần báo giá mới',
  'quotation-superseded': 'Lần báo giá đang chờ đã được thay bằng lần mới',
  'contract-installment-paid': 'Đợt thanh toán đã ghi thu',
  'contract-installment-undone': 'Đợt thanh toán đã hoàn tác ghi thu',
  'contract-schedule-replaced': 'Lịch thanh toán hợp đồng đã thay đổi',
  'contract-condition-done': 'Điều kiện thanh toán đã xong',
  'campaign-stopped': 'Chiến dịch của bạn đã dừng',
  'campaign-finished': 'Chiến dịch của bạn đã chạy xong',
  'kpi-target-proposed': 'Có chỉ tiêu KPI chờ duyệt',
  'kpi-target-agreed': 'Chỉ tiêu KPI bạn đề nghị đã được duyệt',
  'comm-closed-by-other': 'Bản ghi liên hệ của bạn đã được người khác chốt',
  'lead-nurtured': 'Lead của bạn chuyển sang Nhóm chờ chăm sóc',
  'lead-resumed': 'Lead của bạn được chăm sóc lại',
  'lead-reopened': 'Lead của bạn được mở lại',
  'mail-run-replied': 'Khách trả lời thư của lô gửi',
  'contract-installment-overdue': 'Đợt thanh toán của hợp đồng đã quá hạn thu',
  'kpi-target-allocated': 'Bạn được giao chỉ tiêu mới',
  'kpi-counter-resolved': 'Đề xuất chỉ tiêu của bạn đã được xử lý',
  'kpi-allocation-returned': 'Gói chỉ tiêu bạn gửi bị trả lại',
  'kpi-about-to-miss': 'Bạn sắp trượt chỉ tiêu',
  'kpi-about-to-hit': 'Bạn sắp đạt chỉ tiêu',
  'overdue-reason-waiting': 'Có lý do quá hạn chờ bạn duyệt',
  'overdue-reason-decided': 'Lý do quá hạn của bạn đã được xử lý',
  'kpi-team-share-assigned': 'Nhóm được giao chỉ tiêu',
}

/** The filter chips on the bell screen. */
export const NotificationGroup = z.enum([
  'lead',
  'opportunity',
  'contract',
  'next-step',
  'hold',
  'approval',
  'mail',
  'account',
  'campaign',
  'kpi',
  'comm',
])
export type NotificationGroup = z.infer<typeof NotificationGroup>

export const NOTIFICATION_GROUP_LABEL: Record<NotificationGroup, string> = {
  lead: 'Lead',
  opportunity: 'Cơ hội',
  contract: 'Hợp đồng',
  'next-step': 'Việc tiếp theo',
  hold: 'Tạm hoãn',
  approval: 'Phê duyệt',
  mail: 'Thư',
  account: 'Tài khoản',
  campaign: 'Chiến dịch',
  kpi: 'KPI',
  comm: 'Liên hệ',
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
  'meeting-cancelled': 'comm',
  'hold-due-soon': 'hold',
  'hold-due': 'hold',
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
  'opportunity-stage-moved': 'opportunity',
  'opportunity-primary-changed': 'opportunity',
  'contract-signed': 'contract',
  'quotation-new-round': 'opportunity',
  'quotation-superseded': 'opportunity',
  'contract-installment-paid': 'contract',
  'contract-installment-undone': 'contract',
  'contract-schedule-replaced': 'contract',
  'contract-condition-done': 'contract',
  'campaign-stopped': 'campaign',
  'campaign-finished': 'campaign',
  'kpi-target-proposed': 'kpi',
  'kpi-target-agreed': 'kpi',
  'comm-closed-by-other': 'comm',
  'lead-nurtured': 'lead',
  'lead-resumed': 'lead',
  'lead-reopened': 'lead',
  'mail-run-replied': 'mail',
  'contract-installment-overdue': 'contract',
  'kpi-target-allocated': 'kpi',
  'kpi-counter-resolved': 'kpi',
  'kpi-allocation-returned': 'kpi',
  'kpi-about-to-miss': 'kpi',
  'kpi-about-to-hit': 'kpi',
  'overdue-reason-waiting': 'contract',
  'overdue-reason-decided': 'contract',
  'kpi-team-share-assigned': 'kpi',
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
  'meeting-cancelled': { important: false, locked: false },
  'hold-due-soon': { important: false, locked: false },
  'hold-due': { important: false, locked: false },
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
  'opportunity-stage-moved': { important: false, locked: false },
  'opportunity-primary-changed': { important: false, locked: false },
  'contract-signed': { important: false, locked: false },
  'quotation-new-round': { important: false, locked: false },
  'quotation-superseded': { important: false, locked: false },
  'contract-installment-paid': { important: false, locked: false },
  'contract-installment-undone': { important: false, locked: false },
  'contract-schedule-replaced': { important: false, locked: false },
  'contract-condition-done': { important: false, locked: false },
  'campaign-stopped': { important: false, locked: false },
  'campaign-finished': { important: false, locked: false },
  'kpi-target-proposed': { important: false, locked: false },
  'kpi-target-agreed': { important: false, locked: false },
  'comm-closed-by-other': { important: false, locked: false },
  'lead-nurtured': { important: false, locked: false },
  'lead-resumed': { important: false, locked: false },
  'lead-reopened': { important: false, locked: false },
  'mail-run-replied': { important: false, locked: false },
  'contract-installment-overdue': { important: true, locked: false },
  'kpi-target-allocated': { important: true, locked: false },
  'kpi-counter-resolved': { important: false, locked: false },
  /* Owner's call 15/10/2026: a returned package holds up the month's split. */
  'kpi-allocation-returned': { important: true, locked: false },
  'kpi-about-to-miss': { important: false, locked: false },
  'kpi-about-to-hit': { important: false, locked: false },
  'overdue-reason-waiting': { important: true, locked: false },
  'overdue-reason-decided': { important: true, locked: false },
  'kpi-team-share-assigned': { important: true, locked: false },
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
  contract: 'contract.view',
  campaign: 'campaign.view',
  /* `kpi.view`, not `performance.view`: a person's own target line reaches
     roles that cannot open the performance screens (ADR 0098 §3). */
  'kpi-target': 'kpi.view',
  comm: 'comm.view',
  'lead-batch': 'lead.view',
  'opportunity-batch': 'opportunity.view',
  'comm-record': 'comm.view',
  'kpi-scorecard': 'kpi.view',
  'kpi-allocation': 'kpi.view-all',
  /* A team lead holds `kpi.view` only; the team page checks the lead itself. */
  'kpi-team': 'kpi.view',
}

/** Kinds the hub rings even when the reader cannot open the subject (ADR 0093
 *  §7): the line tells them something was taken away or broke, so dropping it
 *  for lack of a link would hide the news itself. The web drops the link. */
export const NOTIFICATION_KINDS_RING_WITHOUT_LINK = [
  'lead-scan-failed',
  'lead-removed',
  'opportunity-unassigned',
  /* A customer's answer must reach the lead holder even without campaign.view. */
  'mail-run-replied',
] as const satisfies readonly NotificationKind[]

/** Every subject each kind is written with, read off the emitters' `announce`
 *  calls. A role cannot use a kind when it may open none of these (ADR 0093
 *  §2); a new emitter that adds a subject must add it here. */
export const NOTIFICATION_KIND_SUBJECTS: Record<NotificationKind, readonly NotificationSubject[]> =
  {
    'lead-pooled': ['lead', 'lead-pool'],
    'lead-received': ['lead', 'lead-batch', 'opportunity-batch'],
    'lead-removed': ['lead'],
    'lead-re-entered': ['lead', 'lead-batch'],
    'lead-stopped': ['lead'],
    'lead-scan-ready': ['lead-scan'],
    'lead-scan-committed': ['lead-scan'],
    'lead-scan-failed': ['lead-scan'],
    'opportunity-awaiting-accept': ['opportunity', 'opportunity-batch'],
    'opportunity-lost': ['opportunity', 'lead'],
    'opportunity-accepted': ['opportunity', 'lead'],
    'opportunity-assigned': ['opportunity', 'opportunity-batch'],
    'opportunity-unassigned': ['opportunity'],
    'next-step-assigned': ['lead', 'opportunity'],
    'next-step-done': ['lead', 'opportunity'],
    'comm-record-late': ['comm-record'],
    'meeting-cancelled': ['lead', 'opportunity'],
    'hold-due-soon': ['lead', 'opportunity'],
    'hold-due': ['lead', 'opportunity'],
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
    'opportunity-stage-moved': ['opportunity'],
    'opportunity-primary-changed': ['opportunity'],
    'contract-signed': ['opportunity'],
    'quotation-new-round': ['opportunity'],
    'quotation-superseded': ['opportunity'],
    'contract-installment-paid': ['contract'],
    'contract-installment-undone': ['contract'],
    'contract-schedule-replaced': ['contract'],
    'contract-condition-done': ['contract'],
    'campaign-stopped': ['campaign'],
    'campaign-finished': ['campaign'],
    'kpi-target-proposed': ['kpi-target'],
    'kpi-target-agreed': ['kpi-target'],
    'comm-closed-by-other': ['comm'],
    'lead-nurtured': ['lead', 'lead-batch'],
    'lead-resumed': ['lead'],
    'lead-reopened': ['lead'],
    'mail-run-replied': ['mail-run'],
    'contract-installment-overdue': ['contract'],
    'kpi-target-allocated': ['kpi-target'],
    'kpi-counter-resolved': ['kpi-target'],
    'kpi-allocation-returned': ['kpi-allocation', 'kpi-team'],
    'kpi-about-to-miss': ['kpi-scorecard'],
    'kpi-about-to-hit': ['kpi-scorecard'],
    'overdue-reason-waiting': ['contract'],
    'overdue-reason-decided': ['contract'],
    'kpi-team-share-assigned': ['kpi-team'],
  }

/** Key of the failed-letter count in `detail` on a closing `mail-run-sent` or
 *  `mail-run-cancelled` row (ADR 0093 §4); absent when no letter failed. */
export const NOTIFICATION_DETAIL_FAILED = 'failed'

/** Other `detail` keys (ADR 0093 wave 2): rows collapsed into a batch line,
 *  deals moved with a lead, target stage label, contract code, instalment no. */
export const NOTIFICATION_DETAIL_COUNT = 'count'
export const NOTIFICATION_DETAIL_DEALS = 'deals'
export const NOTIFICATION_DETAIL_STAGE = 'stage'
export const NOTIFICATION_DETAIL_CONTRACT = 'contract'
export const NOTIFICATION_DETAIL_NO = 'no'
/** Next steps moved by an account lock; its presence marks the lock's line. */
export const NOTIFICATION_DETAIL_STEPS = 'steps'
/** Why a `meeting-cancelled` line's meetings went: a `MEETING_CANCEL_CAUSE_LABEL`. */
export const NOTIFICATION_DETAIL_REASON = 'reason'

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

/** The whole sentence of a line built from its counts, or `null` for the
 *  kind's fixed label. The bell line and the popup both ask here, so the two
 *  never say different things. Owner's wording, 15/10/2026. */
export function notificationSentence(
  row: Pick<NotificationRow, 'kind' | 'subject' | 'detail'>,
): string | null {
  const n = (key: string) => {
    const v = row.detail?.[key]
    return typeof v === 'number' ? v : 0
  }
  const name = row.subject.label
  if (!name) return null
  const num = (v: number) => v.toLocaleString('vi-VN')
  if (row.kind === 'lead-received' && row.detail?.[NOTIFICATION_DETAIL_STEPS] !== undefined) {
    const parts = [
      [n(NOTIFICATION_DETAIL_COUNT), 'lead'],
      [n(NOTIFICATION_DETAIL_DEALS), 'cơ hội'],
      [n(NOTIFICATION_DETAIL_STEPS), 'việc tiếp theo'],
    ] as const
    const said = parts.filter(([v]) => v > 0).map(([v, unit]) => `${num(v)} ${unit}`)
    return `Bạn nhận việc của ${name}: ${said.join(', ')}`
  }
  const reason = row.detail?.[NOTIFICATION_DETAIL_REASON]
  if (row.kind === 'meeting-cancelled' && typeof reason === 'string') {
    const count = num(n(NOTIFICATION_DETAIL_COUNT))
    return `Đã huỷ ${count} lịch họp sắp tới với ${name} vì ${reason.toLowerCase()}`
  }
  const parked = n(NOTIFICATION_DETAIL_COUNT)
  if (row.kind === 'campaign-finished' && parked > 0) {
    return `Chiến dịch ${name} đã chạy xong, ${num(parked)} lead không phản hồi đã về ${LEAD_STATE_LABEL.nurturing}`
  }
  return null
}

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
