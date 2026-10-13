import { useNavigate } from 'react-router-dom'
import { Accordion, Button, GlassCard, Icon, Pencil, Plus, Progress, cn } from '@pv/ui'
import type { OpportunityMoneyContract, OpportunityMoneyInstallment } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { dm } from '@/lib/date'
import { StepDocuments } from '@/components/run/step-documents'
import {
  INSTALLMENT_INK,
  compactMoney,
  installmentStatusLine,
  kindLabel,
  ratioOfShare,
} from './money'
import { RoundList } from './rounds'

/** One signed paper: its heading, what has been collected against its schedule,
 *  the rounds that led to it and its signed documents. Installments come in the
 *  server's order (overdue, upcoming, paid) and each one opens its drawer.
 *  The verdicts are the contract's own (`paymentsVisible`, `can`): a reader
 *  outside its scope gets one sentence where the payments would be, and no
 *  schedule door. `.glass-b`: the card holds lists (law 8). */
export function ContractSection({
  contract: c,
  workstreamCode,
  onOpen,
  onSchedule,
}: {
  contract: OpportunityMoneyContract
  workstreamCode: string | null
  onOpen: (installment: OpportunityMoneyInstallment) => void
  onSchedule: () => void
}) {
  const navigate = useNavigate()
  /* Parked contract screens answer no here, so the heading offers no dead door. */
  const canOpen = useCan('contract.view')

  return (
    <GlassCard
      variant="b"
      role="region"
      aria-label={`Hợp đồng ${c.code}`}
      className="flex min-w-0 flex-col gap-3 p-4 sm:p-5"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="font-display m-0 text-[16px] font-semibold">{kindLabel(c.kind)}</h2>
        {c.amount !== null && (
          <span className="tnum text-[16px] font-semibold">
            {compactMoney(c.amount, c.currency)}
          </span>
        )}
        <span className="font-mono text-[12.5px]">{c.code}</span>
        <span className="text-muted-foreground tnum text-[12.5px]">ký {dm(c.signedAt)}</span>
        {canOpen && (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12 ml-auto"
            onClick={() => navigate(`/sales/contracts/${encodeURIComponent(c.code)}`)}
          >
            Mở hợp đồng
          </Button>
        )}
      </div>

      {c.paymentsVisible ? (
        <Payments contract={c} onOpen={onOpen} onSchedule={onSchedule} />
      ) : (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          Bạn không xem được thanh toán của hợp đồng này.
        </p>
      )}

      {c.rounds.length > 0 && (
        <Accordion title="Báo giá" summary={`${c.rounds.length} lần`}>
          <RoundList rounds={c.rounds} workstreamCode={workstreamCode} />
        </Accordion>
      )}
      <Accordion title="Tài liệu đã ký" summary={`${c.files.contract} tệp`}>
        <StepDocuments
          workstreamCode={workstreamCode}
          step={{ kind: 'contract', contractCode: c.code }}
        />
      </Accordion>
    </GlassCard>
  )
}

function Payments({
  contract: c,
  onOpen,
  onSchedule,
}: {
  contract: OpportunityMoneyContract
  onOpen: (installment: OpportunityMoneyInstallment) => void
  onSchedule: () => void
}) {
  if (c.installments.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          Chưa có lịch thanh toán
        </p>
        {c.can.editSchedule && (
          <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={onSchedule}>
            <Icon icon={Plus} size={16} />
            Nhập lịch thanh toán
          </Button>
        )}
      </div>
    )
  }

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Thanh toán">
      {c.collectedShare !== null && (
        <Progress value={ratioOfShare(c.collectedShare)} label="Đã thu" tone="success" />
      )}
      <span className="tnum text-[12.5px]">{compactMoney(c.collected, c.currency)}</span>
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {c.installments.map((i) => (
          <li key={i.no} className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(i)}
              className="motion-std bg-surface-ink/6 hover:bg-surface-ink/12 flex min-h-12 w-full flex-col gap-1 rounded-md p-3 text-left"
            >
              <span className={cn('tnum text-[12px] leading-[1.5]', INSTALLMENT_INK[i.status])}>
                {installmentStatusLine(i)}
              </span>
              <span className="tnum text-[16px] font-semibold">
                {compactMoney(i.amount, c.currency)}
              </span>
              <span className="text-muted-foreground tnum break-words text-[12px] leading-[1.5]">
                {i.label} · {i.share}%
              </span>
            </button>
          </li>
        ))}
      </ul>
      {c.can.editSchedule && c.installments.some((i) => i.status !== 'paid') && (
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12 self-start"
          onClick={onSchedule}
        >
          <Icon icon={Pencil} size={16} />
          Sửa lịch thanh toán
        </Button>
      )}
    </section>
  )
}
