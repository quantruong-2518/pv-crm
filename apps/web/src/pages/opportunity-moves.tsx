import { useState } from 'react'
import { Octagon, TriangleAlert } from '@pv/ui'
import { Badge, Button, Icon, MetaPill, cn } from '@pv/ui'
import { type OpportunityProfileResponse } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { noSellerSentence } from '@/data/deal-sale'
import {
  activityTally,
  BADGE_INK,
  refusalOf,
  stageClockOf,
  standingLabel,
  STATE_TONE,
} from '@/data/opportunities'
import { StopDrawer } from '@/components/opportunity-stop'
import { AcceptDealButton } from '@/components/opportunity-accept'
import { AssignSaleButton } from '@/components/opportunity-assign'
import { DealEventButtons } from './opportunity-events'

/** Module 3 · where the deal STANDS on the profile's sticky bar, and the doors
 *  that move it (ADR 0064 §3, 0069 §1, 0071). Split out of `opportunity-parts.tsx`.
 *
 *  A read-only badge, never a picker: `PATCH :code/stage` is gone, and a seller
 *  picks neither state nor column. Every button here carries a FACT instead — a
 *  care activity, a quotation, or a stop with a reason — and the server's
 *  single stage writer draws the conclusion from it (ADR 0072). A stop is
 *  final, so a lost deal keeps only its badge; the fail log is its own card.
 *
 *  WHETHER each door shows is the server's `acts` verdict, the same rule the
 *  door refuses by; a refused door prints the server's own reason. The accept,
 *  assign and event acts own their modals; this block only decides who sees them. */
/** Where the accept hands focus: the assign button it reveals. */
const ASSIGN_ID = 'deal-assign-sale'

export function DealMoves({
  op,
  canEdit,
  sellerOnBar,
}: {
  op: OpportunityProfileResponse
  canEdit: boolean
  /** The bar already prints the missing-seller sentence — do not say it twice. */
  sellerOnBar: boolean
}) {
  const [stopping, setStopping] = useState(false)
  const canAccept = useCan('opportunity.accept')
  const canAssign = useCan('opportunity.assign')
  const hasSeller = op.hasSeller
  const open = op.state === 'open'
  const clock = stageClockOf(op)
  const accepted = open && op.stage !== null && op.stage !== 'new'
  const unassigned = accepted && !hasSeller && !sellerOnBar
  const tally = activityTally(op.activityCounts)
  const recordable = op.acts.activity.ok || op.acts.quotation.ok
  /* Both doors refused for one reason print it once. */
  const refusal = [...new Set([refusalOf(op.acts.activity), refusalOf(op.acts.quotation)])].filter(
    Boolean,
  )

  return (
    <div className="flex basis-full flex-wrap items-center gap-2">
      {/* `BADGE_INK` only on the lost tone — law 13; see its own note. */}
      <Badge tone={STATE_TONE[op.state]} className={cn(op.state === 'lost' && BADGE_INK)}>
        {standingLabel(op)}
      </Badge>

      {/* The book's and the drawer's clock, one formatter (`formatStageClock`). */}
      {open && clock && (
        <MetaPill tone={clock.tone} title="Số ngày ở cột này / hạn của cột">
          <span className="tnum">{clock.label}</span>
        </MetaPill>
      )}

      {/* An unaccepted deal records nothing: the accept button where `acts.accept`
          opens, the record doors' reason elsewhere. Mounted on the permission so
          the modal outlives the accept that shuts the act. */}
      {open && canAccept && (
        <AcceptDealButton
          code={op.code}
          show={op.acts.accept.ok}
          className="pointer-coarse:h-12"
          returnFocus={() => document.getElementById(ASSIGN_ID)}
        />
      )}
      {canEdit && open && !accepted && !op.acts.accept.ok && refusal.length > 0 && (
        <span className="text-muted-foreground text-[11px] leading-[1.5]">{refusal.join(' ')}</span>
      )}

      {unassigned && (
        <span className="text-warning flex items-center gap-2 text-[11.5px] leading-[1.5]">
          <Icon icon={TriangleAlert} size={16} className="shrink-0" />
          {noSellerSentence(false, canAssign)}
        </span>
      )}
      {/* One mount point whatever the wording, so the modal survives the
          re-read that flips the label after a save. `acts.assign` shuts it at
          `new` and while a signature waits — the lane is what that request names. */}
      {op.acts.assign.ok && (
        <AssignSaleButton
          id={ASSIGN_ID}
          op={op}
          hasSeller={hasSeller}
          className="pointer-coarse:h-12"
        />
      )}

      {/* Counts read where the doors stand — and stay on a closed deal, as its record. */}
      {!(open && op.stage === 'new') && (
        <span className="text-muted-foreground tnum text-[11.5px] leading-[1.5]">
          {tally ?? 'Chưa có hoạt động'}
        </span>
      )}

      {/* Recordable from `assigned` until lost, a won deal included (ADR 0072):
          the server's `acts` say so, not the column. */}
      {canEdit && (
        <>
          {recordable && <DealEventButtons op={op} />}
          {/* Why a door is shut on an accepted or won deal, in the server's words. */}
          {(accepted || op.state === 'won') && refusal.length > 0 && (
            <span className="text-muted-foreground text-[11px] leading-[1.5]">
              {refusal.join(' ')}
            </span>
          )}

          {op.acts.stop.ok && (
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={() => setStopping(true)}
            >
              <Icon icon={Octagon} size={16} />
              Dừng cơ hội
            </Button>
          )}
        </>
      )}

      <StopDrawer op={op} open={stopping} onClose={() => setStopping(false)} />
    </div>
  )
}
