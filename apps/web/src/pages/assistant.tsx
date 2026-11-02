import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  ArrowLeft,
  Button,
  GlassCard,
  Icon,
  Orbit,
  Plus,
  ScreenHeader,
  ScreenLayout,
  cn,
} from '@pv/ui'
import { useAppChrome } from '@/app/chrome'
import { useI18n } from '@/app/i18n'
import { availabilityQuery } from '@/data/assistant'
import { ASSISTANT_COPY as C, ERROR_COPY } from '@/data/assistant-copy'
import { adoptTurn, newConversation, useAssistantLive } from '@/data/assistant-live'
import { AssistantComposer, AssistantThread } from '@/components/assistant-conversation'
import { useConversation } from '@/data/assistant-conversation'
import { SessionList } from './assistant-sessions'

/** One Core · the CRM assistant as a full page (ADR 0133), for long sessions
 *  and the list of past ones. Same conversation component as the panel; the
 *  open session lives in the address (`?s=`), so a link to it opens it.
 *
 *  A new conversation has no session until the server names one; the page then
 *  puts it in the address. On a phone the list gives way to an open session.
 *  Its ContextRail (law 10) is the conversation's own: subject, then records named.
 *  No rail on the list alone or on a chat that names no record: there is nothing to open. */

const TOUCH = 'pointer-coarse:h-12'
/** The box stays in reach while the thread scrolls: docked over BottomNav below `lg`. The
 *  round assistant button is not drawn on this screen, so nothing covers the send button. */
const DOCK =
  'glass-overlay sticky bottom-[calc(84px+env(safe-area-inset-bottom)+12px)] z-20 rounded-lg px-4 py-3 lg:bottom-6'
/** Following the thread stops above the docked box, not behind it. */
const END_MARGIN = 'scroll-mb-[calc(84px+env(safe-area-inset-bottom)+96px)] lg:scroll-mb-[120px]'

export function AssistantPage() {
  const { t } = useI18n()
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const sessionId = params.get('s')
  const context = useMemo(() => ({ screen: pathname }), [pathname])
  const convo = useConversation('page', sessionId, context)
  const off = useQuery(availabilityQuery).data?.enabled === false
  const turns = useAssistantLive((s) => s.turns)

  useEffect(() => {
    if (sessionId) return
    const fresh = turns.find((turn) => turn.origin === 'page' && turn.sessionId && !turn.adopted)
    if (!fresh?.sessionId) return
    adoptTurn(fresh.key)
    setParams({ s: fresh.sessionId }, { replace: true })
  }, [turns, sessionId, setParams])

  const pick = (id: string | null) => {
    newConversation('page')
    setParams(id ? { s: id } : {})
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title={t(C.title)}
          description={t(C.subline)}
          actions={
            !off && (
              <Button className={TOUCH} onClick={() => pick(null)}>
                <Icon icon={Plus} size={16} />
                {t(C.newChat)}
              </Button>
            )
          }
        />
        {off ? (
          <GlassCard className="flex items-center gap-3 px-5 py-6">
            <Icon icon={Orbit} size={20} className="text-muted-foreground shrink-0" />
            <p className="text-muted-foreground m-0 text-[13px]">{t(ERROR_COPY.off)}</p>
          </GlassCard>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <SessionList
              current={sessionId}
              onPick={pick}
              className={cn('order-last lg:order-none', sessionId && 'hidden lg:flex')}
            />
            <GlassCard variant="b" className="flex min-w-0 flex-col gap-5 p-5">
              {sessionId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(TOUCH, 'self-start lg:hidden')}
                  onClick={() => pick(null)}
                >
                  <Icon icon={ArrowLeft} size={16} />
                  {t(C.allChats)}
                </Button>
              )}
              <AssistantThread
                convo={convo}
                openPath={(path) => navigate(path)}
                onNewChat={() => pick(null)}
                endClassName={END_MARGIN}
              />
              <AssistantComposer convo={convo} className={DOCK} />
            </GlassCard>
          </div>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default AssistantPage
