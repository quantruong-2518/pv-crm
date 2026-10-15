import { useState } from 'react'
import { Button, cn } from '@pv/ui'
import { QUOTATION_OUTCOME_LABEL, type QuotationOutcome, type QuotationRow } from '@pv/contracts'
import { dm } from '@/lib/date'
import { BADGE_INK } from '@/data/opportunities'
import { StepDocuments } from '@/components/run/step-documents'
import { NO_AMOUNT, compactMoney } from './money'
import { TintBadge } from './tint-badge'

/** The rounds of one paper, in the server's order (newest first). Each row
 *  reads round and amount with its outcome, the reason, then the day and the
 *  file count, which opens that round's own documents. */

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
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
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
    <li className="bg-surface-ink/6 flex min-w-0 flex-col gap-2 rounded-md p-3">
      <div className="flex min-w-0 items-start gap-3 text-[12.5px] leading-[1.5]">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="tnum font-semibold">
              Lần {round.roundNo} ·{' '}
              {round.amount === null ? NO_AMOUNT : compactMoney(round.amount, round.currency)}
            </span>
            <TintBadge
              tone={OUTCOME_TONE[round.outcome]}
              className={cn(round.outcome === 'not-closed' && BADGE_INK)}
            >
              {QUOTATION_OUTCOME_LABEL[round.outcome]}
            </TintBadge>
          </span>
          {reason && <span className="text-muted-foreground min-w-0 break-words">{reason}</span>}
          {round.validUntil &&
            (round.expired ? (
              <span className="text-warning tnum">Hết hiệu lực từ {dm(round.validUntil)}</span>
            ) : (
              <span className="text-accent-foreground tnum">
                Hiệu lực đến {dm(round.validUntil)}
              </span>
            ))}
        </span>
        <span className="text-muted-foreground tnum shrink-0">{dm(round.sentAt)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
