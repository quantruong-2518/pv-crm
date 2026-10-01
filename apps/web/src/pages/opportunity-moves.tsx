import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Octagon, TriangleAlert } from '@pv/ui'
import { Badge, Button, Icon, MetaPill, cn } from '@pv/ui'
import { type OpportunityProfileResponse } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { noSellerSentence, useHasSeller } from '@/data/deal-sale'
import { NO_TOUCHES } from '@/data/lead-profile'
import { opportunityTouchesQuery } from '@/data/touches'
import {
  activityTally,
  BADGE_INK,
  eventOfferOf,
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
 *  WHETHER the activity and quotation doors show is `eventOfferOf`'s answer, the
 *  same rule the door refuses by. The accept, assign and event acts own their
 *  modals; this block only decides who sees them. */
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
  const hasSeller = useHasSeller(op)

  /* The profile's own timeline read, cached: rounds are `quotation-sent` rows. */
  const { data: touches = NO_TOUCHES } = useQuery(opportunityTouchesQuery(op.code))
  const offer = eventOfferOf(op, touches.filter((t) => t.kind === 'quotation-sent').length)
  const open = op.state === 'open'
  const clock = stageClockOf(op)
  const accepted = open && op.stage !== null && op.stage !== 'new'
  const unassigned = accepted && hasSeller === false && !sellerOnBar
  const tally = activityTally(op.activityCounts)

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

      {/* A deal no head has accepted records nothing, and the door says so in
          a 409 — the accept button for a head, the reason for anyone else. */}
      {open && canAccept && (
        <AcceptDealButton
          code={op.code}
          show={op.stage === 'new'}
          className="pointer-coarse:h-12"
          returnFocus={() => document.getElementById(ASSIGN_ID)}
        />
      )}
      {canEdit && open && op.stage === 'new' && !canAccept && (
        <span className="text-muted-foreground text-[11px] leading-[1.5]">
          Chờ trưởng phòng Kinh doanh nhận PIC — chưa ghi hoạt động hay báo giá được.
        </span>
      )}

      {unassigned && (
        <span className="text-warning flex items-center gap-2 text-[11.5px] leading-[1.5]">
          <Icon icon={TriangleAlert} size={16} className="shrink-0" />
          {noSellerSentence(false, canAssign)}
        </span>
      )}
      {/* One mount point whatever the wording, so the modal survives the
          re-read that flips the label after a save. Hidden while a signature
          waits: the lane is what that request names. */}
      {accepted && canAssign && !op.pendingSign && hasSeller !== null && (
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

      {canEdit && open && (
        <>
          {offer && <DealEventButtons op={op} offer={offer} />}
          {/* The one reason the doors are absent on an accepted deal. */}
          {accepted && op.pendingSign && (
            <span className="text-muted-foreground text-[11px] leading-[1.5]">
              Cơ hội đang chờ duyệt ký — chưa ghi hoạt động hay báo giá được.
            </span>
          )}

          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => setStopping(true)}
          >
            <Icon icon={Octagon} size={16} />
            Dừng cơ hội
          </Button>
        </>
      )}

      <StopDrawer op={op} open={stopping} onClose={() => setStopping(false)} />
    </div>
  )
}
