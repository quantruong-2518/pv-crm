import type { MeetingRow } from '@pv/contracts'
import { toast } from '@/app/toast'

/** The saved-meeting toast, plus what the calendar did with it. `calendar` is
 *  the outcome of THIS write only; on first creation `not_connected` and `off`
 *  stay silent because the panel's own line already says the link is missing.
 *  `pending` stays silent too: the worker retries, and only a streak of
 *  failures reaches the user, as a bell. */
export function toastSaved(title: string, row: MeetingRow, detail?: string) {
  if (row.eventUrl && row.calendar === 'not_connected') {
    /* An event already exists and nobody can update it, so the customer may
       still hold the old time. */
    toast('Đã lưu lịch mới, sự kiện trên Google Calendar chưa cập nhật', {
      tone: 'warning',
      ...(detail ? { detail } : {}),
    })
    return
  }
  const synced =
    row.calendar === 'synced'
      ? [
          'Đã tạo sự kiện trên Google Calendar',
          ...(row.mode === 'online' && row.link ? ['Link họp đã gắn vào sự kiện.'] : []),
        ].join('. ')
      : undefined
  const joined = [detail, synced].filter(Boolean).join(' ')
  toast(title, { tone: 'success', ...(joined ? { detail: joined } : {}) })
}
