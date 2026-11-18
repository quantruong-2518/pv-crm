import { cn } from '@pv/ui'
import { useI18n } from '@/app/i18n'
import { ASSISTANT_COPY as C, shownText, suggestionText } from '@/data/assistant-copy'
import type { AnswerView } from '@/data/assistant-thread'
import { AssistantAnswerText } from './assistant-answer-text'
import { AnswerFooter, FailedAlert, QuietLine, type AnswerProps } from './assistant-answer-parts'
import { basisOf, quietKind } from './assistant-answer-model'
import { AiGlyph, BUBBLE } from './assistant-bits'
import { ProposalCard } from './assistant-proposal-card'
import { RefCard, RefTable } from './assistant-ref-card'
import { RunningBubble } from './assistant-running'

/** One assistant answer in the narrow drawer, as the owner's 03/11 design draws it: a
 *  read-only bubble with the mark inside, steps listed while it runs. The page draws
 *  its answers plain (`assistant-answer.tsx`); this file keeps the drawer as it was.
 *
 *  The bubble is not an AI block: an answer proposes nothing, so law 9 does not apply
 *  and it has no confirm button; the code chip and the record card open the record.
 *  Three records or more become a table under the bubble (law 8). */

export function PanelAnswer(props: AnswerProps) {
  const { answer } = props
  if (answer.state === 'running') {
    return (
      <div className="flex flex-col gap-3">
        <RunningBubble answer={answer} />
      </div>
    )
  }
  if (answer.state === 'failed') return <Failed {...props} />
  const quiet = quietKind(answer)
  if (quiet) return <QuietLine kind={quiet} onNewChat={props.onNewChat} />
  return <Answered {...props} />
}

function Failed({ answer, ask, busy, openPath, last }: AnswerProps) {
  const alert = <FailedAlert answer={answer} ask={ask} busy={busy} />
  /* What arrived before the break is still shown, with its basis, and can be copied. */
  if (!answer.body) return alert
  return (
    <div className="flex flex-col gap-3">
      <AnswerBubble answer={answer} openPath={openPath} reportable={false} latest={last} />
      {alert}
    </div>
  )
}

function Answered({ answer, last, busy, ask, openPath }: AnswerProps) {
  const { lang } = useI18n()
  const suggestions = last
    ? answer.suggestions.flatMap((s) => {
        const text = suggestionText(s, lang)
        return text ? [{ key: `${s.key}:${s.params.code ?? ''}`, ...text }] : []
      })
    : []

  return (
    <div className="flex flex-col gap-3">
      <AnswerBubble answer={answer} openPath={openPath} reportable latest={last} />
      {answer.refs.length >= 3 && <RefTable refs={answer.refs} openPath={openPath} />}
      {answer.proposals.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} compact />
      ))}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
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
    </div>
  )
}

function AnswerBubble({
  answer,
  openPath,
  reportable,
  latest,
}: {
  answer: AnswerView
  openPath: (path: string) => void
  reportable: boolean
  /** Newest answer of the thread: only its cards read facts. */
  latest: boolean
}) {
  const { t, lang } = useI18n()
  const cards = answer.refs.length < 3 ? answer.refs : []

  return (
    <article className={cn(BUBBLE, 'flex flex-col gap-3')}>
      <div className="flex items-center gap-2">
        <AiGlyph size={18} />
        <span className="text-accent-foreground text-[13px] font-semibold">{t(C.aiLabel)}</span>
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
      <AnswerFooter
        answer={answer}
        reportable={reportable}
        line={`${t(C.basisLabel)}: ${basisOf(answer, lang)}`}
      />
    </article>
  )
}
