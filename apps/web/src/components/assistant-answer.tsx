import { useI18n } from '@/app/i18n'
import {
  ASSISTANT_COPY as C,
  sentenceStart,
  shownText,
  suggestionText,
} from '@/data/assistant-copy'
import { AssistantAnswerText } from './assistant-answer-text'
import { AnswerFooter, FailedAlert, QuietLine, type AnswerProps } from './assistant-answer-parts'
import { basisOf, quietKind } from './assistant-answer-model'
import { PanelAnswer } from './assistant-answer-panel'
import { ProposalCard } from './assistant-proposal-card'
import { RefTable } from './assistant-ref-card'
import { RunningLine } from './assistant-running'

/** One assistant answer in the conversation (ADR 0133). On the page (owner, 18/11) it is
 *  plain text on the background: no bubble, no mark, one dim line of evidence under it
 *  with copy and report, the proposal as the one `glass-ai` block, at most two follow-ups.
 *  The drawer keeps its bubble (`assistant-answer-panel.tsx`).
 *
 *  An answer proposes nothing by itself: law 9 binds only the proposal card, whose button
 *  is the only thing that writes. The records an answer names open in the page's record
 *  pane; three or more also list in a table under it (law 8). */

const FOLLOW_UPS = 2

export function AssistantAnswer(props: AnswerProps & { compact: boolean }) {
  if (props.compact) return <PanelAnswer {...props} />
  const { answer } = props
  if (answer.state === 'running') return <RunningLine answer={answer} />
  if (answer.state === 'failed') return <Failed {...props} />
  const quiet = quietKind(answer)
  if (quiet) return <QuietLine kind={quiet} onNewChat={props.onNewChat} />
  return <Answered {...props} />
}

function Failed({ answer, ask, busy, openPath }: AnswerProps) {
  const alert = <FailedAlert answer={answer} ask={ask} busy={busy} />
  /* What arrived before the break is still shown, with its evidence, and can be copied. */
  if (!answer.body) return alert
  return (
    <div className="flex flex-col gap-3">
      <Text answer={answer} openPath={openPath} reportable={false} />
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
    <div className="flex flex-col gap-4">
      <Text answer={answer} openPath={openPath} reportable />
      {answer.refs.length >= 3 && <RefTable refs={answer.refs} openPath={openPath} />}
      {answer.proposals.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} compact={false} />
      ))}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {suggestions.slice(0, FOLLOW_UPS).map((s) => (
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

/** The answer's words, then its evidence line with copy and report. */
function Text({
  answer,
  openPath,
  reportable,
}: Pick<AnswerProps, 'answer' | 'openPath'> & { reportable: boolean }) {
  const { t, lang } = useI18n()
  return (
    <div className="flex flex-col gap-2">
      <AssistantAnswerText
        text={shownText(answer.body, lang)}
        refs={answer.refs}
        openPath={openPath}
      />
      {answer.state === 'stopped' && (
        <span className="text-muted-foreground text-[12px]">{t(C.stopped)}</span>
      )}
      <AnswerFooter
        answer={answer}
        reportable={reportable}
        line={sentenceStart(basisOf(answer, lang))}
      />
    </div>
  )
}
