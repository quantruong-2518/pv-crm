import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { AppShell, GlassCard, ScreenHeader, ScreenLayout } from '@pv/ui'
import { NotificationListQuery, type NotificationRow } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { useBookQuery } from '@/app/book-query'
import {
  notificationPageQuery,
  unreadNotificationsQuery,
  useMarkNotificationsRead,
} from '@/data/notifications'
import { NotificationFeed, NotificationToolbar } from './notifications-parts'

/** The bell's whole list — `/notifications`, one reader's own rows.
 *
 *  Filters and search live in the ADDRESS, like every server-paged book, so
 *  they survive refresh and Back. The page number does not: rows arrive by
 *  scrolling, and `pageParam` sets the page inside the query, so `page` and
 *  `size` are kept out of the key and out of the URL.
 *
 *  No ContextRail (law 10 debt, as the books carry it): a list has no open
 *  object, so the rail returns once it can follow the pressed row. */

export default function NotificationsPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const book = useBookQuery(NotificationListQuery, { filterKeys: ['unread', 'group'] })
  const { query } = book

  const list = useInfiniteQuery(
    notificationPageQuery({ unread: query.unread, group: query.group, q: query.q }),
  )
  const { data: unreadCount } = useQuery(unreadNotificationsQuery())
  const markRead = useMarkNotificationsRead()

  const rows = list.data?.rows ?? []
  /* The count can be a minute older than the list, so the rows vote too. */
  const anyUnread = unreadCount !== 0 || rows.some((row) => row.readAt === null)

  const press = (row: NotificationRow, path: string | null) => {
    if (!row.readAt) markRead.mutate({ ids: [row.id] })
    if (path) navigate(path)
  }

  /* `{ all: true }` is global. Under a group or a search it would clear rows
     the reader cannot see, so there the button is gone, not greyed. The typed
     text counts at once: the address trails it by the debounce, both ways. */
  const markAll =
    query.group || query.q || book.text.trim() !== ''
      ? null
      : {
          disabled: !anyUnread || markRead.isPending,
          onClick: () => markRead.mutate({ all: true }),
        }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader title="Thông báo" />

        {/* Law 8 — a long list sits on `.glass-b`, and nothing inside draws a
            second surface. */}
        <GlassCard variant="b" aria-label="Thông báo">
          <NotificationToolbar book={book} total={list.data?.total} markAll={markAll} />
          <NotificationFeed
            list={list}
            narrowed={Boolean(query.group || query.q)}
            unreadOnly={query.unread === '1'}
            onPress={press}
            onClear={book.clear}
          />
        </GlassCard>
      </ScreenLayout>
    </AppShell>
  )
}
