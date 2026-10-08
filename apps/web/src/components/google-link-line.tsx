import { useQuery } from '@tanstack/react-query'
import { Button, Icon, Plug } from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { googleLinkQuery, useConnectGoogle } from '@/data/google'

/** The one quiet line of the booking panel about the booker's Google link.
 *
 *  Hidden while the status is unknown or the server has no Google client
 *  (`configured` false): a button that can only fail is worse than no button.
 *  Connected, it only names the account — disconnecting has no UI yet, and a panel
 *  about one meeting is not where it should go. */
export function GoogleLinkLine() {
  const { data: status } = useQuery(googleLinkQuery())
  const connect = useConnectGoogle()
  if (!status?.configured) return null

  if (status.connected) {
    return (
      <p className="text-muted-foreground m-0 flex min-w-0 items-center gap-2 text-[11.5px] leading-[1.5]">
        <Icon icon={Plug} size={16} className="shrink-0" />
        <span className="min-w-0 truncate">Google Calendar: {status.email}</span>
      </p>
    )
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <p className="text-muted-foreground m-0 min-w-0 text-[11.5px] leading-[1.5]">
        Chưa nối Google Calendar — buổi họp sẽ không lên Google Calendar.
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="pointer-coarse:h-12 shrink-0"
        disabled={connect.isPending}
        onClick={() =>
          connect.mutate(undefined, {
            onError: (error) =>
              toast(
                isApiError(error) ? userMessage(error) : 'Không mở được trang nối Google Calendar.',
                {
                  tone: 'danger',
                },
              ),
          })
        }
      >
        <Icon icon={Plug} size={16} />
        Nối Google Calendar
      </Button>
    </div>
  )
}
