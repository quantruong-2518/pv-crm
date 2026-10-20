import { useId, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Check, ChevronLeft, ContextRail, GlassCard, Icon, ScreenLayout, cn } from '@pv/ui'
import type { DebriefView } from '@pv/contracts'
import { COMMS_CHANNEL_ICON, COMMS_CHANNEL_LABEL } from '@/data/comms'
import { commStepAnchor, subjectKindLabel, subjectPath } from '@/data/comm-record-detail'
import { CommStateBadge } from './comm-bits'

/** The one-column frame of `/comms/:id`: the way back to the subject, the
 *  channel tile, the title with the state pill and a time line, then the cards.
 *  No side rail — the record is read top to bottom, step by step.
 *
 *  The subject's code chip in the back row is the screen's ContextRail
 *  (law 10): a record mints no code of its own, so its story is its subject. */

export function CommRecordFrame({
  record,
  title,
  meta,
  caption,
  actions,
  note,
  noteId,
  noteFailed = false,
  bar,
  subjectInTitle = false,
  children,
}: {
  record: DebriefView
  title: ReactNode
  /** The title already is the subject's label, so the back row drops it. */
  subjectInTitle?: boolean
  /** The time line right of the state pill. */
  meta?: ReactNode
  caption?: ReactNode
  /** The record's own moves, 48px buttons. */
  actions?: ReactNode
  /** Why a move is shut, under the header. */
  note?: string | null
  noteId?: string
  noteFailed?: boolean
  /** The sticky bar of the fill form. */
  bar?: ReactNode
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <ScreenLayout className="mx-auto max-w-[960px]">
      <header className="flex min-w-0 flex-col gap-4" aria-labelledby={titleId}>
        <BackRow record={record} withLabel={!subjectInTitle} />
        <div className="flex min-w-0 flex-wrap items-start gap-4">
          <span
            role="img"
            aria-label={COMMS_CHANNEL_LABEL[record.channel]}
            className="bg-accent text-accent-foreground flex size-12 shrink-0 items-center justify-center rounded-lg"
          >
            <Icon icon={COMMS_CHANNEL_ICON[record.channel]} size={20} />
          </span>
          <div className="flex min-w-0 flex-1 basis-80 flex-col gap-2">
            <h1
              id={titleId}
              className="font-display m-0 break-words text-[26px] font-semibold leading-[1.3] lg:text-[28px]"
            >
              {title}
            </h1>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] leading-[1.5]">
              <CommStateBadge state={record.state} />
              {meta}
            </div>
            {caption && <p className="text-muted-foreground m-0 text-[12px]">{caption}</p>}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2 empty:hidden">{actions}</div>
          )}
        </div>
        {note && (
          <p
            id={noteId}
            className={cn(
              noteFailed ? 'text-destructive-foreground' : 'text-muted-foreground',
              'm-0 text-[12.5px] leading-[1.6]',
            )}
          >
            {note}
          </p>
        )}
      </header>
      {children}
      {bar}
    </ScreenLayout>
  )
}

function BackRow({ record, withLabel }: { record: DebriefView; withLabel: boolean }) {
  const navigate = useNavigate()
  const { code, label } = record.subject
  const path = subjectPath(code)
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        className="pointer-coarse:h-12"
        onClick={() => (path ? navigate(path) : navigate(-1))}
      >
        <Icon icon={ChevronLeft} size={16} />
        Quay lại {subjectKindLabel(code).toLowerCase()}
      </Button>
      <ContextRail
        objects={[{ code, source: true, ...(path ? { onOpen: () => navigate(path) } : {}) }]}
      />
      {withLabel && (
        <span className="text-muted-foreground min-w-0 truncate text-[13px]">{label}</span>
      )}
    </div>
  )
}

export type CommStepState = 'current' | 'done' | 'todo'

/** Numbered squares joined by a line. The fill form jumps with `onGo`; the
 *  read view links to each card instead. Under `md` only the open step keeps
 *  its label — three labels do not fit a phone row. */
export function CommStepper({
  labels,
  states,
  onGo,
}: {
  labels: readonly string[]
  states: readonly CommStepState[]
  onGo?: (index: number) => void
}) {
  return (
    <GlassCard className="px-4 py-4 sm:px-6">
      <nav aria-label="Các bước">
        <ol className="m-0 flex list-none items-center gap-3 p-0">
          {labels.map((label, i) => {
            const state = states[i] ?? 'todo'
            const body = (
              <>
                <span
                  className={cn(
                    'tnum flex size-8 shrink-0 items-center justify-center rounded-md text-[13px] font-semibold',
                    /* The strong ramp: white on plain primary is 4.46:1 on Aurora (law 13). */
                    state === 'current' && 'bg-primary-strong text-primary-foreground',
                    state === 'done' && 'bg-success/20 text-on-tint-success',
                    state === 'todo' && 'bg-surface-ink/9 text-muted-foreground',
                  )}
                >
                  {state === 'done' ? <Icon icon={Check} size={16} /> : i + 1}
                </span>
                <span
                  className={cn(
                    'min-w-0 truncate text-[13px]',
                    state === 'todo' ? 'text-muted-foreground font-medium' : 'font-semibold',
                    state !== 'current' && 'hidden md:inline',
                  )}
                >
                  {label}
                </span>
              </>
            )
            const control =
              'motion-std pointer-coarse:min-h-12 pointer-coarse:min-w-12 text-foreground flex min-w-0 items-center justify-center gap-3 rounded-md text-left no-underline md:justify-start'
            return (
              <li
                key={label}
                aria-current={state === 'current' ? 'step' : undefined}
                className={cn('flex min-w-0 items-center gap-3', i > 0 && 'flex-1')}
              >
                {i > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      'h-0.5 min-w-4 flex-1',
                      state === 'todo' ? 'bg-surface-ink/16' : 'bg-success',
                    )}
                  />
                )}
                {onGo ? (
                  <button type="button" className={control} onClick={() => onGo(i)}>
                    {body}
                  </button>
                ) : (
                  <a href={`#${commStepAnchor(i)}`} className={control}>
                    {body}
                  </a>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
    </GlassCard>
  )
}

/** One step's card: its title, then the body. Which step it is and whether it
 *  is done are the stepper's to say, not repeated here. */
export function CommStepCard({
  index,
  title,
  anchored = false,
  children,
}: {
  /** 0-based. */
  index: number
  title: string
  /** Carries the id the read stepper links to. */
  anchored?: boolean
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <GlassCard
      role="region"
      aria-labelledby={titleId}
      id={anchored ? commStepAnchor(index) : undefined}
      className="flex min-w-0 scroll-mt-24 flex-col gap-6 p-5 sm:p-6"
    >
      <h2 id={titleId} className="m-0 text-[18px] font-semibold leading-[1.45]">
        {title}
      </h2>
      {children}
    </GlassCard>
  )
}
