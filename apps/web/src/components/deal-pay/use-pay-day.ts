import { useEffect, useState } from 'react'
import { vnToday } from '@/data/opportunities'
import { vnDayOf } from '@/data/quotations-write'
import { dmy } from '@/lib/date'

/** Which day the money landed, as the modal's three choices. The range is the
 *  record-paid door's own: from the contract's signing day to today, on the
 *  Vietnam calendar — so "yesterday" is off before the paper existed. */

export type DayPick = 'today' | 'yesterday' | 'other'

const DAY_MS = 24 * 60 * 60 * 1000

/** `YYYY-MM-DD` shifted by whole days, on the calendar and not the clock. */
const shiftDay = (day: string, days: number) =>
  new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10)

export function usePayDay(open: boolean, signedAt: string) {
  const [pick, setPick] = useState<DayPick>('today')
  const [other, setOther] = useState('')

  useEffect(() => {
    if (!open) return
    setPick('today')
    setOther('')
  }, [open])

  const today = vnToday()
  const min = vnDayOf(signedAt)
  const yesterday = shiftDay(today, -1)
  const day = pick === 'today' ? today : pick === 'yesterday' ? yesterday : other
  const blocker =
    day === ''
      ? 'Chọn ngày nhận tiền.'
      : day < min || day > today
        ? `Chọn ngày từ ${dmy(min)} đến hôm nay.`
        : ''

  return { pick, setPick, other, setOther, day, blocker, today, min, yesterdayOk: yesterday >= min }
}

export type PayDay = ReturnType<typeof usePayDay>
