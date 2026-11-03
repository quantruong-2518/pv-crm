import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, GlassCard, ScreenHeader, ScreenLayout, cn } from '@pv/ui'
import { AssistantSubject } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { useI18n } from '@/app/i18n'
import { availabilityQuery } from '@/data/assistant'
import { ASSISTANT_COPY as C, ERROR_COPY } from '@/data/assistant-copy'
import { adoptTurn, newConversation, useAssistantLive } from '@/data/assistant-live'
import { AiGlyph } from '@/components/assistant-bits'
import { AssistantComposer, AssistantThread } from '@/components/assistant-conversation'
import { PageHome } from '@/components/assistant-home'
import { useConversation } from '@/data/assistant-conversation'
import { ConversationBar } from './assistant-bar'
import { SessionList } from './assistant-sessions'

/** One Core · the CRM assistant as a full page (ADR 0133), for long sessions
 *  and the list of past ones. Same conversation component as the panel; the
 *  open session lives in the address (`?s=`), so a link to it opens it.
 *
 *  A new conversation has no session until the server names one; the page then
 *  puts it in the address. `?about=kind:code` starts a new chat about a record
 *  (the panel's full-screen button sends it); the box shows it and may drop it.
 *  Its ContextRail (law 10) is the conversation's own: subject, then records named.
 *  No rail on the list alone or on a chat that names no record: there is nothing to open. */

/** The box stays in reach while the thread scrolls: docked over BottomNav below `lg`. The
 *  round assistant button is not drawn on this screen, so nothing covers the send button. */
const DOCK = 'sticky bottom-[calc(84px+env(safe-area-inset-bottom)+12px)] z-20 lg:bottom-6'
/** Following the thread stops this far above the screen's bottom edge: the docked box's
 *  measured height plus a gap, and below `lg` the BottomNav's height too. Kept in state,
 *  not a CSS variable, so the token checker has no new name to take for an invented token. */
const GAP_LG = 48
const GAP_PHONE = 120

function aboutOf(raw: string | null): AssistantSubject | undefined {
  const at = raw?.indexOf(':') ?? -1
  if (!raw || at < 1) return undefined
  const parsed = AssistantSubject.safeParse({ kind: raw.slice(0, at), code: raw.slice(at + 1) })
  return parsed.success ? parsed.data : undefined
}

export function AssistantPage() {
  const { t } = useI18n()
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const sessionId = params.get('s')
  const rawAbout = params.get('about')
  const about = useMemo(() => (sessionId ? undefined : aboutOf(rawAbout)), [sessionId, rawAbout])
  const context = useMemo(
    () => ({ screen: pathname, ...(about ? { subject: about } : {}) }),
    [pathname, about],
  )
  const convo = useConversation('page', sessionId, context)
  const off = useQuery(availabilityQuery).data?.enabled === false
  const turns = useAssistantLive((s) => s.turns)
  const session = convo.detail.data?.session
  const subject = sessionId ? session?.subject : about

  useEffect(() => {
    if (sessionId) return
    const fresh = turns.find((turn) => turn.origin === 'page' && turn.sessionId && !turn.adopted)
    if (!fresh?.sessionId) return
    adoptTurn(fresh.key)
    setParams({ s: fresh.sessionId }, { replace: true })
  }, [turns, sessionId, setParams])

  const [followGap, setFollowGap] = useState(0)
  const dock = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const publish = () => {
      const lg = window.matchMedia('(min-width: 1024px)').matches
      setFollowGap(el.offsetHeight + (lg ? GAP_LG : GAP_PHONE))
    }
    publish()
    const watch = new ResizeObserver(publish)
    watch.observe(el)
    window.addEventListener('resize', publish)
    return () => {
      watch.disconnect()
      window.removeEventListener('resize', publish)
    }
  }, [])

  const pick = (id: string | null) => {
    newConversation('page')
    setParams(id ? { s: id } : {})
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title={
            <span className="flex items-center gap-3">
              <AiGlyph size={26} />
              {t(C.title)}
            </span>
          }
          description={t(C.subline)}
        />
        {off ? (
          <GlassCard className="flex items-center gap-3 px-5 py-6">
            <AiGlyph />
            <p className="text-muted-foreground m-0 text-[13px]">{t(ERROR_COPY.off)}</p>
          </GlassCard>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <SessionList
              current={sessionId}
              onPick={pick}
              className={cn('order-last lg:order-none', sessionId && 'hidden lg:flex')}
            />
            <GlassCard variant="b" className="flex min-w-0 flex-col">
              <ConversationBar
                key={sessionId ?? 'new'}
                session={session}
                questions={convo.items.filter((i) => i.kind === 'question').length}
                onBack={sessionId ? () => pick(null) : undefined}
                onNew={sessionId ? () => pick(null) : undefined}
                onDeleted={() => pick(null)}
              />
              <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-5 py-6">
                <AssistantThread
                  convo={convo}
                  openPath={(path) => navigate(path)}
                  onNewChat={() => pick(null)}
                  endStyle={{ scrollMarginBottom: `${followGap}px` }}
                  empty={<PageHome convo={convo} />}
                />
                <div ref={dock} className={DOCK}>
                  <AssistantComposer
                    convo={convo}
                    subject={
                      subject
                        ? { ref: subject, onRemove: sessionId ? undefined : () => setParams({}) }
                        : undefined
                    }
                  />
                </div>
              </div>
            </GlassCard>
          </div>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default AssistantPage
