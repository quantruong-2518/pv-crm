import { useState, type ReactNode } from 'react'
import { Button, CircleAlert, Copy, FileText, Icon, TriangleAlert, cn } from '@pv/ui'
import { useI18n, type Lang } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import {
  ASSISTANT_COPY as C,
  ERROR_COPY,
  RETRYABLE,
  asOf,
  clock,
  footerLine,
  shownText,
  suggestionText,
} from '@/data/assistant-copy'
import type { AnswerView } from '@/data/assistant-thread'
import { AssistantAnswerText } from './assistant-answer-text'
import { AiGlyph, BUBBLE } from './assistant-bits'
import { RefCard, RefTable } from './assistant-ref-card'
import { ReportForm } from './assistant-report-form'
import { RunningBubble } from './assistant-running'

/** One assistant answer in the conversation (ADR 0133), as the owner's
 *  03/11 design draws it: the steps with a stop icon while it runs, the refusal
 *  with a retry when it fails, and otherwise a read-only bubble.
 *
 *  The bubble is not an AI block: an answer proposes nothing, so law 9 (wait for
 *  a button) does not apply and there is no confirm button; the code chip and the
 *  record card already open the record (owner, 03/11). It still prints its basis.
 *  Three records or more become a table under the bubble (law 8). */

const TOUCH = 'pointer-coarse:h-12'
/** Copy and report: quiet icon buttons that keep their 48px reach on touch (law 13). */
const QUIET =
  'text-muted-foreground hover:text-foreground hover:bg-surface-ink/9 pointer-coarse:size-12 size-8 bg-transparent px-0 shadow-none'

type AnswerProps = {
  answer: AnswerView
  /** Suggestion chips only under the newest answer. */
  last: boolean
  busy: boolean
  /** The panel is narrow: the AI mark moves inside the bubble. */
  compact: boolean
  ask: (question: string) => void
  openPath: (path: string) => void
  /** Leaves the session: an unchecked answer stays unchecked for the rest of this chat. */
  onNewChat: () => void
}

/** The turn's footer, live or saved; a row with none (a stopped turn) still dates its figures.
 *  Lower case in both, because it follows the basis label. */
const basisOf = (answer: AnswerView, lang: Lang) =>
  answer.footer ? footerLine(answer.footer, lang) : asOf(answer.at, lang)

export function AssistantAnswer(props: AnswerProps) {
  const { t } = useI18n()
  const { answer, compact } = props
  if (answer.state === 'running') {
    return (
      <Row compact={compact}>
        <RunningBubble answer={answer} compact={compact} />
      </Row>
    )
  }
  if (answer.state === 'failed') return <Failed {...props} />
  if (answer.withheld)
    return <p className="text-muted-foreground m-0 text-[12.5px]">{t(C.withheld)}</p>
  if (answer.unchecked) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground m-0 flex-1 text-[12.5px]">{t(C.unchecked)}</p>
        <Button variant="ghost" size="sm" className={TOUCH} onClick={props.onNewChat}>
          {t(C.newChat)}
        </Button>
      </div>
    )
  }
  if (!answer.body) return <p className="text-muted-foreground m-0 text-[12.5px]">{t(C.stopped)}</p>
  return <Answered {...props} />
}

/** The page puts the mark beside the bubble; the panel has no room and draws it in the bubble. */
function Row({ compact, children }: { compact: boolean; children: ReactNode }) {
  if (compact) return <div className="flex flex-col gap-3">{children}</div>
  return (
    <div className="flex items-start gap-3">
      <AiGlyph className="mt-1" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">{children}</div>
    </div>
  )
}

function useCopy(answer: AnswerView) {
  const { t, lang } = useI18n()
  return () =>
    void navigator.clipboard.writeText(shownText(answer.body, lang)).then(
      () => toastDone(t(C.copied)),
      () => toastFail(t(C.copyFailed)),
    )
}

