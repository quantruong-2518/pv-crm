import type { MeetingRow } from '@pv/contracts'
import { toast } from '@/app/toast'
import { message, translate } from '@/app/i18n'

/** The saved-meeting toast, plus what the calendar did with it. `calendar` is
 *  the outcome of THIS write only; on first creation `not_connected` and `off`
 *  stay silent because the panel's own line already says the link is missing.
 *  `pending` stays silent too: the worker retries, and only a streak of
 *  failures reaches the user, as a bell. */
export function toastSaved(title: string, row: MeetingRow, detail?: string) {
  if (row.eventUrl && row.calendar === 'not_connected') {
    /* An event already exists and nobody can update it, so the customer may
       still hold the old time. */
    const stale = message(
      'Đã lưu lịch mới, sự kiện trên Google Calendar chưa cập nhật',
      'New schedule saved, but the Google Calendar event was not updated',
      '새 일정이 저장되었지만 Google Calendar 일정은 업데이트되지 않았습니다',
    )
    toast(translate(stale), {
      tone: 'warning',
      ...(detail ? { detail } : {}),
    })
    return
  }
  const synced =
    row.calendar === 'synced'
      ? [
          translate(
            message(
              'Đã tạo sự kiện trên Google Calendar',
              'Google Calendar event created',
              'Google Calendar 일정을 만들었습니다',
            ),
          ),
          ...(row.mode === 'online' && row.link
            ? [
                translate(
                  message(
                    'Link họp đã gắn vào sự kiện.',
                    'The meeting link was added to the event.',
                    '회의 링크가 일정에 추가되었습니다.',
                  ),
                ),
              ]
            : []),
        ].join('. ')
      : undefined
  const joined = [detail, synced].filter(Boolean).join(' ')
  toast(title, { tone: 'success', ...(joined ? { detail: joined } : {}) })
}
