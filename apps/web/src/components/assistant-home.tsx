import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronRight, Icon, MessageCircle, cn } from '@pv/ui'
import type { AssistantSubject } from '@pv/contracts'
import { useSession } from '@/app/auth'
import { useI18n } from '@/app/i18n'
import { sessionsQuery } from '@/data/assistant'
import {
  ASSISTANT_COPY as C,
  aboutQuestion,
  greeting,
  sampleQuestions,
  sessionWhen,
} from '@/data/assistant-copy'
import { focusComposer, openPanelSession, setDraft } from '@/data/assistant-live'
import type { Conversation } from '@/data/assistant-conversation'
import { useSubjectName } from '@/data/assistant-subject'
import { CodeChip, HAIRLINE } from './assistant-bits'

/** What an empty conversation shows (owner, 03/11 design): a greeting and the
 *  suggested questions on both surfaces; in the panel also the record on screen
 *  and the two latest chats. A sample fills the box rather than sending, so the
 *  question can be read and changed first. */

/** The given name is the last word of a Vietnamese full name. */
const givenName = (full: string | undefined) => full?.trim().split(/\s+/).at(-1)

function Greeting() {
  const { t, lang } = useI18n()
  const name = givenName(useSession((s) => s.actor?.name))
  return (
    <div className="flex flex-col gap-1">
      {name && (
        <p className="m-0 text-[20px] font-semibold leading-[1.4]">{greeting(name, lang)}</p>
      )}
      <p className="text-muted-foreground m-0 text-[14px]">{t(C.hint)}</p>
    </div>
  )
}

function Samples({ convo }: { convo: Conversation }) {
  const { t, lang } = useI18n()
  const role = useSession((s) => s.actor?.roleIds[0])
  const questions = sampleQuestions(role, lang)
  if (!questions.length) return null
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-[12px] font-semibold">{t(C.tryAsking)}</span>
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          className="motion-std bg-muted text-foreground hover:bg-accent hover:text-accent-foreground pointer-coarse:min-h-12 group flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-left text-[14px] font-medium"
          onClick={() => {
            setDraft(convo.origin, q)
            focusComposer(convo.origin, true)
          }}
        >
          <span className="bg-accent text-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-sm">
            <Icon icon={MessageCircle} size={16} />
          </span>
          <span className="min-w-0 flex-1">{q}</span>
          <Icon icon={ChevronRight} size={16} className="text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  )
}

export function PageHome({ convo }: { convo: Conversation }) {
  return (
    <div className="flex flex-col gap-5">
      <Greeting />
      <Samples convo={convo} />
    </div>
  )
}

export function PanelHome({
  convo,
  subject,
  openPath,
}: {
  convo: Conversation
  subject?: AssistantSubject
  openPath: (path: string) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <Greeting />
      {subject && <Viewing convo={convo} subject={subject} />}
      <Samples convo={convo} />
      <Recent openPath={openPath} />
    </div>
  )
}

/** One row naming the record on screen; a press asks about it, and the session opens with it as its subject. */
function Viewing({ convo, subject }: { convo: Conversation; subject: AssistantSubject }) {
  const { t, lang } = useI18n()
  const name = useSubjectName(subject)
  return (
    <button
      type="button"
      disabled={convo.busy}
      className={cn(
        HAIRLINE,
        'motion-std bg-card hover:bg-muted pointer-coarse:h-12 flex h-11 w-full items-center gap-3 rounded-md px-3 text-left disabled:opacity-60',
      )}
      onClick={() => convo.ask(aboutQuestion(subject.code, lang))}
    >
      <span className="text-glass-foreground shrink-0 text-[12px]">{t(C.viewing)}</span>
      <CodeChip code={subject.code} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{name}</span>
      <span className="text-accent-foreground flex shrink-0 items-center gap-1 text-[13px] font-semibold">
        {t(C.askAboutThis)}
        <Icon icon={ChevronRight} size={16} />
      </span>
    </button>
  )
}

function Recent({ openPath }: { openPath: (path: string) => void }) {
  const { t, lang } = useI18n()
  const sessions = useInfiniteQuery(sessionsQuery)
  const latest = (sessions.data?.pages.flatMap((page) => page.sessions) ?? [])
    .sort((a, b) => Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt))
    .slice(0, 2)
  if (!latest.length) return null
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center">
        <span className="text-muted-foreground flex-1 text-[12px] font-semibold">
          {t(C.recent)}
        </span>
        <button
          type="button"
          className="text-accent-foreground pointer-coarse:min-h-12 text-[13px] font-semibold"
          onClick={() => openPath('/assistant')}
        >
          {t(C.seeAll)}
        </button>
      </div>
      {latest.map((session) => (
        <button
          key={session.id}
          type="button"
          className="pointer-coarse:min-h-12 flex items-center gap-2 py-2 text-left text-[14px]"
          onClick={() => openPanelSession(session.id)}
        >
          <span className="min-w-0 flex-1 truncate">{session.title ?? t(C.untitled)}</span>
          <span className="text-glass-foreground tnum shrink-0 text-[12px]">
            {sessionWhen(session.lastOpenedAt, lang)}
          </span>
        </button>
      ))}
    </div>
  )
}
