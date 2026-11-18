import { Button, Check, Icon, Loader, Skeleton, StopCircle, cn } from '@pv/ui'
import { useI18n } from '@/app/i18n'
import { toastFail } from '@/app/toast'
import { useStopTurn } from '@/data/assistant'
import { ASSISTANT_COPY as C, doneStepLabel, shownText, stepLabel } from '@/data/assistant-copy'
import type { AnswerView } from '@/data/assistant-thread'
import { AiGlyph, BUBBLE } from './assistant-bits'

/** While an answer is written. The drawer's bubble lists the steps so far with a
 *  check, the current one in bold with a spinner, then the text as it streams or three
 *  bars. The page shows one line whose words swap in place (no growing list), then
 *  the streamed text. Stop is an icon on its own, named for readers. */

const ICON_BUTTON =
  'text-muted-foreground hover:text-foreground hover:bg-surface-ink/9 pointer-coarse:size-12 size-8 bg-transparent px-0 shadow-none'

function useStop(answer: AnswerView) {
  const { t } = useI18n()
  const stop = useStopTurn()
  const id = answer.id
  const onStop = () => id && stop.mutate(id, { onError: () => toastFail(t(C.stopFailed)) })
  return { id, pending: stop.isPending, onStop }
}

function StopButton({ answer }: { answer: AnswerView }) {
  const { t } = useI18n()
  const { id, pending, onStop } = useStop(answer)
  if (!id) return null
  return (
    <Button
      variant="ghost"
      size="sm"
      className={ICON_BUTTON}
      aria-label={t(C.stop)}
      title={t(C.stop)}
      disabled={pending}
      onClick={onStop}
    >
      <Icon icon={StopCircle} size={16} />
    </Button>
  )
}

/** The page's running answer: the current step on one line, then whatever text has arrived. */
export function RunningLine({ answer }: { answer: AnswerView }) {
  const { lang } = useI18n()
  const current = answer.live ? stepLabel(answer.step?.tool, lang) : stepLabel(undefined, lang)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Icon icon={Loader} size={16} className="text-primary shrink-0 animate-spin" />
        <span role="status" className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]">
          {current}
        </span>
        <StopButton answer={answer} />
      </div>
      {answer.body && (
        <p className="text-foreground m-0 whitespace-pre-line text-[14px] leading-[1.65]">
          {shownText(answer.body, lang)}
        </p>
      )}
    </div>
  )
}

export function RunningBubble({ answer }: { answer: AnswerView }) {
  const { lang } = useI18n()
  /* Saved while still running, with no stream here: only the writing line is known. */
  const done = answer.live ? [...new Set(answer.past.map((tool) => doneStepLabel(tool, lang)))] : []
  const current = answer.live ? stepLabel(answer.step?.tool, lang) : stepLabel(undefined, lang)

  return (
    <article className={cn(BUBBLE, 'flex flex-col gap-3')}>
      <div className="flex items-center gap-2">
        <AiGlyph size={18} />
        <ol role="status" className="m-0 flex flex-1 list-none flex-col gap-2 p-0 text-[13px]">
          {done.map((label) => (
            <li key={label} className="text-muted-foreground flex items-center gap-2">
              <Icon icon={Check} size={16} className="text-on-tint-success" />
              {label}
            </li>
          ))}
          <li className="text-foreground flex items-center gap-2 font-semibold">
            <Icon icon={Loader} size={16} className="text-primary animate-spin" />
            {current}
          </li>
        </ol>
      </div>
      {answer.body ? (
        <p className="text-foreground m-0 whitespace-pre-line text-[14px] leading-[1.65]">
          {shownText(answer.body, lang)}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Skeleton height={10} width="92%" />
          <Skeleton height={10} width="78%" delay={200} />
          <Skeleton height={10} width="54%" delay={400} />
        </div>
      )}
      {answer.id && (
        <div>
          <StopButton answer={answer} />
        </div>
      )}
    </article>
  )
}