function Failed({ answer, ask, busy, openPath, compact, last }: AnswerProps) {
  const { t, lang } = useI18n()
  const failure = answer.failure
  /* The server's sentence is Vietnamese; another language reads the one keyed by code. */
  const text = failure
    ? lang === 'vi' && failure.message
      ? failure.message
      : t(ERROR_COPY[failure.code])
    : t(C.notAnswered)
  const retry = !failure || RETRYABLE.has(failure.code)
  const alert = (
    <div
      role="alert"
      className="text-destructive-foreground flex flex-wrap items-center gap-3 text-[12.5px]"
    >
      <Icon icon={TriangleAlert} size={16} className="shrink-0" />
      <span className="flex-1">{text}</span>
      {retry && answer.question && (
        <Button
          variant="ghost"
          size="sm"
          className={TOUCH}
          disabled={busy}
          onClick={() => ask(answer.question)}
        >
          {t(C.retry)}
        </Button>
      )}
    </div>
  )
  /* What arrived before the break is still shown, with its basis, and can be copied. */
  if (!answer.body) return alert
  return (
    <Row compact={compact}>
      <AnswerBubble
        answer={answer}
        compact={compact}
        openPath={openPath}
        reportable={false}
        latest={last}
      />
      {alert}
    </Row>
  )
}

function Answered({ answer, last, busy, ask, openPath, compact }: AnswerProps) {
  const { t, lang } = useI18n()
  const suggestions = last
    ? answer.suggestions.flatMap((s) => {
        const text = suggestionText(s, lang)
        return text ? [{ key: `${s.key}:${s.params.code ?? ''}`, ...text }] : []
      })
    : []

  return (
    <Row compact={compact}>
      <AnswerBubble
        answer={answer}
        compact={compact}
        openPath={openPath}
        reportable
        latest={last}
      />
      {answer.refs.length >= 3 && <RefTable refs={answer.refs} openPath={openPath} />}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {!compact && (
            <span className="text-muted-foreground mr-1 text-[12px] font-semibold">
              {t(C.askNext)}
            </span>
          )}
          {suggestions.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={busy}
              className="motion-std bg-muted stone:bg-card porcelain:bg-card text-foreground shadow-control hover:bg-accent hover:text-accent-foreground pointer-coarse:min-h-12 inline-flex min-h-9 items-center rounded-[10px] px-4 text-left text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => ask(s.question)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </Row>
  )
}

function AnswerBubble({
  answer,
  compact,
  openPath,
  reportable,
  latest,
}: {
  answer: AnswerView
  compact: boolean
  openPath: (path: string) => void
  reportable: boolean
  /** Newest answer of the thread: only its cards read facts. */
  latest: boolean
}) {
  const { t, lang } = useI18n()
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)
  const copy = useCopy(answer)
  const cards = answer.refs.length < 3 ? answer.refs : []

  return (
    <article className={cn(BUBBLE, 'flex flex-col gap-3')}>
      <div className="flex items-center gap-2">
        {compact && <AiGlyph size={18} />}
        <span className="text-accent-foreground text-[13px] font-semibold">{t(C.aiLabel)}</span>
        <span className="text-muted-foreground tnum text-[12px]">· {clock(answer.at, lang)}</span>
      </div>
      <AssistantAnswerText
        text={shownText(answer.body, lang)}
        refs={answer.refs}
        openPath={openPath}
      />
      {answer.state === 'stopped' && (
        <span className="text-muted-foreground text-[12px]">{t(C.stopped)}</span>
      )}
      {cards.map((ref) => (
        <RefCard key={`${ref.kind}:${ref.code}`} refItem={ref} openPath={openPath} facts={latest} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground flex min-w-0 flex-1 basis-48 items-center gap-2 text-[12px]">
          <Icon icon={FileText} size={14} />
          {t(C.basisLabel)}: {basisOf(answer, lang)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className={QUIET}
          aria-label={t(C.copy)}
          title={t(C.copy)}
          onClick={copy}
        >
          <Icon icon={Copy} size={16} />
        </Button>
        {reportable && answer.id && !reported && !reporting && (
          <Button
            variant="ghost"
            size="sm"
            className={QUIET}
            aria-label={t(C.report)}
            title={t(C.report)}
            onClick={() => setReporting(true)}
          >
            <Icon icon={CircleAlert} size={16} />
          </Button>
        )}
        {reported && <span className="text-muted-foreground text-[12px]">{t(C.reported)}</span>}
      </div>
      {answer.id && reporting && (
        <ReportForm
          messageId={answer.id}
          onClose={(sent) => {
            setReporting(false)
            setReported(sent)
          }}
        />
      )}
    </article>
  )
}
