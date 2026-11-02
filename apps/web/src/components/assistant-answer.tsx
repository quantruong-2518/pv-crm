import { useState } from 'react'
import {
  AiAction,
  ArrowRight,
  Button,
  Chip,
  CircleAlert,
  Copy,
  DataTable,
  GlassCard,
  Icon,
  Loader,
  MessageCircle,
  SegmentedControl,
  Textarea,
  TriangleAlert,
} from '@pv/ui'
import { AssistantReportBody, AssistantReportReason, type AssistantRef } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useI18n, type Lang } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { refPath, useReportMessage, useStopTurn } from '@/data/assistant'
import {
  ASSISTANT_COPY as C,
  ERROR_COPY,
  REASON_COPY,
  RETRYABLE,
  asOf,
  footerLine,
  openLabel,
  stepLabel,
  suggestionText,
  shownText,
} from '@/data/assistant-copy'
import type { AnswerView } from '@/data/assistant-thread'
import { AssistantAnswerText } from './assistant-answer-text'

/** One assistant answer in the conversation (ADR 0133): the wait line with
 *  a stop button while it runs, the refusal with a retry when it fails, and otherwise
 *  an AI block (law 9) whose button opens the first record it names.
 *
 *  Three records or more become a table under the block, on its own `.glass-b`
 *  (law 8): a table cannot sit on the AI wash. The answer itself reads in the
 *  screen's foreground ink (13:1 or more on the wash in every theme); labels and
 *  the basis keep the `--on-tint-*` inks (law 1). */

const TOUCH = 'pointer-coarse:h-12'
/** Lifts AiAction's own 40px buttons to 48px on touch (law 13), as `comm-ai-report.tsx` does. */
const BLOCK = 'wrap-break-word pointer-coarse:[&_button]:h-12'
const NOTE_MAX = AssistantReportBody.shape.note.unwrap().maxLength ?? undefined
/** Copy and report sit under the block as quiet text buttons, so the open button leads. */
const QUIET =
  'text-muted-foreground hover:text-foreground hover:bg-surface-ink/9 pointer-coarse:h-12 bg-transparent shadow-none'

