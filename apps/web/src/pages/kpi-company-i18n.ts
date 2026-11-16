import { percent } from '@pv/ui'
import { message, translate } from '@/app/i18n'
import { monthEnded } from './kpi-model'

/** Words the desk screens share (company, unit, assignment). Each is a function
 *  or a getter so it follows the reader's language when called, not when loaded. */

export const notApplicable = () =>
  translate(message('Không áp dụng', 'Not applicable', '해당 없음'))

/** What the dark tick on a bar stands for: pace while the month runs, the
 *  whole target once it is over. `null` for a month that has not started. */
export function tickWord(period: string, pace: number): string | null {
  if (monthEnded(period)) {
    return translate(message('Chỉ tiêu cả tháng', 'Whole-month target', '월 전체 목표'))
  }
  if (pace <= 0) return null
  const pct = percent(pace)
  return translate(message(`Nhịp hôm nay ${pct}`, `Pace today ${pct}`, `오늘 진도 ${pct}`))
}

/** Where the tick sits: pace while the month runs, the full target after it. */
export const tickAt = (period: string, pace: number): number | null =>
  monthEnded(period) ? 1 : pace > 0 ? pace : null
