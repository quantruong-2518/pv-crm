import { useEffect, useRef } from 'react'
import type { UseInfiniteQueryResult } from '@tanstack/react-query'
import {
  Bell,
  Button,
  EmptyState,
  SearchField,
  SegmentedControl,
  Skeleton,
  TriangleAlert,
} from '@pv/ui'
import {
  NOTIFICATION_GROUP_LABEL,
  NotificationGroup,
  type NotificationListQuery,
  type NotificationRow,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import type { useBookQuery } from '@/app/book-query'
import { BookCount } from '@/components/book-page'
import { NotificationLine } from '@/components/notification-line'

/** The two blocks of `/notifications` that carry markup: the toolbar and the
 *  feed under it. The page keeps the address and the read, so a filter change
 *  stays one `patch` and these stay pure views of it. */

type Book = ReturnType<typeof useBookQuery<NotificationListQuery>>
type Feed = UseInfiniteQueryResult<{ rows: NotificationRow[]; total: number }>

/** "No filter" for a segmented control, which carries strings only; on the
 *  wire it is an ABSENT field. */
const ANY = 'all'
const UNREAD = '1'

const STATE_OPTIONS = [
  { value: ANY, label: 'Tất cả' },
  { value: UNREAD, label: 'Chưa đọc' },
]

const GROUP_OPTIONS = [
  { value: ANY, label: 'Tất cả' },
  ...NotificationGroup.options.map((group) => ({
    value: group as string,
    label: NOTIFICATION_GROUP_LABEL[group],
  })),
]

/** A two-line row's height, so the list does not jump when the rows land. */
const ROW_PX = 72
const SKELETON_DELAYS = [0, 120, 240]

export function NotificationToolbar({
  book,
  total,
  markAll,
}: {
  book: Book
  /** `undefined` until the first read lands: say nothing rather than "0". */
  total: number | undefined
  /** `null` hides the button: see the page for when a global mark would lie. */
  markAll: { disabled: boolean; onClick: () => void } | null
}) {
  const { query } = book

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <SegmentedControl
          label="Trạng thái"
          tone="quiet"
          size="md"
          value={query.unread ?? ANY}
          options={STATE_OPTIONS}
          onChange={(value) => book.patch({ unread: value === UNREAD ? '1' : undefined })}
        />
        <SegmentedControl
          label="Loại"
          tone="quiet"
          size="md"
          value={query.group ?? ANY}
          options={GROUP_OPTIONS}
          onChange={(value) => book.patch({ group: NotificationGroup.safeParse(value).data })}
        />
        {total !== undefined && <BookCount total={total} noun="thông báo" />}
      </div>

      {/* A real starting width, so the tools drop to their own line when the
          filters are wide, rather than squeezing the search box to nothing. */}
      <div className="flex min-w-0 grow basis-[360px] flex-wrap items-center justify-end gap-2">
        <SearchField
          placeholder="Tìm theo tên công ty, cơ hội hoặc lô gửi…"
          value={book.text}
          onChange={book.setText}
          className="pointer-coarse:h-12 min-w-[200px] flex-1 sm:max-w-[320px]"
        />
        {book.dirty && (
          <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={book.clear}>
            Bỏ hết bộ lọc
          </Button>
        )}
        {markAll && (
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            disabled={markAll.disabled}
            onClick={markAll.onClick}
          >
            Đánh dấu đã đọc hết
          </Button>
        )}
      </div>
    </div>
  )
}

export function NotificationFeed({
  list,
  narrowed,
  unreadOnly,
  onPress,
  onClear,
}: {
  list: Feed
  /** A group or a search is in force: "nothing here" then means "nothing matches". */
  narrowed: boolean
  unreadOnly: boolean
  onPress: (row: NotificationRow, path: string | null) => void
  onClear: () => void
}) {
  const { data, isPending, isError, isPlaceholderData, hasNextPage, isFetchingNextPage } = list
  const { fetchNextPage, refetch } = list
  const sentinel = useRef<HTMLSpanElement>(null)
  const rows = data?.rows ?? []
  /* A placeholder page still carries the PREVIOUS filter's cursor, and a
     failed page would be re-asked in a loop while the sentinel stays in view. */
  const canLoadMore = hasNextPage && !isFetchingNextPage && !isPlaceholderData && !isError

  useEffect(() => {
    const node = sentinel.current
    if (!node || !canLoadMore) return
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void fetchNextPage()
      },
      { root: null },
    )
    watcher.observe(node)
    return () => watcher.disconnect()
  }, [canLoadMore, fetchNextPage])

  const retry = { label: 'Thử lại', onClick: () => void refetch() }
  const failure = isApiError(list.error)
    ? `Không tải được danh sách thông báo. ${userMessage(list.error)}`
    : 'Không tải được danh sách thông báo.'

  if (isPending || (isPlaceholderData && rows.length === 0)) {
    return (
      <div className="flex flex-col gap-1 px-3 pb-3" aria-busy="true">
        {SKELETON_DELAYS.map((delay) => (
          <Skeleton key={delay} height={ROW_PX} delay={delay} />
        ))}
      </div>
    )
  }

  /* A failed background read keeps the rows on screen; only an empty page is replaced. */
  if (isError && rows.length === 0) {
    return (
      <EmptyState
        tone="danger"
        icon={TriangleAlert}
        message={failure}
        action={retry}
        className="py-12"
      />
    )
  }

  if (rows.length === 0) {
    const clear = { label: 'Bỏ hết bộ lọc', onClick: onClear }
    /* An inbox fills from other people's actions, so the one next step is to
       look again (`/approvals` reasons the same way). */
    const [message, action] = narrowed
      ? ['Không có thông báo nào khớp bộ lọc.', clear]
      : unreadOnly
        ? ['Bạn đã đọc hết thông báo.', clear]
        : ['Chưa có thông báo nào.', { label: 'Tải lại', onClick: retry.onClick }]
    return <EmptyState icon={Bell} message={message} action={action} className="py-12" />
  }

  return (
    <div className="flex flex-col gap-3 px-3 pb-3" aria-busy={isPlaceholderData}>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {rows.map((row) => (
          <NotificationLine key={row.id} row={row} onPress={onPress} />
        ))}
      </ul>

      {isFetchingNextPage && <Skeleton height={ROW_PX} />}
      <span ref={sentinel} aria-hidden className="h-px shrink-0" />

      {isError ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-destructive-foreground m-0 text-[12.5px] leading-[1.65]" role="alert">
            {failure}
          </p>
          <Button variant="ghost" size="sm" className="pointer-coarse:h-12" onClick={retry.onClick}>
            {retry.label}
          </Button>
        </div>
      ) : hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          className="pointer-coarse:h-12 self-center"
          disabled={isFetchingNextPage || isPlaceholderData}
          onClick={() => void fetchNextPage()}
        >
          Xem thêm
        </Button>
      ) : null}
    </div>
  )
}
