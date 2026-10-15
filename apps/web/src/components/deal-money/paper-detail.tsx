import { useNavigate } from 'react-router-dom'
import { Badge, Button, Check, Chip, Icon, Pencil, Plus } from '@pv/ui'
import {
  QUOTATION_OUTCOME_LABEL,
  type OpportunityMoneyContract,
  type OpportunityMoneyInstallment,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { dmy } from '@/lib/date'
import { ContractFiles } from './contract-files'
import { InstallmentTiles } from './installment-tiles'
import { NO_AMOUNT, compactMoney, kindLabel } from './money'
import type { Paper } from './papers'

/** What the carousel picked, spread out with no tabs: a signed paper's
 *  schedule and files, or a waiting quote with its sign door (the deal header
 *  holds the same door; the owner chose to repeat it here, ADR 0078). The verdicts are
 *  the server's — `can` on the paper, `paymentsVisible` on what it shows; a
 *  reader outside the paper's scope gets one sentence where the payments would
 *  be and no schedule door. */

const WELL = 'bg-surface-ink/5 flex min-w-0 flex-col gap-6 rounded-lg p-4 sm:p-6'
const LABEL = 'text-muted-foreground text-[12px] font-medium'

/** The sign button of a waiting quote: the header's own verdict and label. */
export type QuoteSign = { label: string; onSign: (quotationId: string) => void }

export function PaperDetail({
  paper,
  workstreamCode,
  sign,
  onOpen,
  onSchedule,
}: {
  paper: Paper
  workstreamCode: string | null
  sign: QuoteSign | null
  onOpen: (contract: OpportunityMoneyContract, installment: OpportunityMoneyInstallment) => void
  onSchedule: (contract: OpportunityMoneyContract) => void
}) {
  if (paper.kind === 'quote') {
    const { negotiation: n, round } = paper
    return (
      <div className={WELL}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h3 className="font-display m-0 text-[20px] font-semibold">{kindLabel(n.kind)}</h3>
          <Badge tone="running">{QUOTATION_OUTCOME_LABEL.pending}</Badge>
          {round && (
            <span className="text-muted-foreground tnum text-[12px]">
              Báo giá lần {round.roundNo} · gửi {dmy(round.sentAt)}
            </span>
          )}
          <span className="tnum font-num ml-auto text-[20px] font-semibold">
            {n.amount === null ? NO_AMOUNT : compactMoney(n.amount, n.currency)}
          </span>
        </div>
        {sign && n.pendingId !== null && (
          <Button size="lg" className="self-end" onClick={() => sign.onSign(n.pendingId ?? '')}>
            <Icon icon={Check} size={16} />
            {sign.label}
          </Button>
        )}
      </div>
    )
  }

  return (
    <SignedPaper
      contract={paper.contract}
      workstreamCode={workstreamCode}
      onOpen={onOpen}
      onSchedule={onSchedule}
    />
  )
}

function SignedPaper({
  contract: c,
  workstreamCode,
  onOpen,
  onSchedule,
}: {
  contract: OpportunityMoneyContract
  workstreamCode: string | null
  onOpen: (contract: OpportunityMoneyContract, installment: OpportunityMoneyInstallment) => void
  onSchedule: (contract: OpportunityMoneyContract) => void
}) {
  const navigate = useNavigate()
  /* Parked contract screens answer no here, so the heading offers no dead door. */
  const canOpen = useCan('contract.view')
  const unpaid = c.installments.some((i) => i.status !== 'paid')

  return (
    <div className={WELL}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="font-display m-0 text-[20px] font-semibold">{kindLabel(c.kind)}</h3>
        <Chip>{c.code}</Chip>
        <span className="text-muted-foreground tnum text-[12px]">Ký {dmy(c.signedAt)}</span>
        <span className="tnum font-num ml-auto text-[20px] font-semibold">
          {c.amount === null ? NO_AMOUNT : compactMoney(c.amount, c.currency)}
        </span>
        {canOpen && (
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => navigate(`/sales/contracts/${encodeURIComponent(c.code)}`)}
          >
            Mở hợp đồng
          </Button>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-8">
        {c.paymentsVisible ? (
          <section className="flex min-w-0 flex-col gap-3" aria-label="Lịch thanh toán">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className={LABEL}>
                Lịch thanh toán · đã thu {compactMoney(c.collected, c.currency)}
                {c.amount !== null && ` / ${compactMoney(c.amount, c.currency)}`}
              </span>
              {c.can.editSchedule && c.installments.length > 0 && unpaid && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="pointer-coarse:h-12 ml-auto"
                  onClick={() => onSchedule(c)}
                >
                  <Icon icon={Pencil} size={16} />
                  Sửa lịch
                </Button>
              )}
            </div>
            {c.installments.length === 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
                  Chưa có lịch thanh toán
                </p>
                {c.can.editSchedule && (
                  <Button
                    size="md"
                    variant="ghost"
                    className="pointer-coarse:h-12"
                    onClick={() => onSchedule(c)}
                  >
                    <Icon icon={Plus} size={16} />
                    Nhập lịch thanh toán
                  </Button>
                )}
              </div>
            ) : (
              <InstallmentTiles contract={c} onOpen={(i) => onOpen(c, i)} />
            )}
          </section>
        ) : (
          <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
            Bạn không xem được thanh toán của hợp đồng này.
          </p>
        )}
        <ContractFiles
          workstreamCode={workstreamCode}
          contractCode={c.code}
          count={c.files.contract}
        />
      </div>
    </div>
  )
}
