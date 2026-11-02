import { useState } from 'react'
import {
  AiAction,
  Button,
  Chip,
  DataTable,
  GlassCard,
  Icon,
  Loader,
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

/** One assistant answer in the conversation (ADR 0133): the wait line with
 *  a stop button while it runs, the refusal with a retry when it fails, and otherwise
 *  an AI block (law 9) whose button opens the first record it names.
 *
 *  Three records or more become a table under the block, on its own `.glass-b`
 *  (law 8): a table cannot sit on the AI wash. Text inside the block uses the
 *  `--on-tint-*` inks (law 1). */

const TOUCH = 'pointer-coarse:h-12'
/** Lifts AiAction's own 40px buttons to 48px on touch (law 13), as `comm-ai-report.tsx` does. */
const BLOCK = 'wrap-break-word pointer-coarse:[&_button]:h-12'
const NOTE_MAX = AssistantReportBody.shape.note.unwrap().maxLength ?? undefined

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
    <div className="bg-surface-ink/5 flex flex-col gap-3 rounded-lg px-5 py-4">
      <div role="status" className="flex items-center gap-3">
        <Icon icon={Loader} size={16} className="text-muted-foreground shrink-0 animate-spin" />
        <span className="text-muted-foreground flex-1 text-[12.5px]">
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

function Failed({ answer, ask, busy }: AnswerProps) {
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
            <span className="block whitespace-pre-line">{shownText(answer.body, lang)}</span>
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

  return (
    <div className="flex flex-col gap-3">
      <AiAction
        variant="panel"
        className={BLOCK}
        suggestion={
          <>
            <span className="text-on-tint-primary-muted mb-2 block text-[11.5px] font-semibold">
              {t(C.aiLabel)}
            </span>
            <span className="block whitespace-pre-line">{shownText(answer.body, lang)}</span>
            {answer.state === 'stopped' && (
              <span className="text-on-tint-primary-muted mt-2 block text-[11.5px]">
                {t(C.stopped)}
              </span>
            )}
            {answer.refs.length > 0 && answer.refs.length < 3 && (
              <span className="mt-3 flex flex-wrap gap-2">
                {answer.refs.map((ref) => (
                  <RefChip key={`${ref.kind}:${ref.code}`} refItem={ref} openPath={openPath} />
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
        onInspect={first ? copy : undefined}
        inspectLabel={t(C.copy)}
      />
      {answer.refs.length >= 3 && <RefTable refs={answer.refs} openPath={openPath} />}
      <div className="flex flex-wrap items-center gap-2">
        {last &&
          answer.suggestions.map((s) => {
            const text = suggestionText(s, lang)
            return (
              text && (
                <Button
                  key={`${s.key}:${s.params.code ?? ''}`}
                  variant="secondary"
                  size="sm"
                  className="pointer-coarse:min-h-12 h-auto min-h-10 whitespace-normal py-2 text-left"
                  disabled={busy}
                  onClick={() => ask(text.question)}
                >
                  {text.label}
                </Button>
              )
            )
          })}
        {answer.id && !reported && !reporting && (
          <Button variant="ghost" size="sm" className={TOUCH} onClick={() => setReporting(true)}>
            {t(C.report)}
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
    </div>
  )
}

function RefChip({
  refItem,
  openPath,
}: {
  refItem: AssistantRef
  openPath: (path: string) => void
}) {
  return (
    /* `object`: azure marks only the record the screen is about (law 10). `h-auto!` keeps
       the block's 48px button rule off the chip, whose own pseudo-element pads the touch area. */
    <Chip
      variant="object"
      className="pointer-coarse:h-auto! max-w-full gap-2"
      onOpen={() => openPath(refPath(refItem))}
    >
      <span>{refItem.code}</span>
      <span className="min-w-0 truncate font-sans">{refItem.label}</span>
    </Chip>
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
        rows={refs.map((ref) => ({
          id: `${ref.kind}:${ref.code}`,
          cells: [
            <span key="code" className="font-mono text-[12px]">
              {ref.code}
            </span>,
            <span key="label" className="truncate text-[12.5px]">
              {ref.label}
            </span>,
          ],
          onOpen: () => openPath(refPath(ref)),
        }))}
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
