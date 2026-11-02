import { Button, Drawer, Icon, MessageSquare, Plus } from '@pv/ui'
import { useI18n } from '@/app/i18n'
import { ASSISTANT_COPY as C } from '@/data/assistant-copy'
import { closeAssistant, newConversation, useAssistantLive } from '@/data/assistant-live'
import { router } from '@/routes'
import { AssistantComposer, AssistantThread } from './assistant-conversation'
import { useConversation } from '@/data/assistant-conversation'

/** The CRM assistant panel (ADR 0133): a right-hand Drawer over whatever
 *  screen opened it, full width on a phone. Mounted once beside the router in
 *  `main.tsx`, like the AI task tray, so opening a record goes through `router`.
 *
 *  Opening a record closes the panel; the session stays, and the next opening
 *  shows it again. Mounted from the first opening on, so closing slides. */

const ICON_BUTTON = 'pointer-coarse:size-12 size-8 px-0'

export function AssistantPanelHost() {
  const mounted = useAssistantLive((s) => s.panel.mounted)
  return mounted ? <AssistantPanel /> : null
}

function AssistantPanel() {
  const { t } = useI18n()
  const { open, sessionId, context } = useAssistantLive((s) => s.panel)
  const convo = useConversation('panel', sessionId, context)
  const openPath = (path: string) => {
    closeAssistant()
    void router.navigate(path)
  }

  return (
    <Drawer
      open={open}
      onClose={closeAssistant}
      title={t(C.title)}
      subtitle={t(C.subline)}
      closeLabel={t(C.close)}
      meta={
        <div className="-mt-1 flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={ICON_BUTTON}
            aria-label={t(C.newChat)}
            title={t(C.newChat)}
            disabled={sessionId === null && convo.items.length === 0}
            onClick={() => newConversation('panel')}
          >
            <Icon icon={Plus} size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={ICON_BUTTON}
            aria-label={t(C.fullScreen)}
            title={t(C.fullScreen)}
            onClick={() => openPath(sessionId ? `/assistant?s=${sessionId}` : '/assistant')}
          >
            <Icon icon={MessageSquare} size={16} />
          </Button>
        </div>
      }
      footer={<AssistantComposer convo={convo} focusOnOpen />}
    >
      <AssistantThread
        convo={convo}
        subject={context.subject}
        openPath={openPath}
        onNewChat={() => newConversation('panel')}
      />
    </Drawer>
  )
}
