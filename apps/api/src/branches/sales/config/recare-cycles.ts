import { RecareCycles } from '@pv/contracts'
import type { SettingService } from '@api/platform/setting/setting.service'

/** The three re-care cycles of a bought customer (ADR 0121 §4), as one trio.
 *  Read here once for the config door, the after-sale book and its sweeper,
 *  `activityFreshnessOf`'s reason. Registry defaults answer when untuned. */
export async function recareCyclesOf(settings: SettingService): Promise<RecareCycles> {
  const [hot, warm, cold] = await Promise.all([
    settings.value('sales.after-sale.hot-days'),
    settings.value('sales.after-sale.warm-days'),
    settings.value('sales.after-sale.cold-days'),
  ])
  return RecareCycles.parse({ hotDays: hot.value, warmDays: warm.value, coldDays: cold.value })
}
