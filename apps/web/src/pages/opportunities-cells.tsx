import { useRef, type ReactNode, type SyntheticEvent } from 'react'
import { Badge, StageTrack, cn } from '@pv/ui'
import { OPPORTUNITY_STAGE_LABEL, type OpportunityBookRow } from '@pv/contracts'
import { useHasSeller } from '@/data/deal-sale'
import {
  BADGE_INK,
  OVERDUE_WORD,
  stageClockOf,
  stageTrackOf,
  standingLabel,
  STATE_TONE,
} from '@/data/opportunities'
import { ACCEPT_QUEUE_ID, AcceptDealButton } from '@/components/opportunity-accept'
import { AssignSaleButton } from '@/components/opportunity-assign'

/** Module 3 · the deal book's state cell and the two acts it carries — split
 *  out of `opportunities.tsx`, which sits near the size ceiling. */

/** The state cell — a PILL, and under it the flow the deal is walking.
 *
 *  The pill's colour says whether the deal is still ON THE BOARD, its text says
 *  WHERE (`standingLabel`, shared with the sticky bar). The bar is a shape to
 *  glance at across the page, which a tooltip never is; `title` keeps the full
 *  sentence with the day count and the limit, and beside the bar sits the
 *  clock's short text (`formatStageClock`). A closed deal has no bar.
 *
 *  ONE LINE WHEN A ROW CARRIES AN ACT (ADR 0071): rows are a fixed 56px, so a
 *  `new` row's accept and a seller-less row's assign sit beside the badge and
 *  replace the bar rather than stacking under it. */
export function StateCell({
  op,
  canAccept,
  canAssign,
}: {
  op: OpportunityBookRow
  canAccept: boolean
  canAssign: boolean
}) {
  const clock = stageClockOf(op)
  const rotting = clock?.overdue ?? false
  const stage = op.stage === null ? null : OPPORTUNITY_STAGE_LABEL[op.stage]
  const track = stageTrackOf(op)
  const hasSeller = useHasSeller(op)
  const open = op.state === 'open'
  /* Mounted for every open row so the modal outlives the accept that moves it. */
  const accept = canAccept && open
  const accepting = accept && op.stage === 'new'
  const assigning =
    canAssign && open && op.stage !== null && op.stage !== 'new' && hasSeller === false

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <Badge
          tone={rotting ? 'warning' : STATE_TONE[op.state]}
          /* `BADGE_INK` only where the pill wears the lost tone — law 13. */
          className={cn('min-w-0 max-w-full', !rotting && op.state === 'lost' && BADGE_INK)}
          title={
            stage && clock ? `Cột "${stage}" · ${clock.label}` : 'Đã đóng sổ — đơn ra khỏi năm cột'
          }
        >
          <span className="min-w-0 truncate">
            {standingLabel(op)}
            {rotting && ` · ${OVERDUE_WORD}`}
          </span>
        </Badge>
        {accept && <RowAccept code={op.code} show={accepting} />}
        {assigning && (
          <RowAct>
            <AssignSaleButton op={op} hasSeller={false} size="sm" className="pointer-coarse:h-12" />
          </RowAct>
        )}
      </div>

      {track && !accepting && !assigning && (
        <div className="flex min-w-0 items-center gap-2">
          <StageTrack steps={track.steps} current={track.current} className="min-w-0 flex-1" />
          {clock && (
            <span className="text-muted-foreground tnum shrink-0 text-[11px]">{clock.short}</span>
          )}
        </div>
      )}
    </div>
  )
}

/** Stops clicks and keys from opening the row: modal events bubble through the
 *  React tree, out of the portal and into the row's own handler. */
function RowAct({ children }: { children: ReactNode }) {
  const stop = (event: SyntheticEvent) => event.stopPropagation()
  return (
    <span className="flex shrink-0" onClick={stop} onKeyDown={stop}>
      {children}
    </span>
  )
}

/** Accept from the row; focus then moves to the next row, else the queue button. */
function RowAccept({ code, show }: { code: string; show: boolean }) {
  const box = useRef<HTMLSpanElement>(null)
  const next = useRef<HTMLElement | null>(null)
  const nextRow = () => {
    let row = box.current?.closest('[role="row"]')?.nextElementSibling ?? null
    while (row && !(row instanceof HTMLElement && row.tabIndex >= 0)) row = row.nextElementSibling
    return row
  }
  return (
    <span ref={box} className="flex shrink-0">
      <RowAct>
        <AcceptDealButton
          code={code}
          show={show}
          size="sm"
          className="pointer-coarse:h-12"
          onAccepted={() => (next.current = nextRow())}
          returnFocus={() =>
            next.current?.isConnected ? next.current : document.getElementById(ACCEPT_QUEUE_ID)
          }
        />
      </RowAct>
    </span>
  )
}
