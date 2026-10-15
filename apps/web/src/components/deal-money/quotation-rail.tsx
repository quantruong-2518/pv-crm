import { Button, Chip, FileText, Icon } from '@pv/ui'
import type { OpportunityMoneyNegotiation, QuotationRow } from '@pv/contracts'
import { RunBlock } from '@/components/run/run-block'
import { QUOTE_LABEL, kindLabel } from './money'
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
  if (!paper && !doors && closed.length === 0) return null
  const rounds = roundsOf(paper)
  const negotiation = paper?.kind === 'quote' ? paper.negotiation : null
  const won = rounds.find((r) => r.outcome === 'won')
  const pending = negotiation?.pendingId ? negotiation : null

  return (
    <RunBlock
      title="Báo giá"
      aside={
        paper && (
          <Chip>
            {paper.kind === 'contract' ? paper.contract.code : kindLabel(paper.negotiation.kind)}
          </Chip>
        )
      }
    >
      {paper && (
        <span className="text-muted-foreground tnum text-[12px]">
          {[
            `${rounds.length} lần`,
            won ? `chốt ở lần ${won.roundNo}` : negotiation && 'đang chờ khách',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
      {rounds.length > 0 && (
        <RoundList rounds={rounds} workstreamCode={workstreamCode} onPatch={doors?.onPatch} />
      )}
      {rounds.length === 0 && closed.length === 0 && (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">Chưa có báo giá.</p>
      )}
      {closed.length > 0 && (
        <>
          <span className="text-muted-foreground text-[12px] font-medium">
            Báo giá đã đóng, không chốt
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
          {QUOTE_LABEL}
        </Button>
      )}
      {doors && pending && (
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12 w-full"
          onClick={() => doors.onClose(pending)}
        >
          Đóng vòng báo giá
        </Button>
      )}
    </RunBlock>
  )
}
