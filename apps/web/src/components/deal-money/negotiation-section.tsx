import { Accordion, Button, FileText, GlassCard, Icon } from '@pv/ui'
import type { OpportunityMoneyNegotiation, QuotationRow } from '@pv/contracts'
import { NO_AMOUNT, compactMoney, kindLabel } from './money'
import { RoundList } from './rounds'

/** One negotiation with no contract yet. `pendingId` set = a round waits on the
 *  customer, so the record and close doors show; null = it closed unsigned and
 *  is read-only. A pending round with no kind (mail, backfill) is its own group
 *  that a typed record never joins, so it offers the close door and the round's
 *  own completion only. The heading names kind and amount; where the round
 *  stands is said once, on its row. `.glass-b`: the card holds a list (law 8). */
export function NegotiationSection({
  negotiation: n,
  workstreamCode,
  doors,
}: {
  negotiation: OpportunityMoneyNegotiation
  workstreamCode: string | null
  /** Absent = `acts.quotation` refuses this reader. */
  doors?:
    | {
        onQuote: (negotiation: OpportunityMoneyNegotiation) => void
        onClose: (negotiation: OpportunityMoneyNegotiation) => void
        onPatch: (round: QuotationRow) => void
      }
    | undefined
}) {
  const waiting = n.pendingId !== null
  const title = kindLabel(n.kind)

  return (
    <GlassCard
      variant="b"
      role="region"
      aria-label={`Báo giá ${title} chưa ký`}
      className="flex min-w-0 flex-col gap-3 p-4 sm:p-5"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="font-display m-0 text-[16px] font-semibold">{title}</h2>
        {waiting &&
          (n.amount === null ? (
            <span className="text-muted-foreground text-[13px]">{NO_AMOUNT}</span>
          ) : (
            <span className="tnum text-[16px] font-semibold">
              {compactMoney(n.amount, n.currency)}
            </span>
          ))}
        {waiting && doors && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {n.kind !== null && (
              <Button
                size="md"
                variant="secondary"
                className="pointer-coarse:h-12"
                onClick={() => doors.onQuote(n)}
              >
                <Icon icon={FileText} size={16} />
                Thêm lần báo giá
              </Button>
            )}
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={() => doors.onClose(n)}
            >
              Đóng vòng báo giá
            </Button>
          </span>
        )}
      </div>
      <Accordion title="Báo giá" summary={`${n.rounds.length} lần`} defaultOpen={waiting}>
        <RoundList rounds={n.rounds} workstreamCode={workstreamCode} onPatch={doors?.onPatch} />
      </Accordion>
    </GlassCard>
  )
}
