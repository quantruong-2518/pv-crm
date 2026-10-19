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
    return row.actor ? `${row.actor.name} ghi lý do quá hạn cho ${what}` : null
  const { decision, note } = row.detail ?? {}
  if (decision === 'approved') return `Lý do quá hạn ${what} đã được duyệt`
  if (decision !== 'rejected') return null
  return `Lý do quá hạn ${what} bị từ chối${note ? `: ${note}` : ''}`
}

/** The sentence a bell line or popup says for this row, or `null` for the
 *  kind's fixed label. The line and the popup both ask here. */
export const sentenceOf = (row: NotificationRow): string | null =>
  overdueReasonSentence(row) ?? notificationSentence(row)
