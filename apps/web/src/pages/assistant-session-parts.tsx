import { useState, type FormEvent } from 'react'
import { Button, Input, Modal, cn } from '@pv/ui'
import { AssistantSessionPatchBody, type AssistantSession } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useI18n } from '@/app/i18n'
import { toastFail } from '@/app/toast'
import { useDeleteSession, usePatchSession } from '@/data/assistant'
import { SESSION_COPY } from '@/data/assistant-copy'
import { forgetSession } from '@/data/assistant-live'

/** What the conversation's header bar uses: the words for pin, rename and delete, the
 *  inline rename form and the delete confirm (asks once, because a chat cannot be brought back). */

const TOUCH = 'pointer-coarse:h-12'
const TITLE_MAX = AssistantSessionPatchBody.shape.title.unwrap().maxLength ?? undefined
export const SESSION_ICON =
  'text-muted-foreground hover:text-foreground hover:bg-surface-ink/9 pointer-coarse:size-12 size-8 shrink-0 rounded-[10px] bg-transparent px-0 shadow-none disabled:opacity-45'

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
