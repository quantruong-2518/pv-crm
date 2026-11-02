import { Link } from 'react-router-dom'
import { Checkbox } from '@pv/ui'
import type { OpportunityOpenContext } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { opportunityStageLabel } from '@/data/sales-labels-i18n'
import { chainPath } from '@/data/opportunities'

/** The lead's running deals, listed above the form with the one tick that lets
 *  a second deal through (ADR 0088 §9). Empty list, no block, nothing to tick.
 *
 *  The codes drawn here are the codes the create body sends back, so the tick
 *  confirms exactly what the person saw. */
export function RunningDealsBlock({
  deals,
  confirmed,
  busy,
  onConfirm,
}: {
  deals: OpportunityOpenContext['runningDeals']
  confirmed: boolean
  /** The list is being re-read: ticking now would confirm a list on its way out. */
  busy: boolean
  onConfirm: (on: boolean) => void
}) {
  const { t, lang } = useI18n()
  if (deals.length === 0) return null

  return (
    <section className="bg-primary/16 flex flex-col gap-3 rounded-lg px-4 py-3">
      <span className="text-[13px] font-semibold">
        {t(
          message(
            'Lead này có cơ hội đang chạy',
            'This lead has open opportunities',
            '이 리드에 진행 중인 영업 기회가 있습니다',
          ),
        )}
      </span>
      <ul className="flex flex-col gap-2 text-[12.5px] leading-[1.6]">
        {deals.map((deal) => (
          <li key={deal.code} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              to={chainPath('OP', deal.code) ?? `/sales/opportunities/${deal.code}`}
              className="text-on-tint-primary pointer-coarse:min-h-12 inline-flex items-center font-mono hover:underline"
            >
              {deal.code}
            </Link>
            <span className="min-w-0 truncate font-medium">{deal.name}</span>
            <span className="text-on-tint-primary-muted">
              {opportunityStageLabel(deal.stage, lang)}
              {deal.holder && ` · ${deal.holder.name}`}
            </span>
          </li>
        ))}
      </ul>
      <Checkbox
        className="pointer-coarse:min-h-12 -mx-3"
        wrap
        checked={confirmed}
        disabled={busy}
        onChange={onConfirm}
        label={t(
          message(
            'Đây là nhu cầu khác, vẫn mở cơ hội mới',
            'This is a different need; create another opportunity',
            '다른 요구 사항입니다. 새 영업 기회를 만듭니다',
          ),
        )}
      />
    </section>
  )
}
