import { useQuery } from '@tanstack/react-query'
import { GlassCard, SectionTitle } from '@pv/ui'
import type { MessageRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { dmhm } from '@/lib/date'
import { threadMessagesQuery } from '@/data/comms'

/** The turns of a comm that carry text — a chat or a mail captured with its
 *  words — on their own list card (law 8). Reading bodies writes an audit line
 *  server-side, which is the point: this page is where they are read. A turn
 *  with no text draws nothing, so a call logged by a button leaves no "nothing
 *  yet" block; a turn withheld by permission says so, it never reads as empty. */

const shown = (row: MessageRow) =>
  row.content.state === 'hidden' ||
  (row.content.state === 'visible' && row.content.bodyText.trim() !== '')

export function CommTurns({ threadId }: { threadId: string }) {
  const { data, error } = useQuery(threadMessagesQuery(threadId))
  const rows = data ? [...data.rows].reverse().filter(shown) : []
  if (!error && rows.length === 0) return null

  return (
    <GlassCard
      variant="b"
      className="flex min-w-0 flex-col gap-4 p-5 sm:p-6"
      aria-label="Nội dung đã ghi"
    >
      <SectionTitle size="detail">Nội dung đã ghi</SectionTitle>
      {error ? (
        <p role="alert" className="text-destructive-foreground m-0 text-[12.5px]">
          Không tải được các lượt trao đổi. {isApiError(error) ? userMessage(error) : ''}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1">
              <span className="text-muted-foreground tnum text-[12px]">{dmhm(row.at)}</span>
              {row.content.state === 'visible' ? (
                <p className="m-0 whitespace-pre-wrap break-words text-[14px] leading-[1.6]">
                  {row.content.bodyText}
                </p>
              ) : (
                <p className="text-muted-foreground m-0 text-[13px] leading-[1.6]">
                  Vai của bạn không xem được nội dung lượt này.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}
