import { useState } from 'react'
import { Badge, Button, cn } from '@pv/ui'
import { QUOTATION_OUTCOME_LABEL, type QuotationOutcome, type QuotationRow } from '@pv/contracts'
import { dm } from '@/lib/date'
import { BADGE_INK } from '@/data/opportunities'
import { StepDocuments } from '@/components/run/step-documents'
import { NO_AMOUNT, compactMoney } from './money'

/** The rounds of one negotiation, in the server's order (newest first). Each
 *  row reads outcome → amount → reason → round and day → files; the file count
 *  opens that round's own documents. */

const OUTCOME_TONE: Record<QuotationOutcome, 'running' | 'success' | 'draft'> = {
  pending: 'running',
  won: 'success',
  'not-closed': 'draft',
}

export function RoundList({
  rounds,
  workstreamCode,
  onPatch,
}: {
  rounds: QuotationRow[]
  workstreamCode: string | null
  /** Absent = this reader may not complete a round. */
  onPatch?: ((round: QuotationRow) => void) | undefined
}) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {rounds.map((round) => (
        <RoundLine key={round.id} round={round} workstreamCode={workstreamCode} onPatch={onPatch} />
      ))}
    </ul>
  )
}

function RoundLine({
  round,
  workstreamCode,
  onPatch,
}: {
  round: QuotationRow
  workstreamCode: string | null
  onPatch?: ((round: QuotationRow) => void) | undefined
}) {
  const [filesOpen, setFilesOpen] = useState(false)
  /* The patch door takes a pending round only. */
  const incomplete = round.amount === null || round.kind === null
  const patchable = onPatch && incomplete && round.outcome === 'pending'
  const reason = [round.reasonLabel, round.note].filter(Boolean).join(' · ')

  return (
    <li className="flex min-w-0 flex-col gap-2 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] leading-[1.5]">
        <Badge
          tone={OUTCOME_TONE[round.outcome]}
          className={cn(round.outcome === 'not-closed' && BADGE_INK)}
        >
          {QUOTATION_OUTCOME_LABEL[round.outcome]}
        </Badge>
        {round.amount === null ? (
          <span className="text-muted-foreground">{NO_AMOUNT}</span>
        ) : (
          <span className="tnum font-semibold">{compactMoney(round.amount, round.currency)}</span>
        )}
        {reason && <span className="min-w-0 break-words">{reason}</span>}
        <span className="text-muted-foreground tnum">
          Lần {round.roundNo} · {dm(round.sentAt)}
          {round.validUntil && !round.expired && ` · hiệu lực đến ${dm(round.validUntil)}`}
        </span>
        {round.validUntil && round.expired && (
          <span className="text-warning tnum">hết hiệu lực từ {dm(round.validUntil)}</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {patchable && (
            <Button
              size="sm"
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={() => onPatch(round)}
            >
              Bổ sung thông tin
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12 tnum"
            aria-expanded={filesOpen}
            onClick={() => setFilesOpen((was) => !was)}
          >
            {round.files} tệp
          </Button>
        </span>
      </div>
      {filesOpen && (
        <StepDocuments
          workstreamCode={workstreamCode}
          step={{ kind: 'quotation', quotationId: round.id }}
        />
      )}
    </li>
  )
}
