import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Button, GlassCard, Icon, Plus, SearchField, Skeleton, cn } from '@pv/ui'
import type { AssistantSession } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { sessionsQuery } from '@/data/assistant'
import {
  ASSISTANT_COPY as C,
  sessionGroup,
  sessionWhen,
  type SessionGroup,
} from '@/data/assistant-copy'
import { CodeChip } from '@/components/assistant-bits'
import { DeleteSessionModal, RenameForm, SessionActions } from './assistant-session-parts'

/** The `/assistant` page's sidebar: a new-chat button, a search box over the
 *  chats loaded so far, and the chats in groups (pinned, today, this week,
 *  earlier), in the server's order, a page at a time. A long list, so it sits on
 *  `.glass-b` (law 8). Every row has pin, rename and delete: on hover or focus, always on touch. */

const m = message
const COPY = {
  search: m('Tìm cuộc trò chuyện', 'Search chats', '대화 검색'),
  none: m('Chưa có cuộc trò chuyện nào.', 'No chats yet.', '아직 대화가 없습니다.'),
  noMatch: m('Không có cuộc trò chuyện nào khớp.', 'No chat matches.', '일치하는 대화가 없습니다.'),
  failed: m('Không tải được danh sách.', 'Could not load the list.', '목록을 불러오지 못했습니다.'),
  more: m('Xem thêm', 'Show more', '더 보기'),
  retry: m('Thử lại', 'Try again', '다시 시도'),
}
const GROUP_COPY: Record<SessionGroup, ReturnType<typeof m>> = {
  pinned: m('Đã ghim', 'Pinned', '고정됨'),
  today: m('Hôm nay', 'Today', '오늘'),
  week: m('7 ngày qua', 'Last 7 days', '최근 7일'),
  older: m('Trước đó', 'Earlier', '이전'),
}
const GROUPS: SessionGroup[] = ['pinned', 'today', 'week', 'older']

const TOUCH = 'pointer-coarse:h-12'

/** Vietnamese typed without marks still finds the chat. */
const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()

export function SessionList({
  current,
  onPick,
  className,
}: {
  current: string | null
  onPick: (id: string | null) => void
  className?: string
}) {
  const { t } = useI18n()
  const sessions = useInfiniteQuery(sessionsQuery)
  const [deleting, setDeleting] = useState<AssistantSession | null>(null)
  const [query, setQuery] = useState('')
  const rows = sessions.data?.pages.flatMap((page) => page.sessions) ?? []
  const needle = fold(query.trim())
  const shown = needle
    ? rows.filter((s) =>
        fold(`${s.title ?? t(C.untitled)} ${s.subject?.code ?? ''}`).includes(needle),
      )
    : rows

  return (
    <GlassCard variant="b" className={cn('flex flex-col gap-3 p-3', className)}>
      <Button className={TOUCH} onClick={() => onPick(null)}>
        <Icon icon={Plus} size={16} />
        {t(C.newChat)}
      </Button>
      <SearchField
        placeholder={t(COPY.search)}
        value={query}
        onChange={setQuery}
        className="pointer-coarse:h-12"
      />
      {sessions.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : sessions.isError ? (
        <div className="flex items-center gap-3">
          <p className="text-destructive-foreground m-0 flex-1 text-[12.5px]">{t(COPY.failed)}</p>
          <Button
            variant="ghost"
            size="sm"
            className={TOUCH}
            onClick={() => void sessions.refetch()}
          >
            {t(COPY.retry)}
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground m-0 px-2 text-[12.5px]">
          {t(rows.length === 0 ? COPY.none : COPY.noMatch)}
        </p>
      ) : (
        GROUPS.map((group) => {
          const inGroup = shown.filter((s) => sessionGroup(s) === group)
          if (!inGroup.length) return null
          return (
            <div key={group} className="flex flex-col gap-1">
              <h3 className="text-muted-foreground m-0 px-2 pb-1 pt-2 text-[12px] font-semibold">
                {t(GROUP_COPY[group])}
              </h3>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {inGroup.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    current={session.id === current}
                    onPick={() => onPick(session.id)}
                    onDelete={() => setDeleting(session)}
                  />
                ))}
              </ul>
            </div>
          )
        })
      )}
      {sessions.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className={cn(TOUCH, 'self-start')}
          disabled={sessions.isFetchingNextPage}
          onClick={() => void sessions.fetchNextPage()}
        >
          {t(COPY.more)}
        </Button>
      )}
      <DeleteSessionModal
        session={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(id) => id === current && onPick(null)}
      />
    </GlassCard>
  )
}

function SessionRow({
  session,
  current,
  onPick,
  onDelete,
}: {
  session: AssistantSession
  current: boolean
  onPick: () => void
  onDelete: () => void
}) {
  const { t, lang } = useI18n()
  const [renaming, setRenaming] = useState(false)

  if (renaming) {
    return (
      <li className="px-1 py-2">
        <RenameForm session={session} onDone={() => setRenaming(false)} />
      </li>
    )
  }

  return (
    <li
      className={cn(
        'motion-std group flex items-center gap-1 rounded-md pl-1',
        current ? 'bg-accent pr-1' : 'hover:bg-surface-ink/5',
      )}
    >
      <button
        type="button"
        aria-current={current ? 'true' : undefined}
        className="pointer-coarse:min-h-12 flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1 px-2 py-2 text-left"
        onClick={onPick}
      >
        <span
          className={cn(
            'text-foreground truncate text-[14px]',
            current ? 'font-semibold' : 'font-medium',
          )}
        >
          {session.title ?? t(C.untitled)}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {session.subject && <CodeChip code={session.subject.code} small />}
          <span className="text-muted-foreground tnum truncate text-[12px]">
            {sessionWhen(session.lastOpenedAt, lang)}
          </span>
        </span>
      </button>
      {current && (
        <SessionActions session={session} onRename={() => setRenaming(true)} onDelete={onDelete} />
      )}
    </li>
  )
}
