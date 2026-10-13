import type { ReactNode } from 'react'
import { Badge, Button, Icon, cn, type IconGlyph } from '@pv/ui'
import { campaignLabel, type LeadProfile, type OpportunityProfileResponse } from '@pv/contracts'
import { dmy } from '@/lib/date'
import { acceptorText, noSellerSentence } from '@/data/deal-sale'
import {
  BADGE_INK,
  STATE_TONE,
  bdOwnersOf,
  laneText,
  namesOf,
  saleOwnersOf,
  standingLabel,
} from '@/data/opportunities'
import { RecordHeader } from '@/components/record/record-header'
import { customerTagOf } from './opportunity-model'

/** Module 3 · the header of the deal screen, and the block the new-deal page
 *  draws when it will not open.
 *
 *  The header reads customer → where the deal stands → its code, small,
 *  then one meta line — the deal's name, the people on it, the lead's source,
 *  the day it was opened, and the run's customer tag (ADR 0076 §3).
 *  The name is edited from the description card, so the title has no pencil.
 *  The owners live here and nowhere else (ADR 0078 §1). A missing seller is
 *  said with the button it blocks, in the warning tone while the deal is open. */
export function DealHeader({
  op,
  lead,
}: {
  op: OpportunityProfileResponse
  /** The origin lead; `null` while unread or out of the reader's scope. */
  lead: LeadProfile | null
}) {
  const bd = namesOf(bdOwnersOf(op))
  const sellers = saleOwnersOf(op)
  const pic = acceptorText(op)

  return (
    <RecordHeader
      title={
        <>
          {op.account}
          <Badge
            tone={STATE_TONE[op.state]}
            className={cn('ml-3 align-middle tracking-normal', op.state === 'lost' && BADGE_INK)}
          >
            {standingLabel(op)}
          </Badge>
          <span className="text-muted-foreground ml-3 align-middle font-mono text-[12px] font-normal tracking-normal">
            {op.code}
          </span>
        </>
      }
      meta={[
        op.name,
        bd.length > 0 && `BD ${bd.join(', ')}`,
        pic && `PIC ${pic}`,
        sellers.length > 0 ? (
          `Sale ${laneText(sellers)}`
        ) : op.state === 'lost' ? (
          'Chưa có Sale'
        ) : (
          <span className={op.state === 'open' ? 'text-warning' : undefined}>
            {noSellerSentence(op.state === 'won', op.acts.assign.ok)}
          </span>
        ),
        lead && campaignLabel(lead.source),
        <span className="tnum">tạo {dmy(op.createdAt)}</span>,
        customerTagOf(op),
      ]}
    />
  )
}

/** The new-deal page that would not open — ONE block, the sentence is the prop. */
export function EmptyOp({
  icon,
  note,
  onBack,
}: {
  icon: IconGlyph
  note: ReactNode
  onBack: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon icon={icon} size={26} className="text-muted-foreground" />
      <p className="text-muted-foreground text-[12.5px] leading-[1.65]">{note}</p>
      <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onBack}>
        Về sổ cơ hội
      </Button>
    </div>
  )
}
