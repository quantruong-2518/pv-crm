import { Kicker } from '../ui/separator'
import { StatusDot } from '../ui/status-dot'
import { cn } from '../lib/cn'

/** M-16 · FlowVector — the chain of PEOPLE who have held one object.
 *
 *  Not ContextRail (M-04) and not ApprovalChain (M-03). The rail draws a chain
 *  of OBJECTS (a deal, its contract, its work order) and rule 10 makes
 *  `E1.story()` its only legal input; this draws a chain of PEOPLE on ONE
 *  object. Two bars, two questions.
 *  ApprovalChain is the closest visual cousin, but its steps are a decision in
 *  flight held by E3 — these steps are custody that already happened.
 *
 *  ------------------------------------------------------------------
 *  THE SPINE: LEFT IS TRUTH, RIGHT IS LAW — AND THEY MUST NOT LOOK ALIKE
 *  ------------------------------------------------------------------
 *  `held`/`pool` steps come out of `sales.touch`: a real date, a real name, a
 *  `touchId` you can press. `upcoming` steps come out of the flow definition
 *  and know only a ROLE and a DEADLINE — no person, no date, because neither
 *  exists yet. The union is the fence: a future step has no field to put a
 *  date or a name in, so no screen can invent one. Same technique as
 *  `AiActionProps.basis` for rule 9 — the type refuses rather than a reviewer
 *  remembering.
 *
 *  The connector says it too: solid line behind what happened, dashed line in
 *  front of what is merely due.
 *
 *  ------------------------------------------------------------------
 *  THREE DEVICES
 *  ------------------------------------------------------------------
 *  Desktop and tablet run horizontally, mobile turns vertical with the current
 *  node anchored at the TOP — on a phone the answer to "who has it now" must
 *  not be a scroll away. Tablet is the site device, so every node is a ≥48px
 *  target; at 1024px only about three of them fit, which is why everything
 *  before the last three folds into one "steps before" node below `lg`. The
 *  folded nodes are the same markup, hidden — not a second list to keep in
 *  step with the first. */
export type FlowVectorStep =
  /** Somebody held it, starting at `at`. */
  | {
      kind: 'held'
      /** The `sales.touch` row this step was read off — the thing a press opens. */
      touchId: string
      holder: string
      actorId: string
      /** Already formatted for display: `@pv/ui` owns no locale and no clock. */
      at: string
      /** Long form for the tooltip, if the screen has one to give. */
      atFull?: string
      /** The role held THAT DAY. Absent until a row records it — an absent role
       *  prints nothing rather than borrowing the person's current one. */
      role?: string
    }
  /** Released back into the common pool: a dated fact with no holder. */
  | { kind: 'pool'; touchId: string; at: string; atFull?: string }
  /** Due next by the flow definition. Role and deadline, never a name or date. */
  | { kind: 'upcoming'; role: string; due: string }

export type FlowVectorProps = {
  /** `readonly` so a screen can hand in a shared frozen empty — see `NO_STEPS`
   *  in `data/touches.ts`. Nothing here writes to the array. */
  steps: readonly FlowVectorStep[]
  /** The reader's own actor id, so their step can say so. */
  you?: string
  /** Press a step that really happened. Absent, nothing is pressable. */
  onOpen?: (touchId: string) => void
  className?: string
}

/** How many trailing nodes survive the fold below `lg`. Three is what 1024px
 *  fits at a ≥48px target, per `docs/design-system/laws.md` §3. */
const KEPT = 3

function labelOf(step: FlowVectorStep): string {
  if (step.kind === 'held') return step.holder
  if (step.kind === 'pool') return 'Kho chung'
  return step.role
}

