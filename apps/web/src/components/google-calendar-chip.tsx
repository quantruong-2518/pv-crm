import { useQuery } from '@tanstack/react-query'
import { Button, Check, Icon } from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
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
        <span className="sr-only sm:not-sr-only">Đã kết nối</span>
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
      title="Kết nối để buổi họp tự lên Google Calendar và gửi lời mời cho khách."
      className="pointer-coarse:h-12 shrink-0"
      disabled={connect.isPending}
      onClick={() =>
        connect.mutate(undefined, {
          onError: (error) =>
            toast(
              isApiError(error)
                ? userMessage(error)
                : 'Không mở được trang kết nối Google Calendar.',
              { tone: 'danger' },
            ),
        })
      }
    >
      {logo}
      {connect.isPending ? (
        'Đang mở…'
      ) : (
        <span>
          Kết nối<span className="sr-only sm:not-sr-only"> Google Calendar</span>
        </span>
      )}
    </Button>
  )
}
