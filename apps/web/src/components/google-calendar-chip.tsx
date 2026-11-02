import { useQuery } from '@tanstack/react-query'
import { Button, Check, Icon } from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { message, useI18n } from '@/app/i18n'
import googleCalendarLogo from '@/assets/google-calendar.svg'
import { googleLinkQuery, useConnectGoogle } from '@/data/google'

/** The booker's Google link, as one chip in the booking panel's header.
 *
 *  The logo is Google's own artwork in its own colours — a third-party mark,
 *  not a theme colour, so it ships as a file instead of going through tokens.
 *  Hidden while the status is unknown or the server has no Google client
 *  (`configured` false): a button that can only fail is worse than no button.
 *  Connected, it only names the account — disconnecting lives on the account
 *  screen, not in a panel about one meeting. */
export function GoogleCalendarChip() {
  const { t } = useI18n()
  const { data: status } = useQuery(googleLinkQuery())
  const connect = useConnectGoogle()
  if (!status?.configured) return null

  const logo = <img src={googleCalendarLogo} alt="" className="size-4 shrink-0" />

  if (status.connected) {
    return (
      <span
        title={`Google Calendar: ${status.email ?? ''}`}
        className="bg-success/20 text-on-tint-success-strong pointer-coarse:h-12 flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-[11.5px] font-semibold"
      >
        {logo}
        <span className="sr-only sm:not-sr-only">
          {t(message('Đã kết nối', 'Connected', '연결됨'))}
        </span>
        <span className="sr-only">Google Calendar</span>
        <Icon icon={Check} size={16} />
      </span>
    )
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      title={t(
        message(
          'Kết nối để buổi họp tự lên Google Calendar và gửi lời mời cho khách.',
          'Connect so meetings are added to Google Calendar and invitations go to the customer automatically.',
          '연결하면 회의가 Google Calendar에 자동으로 등록되고 고객에게 초대장이 발송됩니다.',
        ),
      )}
      className="pointer-coarse:h-12 shrink-0"
      disabled={connect.isPending}
      onClick={() =>
        connect.mutate(undefined, {
          onError: (error) =>
            toast(
              isApiError(error)
                ? userMessage(error)
                : t(
                    message(
                      'Không mở được trang kết nối Google Calendar.',
                      'Could not open the Google Calendar connection page.',
                      'Google Calendar 연결 페이지를 열지 못했습니다.',
                    ),
                  ),
              { tone: 'danger' },
            ),
        })
      }
    >
      {logo}
      {connect.isPending ? (
        t(message('Đang mở…', 'Opening…', '여는 중…'))
      ) : (
        <span>
          {t(message('Kết nối', 'Connect', '연결'))}
          <span className="sr-only sm:not-sr-only"> Google Calendar</span>
        </span>
      )}
    </Button>
  )
}
