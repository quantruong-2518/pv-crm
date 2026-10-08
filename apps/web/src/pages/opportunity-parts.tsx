import type { ReactNode } from 'react'
import { Button, Icon, type IconGlyph } from '@pv/ui'
import { campaignLabel, type LeadProfile, type OpportunityProfileResponse } from '@pv/contracts'
import { dmy } from '@/lib/date'
import { acceptorText, noSellerSentence } from '@/data/deal-sale'
import { bdOwnersOf, namesOf, saleOwnersOf } from '@/data/opportunities'
import { RecordHeader } from '@/components/record/record-header'
import { customerTagOf } from './opportunity-model'

/** Module 3 · the header of the deal screen, and the block the new-deal page
 *  draws when it will not open.
 *
 *  The header: the deal's name, then one meta line — the people on it, the
 *  lead's source, the day it was opened, and the run's customer tag (ADR 0076
 *  §3). No code: the run strip shows it. The owners live here and nowhere else
 *  (ADR 0078 §1); the bar's more menu opens their drawer. A missing seller is
 *  said with the button it blocks, in the warning tone while the deal is open. */
export function DealHeader({
  op,
  lead,
  onRename,
}: {
  op: OpportunityProfileResponse
  /** The origin lead; `null` while unread or out of the reader's scope. */
  lead: LeadProfile | null
  onRename: () => void
}) {
  const bd = namesOf(bdOwnersOf(op))
  const sellers = namesOf(saleOwnersOf(op))
  const pic = acceptorText(op)

  return (
    <RecordHeader
      title={op.name}
      onRename={op.acts.editDetails.ok ? onRename : undefined}
      meta={[
        bd.length > 0 && `BD ${bd.join(', ')}`,
        pic && `PIC ${pic}`,
        sellers.length > 0 ? (
          `Sale ${sellers.join(', ')}`
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
