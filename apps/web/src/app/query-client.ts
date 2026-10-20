import { QueryClient } from '@tanstack/react-query'
import { sessionIsLive, useSession } from '@/app/auth'
import { streamIsLive, subscribeStreamLive } from '@/app/stream-live'

/** TanStack Query defaults for server data, not frozen fixtures.
 *
 *  30 s fresh: going back and forth between a book and a profile reuses the
 *  answer, while a change made by someone else shows after a remount or a
 *  return to the tab. Writes still invalidate their own keys at once. The
 *  library's 5-minute `gcTime` stays, so every page and filter ever visited
 *  is not kept in memory for the whole session.
 *
 *  Focus and reconnect refetch only while the session is live: behind the
 *  expiry lock a refetch would be refused and swap the kept screen for an
 *  error (`app/auth/expiry.tsx`). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      /* Không thử lại, kể cả khi có server: thử lại một request bị 403 chỉ để
         bị từ chối ba lần. Thử lại là việc của `app/api/client.ts`, nơi biết
         lỗi thuộc loại nào — nó gia hạn vé rồi thử ĐÚNG một lần cho 401. */
      retry: false,
      refetchOnWindowFocus: () => sessionIsLive(),
      refetchOnReconnect: () => sessionIsLive(),
    },
  },
})

/** A poll that stops while the session is not live — behind the expiry lock
 *  every tick would be a refused call. Takes a fixed interval or the query's
 *  own rule (e.g. "only while a batch is sending"). */
export function whileLive<A extends unknown[]>(
  every: number | ((...args: A) => number | false | undefined),
) {
  return (...args: A) =>
    sessionIsLive() ? (typeof every === 'number' ? every : every(...args)) : false
}

/** A poll that only covers for a stream that is down: while the stream is live,
 *  every write of the kind arrives as an `entity` event and
 *  `data/entity-sync.ts` re-reads the mounted queries (ADR 0104). Same shape as
 *  `whileLive`, which stays for polls push cannot replace (signed-URL refresh). */
export function untilPushed<A extends unknown[]>(
  every: number | ((...args: A) => number | false | undefined),
) {
  const poll = whileLive(every)
  return (...args: A) => (streamIsLive() ? false : poll(...args))
}

/** An observer only re-reads its `refetchInterval` rule after a query update,
 *  so a poll that resolved to `false` while the stream was live would stay off
 *  after the stream drops (and the reverse). `setState({})` changes nothing and
 *  just makes every mounted observer ask the rule again, with no request. */
subscribeStreamLive(() => {
  for (const query of queryClient.getQueryCache().findAll({ type: 'active' })) query.setState({})
})

/** Cache tiers by how often OTHER people change the data. Writes in this tab
 *  invalidate their own keys whatever the tier; the plain default (30 s, above)
 *  is the tier for books and profiles, so it has no entry here. */
export const cacheTier = {
  /** Catalogs, labels, users, roles, templates: edited rarely, read everywhere. */
  reference: { staleTime: 10 * 60_000, gcTime: 30 * 60_000 },
  /** Scorecards, KPI, home figures: a minute late is fine, recomputing is not free. */
  aggregate: { staleTime: 60_000 },
  /** Badges, today's meetings, queues: re-asked on a clock only while the session
   *  lives and the stream is down; a live stream pushes the change instead. */
  live: (everyMs: number) => ({ staleTime: everyMs, refetchInterval: untilPushed(everyMs) }),
} as const

/** Đổi người thì cache PHẢI chết theo.
 *
 *  Cache của TanStack Query nằm trong bộ nhớ và không biết gì về phiên. Không
 *  dọn thì người đăng nhập sau trên cùng máy thấy nguyên sổ lead của người
 *  trước — dữ liệu cũ còn tươi trong cache hiện ngay lập tức, trước cả khi
 *  query đầu tiên của người mới kịp chạy. Đây là rò rỉ dữ liệu thật, không phải
 *  lỗi hiển thị.
 *
 *  Hai cửa, và CHỈ hai: đăng xuất, và đăng nhập bằng người khác.
 *
 *  Phiên `expired` cố tình KHÔNG dọn. Lớp khoá giữ màn cũ nằm nguyên phía sau
 *  để người dùng vào lại là làm tiếp (`app/auth/expiry.tsx`); dọn cache ở đây
 *  thì họ vào lại và thấy một màn trắng đang tải — tức là mất đúng thứ lớp khoá
 *  sinh ra để giữ. Đổi lại, dữ liệu cũ còn trong bộ nhớ sau lớp mờ; ai cần dọn
 *  thật thì bấm "Đăng xuất", và đường đó đi qua đúng nhánh đầu tiên dưới đây. */
useSession.subscribe((now, before) => {
  if (before.status === 'signed-in' && now.status === 'guest') queryClient.clear()
  else if (now.actor && before.actor && now.actor.id !== before.actor.id) queryClient.clear()
})
