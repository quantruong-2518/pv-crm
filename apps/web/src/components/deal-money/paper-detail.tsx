import { useNavigate } from 'react-router-dom'
import { Badge, Button, Check, Chip, Icon, Pencil, Plus } from '@pv/ui'
import type { OpportunityMoneyContract, OpportunityMoneyInstallment } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { dmy } from '@/lib/date'
import { QUOTE_PENDING } from '@/data/installment-copy'
import { useContractKindLabel } from '@/data/sales-config'
import { ContractFiles } from './contract-files'
import { InstallmentTiles } from './installment-tiles'
import { NO_AMOUNT_COPY, compactMoney, kindLabel } from './money'
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
  const { t, lang } = useI18n()
  const resolveKind = useContractKindLabel()
  if (paper.kind === 'quote') {
    const { negotiation: n, round } = paper
    return (
      <div className={WELL}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h3 className="font-display m-0 text-[20px] font-semibold">
            {kindLabel(n.kind, resolveKind, lang)}
          </h3>
          <Badge tone="running">{t(QUOTE_PENDING)}</Badge>
          {round && (
            <span className="text-muted-foreground tnum text-[12px]">
              {t(
                message(
                  `Báo giá lần ${round.roundNo} · gửi ${dmy(round.sentAt)}`,
                  `Quotation round ${round.roundNo} · sent ${dmy(round.sentAt)}`,
                  `견적 ${round.roundNo}차 · ${dmy(round.sentAt)} 발송`,
                ),
              )}
            </span>
          )}
          <span className="tnum font-num ml-auto text-[20px] font-semibold">
            {n.amount === null ? t(NO_AMOUNT_COPY) : compactMoney(n.amount, n.currency)}
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
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const resolveKind = useContractKindLabel()
  /* Parked contract screens answer no here, so the heading offers no dead door. */
  const canOpen = useCan('contract.view')
  const unpaid = c.installments.some((i) => i.status !== 'paid')

  return (
    <div className={WELL}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="font-display m-0 text-[20px] font-semibold">
          {kindLabel(c.kind, resolveKind, lang)}
        </h3>
        <Chip>{c.code}</Chip>
        <span className="text-muted-foreground tnum text-[12px]">
          {t(
            message(
              `Ký ${dmy(c.signedAt)}`,
              `Signed ${dmy(c.signedAt)}`,
              `${dmy(c.signedAt)} 체결`,
            ),
          )}
        </span>
        <span className="tnum font-num ml-auto text-[20px] font-semibold">
          {c.amount === null ? t(NO_AMOUNT_COPY) : compactMoney(c.amount, c.currency)}
        </span>
        {canOpen && (
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => navigate(`/sales/contracts/${encodeURIComponent(c.code)}`)}
          >
            {t(message('Mở hợp đồng', 'Open contract', '계약 열기'))}
          </Button>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-8">
        {c.paymentsVisible ? (
          <section
            className="flex min-w-0 flex-col gap-3"
            aria-label={t(message('Lịch thanh toán', 'Payment schedule', '납부 일정'))}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className={LABEL}>
                {t(
                  message(
                    `Lịch thanh toán · đã thu ${compactMoney(c.collected, c.currency)}`,
                    `Payment schedule · collected ${compactMoney(c.collected, c.currency)}`,
                    `납부 일정 · 수금 ${compactMoney(c.collected, c.currency)}`,
                  ),
                )}
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
                  {t(message('Sửa lịch', 'Edit schedule', '일정 수정'))}
                </Button>
              )}
            </div>
            {c.installments.length === 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
                  {t(
                    message(
                      'Chưa có lịch thanh toán',
                      'No payment schedule yet',
                      '납부 일정이 아직 없습니다',
                    ),
                  )}
                </p>
                {c.can.editSchedule && (
                  <Button
                    size="md"
                    variant="ghost"
                    className="pointer-coarse:h-12"
                    onClick={() => onSchedule(c)}
                  >
                    <Icon icon={Plus} size={16} />
                    {t(message('Nhập lịch thanh toán', 'Enter payment schedule', '납부 일정 입력'))}
                  </Button>
                )}
              </div>
            ) : (
              <InstallmentTiles contract={c} onOpen={(i) => onOpen(c, i)} />
            )}
          </section>
        ) : (
          <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
            {t(
              message(
                'Bạn không xem được thanh toán của hợp đồng này.',
                'You cannot view the payments of this contract.',
                '이 계약의 납부 내역을 볼 수 없습니다.',
              ),
            )}
          </p>
        )}
        <ContractFiles
          workstreamCode={workstreamCode}
          contractCode={c.code}
          count={c.files.contract}
          /* The server ANDs both flags with the closer rule (ADR 0110). */
          canEdit={c.can.editSchedule || c.can.recordPayment}
        />
      </div>
    </div>
  )
}
