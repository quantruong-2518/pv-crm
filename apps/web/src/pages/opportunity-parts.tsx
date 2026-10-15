import type { ReactNode } from 'react'
import { Badge, Button, Icon, cn, type IconGlyph } from '@pv/ui'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { BADGE_INK, STATE_TONE, standingLabel } from '@/data/opportunities'
import { RecordHeader } from '@/components/record/record-header'
import { DealPrimary } from './opportunity-moves'
import { customerTagOf, hasDealMoves, type DealPrimaryState } from './opportunity-model'

/** Module 3 · the header of the deal screen, and the block the new-deal page
 *  draws when it will not open.
 *
 *  The header reads customer → where the deal stands → its code, small, with
 *  the deal's moves on the right (ADR 0078 §1, reshaped 14/10) and, when the
 *  sign door is shut, the reason on a line under it. No meta pills: the people
 *  are in the rail, the terms and the description in the cards. One muted line
 *  under the title says the deal's name and its customer tag. The name is
 *  edited from the description card, so the title has no pencil. */
export function DealHeader({
  op,
  primary,
  onSign,
  onQuote,
}: {
  op: OpportunityProfileResponse
  /** `primaryStateOf` — read once by the page, which also feeds the more menu. */
  primary: DealPrimaryState
  onSign: () => void
  onQuote: () => void
}) {
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
      actions={
        hasDealMoves(primary) ? (
          <DealPrimary op={op} state={primary} onSign={onSign} onQuote={onQuote} />
        ) : undefined
      }
      subtitle={[op.name, customerTagOf(op)].filter(Boolean).join(' · ')}
      note={primary.note}
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
