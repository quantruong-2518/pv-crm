import type { ReactNode } from 'react'
import { Chip, FileText, Icon, RadialGauge, type RadialGaugeTone } from '@pv/ui'
import { QUOTATION_OUTCOME_LABEL, type OpportunityMoneyContract } from '@pv/contracts'
import { dm } from '@/lib/date'
import { NO_AMOUNT, compactMoney, kindLabel, ratioOfShare, type Standing } from './money'
import type { Paper } from './papers'
import { TintBadge } from './tint-badge'

/** The face of each card in the contract block: what the paper is, how far
 *  collecting has come and where it stands. A paper whose payments this reader
 *  may not see gets no badge and no ring. */

const RING_TONE: Record<Standing['tone'], RadialGaugeTone> = {
  danger: 'danger',
  success: 'success',
  running: 'primary',
}

export function QuoteCard({ paper }: { paper: Extract<Paper, { kind: 'quote' }> }) {
  const { negotiation: n, round } = paper
  return (
    <>
      <Top
        badge={<TintBadge tone="running">{QUOTATION_OUTCOME_LABEL.pending}</TintBadge>}
        side="chưa ký"
      />
      <Body
        ring={<Placeholder />}
        kind={kindLabel(n.kind)}
        amount={n.amount === null ? NO_AMOUNT : compactMoney(n.amount, n.currency)}
      />
      <span className="text-muted-foreground tnum text-[12px]">
        {round ? `Lần ${round.roundNo}` : 'Báo giá'}
        {round?.validUntil && ` · hiệu lực đến ${dm(round.validUntil)}`}
      </span>
    </>
  )
}

export function ContractCard({
  contract: c,
  standing,
}: {
  contract: OpportunityMoneyContract
  standing: Standing | null
}) {
  return (
    <>
      <Top
        badge={standing && <TintBadge tone={standing.tone}>{standing.label}</TintBadge>}
        side={`ký ${dm(c.signedAt)}`}
      />
      <Body
        ring={<Ring contract={c} standing={standing} />}
        kind={kindLabel(c.kind)}
        amount={c.amount === null ? NO_AMOUNT : compactMoney(c.amount, c.currency)}
      />
      <span className="flex items-center gap-2">
        <Chip>{c.code}</Chip>
        <span className="text-muted-foreground tnum text-[12px]">{metaOf(c)}</span>
      </span>
    </>
  )
}

const metaOf = (c: OpportunityMoneyContract) =>
  [
    c.rounds.length > 0 && `${c.rounds.length} lần báo giá`,
    c.files.contract > 0 ? `${c.files.contract} tệp` : 'chưa có tệp',
  ]
    .filter(Boolean)
    .join(' · ')

function Top({ badge, side }: { badge: ReactNode; side: string }) {
  return (
    <span className="flex items-center gap-2">
      {badge}
      <span className="text-muted-foreground tnum ml-auto text-[12px]">{side}</span>
    </span>
  )
}

function Body({ ring, kind, amount }: { ring: ReactNode; kind: string; amount: string }) {
  return (
    <span className="flex items-center gap-4">
      {ring}
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-semibold">{kind}</span>
        <span className="tnum font-num text-[18px] font-semibold leading-[1.3]">{amount}</span>
      </span>
    </span>
  )
}

function Ring({
  contract: c,
  standing,
}: {
  contract: OpportunityMoneyContract
  standing: Standing | null
}) {
  if (!standing || c.collectedShare === null) return <Placeholder />
  return (
    <RadialGauge
      size={64}
      value={ratioOfShare(c.collectedShare)}
      center={`${c.collectedShare}%`}
      label="Đã thu"
      tone={RING_TONE[standing.tone]}
    />
  )
}

/** A quote, or a paper with no figure to ring. */
function Placeholder() {
  return (
    <span className="bg-surface-ink/9 text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-md">
      <Icon icon={FileText} size={20} />
    </span>
  )
}
