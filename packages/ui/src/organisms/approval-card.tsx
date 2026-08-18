import { ApprovalChain, type ChainStep } from '../patterns/approval-chain'
import { Button } from '../ui/button'
import { Money } from '../ui/money'
import { GlassCard } from '../layout/glass-card'
import { cn } from '../lib/cn'
import { millions } from '../lib/format'

/** O-04 · ApprovalCard — Tiêu đề + Money góc phải + ApprovalChain + 3 Button.
 *  Nút chính LUÔN nói rõ số tiền: "Duyệt 128,5 tr", không phải "Duyệt".
 *  Chuỗi duyệt là dữ liệu của E3; thẻ chỉ hiển thị. */
export type ApprovalCardProps = {
  title: string
  subtitle: string
  /** giá trị bằng đồng */
  amount: number
  chain: ChainStep[]
  onApprove: () => void
  onReject: () => void
  onAskAi: () => void
  className?: string
}

export function ApprovalCard({
  title,
  subtitle,
  amount,
  chain,
  onApprove,
  onReject,
  onAskAi,
  className,
}: ApprovalCardProps) {
  return (
    <GlassCard className={cn('flex flex-col gap-4 px-[22px] py-5', className)}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="font-display text-[15px] font-semibold">{title}</div>
          <div className="text-muted-foreground mt-[5px] text-[12px]">{subtitle}</div>
        </div>
        <Money value={amount} />
      </div>

      <ApprovalChain steps={chain} />

      <div className="flex gap-2.5">
        <Button className="flex-1" onClick={onApprove}>
          Duyệt {millions(amount)}
        </Button>
        <Button variant="destructive" className="px-4" onClick={onReject}>
          Từ chối
        </Button>
        <Button variant="ghost" className="px-4" onClick={onAskAi}>
          Hỏi AI
        </Button>
      </div>
    </GlassCard>
  )
}