function Node({
  step,
  current,
  you,
  onOpen,
}: {
  step: FlowVectorStep
  current: boolean
  you?: string
  onOpen?: (touchId: string) => void
}) {
  const mine = step.kind === 'held' && step.actorId === you
  const dot = step.kind === 'upcoming' ? 'next' : current ? 'current' : 'ok'

  const body = (
    <>
      <span className="flex items-center gap-2">
        <StatusDot state={dot} />
        <span
          className={cn(
            'font-display whitespace-nowrap text-[13.5px] font-semibold',
            current ? 'text-accent-foreground' : 'text-foreground',
          )}
        >
          {labelOf(step)}
        </span>
      </span>

      {/* Role and date sit UNDER the name, both muted, because the name is what
          the eye scans for. `Kicker` rather than a second small-caps style —
          one tracking, one place, the note on `Timeline` says why. */}
      {step.kind === 'held' && step.role && <Kicker tone="muted">{step.role}</Kicker>}

      <span
        className="text-muted-foreground text-[10.5px]"
        title={step.kind === 'upcoming' ? undefined : step.atFull}
      >
        {step.kind === 'upcoming' ? step.due : current ? `từ ${step.at}` : step.at}
      </span>

      {mine && <span className="text-muted-foreground text-[10.5px]">· bạn</span>}
    </>
  )

  /* A pressable node only where there is a row to open. `min-h-12` is the 48px
     tablet target (rule 13); the same height is kept on the non-pressable node
     so folding one into the other does not move the row. */
  const shape =
    'flex min-h-12 min-w-0 flex-col items-start justify-center gap-1 rounded-sm px-2 py-1'

  if (step.kind !== 'upcoming' && onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(step.touchId)}
        aria-current={current ? 'step' : undefined}
        className={cn('motion-std hover:bg-white/8 cursor-pointer text-left', shape)}
      >
        {body}
      </button>
    )
  }

  return (
    <span aria-current={current ? 'step' : undefined} className={shape}>
      {body}
    </span>
  )
}

/** The line between two nodes. Dashed once the chain crosses from what happened
 *  into what is merely due — drawn with a gradient rather than a dashed BORDER,
 *  because the system is borderless (rule 4). */
function Link({ future, vertical }: { future: boolean; vertical?: boolean }) {
  const solid = vertical ? 'bg-white/14 h-4 w-px' : 'bg-white/14 h-[1.5px] w-6 shrink-0'
  const dashed = vertical
    ? 'h-4 w-px bg-[repeating-linear-gradient(180deg,rgb(255_255_255/0.14)_0_3px,transparent_3px_6px)]'
    : 'h-[1.5px] w-6 shrink-0 bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.14)_0_3px,transparent_3px_6px)]'

  return <span aria-hidden="true" className={future ? dashed : solid} />
}

export function FlowVector({ steps, you, onOpen, className }: FlowVectorProps) {
  /* The current holder is the LAST step that actually happened — derived, not
     passed, so a screen cannot mark one node current and leave another dated
     after it. */
  if (steps.length === 0) return null

  const lastReal = steps.map((s) => s.kind !== 'upcoming').lastIndexOf(true)
  /* The fold keeps the last `KEPT` nodes — but NEVER past the current holder.
     Counting from the end alone hides it the moment the right half is longer
     than the fold: two people held it and three steps are due, and "who has it
     now" is inside the folded range on exactly the device this component folds
     for. So the fold stops at `lastReal`, and a chain with a long right half
     shows more than `KEPT` nodes rather than the wrong ones. */
  const folded = Math.max(0, Math.min(steps.length - KEPT, lastReal))

  return (
    <div className={className}>
      {/* Desktop · tablet — horizontal */}
      <ol aria-label="Chuỗi người giữ" className="hidden flex-wrap items-center gap-1 sm:flex">
        {folded > 0 && (
          <li className="lg:hidden">
            <span className="text-muted-foreground flex min-h-12 items-center px-2 text-[12px]">
              {folded} bước trước
            </span>
          </li>
        )}
        {steps.map((step, i) => (
          <li key={keyOf(step, i)} className={cn('contents', i < folded && 'hidden lg:contents')}>
            {i > 0 && <Link future={step.kind === 'upcoming'} />}
            <Node step={step} current={i === lastReal} you={you} onOpen={onOpen} />
          </li>
        ))}
      </ol>

      {/* Mobile — vertical, newest first: "who has it now" is the top line. */}
      <ol aria-label="Chuỗi người giữ" className="flex flex-col items-start sm:hidden">
        {[...steps].reverse().map((step, i, all) => (
          <li key={keyOf(step, all.length - 1 - i)} className="contents">
            {i > 0 && <Link future={all[i - 1]?.kind === 'upcoming'} vertical />}
            <Node step={step} current={all.length - 1 - i === lastReal} you={you} onOpen={onOpen} />
          </li>
        ))}
      </ol>
    </div>
  )
}

/** An upcoming step has no id of its own — it is a rule, not a row. */
function keyOf(step: FlowVectorStep, i: number): string {
  return step.kind === 'upcoming' ? `${step.role}-${i}` : step.touchId
}
