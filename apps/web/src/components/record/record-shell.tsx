import type { ReactNode } from 'react'
import { EmptyState, GlassCard, Inbox, Lock, ScreenLayout, Skeleton, TriangleAlert } from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { DetailSidePanel } from '@/components/detail-side-panel'

/** ONE shape for every profile screen — lead, deal, contract, installment,
 *  workstream, campaign, company, contact (ADR 0078 §1).
 *
 *  The profiles had grown five headers, three skeletons, three failure blocks
 *  and a hand-set spacer per floating bar. Nothing here is new design: it is
 *  the deal profile — main column, 400px rail, floating bar — made the only
 *  one, the way `BookPage` did it for the books.
 *
 *  Screens pass CONTENT: the run strip, the header, the cards, the bar. The
 *  grid and where it folds, the gaps, the skeleton that has to match them, the
 *  failure block and the room the floating bar needs are decided here. */

export type RecordFailure = {
  /** The failed read's error; `app/api/errors.ts` already classified it. */
  error: unknown
  /** Said when the read answers not-found. */
  notFound: string
  /** Said when the error carries no sentence of its own. */
  fallback: string
  back: { label: string; onClick: () => void }
}

export type RecordShellProps = {
  pending?: boolean
  /** What the skeleton draws, so the page does not jump when it lands: a
   *  screen with no strip or no rail says so. Both by default. */
  skeleton?: { strip?: boolean; rail?: boolean }
  /** Set = the record would not open; every other slot is ignored. */
  failure?: RecordFailure
  /** `RunStrip` on a record of a run; absent on campaign, company, contact. */
  strip?: ReactNode
  /** `RecordHeader`. */
  header?: ReactNode
  /** The body, in the fixed order: todo card → working cards → reference. */
  main?: ReactNode
  /** Right column from `xl`; under the body below it — `lg` is the tablet. */
  rail?: ReactNode
  railLabel?: string
  /** `ActionBar`. The shell keeps the room it floats over while it draws. */
  actionBar?: ReactNode
  /** Drawers and dialogs — mounted, never laid out. */
  children?: ReactNode
}

/* One grid for the page and its skeleton, so the wait has the page's shape.
   It splits at `xl`: 1024px is the tablet, which stacks (devices.md). */
const GRID = 'grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-6'
const COLUMN = 'flex min-w-0 flex-col gap-4'
/** The floating bar's band (24px off the bottom + 64px tall) plus a 16px gap,
 *  so a pinned tall rail ends above it. */
const ACTION_BAR_INSET = 104

export function RecordShell({
  pending = false,
  skeleton,
  failure,
  strip,
  header,
  main,
  rail,
  railLabel,
  actionBar,
  children,
}: RecordShellProps) {
  if (pending)
    return <RecordSkeleton strip={skeleton?.strip ?? true} rail={skeleton?.rail ?? true} />
  if (failure) return <RecordFailed failure={failure} />

  return (
    <ScreenLayout>
      {strip}
      {header}
      <div className={rail ? GRID : COLUMN}>
        <div className={COLUMN}>{main}</div>
        {rail && (
          /* Stretched to the row so the panel inside has room to stick while
             the main column scrolls past. */
          <aside className="min-w-0 xl:self-stretch" aria-label={railLabel}>
            <DetailSidePanel bottomInset={actionBar ? ACTION_BAR_INSET : undefined}>
              <div className={COLUMN}>{rail}</div>
            </DetailSidePanel>
          </aside>
        )}
      </div>
      {/* The bar's own height plus a gap, over the shell's bottom padding, so
          the last card stays readable above it. The box holds the fixed bar and
          shows only when one drew: `ActionBar` may draw nothing. */}
      {actionBar && (
        <div className="hidden h-20 shrink-0 has-[[data-action-bar]]:block">{actionBar}</div>
      )}
      {children}
    </ScreenLayout>
  )
}

function RecordSkeleton({ strip, rail }: { strip: boolean; rail: boolean }) {
  return (
    <ScreenLayout>
      {strip && <Skeleton height={56} />}
      <div className="flex flex-col gap-2">
        <Skeleton width="40%" height={36} />
        <Skeleton width="60%" height={20} delay={200} />
      </div>
      <div className={rail ? GRID : COLUMN}>
        <div className={COLUMN}>
          <Skeleton height={240} />
          <Skeleton height={96} delay={200} />
        </div>
        {rail && (
          <div className={COLUMN}>
            <Skeleton height={160} delay={400} />
          </div>
        )}
      </div>
    </ScreenLayout>
  )
}

/** One `kind`, one sentence and one glyph — no status codes read and no
 *  substring of `message` matched here: a second classifier is a second wording. */
function RecordFailed({ failure }: { failure: RecordFailure }) {
  const error = isApiError(failure.error) ? failure.error : null
  const missing = error?.kind === 'not-found'
  const denied = error?.kind === 'forbidden'

  return (
    <ScreenLayout>
      <GlassCard className="p-5 lg:p-6">
        <EmptyState
          className="py-12"
          icon={missing ? Inbox : denied ? Lock : TriangleAlert}
          message={missing ? failure.notFound : (error && userMessage(error)) || failure.fallback}
          action={failure.back}
        />
      </GlassCard>
    </ScreenLayout>
  )
}
