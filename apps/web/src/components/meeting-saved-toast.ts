import type { MeetingRow } from '@pv/contracts'
import { toast } from '@/app/toast'

/** The saved-meeting toast, plus what the calendar did with it. `calendar` is
 *  the outcome of THIS write only; on first creation `not_connected` and `off`
 *  stay silent because the panel's own line already says the link is missing. */
export function toastSaved(title: string, row: MeetingRow, detail?: string) {
  if (row.eventUrl && row.calendar !== 'synced' && row.calendar !== 'off') {
    /* An event already exists, so the customer may still hold the old time. This
       also covers `not_connected`, which stays silent only on first creation. */
    toast('Đã lưu lịch mới, nhưng sự kiện trên Google Calendar chưa được cập nhật', {
      tone: 'warning',
      ...(detail ? { detail } : {}),
    })
    return
  }
  if (row.calendar === 'failed') {
    /* The write succeeded, so the headline must not hide it; the warning tone
       carries the half that did not. */
    toast('Đã lưu buổi họp, nhưng chưa tạo được sự kiện trên Google Calendar', {
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
