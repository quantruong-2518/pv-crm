import { useState } from 'react'
import { Button, cn } from '@pv/ui'
import { QUOTATION_OUTCOME_LABEL, type QuotationOutcome, type QuotationRow } from '@pv/contracts'
import { dm } from '@/lib/date'
import { message, useI18n } from '@/app/i18n'
import { BADGE_INK } from '@/data/opportunities'
import { StepDocuments } from '@/components/run/step-documents'
import { NO_AMOUNT_COPY, compactMoney } from './money'
import { TintBadge } from './tint-badge'

/** The rounds of one paper, in the server's order (newest first). Each row
 *  reads round and amount with its outcome, the reason, then the day and the
 *  file count, which opens that round's own documents. */

const OUTCOME_TONE: Record<QuotationOutcome, 'running' | 'success' | 'draft'> = {
  pending: 'running',
  won: 'success',
  'not-closed': 'draft',
}

const OUTCOME_COPY: Record<QuotationOutcome, ReturnType<typeof message>> = {
  pending: message(QUOTATION_OUTCOME_LABEL.pending, 'Awaiting customer', '고객 응답 대기'),
  won: message(QUOTATION_OUTCOME_LABEL.won, 'Won', '수주'),
  'not-closed': message(QUOTATION_OUTCOME_LABEL['not-closed'], 'Not closed', '미체결'),
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
  const { t } = useI18n()
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
              {t(message(`Lần ${round.roundNo}`, `Round ${round.roundNo}`, `${round.roundNo}차`))} ·{' '}
              {round.amount === null
                ? t(NO_AMOUNT_COPY)
                : compactMoney(round.amount, round.currency)}
            </span>
            <TintBadge
              tone={OUTCOME_TONE[round.outcome]}
              className={cn(round.outcome === 'not-closed' && BADGE_INK)}
            >
              {t(OUTCOME_COPY[round.outcome])}
            </TintBadge>
          </span>
          {reason && <span className="text-muted-foreground min-w-0 break-words">{reason}</span>}
          {round.validUntil &&
            (round.expired ? (
              <span className="text-warning tnum">
                {t(
                  message(
                    `Hết hiệu lực từ ${dm(round.validUntil)}`,
                    `Expired on ${dm(round.validUntil)}`,
                    `${dm(round.validUntil)} 만료`,
                  ),
                )}
              </span>
            ) : (
              <span className="text-accent-foreground tnum">
                {t(
                  message(
                    `Hiệu lực đến ${dm(round.validUntil)}`,
                    `Valid until ${dm(round.validUntil)}`,
                    `${dm(round.validUntil)}까지 유효`,
                  ),
                )}
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
            {t(message('Bổ sung thông tin', 'Add details', '정보 추가'))}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12 tnum"
          aria-expanded={filesOpen}
          onClick={() => setFilesOpen((was) => !was)}
        >
          {t(
            message(
              `${round.files} tệp`,
              `${round.files} ${round.files === 1 ? 'file' : 'files'}`,
              `파일 ${round.files}개`,
            ),
          )}
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
