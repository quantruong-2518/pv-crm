import { useState, type FormEvent } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Button, GlassCard, Icon, Input, Modal, Pencil, Pin, Skeleton, Trash2, cn } from '@pv/ui'
import { AssistantSessionPatchBody, type AssistantSession } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastFail } from '@/app/toast'
import { sessionsQuery, useDeleteSession, usePatchSession } from '@/data/assistant'
import { dayMonth } from '@/data/assistant-copy'
import { forgetSession } from '@/data/assistant-live'
import { ROW_ICON } from '@/components/table-bits'

/** The `/assistant` page's list of past sessions: pinned first, then the most
 *  recently opened, in the server's order, a page at a time. A long list, so it
 *  sits on `.glass-b` (law 8). Rename is inline; delete asks once, because a
 *  session cannot be brought back. */

const m = message
const COPY = {
  chats: m('Cuộc trò chuyện', 'Chats', '대화'),
  none: m('Chưa có cuộc trò chuyện nào.', 'No chats yet.', '아직 대화가 없습니다.'),
  failed: m('Không tải được danh sách.', 'Could not load the list.', '목록을 불러오지 못했습니다.'),
  more: m('Xem thêm', 'Show more', '더 보기'),
  retry: m('Thử lại', 'Try again', '다시 시도'),
  untitled: m('Chưa đặt tên', 'Untitled', '제목 없음'),
  pin: m('Ghim', 'Pin', '고정'),
  unpin: m('Bỏ ghim', 'Unpin', '고정 해제'),
  rename: m('Đổi tên', 'Rename', '이름 변경'),
  title: m('Tên cuộc trò chuyện', 'Chat name', '대화 이름'),
  save: m('Lưu', 'Save', '저장'),
  cancel: m('Huỷ', 'Cancel', '취소'),
  remove: m('Xoá', 'Delete', '삭제'),
  removeTitle: m('Xoá cuộc trò chuyện này?', 'Delete this chat?', '이 대화를 삭제할까요?'),
  removeBody: m(
    'Xoá rồi không khôi phục được.',
    'It cannot be restored.',
    '삭제하면 되돌릴 수 없습니다.',
  ),
}

const TOUCH = 'pointer-coarse:h-12'

const TITLE_MAX = AssistantSessionPatchBody.shape.title.unwrap().maxLength ?? undefined

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
  const remove = useDeleteSession()
  const [deleting, setDeleting] = useState<AssistantSession | null>(null)
  const rows = sessions.data?.pages.flatMap((page) => page.sessions) ?? []

  const confirmDelete = () => {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onSuccess: () => {
        forgetSession(deleting.id)
        if (deleting.id === current) onPick(null)
        setDeleting(null)
      },
      onError: (error) => toastFail(userMessage(error)),
    })
  }

  return (
    <GlassCard variant="b" className={cn('flex flex-col gap-2 py-4', className)}>
      <h2 className="text-foreground m-0 px-5 text-[13px] font-semibold">{t(COPY.chats)}</h2>
      {sessions.isPending ? (
        <div className="flex flex-col gap-2 px-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : sessions.isError ? (
        <div className="flex items-center gap-3 px-5">
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
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground m-0 px-5 text-[12.5px]">{t(COPY.none)}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              current={session.id === current}
              onPick={() => onPick(session.id)}
              onDelete={() => setDeleting(session)}
            />
          ))}
        </ul>
      )}
      {sessions.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className={cn(TOUCH, 'mx-5 self-start')}
          disabled={sessions.isFetchingNextPage}
          onClick={() => void sessions.fetchNextPage()}
        >
          {t(COPY.more)}
        </Button>
      )}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        className="h-auto sm:h-auto sm:max-w-[480px]"
        title={t(COPY.removeTitle)}
        subtitle={deleting?.title ?? undefined}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="lg" variant="ghost" type="button" onClick={() => setDeleting(null)}>
              {t(COPY.cancel)}
            </Button>
            <Button
              size="lg"
              variant="destructive"
              type="button"
              disabled={remove.isPending}
              onClick={confirmDelete}
            >
              {t(COPY.remove)}
            </Button>
          </div>
        }
      >
        <p className="text-muted-foreground m-0 text-[13px] leading-[1.6]">{t(COPY.removeBody)}</p>
      </Modal>
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
  const { t, date, lang } = useI18n()
  const patch = usePatchSession()
  const [draft, setDraft] = useState<string | null>(null)
  const name = session.title ?? t(COPY.untitled)
  const save = (e: FormEvent) => {
    e.preventDefault()
    const title = draft?.trim()
    if (!title) return setDraft(null)
    patch.mutate(
      { id: session.id, body: { title } },
      { onSuccess: () => setDraft(null), onError: (error) => toastFail(userMessage(error)) },
    )
  }
  const togglePin = () =>
    patch.mutate(
      { id: session.id, body: { pinned: !session.pinned } },
      { onError: (error) => toastFail(userMessage(error)) },
    )

  if (draft !== null) {
    return (
      <li className="px-5 py-2">
        <form className="flex items-center gap-2" onSubmit={save}>
          <Input
            autoFocus
            maxLength={TITLE_MAX}
            aria-label={t(COPY.title)}
            className="pointer-coarse:h-12 flex-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button size="sm" className={TOUCH} type="submit" disabled={patch.isPending}>
            {t(COPY.save)}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={TOUCH}
            type="button"
            onClick={() => setDraft(null)}
          >
            {t(COPY.cancel)}
          </Button>
        </form>
      </li>
    )
  }

  return (
    <li className={cn('flex items-center gap-1 px-3', current && 'bg-surface-ink/9')}>
      <button
        type="button"
        aria-current={current ? 'true' : undefined}
        className="pointer-coarse:min-h-12 flex min-h-10 min-w-0 flex-1 flex-col justify-center px-2 py-2 text-left"
        onClick={onPick}
      >
        <span className={cn('text-foreground truncate text-[13px]', current && 'font-semibold')}>
          {name}
        </span>
        <span className="text-muted-foreground tnum truncate text-[11.5px]">
          {date(session.lastOpenedAt, { hour: '2-digit', minute: '2-digit', hour12: false })}
          {' · '}
          {dayMonth(session.lastOpenedAt, lang)}
          {session.subject ? ` · ${session.subject.code}` : ''}
        </span>
      </button>
      <Button
        variant="ghost"
        className={cn(ROW_ICON, session.pinned && 'text-accent-foreground')}
        aria-label={t(session.pinned ? COPY.unpin : COPY.pin)}
        aria-pressed={session.pinned}
        title={t(session.pinned ? COPY.unpin : COPY.pin)}
        disabled={patch.isPending}
        onClick={togglePin}
      >
        <Icon icon={Pin} size={16} />
      </Button>
      <Button
        variant="ghost"
        className={ROW_ICON}
        aria-label={t(COPY.rename)}
        title={t(COPY.rename)}
        onClick={() => setDraft(session.title ?? '')}
      >
        <Icon icon={Pencil} size={16} />
      </Button>
      <Button
        variant="ghost"
        className={ROW_ICON}
        aria-label={t(COPY.remove)}
        title={t(COPY.remove)}
        onClick={onDelete}
      >
        <Icon icon={Trash2} size={16} />
      </Button>
    </li>
  )
}
