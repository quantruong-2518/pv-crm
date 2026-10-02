import { ActivityFreshness } from '@pv/contracts'
import type { SettingService } from '@api/platform/setting/setting.service'

/** The book's two staleness dials (ADR 0077 §4), as one pair. Stored as two
 *  `platform.setting` keys; read here once for both the config door and the
 *  opportunity book, so the pair is assembled in one place. Registry defaults
 *  answer when nobody has tuned them (`SettingService.value`). */
export async function activityFreshnessOf(settings: SettingService): Promise<ActivityFreshness> {
  const [warn, alert] = await Promise.all([
    settings.value('sales.activity.warn-days'),
    settings.value('sales.activity.alert-days'),
  ])
  return ActivityFreshness.parse({ warnDays: warn.value, alertDays: alert.value })
}
