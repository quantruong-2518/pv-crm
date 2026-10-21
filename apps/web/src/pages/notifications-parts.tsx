import { useEffect, useRef } from 'react'
import type { UseInfiniteQueryResult } from '@tanstack/react-query'
import {
  Bell,
  Button,
  EmptyState,
  GlassCard,
  Icon,
  SearchField,
  Skeleton,
  TriangleAlert,
  cn,
} from '@pv/ui'
import {
  NOTIFICATION_GROUP_LABEL,
  NotificationGroup,
  type NotificationListQuery,
  type NotificationRow,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { searchHint } from '@/lib/search-box'
import type { useBookQuery } from '@/app/book-query'
import { BookCount } from '@/components/book-page'
import { GROUP_ICON } from '@/components/notification-group'
import { NotificationList } from '@/components/notification-list'

/** The blocks of `/notifications` that carry markup: the filters, the toolbar
 *  and the feed under it. The page keeps the address and the read, so a filter change
 *  stays one `patch` and these stay pure views of it. */

type Book = ReturnType<typeof useBookQuery<NotificationListQuery>>
type Feed = UseInfiniteQueryResult<{ rows: NotificationRow[]; total: number }>

/** A two-line row's height, so the list does not jump when the rows land. */
const ROW_PX = 72
const SKELETON_DELAYS = [0, 120, 240]

/** The filters, down the left: read state first, then the kind of thing. Both
 *  are address filters, so a press is one `patch` and Back undoes it. A kind
 *  pressed twice lets go. Without per-kind counts: the server has no facet for
 *  them, and a number read off the loaded page would lie. */
export function NotificationNav({ book }: { book: Book }) {
  const { query } = book
  const item = (active: boolean) =>
    cn(
      'motion-std pointer-coarse:h-12 flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-[13px]',
      active
        ? 'bg-primary/24 text-accent-foreground font-semibold'
        : 'text-foreground hover:bg-surface-ink/10 font-medium',
    )

  return (
    <GlassCard
      variant="a"
      role="group"
      aria-label="Lọc thông báo"
      className="flex min-w-0 flex-[1_1_220px] flex-col gap-1 p-2 lg:max-w-[280px]"
    >
      <button
        type="button"
        aria-pressed={!query.unread}
        className={item(!query.unread)}
        onClick={() => book.patch({ unread: undefined })}
      >
        Tất cả
      </button>
      <button
        type="button"
        aria-pressed={Boolean(query.unread)}
        className={item(Boolean(query.unread))}
        onClick={() => book.patch({ unread: '1' })}
      >
        Chưa đọc
      </button>
      <span className="text-muted-foreground px-3 pb-1 pt-3 text-[11.5px] font-medium">
        Theo loại
      </span>
      {NotificationGroup.options.map((group) => (
        <button
          key={group}
          type="button"
          aria-pressed={query.group === group}
          className={item(query.group === group)}
          onClick={() => book.patch({ group: query.group === group ? undefined : group })}
        >
          <Icon icon={GROUP_ICON[group]} size={16} />
          {NOTIFICATION_GROUP_LABEL[group]}
        </button>
      ))}
    </GlassCard>
  )
}

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
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex min-w-0 flex-1 basis-[260px] flex-wrap items-center gap-3">
        <SearchField
          placeholder="Tìm theo tên công ty, cơ hội hoặc lô gửi…"
          value={book.text}
          meta={searchHint(book.text)}
          onChange={book.setText}
          className="pointer-coarse:h-12 min-w-[200px] flex-1 sm:max-w-[380px]"
        />
        {total !== undefined && <BookCount total={total} noun="thông báo" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
  onPress: (rows: NotificationRow[], path: string | null) => void
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
      <NotificationList rows={rows} onPress={onPress} />

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
