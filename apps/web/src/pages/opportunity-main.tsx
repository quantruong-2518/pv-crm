import { FileText } from '@pv/ui'
import { Badge, Button, GlassCard, Icon } from '@pv/ui'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { dmhm } from '@/lib/date'
import { message, useI18n } from '@/app/i18n'
import { useContractKindLabel } from '@/data/sales-config'
import { compactMoney } from '@/components/deal-money/money'

/** Module 3 · the sign request waiting on a decision (ADR 0077 §2, ADR 0078
 *  §1). The terms strip is the money block's now (`components/deal-money`). */

type Profile = OpportunityProfileResponse

/** The `contract-sign` request waiting on a decision. This card has no sign
 *  door of its own: the deal header holds it, and the waiting-quote detail
 *  repeats it by owner decision (ADR 0078). */
export function SignRequestCard({
  op,
  onView,
}: {
  op: Profile
  /** Absent = this reader has nowhere to read the request. */
  onView?: (() => void) | undefined
}) {
  const { t } = useI18n()
  const kindLabel = useContractKindLabel()
  const pending = op.pendingSign
  if (!pending) return null

  return (
    <GlassCard
      className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-[13px] sm:p-5"
      aria-label={t(message('Đề nghị ký hợp đồng', 'Contract signing request', '계약 체결 요청'))}
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-foreground">
          {t(message('Đề nghị ký', 'Signing request', '체결 요청'))} · {kindLabel(pending.kind)}
        </span>
        <span className="text-muted-foreground tnum text-[11.5px]">
          {t(
            message(
              `gửi ${dmhm(pending.raisedAt)}`,
              `sent ${dmhm(pending.raisedAt)}`,
              `${dmhm(pending.raisedAt)} 발송`,
            ),
          )}{' '}
          · {pending.raisedBy}
        </span>
      </span>
      <span className="tnum font-semibold">{compactMoney(pending.amount, pending.currency)}</span>
      <Badge tone="warning">{t(message('Chờ duyệt', 'Pending approval', '승인 대기'))}</Badge>
      {onView && (
        <Button size="md" variant="ghost" className="pointer-coarse:h-12 ml-auto" onClick={onView}>
          <Icon icon={FileText} size={16} />
          {t(message('Xem đề nghị', 'View request', '요청 보기'))}
        </Button>
      )}
    </GlassCard>
  )
}
