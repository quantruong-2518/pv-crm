import type { ReactNode } from 'react'
import { Button, Icon, MetaPill, Pencil } from '@pv/ui'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { dmy } from '@/lib/date'
import { message, useI18n } from '@/app/i18n'
import { compactMoney } from './money'

const WHOLE_PERCENT = 100

/** Under the tiles: how far the figure has come against the deal's own
 *  estimate (an add-on, worded here), then the estimate itself, its close day,
 *  products and the terms door. `shown` is the figure this reader is allowed
 *  to see (signed or quoting, the strip decides); the ratio exists when both
 *  sides are in one currency. */
export function EstimateRow({
  op,
  label,
  shown,
  onEdit,
}: {
  op: OpportunityProfileResponse
  label: string
  shown: number
  onEdit: () => void
}) {
  const { t } = useI18n()
  const { amount, currency } = op
  const ratio =
    amount !== null && amount > 0 && currency === op.money.totals.currency && shown > 0
      ? Math.round((shown / amount) * WHOLE_PERCENT)
      : null

  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
      {ratio !== null && amount !== null && (
        <div className="flex min-w-0 max-w-[420px] flex-[1_1_280px] flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground flex-1 text-[12px] font-medium">{label}</span>
            <span className="tnum font-num text-[13px] font-semibold">{ratio}%</span>
          </div>
          {/* A signed sum may pass the estimate: the text says so, the bar stops. */}
          <div
            role="progressbar"
            aria-label={label}
            aria-valuenow={Math.min(ratio, WHOLE_PERCENT)}
            aria-valuemin={0}
            aria-valuemax={WHOLE_PERCENT}
            className="bg-surface-ink/10 h-1 overflow-hidden rounded-sm"
          >
            <span
              className="bg-primary block h-full rounded-sm"
              style={{ width: `${Math.min(ratio, WHOLE_PERCENT)}%` }}
            />
          </div>
          <span className="text-muted-foreground tnum text-[12px]">
            {compactMoney(shown, currency)} / {t(message('dự kiến', 'estimated', '예상'))}{' '}
            {compactMoney(amount, currency)}
          </span>
        </div>
      )}
      <Fact label={t(message('Giá trị dự kiến', 'Estimated value', '예상 금액'))}>
        <span className="tnum text-[14px] font-semibold">
          {amount === null
            ? t(message('Chưa có', 'None yet', '없음'))
            : compactMoney(amount, currency)}
        </span>
      </Fact>
      <Fact label={t(message('Ngày chốt dự kiến', 'Expected close date', '예상 마감일'))}>
        <span className="tnum text-[14px] font-semibold">
          {op.expectedClose ? dmy(op.expectedClose) : t(message('Chưa đặt', 'Not set', '미설정'))}
        </span>
      </Fact>
      <Fact label={t(message('Sản phẩm', 'Products', '제품'))}>
        {op.products.length === 0 ? (
          <span className="text-muted-foreground text-[13px]">
            {t(message('Chưa chọn', 'None selected', '선택 없음'))}
          </span>
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
          className="pointer-coarse:h-12 ml-auto self-center"
          onClick={onEdit}
        >
          <Icon icon={Pencil} size={16} />
          {t(message('Sửa phiếu', 'Edit terms', '조건 수정'))}
        </Button>
      )}
    </div>
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
