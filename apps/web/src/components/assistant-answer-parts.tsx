import { useState } from 'react'
import { Button, CircleAlert, Copy, Icon, TriangleAlert } from '@pv/ui'
import { useI18n } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { ASSISTANT_COPY as C, ERROR_COPY, RETRYABLE, shownText } from '@/data/assistant-copy'
import type { AnswerView } from '@/data/assistant-thread'
import { ReportForm } from './assistant-report-form'

/** What the drawer's answer and the page's answer share: the props, the footer row with
 *  copy and report, the failure line and the quiet lines of an answer with nothing to show. */

export const TOUCH = 'pointer-coarse:h-12'
/** Copy and report: quiet icon buttons that keep their 48px reach on touch (law 13). */
const QUIET =
  'text-muted-foreground hover:text-foreground hover:bg-surface-ink/9 pointer-coarse:size-12 size-8 bg-transparent px-0 shadow-none'

export type AnswerProps = {
  answer: AnswerView
  /** Suggestion chips only under the newest answer. */
  last: boolean
  busy: boolean
  ask: (question: string) => void
  openPath: (path: string) => void
  /** Leaves the session: an unchecked answer stays unchecked for the rest of this chat. */
  onNewChat: () => void
}

function useCopy(answer: AnswerView) {
  const { t, lang } = useI18n()
  return () =>
    void navigator.clipboard.writeText(shownText(answer.body, lang)).then(
      () => toastDone(t(C.copied)),
      () => toastFail(t(C.copyFailed)),
    )
}

/** The line, then copy and report; the report form opens below as the next sibling. */
export function AnswerFooter({
  answer,
  reportable,
  line,
}: {
  answer: AnswerView
  reportable: boolean
  line: string
}) {
  const { t } = useI18n()
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)
  const copy = useCopy(answer)
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground flex min-w-0 flex-1 basis-48 text-[12px]">
          {line}
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
    </>
  )
}

/** The failure line with its retry. */
export function FailedAlert({ answer, ask, busy }: Pick<AnswerProps, 'answer' | 'ask' | 'busy'>) {
  const { t, lang } = useI18n()
  const failure = answer.failure
  /* The server's sentence is Vietnamese; another language reads the one keyed by code. */
  const text = failure
    ? lang === 'vi' && failure.message
      ? failure.message
      : t(ERROR_COPY[failure.code])
    : t(C.notAnswered)
  const retry = !failure || RETRYABLE.has(failure.code)
  return (
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
}

export function QuietLine({
  kind,
  onNewChat,
}: {
  kind: 'withheld' | 'unchecked' | 'stopped'
  onNewChat: () => void
}) {
  const { t } = useI18n()
  if (kind === 'unchecked') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground m-0 flex-1 text-[12.5px]">{t(C.unchecked)}</p>
        <Button variant="ghost" size="sm" className={TOUCH} onClick={onNewChat}>
          {t(C.newChat)}
        </Button>
      </div>
    )
  }
  return (
    <p className="text-muted-foreground m-0 text-[12.5px]">
      {t(kind === 'withheld' ? C.withheld : C.stopped)}
    </p>
  )
}
