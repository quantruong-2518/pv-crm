import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'
import { Button, ContextRail, Icon, Send, Skeleton, Textarea, TriangleAlert, cn } from '@pv/ui'
import { AssistantQuestion, type AssistantSubject } from '@pv/contracts'
import { useSession } from '@/app/auth'
import { useI18n } from '@/app/i18n'
import { refPath } from '@/data/assistant'
import { ASSISTANT_COPY as C, sampleQuestions } from '@/data/assistant-copy'
import { composerId, focusComposer, setDraft, useAssistantLive } from '@/data/assistant-live'
import type { Conversation } from '@/data/assistant-conversation'
import { railOf } from '@/data/assistant-thread'
import { AssistantAnswer } from './assistant-answer'

/** The one conversation of the CRM assistant, shared by the panel and the
 *  `/assistant` page (ADR 0133). Router-free: the panel lives outside the
 *  router, so opening a record goes through `openPath` from whoever mounts it.
 *
 *  Thread and composer are two pieces because the panel docks the composer in
 *  its footer; `useConversation` (`data/assistant-conversation.ts`) runs once
 *  in the parent and feeds both. */

const TOUCH = 'pointer-coarse:h-12'
const QUESTION_MAX = AssistantQuestion.maxLength ?? undefined

/** Follows the newest text only while the reader is at the end, or right after they asked. */
function useFollow(items: Conversation['items']) {
  const end = useRef<HTMLDivElement>(null)
  const atEnd = useRef(true)
  const hasItems = items.length > 0
  useEffect(() => {
    const marker = end.current
    if (!marker) return
    const watch = new IntersectionObserver(
      ([entry]) => (atEnd.current = entry?.isIntersecting ?? true),
      {
        rootMargin: '0px 0px 48px 0px',
      },
    )
    watch.observe(marker)
    return () => watch.disconnect()
  }, [hasItems])
  const asked = items.filter((i) => i.kind === 'question').at(-1)?.key
  const seen = useRef(asked)
  useEffect(() => {
    const justAsked = asked !== seen.current && asked?.startsWith('q-')
    seen.current = asked
    if (justAsked || atEnd.current) end.current?.scrollIntoView({ block: 'end' })
  }, [items, asked])
  return end
}

export function AssistantThread({
  convo,
  subject,
  openPath,
  onNewChat,
  endClassName,
}: {
  convo: Conversation
  subject?: AssistantSubject
  openPath: (path: string) => void
  onNewChat: () => void
  /** Scroll margin of the end marker, for a box docked over the thread's foot. */
  endClassName?: string
}) {
  const { t } = useI18n()
  const { detail, items, busy, ask } = convo
  const end = useFollow(items)

  if (convo.sessionId && detail.isPending && !items.length) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="ml-auto h-10 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  if (detail.isError && !items.length) {
    return (
      <div
        role="alert"
        className="text-destructive-foreground flex items-center gap-3 text-[12.5px]"
      >
        <Icon icon={TriangleAlert} size={16} className="shrink-0" />
        <span className="flex-1">{t(C.loadFailed)}</span>
        <Button variant="ghost" size="sm" className={TOUCH} onClick={() => void detail.refetch()}>
          {t(C.retry)}
        </Button>
      </div>
    )
  }
  if (!items.length) return <Samples convo={convo} />

  const rail = railOf(detail.data?.session.subject ?? subject, items)
  const last = items.filter((i) => i.kind === 'answer').at(-1)
  const finished = last?.kind === 'answer' && last.answer.live && last.answer.state === 'done'
  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="sr-only">
        {finished ? `${t(C.answered)} ${last.answer.body}` : ''}
      </p>
      {rail.length > 0 && (
        <ContextRail
          max={6}
          objects={rail.map(({ ref, source }) => ({
            code: ref.code,
            source,
            onOpen: () => openPath(refPath(ref)),
          }))}
        />
      )}
      {items.map((item) =>
        item.kind === 'question' ? (
          <p
            key={item.key}
            className="bg-surface-ink/9 text-foreground m-0 ml-auto max-w-[85%] whitespace-pre-line rounded-lg px-4 py-3 text-[13px] leading-[1.55]"
          >
            {item.text}
          </p>
        ) : (
          <AssistantAnswer
            key={item.key}
            answer={item.answer}
            last={item.key === last?.key}
            busy={busy}
            ask={ask}
            openPath={openPath}
            onNewChat={onNewChat}
          />
        ),
      )}
      <div ref={end} className={endClassName} />
    </div>
  )
}

/** A tap fills the box rather than sending, so the question can be read and changed first. */
function Samples({ convo }: { convo: Conversation }) {
  const { t, lang } = useI18n()
  const role = useSession((s) => s.actor?.roleIds[0])
  const questions = sampleQuestions(role, lang)
  if (!questions.length) return null
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground m-0 text-[12.5px]">{t(C.tryAsking)}</p>
      <div className="flex flex-col gap-2">
        {questions.map((q) => (
          <Button
            key={q}
            variant="secondary"
            className="pointer-coarse:min-h-12 h-auto min-h-10 justify-start whitespace-normal py-2 text-left"
            onClick={() => {
              setDraft(convo.origin, q)
              focusComposer(convo.origin, true)
            }}
          >
            {q}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function AssistantComposer({
  convo,
  focusOnOpen = false,
  className,
}: {
  convo: Conversation
  /** Only on a fine pointer: on a phone the keyboard would cover the answer. */
  focusOnOpen?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const { origin } = convo
  const text = useAssistantLive((s) => s.drafts[origin])
  const ready = AssistantQuestion.safeParse(text).success && !convo.busy
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!ready) return
    convo.ask(text.trim())
    setDraft(origin, '')
  }
  /* Enter sends, Shift+Enter breaks the line; never mid-composition (Korean, Vietnamese IME). */
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const composing = e.nativeEvent.isComposing || e.keyCode === 229
    if (e.key === 'Enter' && !e.shiftKey && !composing) submit(e)
  }
  /* A frame later: the Drawer first notes who opened it, so focus goes back there on close. */
  useEffect(() => {
    if (!focusOnOpen) return
    const frame = requestAnimationFrame(() => focusComposer(origin, true))
    return () => cancelAnimationFrame(frame)
  }, [focusOnOpen, origin])
  return (
    <form className={cn('flex items-end gap-3', className)} onSubmit={submit}>
      <Textarea
        id={composerId(origin)}
        rows={1}
        autoGrow
        maxLength={QUESTION_MAX}
        aria-label={t(C.question)}
        placeholder={t(C.placeholder)}
        className="pointer-coarse:min-h-12 max-h-40 flex-1"
        value={text}
        onChange={(e) => setDraft(origin, e.target.value)}
        onKeyDown={onKey}
      />
      <Button type="submit" className={TOUCH} disabled={!ready}>
        <Icon icon={Send} size={16} />
        {t(C.send)}
      </Button>
    </form>
  )
}
