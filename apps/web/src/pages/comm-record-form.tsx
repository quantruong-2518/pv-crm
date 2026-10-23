import type { ReactNode } from 'react'
import { cn } from '@pv/ui'
import type { DebriefView } from '@pv/contracts'
import { CommStepper, type CommStepState } from '@/components/comm-record-frame'
import { CommTurns } from '@/components/comm-turns'
import type { CommForm } from '@/data/comm-record-form'
import { ContentStep, EvaluationStep, NextStepStep } from './comm-record-fill-steps'

/** The body and the sticky bar of a comm's three-step form, drawn alike for
 *  the owner's first fill (`CommFillWorkspace`) and the later edit
 *  (`CommEditWorkspace`). The stepper jumps anywhere; one card shows at a time. */

export type FormProblem = { text: string; failed?: boolean } | null

export function CommFormSteps({
  record,
  form,
  gaps,
  stepCard,
  fileNote,
}: {
  record: DebriefView
  form: CommForm
  /** One gap per step, in the order of `form.titles`; null = complete. */
  gaps: readonly (string | null)[]
  /** Replaces the default next-step card. */
  stepCard?: ReactNode
  fileNote?: string
}) {
  const { titles, at, close } = form
  const states = titles.map<CommStepState>((_, i) =>
    i === at ? 'current' : gaps[i] === null ? 'done' : 'todo',
  )
  return (
    <>
      <CommStepper labels={titles} states={states} onGo={form.go} />
      {at === 0 && <CommTurns threadId={record.threadId} />}
      {at === 0 && (
        <ContentStep
          record={record}
          heading={titles[0]}
          title={form.titled ? form.title : null}
          summary={form.summary}
          onTitle={form.setTitle}
          onSummary={form.setSummary}
          fileNote={fileNote}
        />
      )}
      {at === 1 && (
        <EvaluationStep
          heading={titles[1]}
          vocab={form.vocab}
          picked={form.picked}
          onPick={form.setPicked}
          close={close}
        />
      )}
      {at === 2 &&
        (stepCard ?? (
          <NextStepStep
            record={record}
            heading={titles[2]}
            kinds={form.vocab.data?.stepKinds ?? []}
            close={close}
            draft={form.draft}
            onDraft={form.setDraft}
          />
        ))}
    </>
  )
}

/** Sticky under the open card: what is still missing, then the buttons.
 *  Lifted over the bottom nav on a phone; on a laptop narrow enough that the
 *  column meets the assistant button, it stops short of it. */
export function CommFormBar({ problem, children }: { problem: FormProblem; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label="Thao tác liên hệ"
      className="glass-overlay sticky bottom-[calc(84px+env(safe-area-inset-bottom)+12px)] z-20 flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 lg:bottom-6 lg:max-xl:w-[calc(100%-72px)]"
    >
      <div className="flex min-w-0 flex-1 basis-64 flex-col">
        {problem && (
          <strong
            role={problem.failed ? 'alert' : undefined}
            className={cn(
              'text-[13px] font-semibold leading-[1.5]',
              problem.failed ? 'text-destructive-foreground' : 'text-warning',
            )}
          >
            {problem.text}
          </strong>
        )}
      </div>
      {children}
    </div>
  )
}

/** The bar's buttons reach 48px on a touch screen (law 13). */
export const BAR_BUTTON = 'pointer-coarse:h-12'
