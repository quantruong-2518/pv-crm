import { cn } from '../lib/cn'

/** M-15 · StageTrack — the five columns of a pipeline as one bar, coloured by
 *  where the deal stands: walked = success, standing here = primary, not yet =
 *  muted.
 *
 *  ------------------------------------------------------------------
 *  NOT `Stepper`, AND THE DIFFERENCE IS NOT COSMETIC
 *  ------------------------------------------------------------------
 *  `Stepper` (M-14) walks a FORM: its steps are clickable, it owns a "furthest
 *  reached" high-water mark so a user can step back without losing the way
 *  forward, and on a narrow screen it collapses to one "step n of N" line
 *  because a form has exactly one thing to say at a time. None of that is true
 *  of a deal. A column is not navigation — nobody walks a deal back to an
 *  earlier column by pressing it, and the only door that moves one is
 *  `PATCH /:code/stage`. Bending the stepper to fit would mean a component
 *  clickable in one place and inert in another, worse than two components.
 *
 *  ------------------------------------------------------------------
 *  "WALKED" MEANS POSITION, NOT THE VISITED SET — SAY IT OUT LOUD
 *  ------------------------------------------------------------------
 *  A green segment here means "the deal is past this column", not "the deal
 *  stood in this column". Those differ: a deal dragged from the first column
 *  straight to the last never stood in the three between, and this bar still
 *  paints them green.
 *
 *  That is deliberate, because the alternative is worse in the place it
 *  matters. The book grid holds one column per deal and no history, so a bar
 *  fed by the visited set would be honest on the profile and guesswork in the
 *  grid — the same picture meaning two things two screens apart. One rule, one
 *  meaning: this bar answers "how far has it got". WHICH columns it actually
 *  stood in is a different question with a different answer on screen — the
 *  stage-history list, which sits directly under this bar on the profile and
 *  names every move including the skips.
 *
 *  ------------------------------------------------------------------
 *  A DEAL OFF THE BOARD HAS NO TRACK
 *  ------------------------------------------------------------------
 *  `current` is a plain index, not `number | null`. Signed or lost means the
 *  deal stands in no column at all, and drawing a five-segment bar for it would
 *  invent a position it does not have. Callers render something else for those
 *  — the profile shows a read-only pill, the grid its state badge.
 *
 *  Rule 13: colour is never the only carrier. Every segment holds a `title`
 *  naming its column, and the whole bar carries an `aria-label` reading
 *  position and column name for anyone who never sees the colours at all. */
export type StageTrackStep = {
  key: string
  label: string
  /** Second line under the caption when this is the standing column — days
   *  spent here, the column's limit. Ignored for every other step. */
  hint?: string
}

export type StageTrackProps = {
  steps: StageTrackStep[]
  /** Index of the column the deal stands in, 0-based. */
  current: number
  /** Print the standing column's name (and `hint`) under the bar. Off in a
   *  table cell, where the row is 48px and the name is already in the badge
   *  beside it. */
  caption?: boolean
  className?: string
}

const SEGMENT = {
  done: 'bg-success',
  current: 'bg-primary',
  upcoming: 'bg-white/24',
} as const

export function StageTrack({ steps, current, caption = false, className }: StageTrackProps) {
  const here = steps[current]

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={
          here
            ? `Cột ${current + 1}/${steps.length} · ${here.label}`
            : `Cột ${current + 1}/${steps.length}`
        }
        className="flex items-center gap-1"
      >
        {steps.map((step, i) => (
          <span
            key={step.key}
            /* `title` per segment, not one on the bar: hovering a specific
               column should name THAT column, which is the whole reason
               somebody hovers a bar of five identical shapes. */
            title={step.label}
            className={cn(
              'h-1 flex-1 rounded-sm',
              SEGMENT[i === current ? 'current' : i < current ? 'done' : 'upcoming'],
            )}
          />
        ))}
      </div>

      {caption && here && (
        <p className="mt-2 text-[11.5px] leading-[1.5]">
          <span className="font-medium">{here.label}</span>
          {here.hint !== undefined && <span className="text-muted-foreground"> · {here.hint}</span>}
        </p>
      )}
    </div>
  )
}
