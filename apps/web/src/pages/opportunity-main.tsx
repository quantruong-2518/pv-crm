import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Pencil, PenLine } from '@pv/ui'
import { Badge, Button, GlassCard, Icon, MetaPill, SectionTitle } from '@pv/ui'
import { CONTRACT_KIND_LABEL, type OpportunityProfileResponse } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { dm, dmhm, dmy } from '@/lib/date'
import { commRecordPath } from '@/data/comm-records'
import { WAITING_SIGN } from '@/data/deal-draft'
import { refusalOf } from '@/data/opportunities'
import { CommTimeline } from '@/components/comms-card'
import { moneyText } from './opportunity-model'

/** Module 3 · the profile's main column: the deal's value, its contracts, and
 *  the contact timeline — one place per fact (ADR 0077 §1, §2, §6).
 *
 *  The value strip is read-only; its edit button opens the terms drawer and
 *  shows only while `acts.editTerms` opens it. History is not here: it lives
 *  in the workstream drawer the action bar opens. */

type Profile = OpportunityProfileResponse

export function ValueStrip({ op, onEdit }: { op: Profile; onEdit: () => void }) {
  const signed = op.signedTotal

  return (
    <GlassCard className="flex flex-col gap-3 p-4 sm:p-5" aria-label="Giá trị cơ hội">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <Fact
          label={signed ? 'Giá trị đơn' : 'Giá trị dự kiến'}
          caption={signed ? `tổng ${signed.count} hợp đồng đã ký` : undefined}
        >
          <span className="tnum text-[20px] font-semibold leading-[1.3]">
            {signed
              ? moneyText(signed.amount, signed.currency)
              : op.amount === null
                ? 'Chưa có'
                : moneyText(op.amount, op.currency)}
          </span>
        </Fact>
        <Fact label="Ngày chốt dự kiến">
          <span className="tnum text-[14px]">
            {op.expectedClose ? dmy(op.expectedClose) : 'Chưa đặt'}
          </span>
        </Fact>
        <Fact label="Sản phẩm">
          {op.products.length === 0 ? (
            <span className="text-muted-foreground text-[13px]">Chưa chọn</span>
          ) : (
            <span className="flex flex-wrap gap-2">
              {op.products.map((p) => (
                <MetaPill key={p.id}>{p.name}</MetaPill>
              ))}
            </span>
          )}
        </Fact>
        {op.acts.editTerms.ok && (
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12 ml-auto"
            onClick={onEdit}
          >
            <Icon icon={Pencil} size={16} />
            Sửa phiếu
          </Button>
        )}
      </div>
      {op.pendingSign && (
        <p className="text-warning m-0 text-[12px] leading-[1.5]">{WAITING_SIGN}</p>
      )}
    </GlassCard>
  )
}

function Fact({
  label,
  caption,
  children,
}: {
  label: string
  caption?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-[12px] leading-[1.5]">{label}</span>
      {children}
      {caption && (
        <span className="text-muted-foreground tnum text-[11.5px] leading-[1.5]">{caption}</span>
      )}
    </div>
  )
}

/** Signed papers and the request waiting on one (ADR 0077 §2). The first
 *  contract goes through the action bar's win button; signing again starts
 *  here, on a won deal, while no request waits. */
export function ContractsCard({
  op,
  onSign,
  onViewRequest,
}: {
  op: Profile
  onSign: () => void
  /** Absent = this reader has nowhere to read the request. */
  onViewRequest?: () => void
}) {
  const navigate = useNavigate()
  /* Parked contract screens answer no here, so the row offers no dead door. */
  const canOpen = useCan('contract.view')
  const pending = op.pendingSign
  if (op.contracts.length === 0 && !pending) return null

  const again = op.state === 'won' && !pending
  const refusal = again ? refusalOf(op.acts.sign) : null

  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4 sm:p-5" aria-label="Hợp đồng">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle size="detail">Hợp đồng</SectionTitle>
        {again && refusal === null && (
          <Button size="md" variant="secondary" className="pointer-coarse:h-12" onClick={onSign}>
            <Icon icon={PenLine} size={16} />
            Ký thêm hợp đồng
          </Button>
        )}
        {refusal && <span className="text-muted-foreground text-[12px]">{refusal}</span>}
      </div>

      <ul className="m-0 flex list-none flex-col p-0">
        {op.contracts.map((c) => (
          <ContractLine
            key={c.code}
            code={<span className="font-mono">{c.code}</span>}
            kind={c.kind ? CONTRACT_KIND_LABEL[c.kind] : 'Chưa ghi loại'}
            when={[`ký ${dm(c.signedAt)}`, c.owner?.name].filter(Boolean).join(' · ')}
            amount={c.amount === null ? '—' : moneyText(c.amount, c.currency)}
            status={<Badge tone="success">Đã ký</Badge>}
            action={
              canOpen && (
                <Button
                  size="md"
                  variant="ghost"
                  className="pointer-coarse:h-12"
                  onClick={() => navigate(`/sales/contracts/${encodeURIComponent(c.code)}`)}
                >
                  Mở hợp đồng
                </Button>
              )
            }
          />
        ))}
        {pending && (
          <ContractLine
            code={<span className="text-muted-foreground">Chưa có mã</span>}
            kind={CONTRACT_KIND_LABEL[pending.kind]}
            when={`gửi ${dmhm(pending.raisedAt)} · ${pending.raisedBy}`}
            amount={moneyText(pending.amount, pending.currency)}
            status={<Badge tone="warning">Chờ duyệt</Badge>}
            action={
              onViewRequest && (
                <Button
                  size="md"
                  variant="ghost"
                  className="pointer-coarse:h-12"
                  onClick={onViewRequest}
                >
                  <Icon icon={FileText} size={16} />
                  Xem đề nghị
                </Button>
              )
            }
          />
        )}
      </ul>
    </GlassCard>
  )
}

function ContractLine({
  code,
  kind,
  when,
  amount,
  status,
  action,
}: {
  code: ReactNode
  kind: string
  when: string
  amount: string
  status: ReactNode
  action: ReactNode
}) {
  return (
    <li className="grid items-center gap-x-4 gap-y-1 py-3 text-[13px] sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          {code}
          <span className="text-foreground">{kind}</span>
        </span>
        <span className="text-muted-foreground tnum text-[11.5px]">{when}</span>
      </span>
      <span className="tnum font-semibold sm:text-right">{amount}</span>
      <span className="flex">{status}</span>
      <span className="flex sm:justify-end">{action}</span>
    </li>
  )
}

/** The deal's contact timeline; a card opens the comm's own screen. */
export function DealComms({ op }: { op: Profile }) {
  const navigate = useNavigate()

  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 p-4 sm:p-5" aria-label="Liên hệ">
      <SectionTitle size="detail">Liên hệ</SectionTitle>
      <CommTimeline subjectCode={op.code} onOpen={(id) => navigate(commRecordPath(id))} />
    </GlassCard>
  )
}
