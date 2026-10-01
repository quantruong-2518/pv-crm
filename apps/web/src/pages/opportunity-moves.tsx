import { useState } from 'react'
import { ListChecks, Octagon, TriangleAlert } from '@pv/ui'
import { Badge, Button, Icon, Input, MetaPill, cn } from '@pv/ui'
import {
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_NOTE_MAX,
  type OpportunityMilestoneKind,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { noSellerSentence, useHasSeller } from '@/data/deal-sale'
import {
  BADGE_INK,
  milestonesOf,
  stageClockOf,
  standingLabel,
  STATE_TONE,
} from '@/data/opportunities'
import { useLogMilestone } from '@/data/opportunities-write'
import { StopDrawer } from '@/components/opportunity-stop'
import { AcceptDealButton } from '@/components/opportunity-accept'
import { AssignSaleButton } from '@/components/opportunity-assign'

/** Module 3 · where the deal STANDS on the profile's sticky bar, and the doors
 *  that move it (ADR 0064 §3, 0069 §1, 0071). Split out of `opportunity-parts.tsx`.
 *
 *  A read-only badge, never a picker: `PATCH :code/stage` is gone, and a seller
 *  picks neither state nor column. Every button here carries a FACT instead — a
 *  milestone that really happened, or a stop with a reason — and the server's
 *  single stage writer draws the conclusion from it. A stop is final, so a
 *  lost deal keeps only its badge; the fail log is its own card.
 *
 *  WHICH milestone buttons appear is `milestonesOf`'s answer rather than this
 *  block's: it applies the same rank rule the door refuses by, so no button on
 *  screen can earn a 409 for naming the wrong column. The accept and assign
 *  acts own their modals; this block only decides who sees them. */
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
  const [note, setNote] = useState('')
  const [stopping, setStopping] = useState(false)
  const milestone = useLogMilestone(op.code)
  const canAccept = useCan('opportunity.accept')
  const canAssign = useCan('opportunity.assign')
  const hasSeller = useHasSeller(op)

  const offers = milestonesOf(op)
  const open = op.state === 'open'
  const clock = stageClockOf(op)
  const accepted = open && op.stage !== null && op.stage !== 'new'
  const unassigned = accepted && hasSeller === false && !sellerOnBar

  /* The note box is shared by every milestone button rather than repeated per
     button: one deal moves one column at a time, and four note boxes on a
     sticky bar is four boxes nobody fills in. */
  const record = (kind: OpportunityMilestoneKind, label: string) => {
    const typed = note.trim()
    milestone.mutate(
      { kind, ...(typed === '' ? {} : { note: typed }) },
      {
        onSuccess: () => {
          setNote('')
          toastDone(`Đã ghi mốc ${label}.`)
        },
      },
    )
  }

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
          Chờ trưởng phòng Kinh doanh nhận PIC — chưa ghi mốc được.
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

      {canEdit && open && (
        <>
          {offers.length > 0 && (
            <Input
              value={note}
              aria-label="Ghi chú mốc"
              placeholder="Ghi chú mốc (tuỳ chọn)"
              maxLength={OPPORTUNITY_STAGE_NOTE_MAX}
              className="pointer-coarse:h-12 w-full sm:w-[220px]"
              onChange={(e) => setNote(e.target.value)}
            />
          )}

          {offers.map((offer) => (
            <Button
              key={offer.kind}
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              disabled={milestone.isPending}
              /* The repeat wording is the whole point of `repeat`: pressing
                 Quotation again is another Nego round, not a mistake. */
              title={
                offer.repeat
                  ? 'Ghi thêm một lần nữa ở đúng cột này — cột và đồng hồ giữ nguyên.'
                  : undefined
              }
              onClick={() => record(offer.kind, OPPORTUNITY_STAGE_LABEL[offer.stage])}
            >
              <Icon icon={ListChecks} size={16} />
              {offer.repeat ? 'Ghi lại ' : 'Ghi mốc '}
              {OPPORTUNITY_STAGE_LABEL[offer.stage]}
            </Button>
          ))}

          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            disabled={milestone.isPending}
            onClick={() => setStopping(true)}
          >
            <Icon icon={Octagon} size={16} />
            Dừng cơ hội
          </Button>
        </>
      )}

      {milestone.error && (
        <span
          role="alert"
          className="text-destructive-foreground min-w-0 text-[11px] leading-[1.5]"
        >
          {userMessage(milestone.error)}
        </span>
      )}

      <StopDrawer op={op} open={stopping} onClose={() => setStopping(false)} />
    </div>
  )
}
