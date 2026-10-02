import { useState, type ReactNode } from 'react'
import { ChevronDown, Users, type IconGlyph } from '@pv/ui'
import { Badge, Button, ContextRail, Icon, MetaPill, ScreenHeader } from '@pv/ui'
import { campaignLabel, type LeadProfile, type OpportunityProfileResponse } from '@pv/contracts'
import type { RailObject } from '@pv/ui'
import { StopDrawer } from '@/components/opportunity-stop'
import { MenuButton, type MenuChoice } from './opportunity-menu'
import { customerTagOf } from './opportunity-model'

/** Module 3 · the header of the deal screen and the block drawn when it will
 *  not open. The page keeps the query and the assembly; the other blocks live
 *  in `opportunity-status` · `-main` · `-side` · `-moves`, the same split
 *  `lead-detail.tsx` / `lead-parts.tsx` runs on. */

/** The header, with no glass around it.
 *
 *  Identity on the left; the lead link and the menu holding the stop on the
 *  right. No call buttons and no stage tag: contacts are reached from the
 *  action bar, and where the deal stands is the status block (ADR 0077 §6).
 *
 *  THE RAIL RIDES IN THE META ROW (law 10), beside the customer tag of the
 *  run (ADR 0076 §3) and the lead's provenance. */
export function DealHeader({
  op,
  lead,
  rail,
  onBack,
  onOpenLead,
}: {
  op: OpportunityProfileResponse
  lead: LeadProfile | null
  /** The object chain, already dressed by `railOf`. Law 10. */
  rail: RailObject[]
  onBack: () => void
  onOpenLead: () => void
}) {
  const [stopping, setStopping] = useState(false)
  const customer = customerTagOf(op)
  /* A stop is final, so a lost deal carries no menu at all. */
  const menu: MenuChoice[] =
    op.state !== 'lost' && op.acts.stop.ok
      ? [{ key: 'stop', label: 'Dừng cơ hội', tone: 'danger', onSelect: () => setStopping(true) }]
      : []

  return (
    <>
      <ScreenHeader
        back={{ label: 'Sổ cơ hội', onClick: onBack }}
        kicker={
          <span className="flex items-center gap-2">
            <span className="font-sans">Cơ hội</span>
            {op.code}
          </span>
        }
        title={op.name}
        actions={
          <>
            {/* 40px on a mouse, 48px on a finger (law 13). */}
            <Button
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              onClick={onOpenLead}
            >
              <Icon icon={Users} size={16} />
              Hồ sơ lead
            </Button>
            {menu.length > 0 && (
              <MenuButton
                label="Khác"
                icon={ChevronDown}
                ariaLabel="Thao tác khác"
                size="md"
                className="pointer-coarse:h-12"
                align="right"
                choices={menu}
              />
            )}
          </>
        }
        meta={
          <>
            {customer && <Badge tone="running">{customer}</Badge>}
            {/* ALWAYS drawn (law 10), even as one chip. */}
            <ContextRail objects={rail} />
            {lead ? (
              <>
                <MetaPill>{lead.province ?? '—'}</MetaPill>
                <MetaPill>{campaignLabel(lead.source)}</MetaPill>
              </>
            ) : (
              <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Chưa đọc được hồ sơ lead <span className="font-mono">{op.leadCode}</span> — có thể
                nó nằm ngoài phạm vi quyền của bạn.
              </span>
            )}
          </>
        }
      />
      <StopDrawer op={op} open={stopping} onClose={() => setStopping(false)} />
    </>
  )
}

/** The screen that would not open — ONE block, four sentences, glyph follows
 *  the sentence. Four near-identical empty blocks would drift apart on the
 *  second edit; what differs is the SENTENCE, so the sentence is the prop. */
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