type AnswerProps = {
  answer: AnswerView
  /** Suggestion chips only under the newest answer. */
  last: boolean
  busy: boolean
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
  const { answer } = props
  if (answer.state === 'running') return <Running answer={answer} />
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

function Running({ answer }: { answer: AnswerView }) {
  const { t, lang } = useI18n()
  const stop = useStopTurn()
  const id = answer.id
  const onStop = () => id && stop.mutate(id, { onError: () => toastFail(t(C.stopFailed)) })
  return (
    <div className="bg-accent flex flex-col gap-3 rounded-lg px-5 py-4">
      <div role="status" className="flex items-center gap-3">
        <Icon icon={Loader} size={16} className="text-accent-foreground shrink-0 animate-spin" />
        <span className="text-accent-foreground flex-1 text-[12.5px] font-semibold">
          {answer.live ? stepLabel(answer.step?.tool, lang) : stepLabel(undefined, lang)}
        </span>
        {id && (
          <Button
            variant="ghost"
            size="sm"
            className={TOUCH}
            disabled={stop.isPending}
            onClick={onStop}
          >
            {t(C.stop)}
          </Button>
        )}
      </div>
      {answer.body && (
        <p className="text-foreground m-0 whitespace-pre-line text-[13px] leading-[1.55]">
          {shownText(answer.body, lang)}
        </p>
      )}
    </div>
  )
}

function Failed({ answer, ask, busy, openPath }: AnswerProps) {
  const { t, lang } = useI18n()
  const failure = answer.failure
  /* The server's sentence is Vietnamese; another language reads the one keyed by code. */
  const text = failure
    ? lang === 'vi' && failure.message
      ? failure.message
      : t(ERROR_COPY[failure.code])
    : t(C.notAnswered)
  const retry = !failure || RETRYABLE.has(failure.code)
  const copy = () =>
    void navigator.clipboard.writeText(shownText(answer.body, lang)).then(
      () => toastDone(t(C.copied)),
      () => toastFail(t(C.copyFailed)),
    )
  return (
    <div className="flex flex-col gap-3">
      {/* What arrived before the break is still AI text, so it keeps its basis and a button (law 9). */}
      {answer.body && (
        <AiAction
          variant="panel"
          className={BLOCK}
          suggestion={
            <AssistantAnswerText
              text={shownText(answer.body, lang)}
              refs={answer.refs}
              openPath={openPath}
            />
          }
          basis={basisOf(answer, lang)}
          basisLabel={t(C.basisLabel)}
          empty={t(C.readOnly)}
          confirmLabel={t(C.copy)}
          onConfirm={copy}
        />
      )}
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
    </div>
  )
}

function Answered({ answer, last, busy, ask, openPath }: AnswerProps) {
  const { t, lang } = useI18n()
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)
  const first = answer.refs[0]
  const copy = () =>
    void navigator.clipboard.writeText(shownText(answer.body, lang)).then(
      () => toastDone(t(C.copied)),
      () => toastFail(t(C.copyFailed)),
    )
  const suggestions = last
    ? answer.suggestions.flatMap((s) => {
        const text = suggestionText(s, lang)
        return text ? [{ key: `${s.key}:${s.params.code ?? ''}`, ...text }] : []
      })
    : []

  return (
    <div className="flex flex-col gap-3">
      <AiAction
        variant="panel"
        className={BLOCK}
        title={t(C.aiLabel)}
        suggestion={
          <>
            <AssistantAnswerText
              text={shownText(answer.body, lang)}
              refs={answer.refs}
              openPath={openPath}
            />
            {answer.state === 'stopped' && (
              <span className="text-on-tint-primary-muted mt-2 block text-[11.5px]">
                {t(C.stopped)}
              </span>
            )}
            {answer.refs.length > 0 && answer.refs.length < 3 && (
              <span className="mt-4 flex flex-col gap-2">
                {answer.refs.map((ref) => (
                  <RefLink key={`${ref.kind}:${ref.code}`} refItem={ref} openPath={openPath} />
                ))}
              </span>
            )}
          </>
        }
        basis={basisOf(answer, lang)}
        basisLabel={t(C.basisLabel)}
        empty={t(C.readOnly)}
        confirmLabel={first ? openLabel(first.code, lang) : t(C.copy)}
        onConfirm={first ? () => openPath(refPath(first)) : copy}
      />
      {answer.refs.length >= 3 && <RefTable refs={answer.refs} openPath={openPath} />}
      <div className="flex flex-wrap items-center gap-1">
        {first && (
          <Button variant="ghost" size="sm" className={QUIET} onClick={copy}>
            <Icon icon={Copy} size={16} />
            {t(C.copy)}
          </Button>
        )}
        {answer.id && !reported && !reporting && (
          <Button variant="ghost" size="sm" className={QUIET} onClick={() => setReporting(true)}>
            <Icon icon={CircleAlert} size={16} />
            {t(C.report)}
          </Button>
        )}
        {reported && (
          <span className="text-muted-foreground px-3 text-[12px]">{t(C.reported)}</span>
        )}
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
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={busy}
              className="motion-std bg-accent text-accent-foreground hover:bg-primary/24 shadow-control-soft pointer-coarse:min-h-12 inline-flex min-h-10 items-center gap-2 rounded-md px-4 py-2 text-left text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => ask(s.question)}
            >
              <Icon icon={MessageCircle} size={16} className="shrink-0" />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** One or two records: a row each under the answer, code first, then what it is. */
function RefLink({
  refItem,
  openPath,
}: {
  refItem: AssistantRef
  openPath: (path: string) => void
}) {
  const [name, ...rest] = refItem.label.split(' · ')
  return (
    <button
      type="button"
      className="motion-std bg-card/70 hover:bg-card shadow-control-soft pointer-coarse:h-auto! group flex min-h-12 w-full min-w-0 items-center gap-3 rounded-md px-4 py-2 text-left"
      onClick={() => openPath(refPath(refItem))}
    >
      <Chip variant="source" className="bg-primary/16 shrink-0 font-semibold">
        {refItem.code}
      </Chip>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-foreground truncate text-[13px] font-semibold">{name}</span>
        {rest.length > 0 && (
          <span className="text-muted-foreground truncate text-[12px]">{rest.join(' · ')}</span>
        )}
      </span>
      <Icon
        icon={ArrowRight}
        size={16}
        className="text-on-tint-primary-muted group-hover:text-accent-foreground shrink-0"
      />
    </button>
  )
}

function RefTable({ refs, openPath }: { refs: AssistantRef[]; openPath: (path: string) => void }) {
  const { t } = useI18n()
  return (
    <GlassCard variant="b" className="overflow-hidden" aria-label={t(C.related)}>
      <DataTable
        flush
        columns={[
          { header: t(C.code), width: '128px' },
          { header: t(C.name), width: 'minmax(0,1fr)' },
        ]}
        rows={refs.map((ref) => {
          const [name, ...rest] = ref.label.split(' · ')
          return {
            id: `${ref.kind}:${ref.code}`,
            cells: [
              /* Not interactive: the whole row already opens the record. */
              <Chip key="code" variant="source" className="bg-primary/16 font-semibold">
                {ref.code}
              </Chip>,
              <span key="label" className="min-w-0 truncate text-[12.5px]">
                <span className="text-foreground font-semibold">{name}</span>
                {rest.length > 0 && (
                  <span className="text-muted-foreground"> · {rest.join(' · ')}</span>
                )}
              </span>,
            ],
            onOpen: () => openPath(refPath(ref)),
          }
        })}
      />
    </GlassCard>
  )
}

function ReportForm({
  messageId,
  onClose,
}: {
  messageId: string
  onClose: (sent: boolean) => void
}) {
  const { t } = useI18n()
  const [reason, setReason] = useState<AssistantReportReason | ''>('')
  const [note, setNote] = useState('')
  const report = useReportMessage()
  const send = () => {
    if (!reason) return
    report.mutate(
      { id: messageId, body: { reason, ...(note.trim() ? { note: note.trim() } : {}) } },
      { onSuccess: () => onClose(true), onError: (error) => toastFail(userMessage(error)) },
    )
  }

  return (
    <div className="bg-surface-ink/5 flex flex-col gap-3 rounded-lg p-4">
      <SegmentedControl
        label={t(C.report)}
        value={reason}
        size="sm"
        tone="quiet"
        className="pointer-coarse:[&_button]:min-h-12"
        options={AssistantReportReason.options.map((value) => ({
          value,
          label: t(REASON_COPY[value]),
        }))}
        onChange={(value) => setReason(AssistantReportReason.parse(value))}
      />
      <Textarea
        rows={2}
        autoGrow
        maxLength={NOTE_MAX}
        aria-label={t(C.reportNote)}
        placeholder={t(C.reportNote)}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className={TOUCH} disabled={!reason || report.isPending} onClick={send}>
          {t(C.reportSend)}
        </Button>
        <Button variant="ghost" size="sm" className={TOUCH} onClick={() => onClose(false)}>
          {t(C.cancel)}
        </Button>
      </div>
    </div>
  )
}
