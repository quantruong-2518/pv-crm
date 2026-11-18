import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  AiMark,
  Button,
  ChevronRight,
  GlassCard,
  Icon,
  MessageCircle,
  Skeleton,
  TriangleAlert,
  cn,
} from '@pv/ui'
import type { AssistantSubject, MyWorkSection } from '@pv/contracts'
import { useSession } from '@/app/auth'
import { useI18n } from '@/app/i18n'
import { sessionsQuery } from '@/data/assistant'
import {
  BRIEF_COPY as B,
  SECTION_LABEL,
  SECTION_QUESTION,
  myWorkQuery,
} from '@/data/assistant-brief'
import {
  ASSISTANT_COPY as C,
  aboutQuestion,
  clock,
  greeting,
  sampleQuestions,
  sessionWhen,
} from '@/data/assistant-copy'
import { focusComposer, openPanelSession, setDraft } from '@/data/assistant-live'
import type { Conversation } from '@/data/assistant-conversation'
import { useSubjectName } from '@/data/assistant-subject'
import { CodeChip, HAIRLINE } from './assistant-bits'

/** What an empty conversation shows. The page: today's work, the morning brief
 *  over one list of rows, and a press on a row asks about that section. The
 *  panel (owner, 03/11 design): a greeting and the suggested questions, the
 *  record on screen and the two latest chats; a sample fills the box rather
 *  than sending, so the question can be read and changed first. */

/** The given name is the last word of a Vietnamese full name. */
const givenName = (full: string | undefined) => full?.trim().split(/\s+/).at(-1)

function Greeting() {
  const { lang } = useI18n()
  const name = givenName(useSession((s) => s.actor?.name))
  if (!name) return null
  return <p className="m-0 text-[20px] font-semibold leading-[1.4]">{greeting(name, lang)}</p>
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

/** The brief is AI text and carries the one AI mark (law 9); the counts are
 *  rule-computed and carry none. Plain text on the raw background, hence
 *  `text-foreground`, not `text-glass-foreground`. */
function Hero({ brief }: { brief: { summary: string; at: string } | null | undefined }) {
  const { t, lang } = useI18n()
  if (!brief) return <Greeting />
  return (
    <div className="flex flex-col gap-2">
      <p className="text-foreground m-0 flex items-start gap-2 text-[16px] font-semibold leading-[1.4] md:text-[20px]">
        <Icon icon={AiMark} size={16} className="text-primary mt-1 shrink-0 md:mt-2" />
        <span className="min-w-0">{brief.summary}</span>
      </p>
      <p className="text-muted-foreground m-0 text-[12px]">{t(B.written(clock(brief.at, lang)))}</p>
    </div>
  )
}

function WorkRow({
  count,
  more,
  section,
  convo,
}: {
  count: number
  more: boolean
  section: MyWorkSection
  convo: Conversation
}) {
  const { t, number } = useI18n()
  return (
    <button
      type="button"
      disabled={convo.busy}
      className="motion-std hover:bg-muted focus-visible:bg-muted group flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-[14px] disabled:opacity-60"
      onClick={() => convo.ask(t(SECTION_QUESTION[section]))}
    >
      <span className="tnum w-12 shrink-0 text-right font-bold">
        {number(count)}
        {more && '+'}
      </span>
      <span className="min-w-0 flex-1">{t(SECTION_LABEL[section])}</span>
      <Icon
        icon={ChevronRight}
        size={16}
        className="text-muted-foreground pointer-fine:group-hover:hidden pointer-fine:group-focus-visible:hidden shrink-0"
      />
      <span className="text-accent-foreground pointer-fine:group-hover:inline pointer-fine:group-focus-visible:inline hidden shrink-0 text-[13px] font-semibold">
        {t(B.askAbout)}
      </span>
    </button>
  )
}

function WorkList({ convo }: { convo: Conversation }) {
  const { t } = useI18n()
  const work = useQuery(myWorkQuery)
  const sections = work.data?.sections.filter((s) => s.count > 0 || s.skipped) ?? []
  return (
    <div className="flex flex-col">
      <Hero brief={work.data?.brief} />
      <section className="mt-8 flex min-w-0 flex-col gap-2">
        <h2 className="m-0 text-[14px] font-semibold">{t(B.title)}</h2>
        {work.isPending ? (
          <GlassCard className="flex flex-col gap-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </GlassCard>
        ) : work.isError ? (
          <div
            role="alert"
            className="text-destructive-foreground flex items-center gap-3 text-[12.5px]"
          >
            <Icon icon={TriangleAlert} size={16} className="shrink-0" />
            <span className="flex-1">{t(C.loadFailed)}</span>
            <Button
              variant="ghost"
              size="sm"
              className="pointer-coarse:h-12"
              onClick={() => void work.refetch()}
            >
              {t(C.retry)}
            </Button>
          </div>
        ) : sections.length === 0 ? (
          <p className="text-muted-foreground m-0 text-[13px]">{t(B.empty)}</p>
        ) : (
          <GlassCard className="flex flex-col overflow-hidden py-1">
            {sections.map((s) =>
              s.skipped ? (
                <div
                  key={s.section}
                  className="flex min-h-12 items-center gap-3 px-4 py-2 text-[14px]"
                >
                  <span className="w-12 shrink-0" />
                  <span className="min-w-0 flex-1">{t(SECTION_LABEL[s.section])}</span>
                  <span className="text-glass-foreground shrink-0 text-[12.5px]">
                    {t(B.skipped)}
                  </span>
                </div>
              ) : (
                <WorkRow
                  key={s.section}
                  section={s.section}
                  count={s.count}
                  more={s.more}
                  convo={convo}
                />
              ),
            )}
          </GlassCard>
        )}
      </section>
    </div>
  )
}

export function PageHome({ convo }: { convo: Conversation }) {
  return <WorkList convo={convo} />
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
