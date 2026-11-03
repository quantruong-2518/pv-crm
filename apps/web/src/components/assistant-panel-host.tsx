import { Button, Drawer, Icon, Maximize, Plus } from '@pv/ui'
import { useI18n } from '@/app/i18n'
import { ASSISTANT_COPY as C } from '@/data/assistant-copy'
import { closeAssistant, newConversation, useAssistantLive } from '@/data/assistant-live'
import { router } from '@/routes'
import { AiGlyph } from './assistant-bits'
import { AssistantComposer, AssistantThread } from './assistant-conversation'
import { PanelHome } from './assistant-home'
import { useConversation } from '@/data/assistant-conversation'

/** The CRM assistant panel (ADR 0133): a right-hand Drawer over whatever
 *  screen opened it, full width on a phone. Mounted once beside the router in
 *  `main.tsx`, like the AI task tray, so opening a record goes through `router`.
 *
 *  Opening a record closes the panel; the session stays, and the next opening
 *  shows it again. Mounted from the first opening on, so closing slides.
 *  Full screen carries the chat over: the session, or the record on screen
 *  when no chat has started (`?about=kind:code`). */

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
  const { subject } = context
  const fullScreen = sessionId
    ? `/assistant?s=${sessionId}`
    : subject
      ? `/assistant?about=${subject.kind}:${encodeURIComponent(subject.code)}`
      : '/assistant'
  const opening = convo.items.find((i) => i.kind === 'question')?.text
  const line = convo.items.length
    ? (convo.detail.data?.session.title ?? opening ?? t(C.subline))
    : t(C.subline)

  return (
    <Drawer
      open={open}
      onClose={closeAssistant}
      title={
        <span className="flex items-center gap-3">
          <AiGlyph />
          <span className="flex min-w-0 flex-col">
            <span>{t(C.title)}</span>
            <span className="text-muted-foreground truncate text-[12px] font-normal">{line}</span>
          </span>
        </span>
      }
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
            onClick={() => openPath(fullScreen)}
          >
            <Icon icon={Maximize} size={16} />
          </Button>
        </div>
      }
      footer={<AssistantComposer convo={convo} focusOnOpen />}
    >
      <AssistantThread
        convo={convo}
        subject={subject}
        openPath={openPath}
        onNewChat={() => newConversation('panel')}
        empty={<PanelHome convo={convo} subject={subject} openPath={openPath} />}
      />
    </Drawer>
  )
}
