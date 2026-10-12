import { Link } from 'react-router-dom'
import { Checkbox } from '@pv/ui'
import { OPPORTUNITY_STAGE_LABEL, type OpportunityOpenContext } from '@pv/contracts'
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
  if (deals.length === 0) return null

  return (
    <section className="bg-primary/16 flex flex-col gap-3 rounded-lg px-4 py-3">
      <span className="text-[13px] font-semibold">Lead này có cơ hội đang chạy</span>
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
              {OPPORTUNITY_STAGE_LABEL[deal.stage]}
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
        label="Đây là nhu cầu khác, vẫn mở cơ hội mới"
      />
    </section>
  )
}
