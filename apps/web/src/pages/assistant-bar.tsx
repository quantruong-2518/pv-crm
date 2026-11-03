import { useState } from 'react'
import { ArrowLeft, Badge, Button, Icon, Plus, cn } from '@pv/ui'
import type { AssistantSession } from '@pv/contracts'
import { useI18n } from '@/app/i18n'
import { ASSISTANT_COPY as C, questionCount } from '@/data/assistant-copy'
import {
  DeleteSessionModal,
  RenameForm,
  SESSION_ICON,
  SessionActions,
} from './assistant-session-parts'

/** The bar over the open chat: its name, how many questions it holds, and pin,
 *  rename and delete. A chat not yet started has only the plain name; on a phone
 *  the back arrow returns to the list, which the sidebar gives way to. */

const TOUCH = 'pointer-coarse:h-12'

export function ConversationBar({
  session,
  questions,
  onBack,
  onNew,
  onDeleted,
}: {
  /** `undefined` while a chat is new or still loading. */
  session: AssistantSession | undefined
  questions: number
  /** Present only with an open chat. */
  onBack?: () => void
  /** Present only with an open chat: on a phone the sidebar is hidden, so this is the way to a new one. */
  onNew?: () => void
  onDeleted: () => void
}) {
  const { t, lang } = useI18n()
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3 shadow-[inset_0_-1px_0_color-mix(in_srgb,var(--surface-ink)_8%,transparent)]">
      {onBack && (
        <Button variant="ghost" size="sm" className={`${TOUCH} lg:hidden`} onClick={onBack}>
          <Icon icon={ArrowLeft} size={16} />
          {t(C.allChats)}
        </Button>
      )}
      {session && renaming ? (
        <RenameForm
          session={session}
          onDone={() => setRenaming(false)}
          className="min-w-0 flex-1"
        />
      ) : (
        <>
          <h3 className="m-0 min-w-0 truncate text-[16px] font-semibold">
            {session ? (session.title ?? t(C.untitled)) : t(C.newChat)}
          </h3>
          {questions > 0 && <Badge>{questionCount(questions, lang)}</Badge>}
          <span className="flex-1" />
          {onNew && (
            <Button
              variant="ghost"
              className={cn(SESSION_ICON, 'lg:hidden')}
              aria-label={t(C.newChat)}
              title={t(C.newChat)}
              onClick={onNew}
            >
              <Icon icon={Plus} size={16} />
            </Button>
          )}
          {session && (
            <SessionActions
              session={session}
              onRename={() => setRenaming(true)}
              onDelete={() => setDeleting(true)}
            />
          )}
        </>
      )}
      <DeleteSessionModal
        session={deleting ? (session ?? null) : null}
        onClose={() => setDeleting(false)}
        onDeleted={onDeleted}
      />
    </div>
  )
}
