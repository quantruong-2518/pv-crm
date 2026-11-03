import {
  useEffect,
  useRef,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  ArrowUpLong,
  Button,
  ContextRail,
  Icon,
  Skeleton,
  Textarea,
  TriangleAlert,
  X,
  cn,
} from '@pv/ui'
import { AssistantQuestion, type AssistantSubject } from '@pv/contracts'
import { useI18n } from '@/app/i18n'
import { refPath } from '@/data/assistant'
import { ASSISTANT_COPY as C, askingAbout, dropSubject } from '@/data/assistant-copy'
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
 *  in the parent and feeds both. The empty state is the caller's (`empty`). */

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
  endStyle,
  empty,
}: {
  convo: Conversation
  subject?: AssistantSubject
  openPath: (path: string) => void
  onNewChat: () => void
  /** Scroll margin of the end marker, for a box docked over the thread's foot. */
  endStyle?: CSSProperties
  /** Drawn while the chat has no message yet. */
  empty: ReactNode
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
  if (!items.length) return empty

  const rail = railOf(detail.data?.session.subject ?? subject, items)
  const last = items.filter((i) => i.kind === 'answer').at(-1)
  const finished = last?.kind === 'answer' && last.answer.live && last.answer.state === 'done'
  const compact = convo.origin === 'panel'
  return (
    <div className={cn('flex flex-col', compact ? 'gap-4' : 'gap-6')}>
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
            className="bg-primary-strong stone:bg-primary porcelain:bg-primary text-primary-foreground m-0 ml-auto max-w-[85%] whitespace-pre-line rounded-[16px_16px_4px_16px] px-4 py-3 text-[14px] leading-[1.55]"
          >
            {item.text}
          </p>
        ) : (
          <AssistantAnswer
            key={item.key}
            answer={item.answer}
            last={item.key === last?.key}
            busy={busy}
            compact={compact}
            ask={ask}
            openPath={openPath}
            onNewChat={onNewChat}
          />
        ),
      )}
      <div ref={end} style={endStyle} />
    </div>
  )
}

/** The record a chat asks about, drawn above the box on the page. A session's own
 *  subject is fixed on the server, so only a chat not yet started may drop it. */
export type ComposerSubject = { ref: AssistantSubject; onRemove?: () => void }

const SUBJECT_CHIP =
  'bg-accent text-accent-foreground pointer-coarse:h-12 inline-flex h-8 items-center gap-2 rounded-md px-3 text-[12px] font-semibold'

function SubjectChip({ subject }: { subject: ComposerSubject }) {
  const { lang } = useI18n()
  const { code } = subject.ref
  if (!subject.onRemove) return <span className={SUBJECT_CHIP}>{askingAbout(code, lang)}</span>
  return (
    <button
      type="button"
      aria-label={dropSubject(code, lang)}
      className={cn(SUBJECT_CHIP, 'motion-std hover:bg-primary/24')}
      onClick={subject.onRemove}
    >
      {askingAbout(code, lang)}
      <Icon icon={X} size={14} />
    </button>
  )
}

export function AssistantComposer({
  convo,
  focusOnOpen = false,
  subject,
  className,
}: {
  convo: Conversation
  /** Only on a fine pointer: on a phone the keyboard would cover the answer. */
  focusOnOpen?: boolean
  subject?: ComposerSubject
  className?: string
}) {
  const { t } = useI18n()
  const { origin } = convo
  const page = origin === 'page'
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
  /* Off: a flat tint, no ramp and no shadow, so it reads as waiting rather than gone. */
  const send = (
    <Button
      type="submit"
      className={cn(
        TOUCH,
        !page && 'pointer-coarse:size-12 size-10 px-0',
        !ready && 'bg-primary/16 text-accent-foreground opacity-100 shadow-none',
      )}
      aria-label={page ? undefined : t(C.send)}
      disabled={!ready}
    >
      {page && t(C.send)}
      <Icon icon={ArrowUpLong} size={16} />
    </Button>
  )
  const field = (
    <Textarea
      id={composerId(origin)}
      rows={page ? 2 : 1}
      autoGrow
      maxLength={QUESTION_MAX}
      aria-label={t(C.question)}
      placeholder={t(C.placeholder)}
      className={cn(
        'max-h-40 flex-1 bg-transparent p-0 focus-visible:shadow-none',
        page
          ? 'min-h-12 text-[15px] leading-[1.5]'
          : 'pointer-coarse:min-h-12 py-2 text-[14px] leading-[1.6]',
      )}
      value={text}
      onChange={(e) => setDraft(origin, e.target.value)}
      onKeyDown={onKey}
    />
  )

  if (!page) {
    return (
      <form
        className={cn('bg-input flex items-end gap-2 rounded-lg py-2 pl-3 pr-2', className)}
        onSubmit={submit}
      >
        {field}
        {send}
      </form>
    )
  }
  /* A utility ring, not `glass-overlay`: a ring utility would replace that class's whole shadow. */
  return (
    <form
      className={cn(
        'bg-muted stone:bg-popover porcelain:bg-popover focus-within:ring-ring flex flex-col gap-2 rounded-2xl py-3 pl-4 pr-3 shadow-[var(--shadow-pop),inset_0_1px_0_var(--sheen-a)] focus-within:ring-2',
        className,
      )}
      onSubmit={submit}
    >
      {field}
      <div className="flex flex-wrap items-center gap-2">
        {subject && <SubjectChip subject={subject} />}
        <span className="flex-1" />
        <span className="text-glass-foreground hidden text-[12px] sm:inline">{t(C.keys)}</span>
        {send}
      </div>
    </form>
  )
}
