import { Button, Chip, FileText, Icon } from '@pv/ui'
import type { OpportunityMoneyNegotiation, QuotationRow } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { useContractKindLabel } from '@/data/sales-config'
import { RunBlock } from '@/components/run/run-block'
import { QUOTE_LABEL_COPY, kindLabel } from './money'
import { roundsOf, type Paper } from './papers'
import { RoundList } from './rounds'

/** The rail's quotation list: the rounds of the paper picked in the money
 *  block, newest first, then the rounds of negotiations that closed unsigned
 *  (no card, still on record), and the two quote doors. The doors repeat the
 *  header's by owner decision (ADR 0078). Absent `doors` = the server's
 *  `acts.quotation` refuses this reader, so nothing here writes. */

export type QuotationDoors = {
  /** `null` = a negotiation of its own. */
  onQuote: (negotiation: OpportunityMoneyNegotiation | null) => void
  onClose: (negotiation: OpportunityMoneyNegotiation) => void
  onPatch: (round: QuotationRow) => void
}

export function QuotationRail({
  paper,
  closed,
  workstreamCode,
  doors,
}: {
  paper: Paper | undefined
  /** Rounds of negotiations that closed unsigned, read-only. */
  closed: QuotationRow[]
  workstreamCode: string | null
  doors: QuotationDoors | undefined
}) {
  const { t } = useI18n()
  const resolveKind = useContractKindLabel()
  if (!paper && !doors && closed.length === 0) return null
  const rounds = roundsOf(paper)
  const negotiation = paper?.kind === 'quote' ? paper.negotiation : null
  const won = rounds.find((r) => r.outcome === 'won')
  const pending = negotiation?.pendingId ? negotiation : null

  return (
    <RunBlock
      title={t(message('Báo giá', 'Quotations', '견적서'))}
      aside={
        paper && (
          <Chip>
            {paper.kind === 'contract'
              ? paper.contract.code
              : kindLabel(paper.negotiation.kind, resolveKind)}
          </Chip>
        )
      }
    >
      {paper && (
        <span className="text-muted-foreground tnum text-[12px]">
          {[
            t(
              message(
                `${rounds.length} lần`,
                `${rounds.length} ${rounds.length === 1 ? 'round' : 'rounds'}`,
                `${rounds.length}회`,
              ),
            ),
            won
              ? t(
                  message(
                    `chốt ở lần ${won.roundNo}`,
                    `won in round ${won.roundNo}`,
                    `${won.roundNo}회차에서 확정`,
                  ),
                )
              : negotiation &&
                t(message('đang chờ khách', 'awaiting the customer', '고객 회신 대기')),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
      {rounds.length > 0 && (
        <RoundList rounds={rounds} workstreamCode={workstreamCode} onPatch={doors?.onPatch} />
      )}
      {rounds.length === 0 && closed.length === 0 && (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          {t(message('Chưa có báo giá.', 'No quotations yet.', '견적서가 없습니다.'))}
        </p>
      )}
      {closed.length > 0 && (
        <>
          <span className="text-muted-foreground text-[12px] font-medium">
            {t(
              message(
                'Báo giá đã đóng, không chốt',
                'Closed quotations, not won',
                '종료된 견적서, 미체결',
              ),
            )}
          </span>
          <RoundList rounds={closed} workstreamCode={workstreamCode} />
        </>
      )}
      {doors && (
        /* A kindless mailed round is no group a typed record joins: the form opens a new one. */
        <Button
          size="lg"
          variant="secondary"
          className="w-full"
          onClick={() => doors.onQuote(negotiation?.kind ? negotiation : null)}
        >
          <Icon icon={FileText} size={16} />
          {t(QUOTE_LABEL_COPY)}
        </Button>
      )}
      {doors && pending && (
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12 w-full"
          onClick={() => doors.onClose(pending)}
        >
          {t(message('Đóng vòng báo giá', 'Close the quotation', '견적 종료'))}
        </Button>
      )}
    </RunBlock>
  )
}
