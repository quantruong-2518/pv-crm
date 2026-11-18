import { useState } from 'react'
import { Button, ChevronDown, Drawer, Ellipsis, Icon, Plus, cn } from '@pv/ui'
import type { AssistantSession } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useI18n } from '@/app/i18n'
import { toastFail } from '@/app/toast'
import { usePatchSession } from '@/data/assistant'
import { ASSISTANT_COPY as C, SESSION_COPY, VIEW_COPY as V } from '@/data/assistant-copy'
import { MenuButton } from '@/components/record/menu-button'
import { DeleteSessionModal, RenameForm, SESSION_ICON } from './assistant-session-parts'
import { SessionList } from './assistant-sessions'

/** The page header's chat controls (owner, 18/11): a ghost button with the open chat's
 *  name that lifts the list of chats, a new-chat icon, and a menu with pin, rename and
 *  delete. No count, no filled button: the page's one filled button is the send or the proposal's. */

export function ConversationBar({
  session,
  current,
  onPick,
  onDeleted,
}: {
  /** `undefined` while a chat is new or still loading. */
  session: AssistantSession | undefined
  /** The open chat's id in the address, `null` for a new one. */
  current: string | null
  onPick: (id: string | null) => void
  onDeleted: () => void
}) {
  const { t } = useI18n()
  const patch = usePatchSession()
  const [listing, setListing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (session && renaming) {
    return <RenameForm session={session} onDone={() => setRenaming(false)} className="min-w-0" />
  }
  const name = session ? (session.title ?? t(C.untitled)) : t(C.newChat)

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        variant="ghost"
        className="pointer-coarse:h-12 min-w-0 max-w-[60vw] sm:max-w-[320px]"
        aria-haspopup="dialog"
        onClick={() => setListing(true)}
      >
        <span className="truncate">{name}</span>
        <Icon icon={ChevronDown} size={16} className="shrink-0" />
      </Button>
      <Button
        variant="ghost"
        className={SESSION_ICON}
        aria-label={t(C.newChat)}
        title={t(C.newChat)}
        onClick={() => onPick(null)}
      >
        <Icon icon={Plus} size={16} />
      </Button>
      {session && (
        <MenuButton
          label={null}
          icon={Ellipsis}
          size="sm"
          align="right"
          ariaLabel={t(V.options)}
          title={t(V.options)}
          className={cn(SESSION_ICON)}
          choices={[
            {
              key: 'pin',
              label: t(session.pinned ? SESSION_COPY.unpin : SESSION_COPY.pin),
              onSelect: () =>
                patch.mutate(
                  { id: session.id, body: { pinned: !session.pinned } },
                  { onError: (error) => toastFail(userMessage(error)) },
                ),
            },
            { key: 'rename', label: t(SESSION_COPY.rename), onSelect: () => setRenaming(true) },
            {
              key: 'remove',
              label: t(SESSION_COPY.removeChat),
              tone: 'danger',
              onSelect: () => setDeleting(true),
            },
          ]}
        />
      )}
      <Drawer
        open={listing}
        onClose={() => setListing(false)}
        title={t(C.allChats)}
        closeLabel={t(C.close)}
      >
        <SessionList
          current={current}
          onPick={(id) => {
            setListing(false)
            onPick(id)
          }}
        />
      </Drawer>
      <DeleteSessionModal
        session={deleting ? (session ?? null) : null}
        onClose={() => setDeleting(false)}
        onDeleted={onDeleted}
      />
    </div>
  )
}
