import { Button, Check, Icon, Loader, Skeleton, StopCircle, cn } from '@pv/ui'
import { useI18n } from '@/app/i18n'
import { toastFail } from '@/app/toast'
import { useStopTurn } from '@/data/assistant'
import { ASSISTANT_COPY as C, doneStepLabel, shownText, stepLabel } from '@/data/assistant-copy'
import type { AnswerView } from '@/data/assistant-thread'
import { AiGlyph, BUBBLE } from './assistant-bits'

/** The bubble while an answer is being written: the steps so far with a check,
 *  the current one in bold with a spinner, then either the text as it streams
 *  or three bars standing for it. Stop is an icon on its own, named for readers. */

const ICON_BUTTON =
  'text-muted-foreground hover:text-foreground hover:bg-surface-ink/9 pointer-coarse:size-12 size-8 bg-transparent px-0 shadow-none'

export function RunningBubble({ answer, compact }: { answer: AnswerView; compact: boolean }) {
  const { t, lang } = useI18n()
  const stop = useStopTurn()
  const id = answer.id
  const onStop = () => id && stop.mutate(id, { onError: () => toastFail(t(C.stopFailed)) })
  /* Saved while still running, with no stream here: only the writing line is known. */
  const done = answer.live ? [...new Set(answer.past.map((tool) => doneStepLabel(tool, lang)))] : []
  const current = answer.live ? stepLabel(answer.step?.tool, lang) : stepLabel(undefined, lang)

  return (
    <article className={cn(BUBBLE, 'flex flex-col gap-3')}>
      <div className="flex items-center gap-2">
        {compact && <AiGlyph size={18} />}
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
      {id && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className={ICON_BUTTON}
            aria-label={t(C.stop)}
            title={t(C.stop)}
            disabled={stop.isPending}
            onClick={onStop}
          >
            <Icon icon={StopCircle} size={16} />
          </Button>
        </div>
      )}
    </article>
  )
}
