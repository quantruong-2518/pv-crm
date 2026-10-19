import { NOTIFICATION_DETAIL_NO, notificationSentence, type NotificationRow } from '@pv/contracts'

/** The two overdue-reason kinds (ADR 0100), read off the row. `detail` carries
 *  `no` (the installment) and, once decided, `decision` (`approved` | `rejected`)
 *  and an optional `note`. Kept apart from `notifications.ts` because the popup
 *  file needs the sentence and `notifications.ts` already imports the popup. */

/** The installment number, or `null` for another kind or a row without one, so
 *  no path ends in `/undefined`. */
export function overdueReasonNo(row: NotificationRow): number | null {
  if (row.kind !== 'overdue-reason-waiting' && row.kind !== 'overdue-reason-decided') return null
  if (row.subject.kind !== 'contract') return null
  const no = Number(row.detail?.[NOTIFICATION_DETAIL_NO])
  return Number.isInteger(no) && no >= 1 ? no : null
}

function overdueReasonSentence(row: NotificationRow): string | null {
  const no = overdueReasonNo(row)
  if (!no) return null
  const what = `đợt ${no} của hợp đồng ${row.subject.code}`
  if (row.kind === 'overdue-reason-waiting')
    return row.actor ? `${row.actor.name} ghi lý do quá hạn ${what}, chờ bạn duyệt` : null
  const { decision, note } = row.detail ?? {}
  if (decision === 'approved') return `Lý do quá hạn ${what} đã được duyệt`
  if (decision !== 'rejected') return null
  return `Lý do quá hạn ${what} bị từ chối${note ? `: ${note}` : ''}`
}

const TEAM_MONTH = /^tháng \d{1,2}\/\d{4}$/

/** `kpi-team-share-assigned` (ADR 0101). The subject label is
 *  `<team> · <role> · <month text>`; a team name is free text and may hold the
 *  separator, so it is read from the right. `null` for any other shape. */
function teamShareSentence(row: NotificationRow): string | null {
  if (row.kind !== 'kpi-team-share-assigned' || !row.subject.label) return null
  const parts = row.subject.label.split(' · ')
  const month = parts.at(-1)
  const role = parts.at(-2)
  const team = parts.slice(0, -2).join(' · ')
  if (!team || !role || !month || !TEAM_MONTH.test(month)) return null
  return `Nhóm ${team} được giao chỉ tiêu ${role} ${month}. Chia cho thành viên.`
}

/** The sentence a bell line or popup says for this row, or `null` for the
 *  kind's fixed label. The line and the popup both ask here. */
export const sentenceOf = (row: NotificationRow): string | null =>
  overdueReasonSentence(row) ?? teamShareSentence(row) ?? notificationSentence(row)
