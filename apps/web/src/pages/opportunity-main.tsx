import type { ReactNode } from 'react'
import { FileText, Pencil } from '@pv/ui'
import { Badge, Button, GlassCard, Icon, MetaPill } from '@pv/ui'
import { CONTRACT_KIND_LABEL, type OpportunityProfileResponse } from '@pv/contracts'
import { dmhm, dmy } from '@/lib/date'
import { compactMoney } from '@/components/deal-money/money'

/** Module 3 · the deal's terms and the sign request waiting on it (ADR 0077
 *  §1, §2; ADR 0078 §1). What is signed, collected and quoted is the money
 *  block's (`components/deal-money`), so the terms strip keeps the estimate only.
 *
 *  The terms strip is read-only; its edit button opens the terms drawer and
 *  shows only while `acts.editTerms` opens it. */

type Profile = OpportunityProfileResponse

export function ValueStrip({ op, onEdit }: { op: Profile; onEdit: () => void }) {
  return (
    <GlassCard className="flex flex-col gap-3 p-4 sm:p-5" aria-label="Giá trị cơ hội">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <Fact label="Giá trị dự kiến">
          <span className="tnum text-[20px] font-semibold leading-[1.3]">
            {op.amount === null ? 'Chưa có' : compactMoney(op.amount, op.currency)}
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
    </GlassCard>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-[12px] leading-[1.5]">{label}</span>
      {children}
    </div>
  )
}

/** The `contract-sign` request waiting on a decision. No sign door here: the
 *  header holds it, for the first contract and for every later one. */
export function SignRequestCard({
  op,
  onView,
}: {
  op: Profile
  /** Absent = this reader has nowhere to read the request. */
  onView?: (() => void) | undefined
}) {
  const pending = op.pendingSign
  if (!pending) return null

  return (
    <GlassCard
      className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-[13px] sm:p-5"
      aria-label="Đề nghị ký hợp đồng"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-foreground">Đề nghị ký · {CONTRACT_KIND_LABEL[pending.kind]}</span>
        <span className="text-muted-foreground tnum text-[11.5px]">
          gửi {dmhm(pending.raisedAt)} · {pending.raisedBy}
        </span>
      </span>
      <span className="tnum font-semibold">{compactMoney(pending.amount, pending.currency)}</span>
      <Badge tone="warning">Chờ duyệt</Badge>
      {onView && (
        <Button size="md" variant="ghost" className="pointer-coarse:h-12 ml-auto" onClick={onView}>
          <Icon icon={FileText} size={16} />
          Xem đề nghị
        </Button>
      )}
    </GlassCard>
  )
}
