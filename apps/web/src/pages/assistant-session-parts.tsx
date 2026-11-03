import { useState, type FormEvent } from 'react'
import { Button, Icon, Input, Modal, Pencil, Pin, Trash2, cn } from '@pv/ui'
import { AssistantSessionPatchBody, type AssistantSession } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastFail } from '@/app/toast'
import { useDeleteSession, usePatchSession } from '@/data/assistant'
import { forgetSession } from '@/data/assistant-live'

/** What the sidebar's active row and the conversation's header bar share: pin,
 *  rename (inline) and delete (asks once, because a chat cannot be brought back). */

const m = message
const SESSION_COPY = {
  pin: m('Ghim', 'Pin', '고정'),
  unpin: m('Bỏ ghim', 'Unpin', '고정 해제'),
  rename: m('Đổi tên', 'Rename', '이름 변경'),
  title: m('Tên cuộc trò chuyện', 'Chat name', '대화 이름'),
  save: m('Lưu', 'Save', '저장'),
  cancel: m('Huỷ', 'Cancel', '취소'),
  remove: m('Xoá', 'Delete', '삭제'),
  removeChat: m('Xoá cuộc trò chuyện', 'Delete chat', '대화 삭제'),
  removeTitle: m('Xoá cuộc trò chuyện này?', 'Delete this chat?', '이 대화를 삭제할까요?'),
  removeBody: m(
    'Xoá rồi không khôi phục được.',
    'It cannot be restored.',
    '삭제하면 되돌릴 수 없습니다.',
  ),
}

const TOUCH = 'pointer-coarse:h-12'
const TITLE_MAX = AssistantSessionPatchBody.shape.title.unwrap().maxLength ?? undefined
export const SESSION_ICON =
  'text-muted-foreground hover:text-foreground hover:bg-surface-ink/9 pointer-coarse:size-12 size-8 shrink-0 rounded-[10px] bg-transparent px-0 shadow-none disabled:opacity-45'

export function SessionActions({
  session,
  onRename,
  onDelete,
}: {
  session: AssistantSession
  onRename: () => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const patch = usePatchSession()
  const pinLabel = t(session.pinned ? SESSION_COPY.unpin : SESSION_COPY.pin)
  return (
    <>
      <Button
        variant="ghost"
        className={cn(SESSION_ICON, session.pinned && 'text-accent-foreground')}
        aria-label={pinLabel}
        aria-pressed={session.pinned}
        title={pinLabel}
        disabled={patch.isPending}
        onClick={() =>
          patch.mutate(
            { id: session.id, body: { pinned: !session.pinned } },
            { onError: (error) => toastFail(userMessage(error)) },
          )
        }
      >
        <Icon icon={Pin} size={16} />
      </Button>
      <Button
        variant="ghost"
        className={SESSION_ICON}
        aria-label={t(SESSION_COPY.rename)}
        title={t(SESSION_COPY.rename)}
        onClick={onRename}
      >
        <Icon icon={Pencil} size={16} />
      </Button>
      <Button
        variant="ghost"
        className={SESSION_ICON}
        aria-label={t(SESSION_COPY.removeChat)}
        title={t(SESSION_COPY.removeChat)}
        onClick={onDelete}
      >
        <Icon icon={Trash2} size={16} />
      </Button>
    </>
  )
}

export function RenameForm({
  session,
  onDone,
  className,
}: {
  session: AssistantSession
  onDone: () => void
  className?: string
}) {
  const { t } = useI18n()
  const patch = usePatchSession()
  const [draft, setDraft] = useState(session.title ?? '')
  const save = (e: FormEvent) => {
    e.preventDefault()
    const title = draft.trim()
    if (!title) return onDone()
    patch.mutate(
      { id: session.id, body: { title } },
      { onSuccess: onDone, onError: (error) => toastFail(userMessage(error)) },
    )
  }
  return (
    <form className={cn('flex items-center gap-2', className)} onSubmit={save}>
      <Input
        autoFocus
        maxLength={TITLE_MAX}
        aria-label={t(SESSION_COPY.title)}
        className="pointer-coarse:h-12 min-w-0 flex-1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <Button size="sm" className={TOUCH} type="submit" disabled={patch.isPending}>
        {t(SESSION_COPY.save)}
      </Button>
      <Button size="sm" variant="ghost" className={TOUCH} type="button" onClick={onDone}>
        {t(SESSION_COPY.cancel)}
      </Button>
    </form>
  )
}

/** `onDeleted` runs after the server removed it, so the caller can leave the open chat. */
export function DeleteSessionModal({
  session,
  onClose,
  onDeleted,
}: {
  session: AssistantSession | null
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const { t } = useI18n()
  const remove = useDeleteSession()
  const confirm = () => {
    if (!session) return
    remove.mutate(session.id, {
      onSuccess: () => {
        forgetSession(session.id)
        onDeleted(session.id)
        onClose()
      },
      onError: (error) => toastFail(userMessage(error)),
    })
  }
  return (
    <Modal
      open={session !== null}
      onClose={onClose}
      className="h-auto sm:h-auto sm:max-w-[480px]"
      title={t(SESSION_COPY.removeTitle)}
      subtitle={session?.title ?? undefined}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button size="lg" variant="ghost" type="button" onClick={onClose}>
            {t(SESSION_COPY.cancel)}
          </Button>
          <Button
            size="lg"
            variant="destructive"
            type="button"
            disabled={remove.isPending}
            onClick={confirm}
          >
            {t(SESSION_COPY.remove)}
          </Button>
        </div>
      }
    >
      <p className="text-muted-foreground m-0 text-[13px] leading-[1.6]">
        {t(SESSION_COPY.removeBody)}
      </p>
    </Modal>
  )
}
