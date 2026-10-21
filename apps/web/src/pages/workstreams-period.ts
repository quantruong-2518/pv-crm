import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isSalesPeriodKey, salesGrainOf } from '@pv/contracts'
import { currentPick, keyOf, type PeriodPick } from '@/data/period-pick'

/** The workstream book's period, kept in the address as `?period=`. The
 *  overview keeps its own in state and opens on a quarter; this book opens on
 *  the running month.
 *
 *  `useBookQuery` rewrites the address from its schema's keys alone, so every
 *  filter, page and search change drops `period`. The last pick is therefore
 *  remembered in state and written back, `replace`d, whenever the address
 *  loses it. Only the running month is left off the address: a link then
 *  follows the calendar instead of freezing one month. */

const PARAM = 'period'

const monthPick = (): PeriodPick => ({ ...currentPick(), grain: 'month' })

function withKey(pick: PeriodPick, key: string): PeriodPick {
  const grain = salesGrainOf(key)
  return { ...pick, grain, [grain]: key }
}

export function useBookPeriod(): [PeriodPick, (next: PeriodPick) => void] {
  const [params, setParams] = useSearchParams()
  const [fallback] = useState(monthPick)
  const [memory, setMemory] = useState(fallback)
  const asked = params.get(PARAM)
  const valid = asked !== null && isSalesPeriodKey(asked) ? asked : null
  const pick = useMemo(() => (valid === null ? memory : withKey(memory, valid)), [memory, valid])
  const key = keyOf(pick)
  const wanted = key === keyOf(fallback) ? null : key

  const write = (to: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (to === null) next.delete(PARAM)
        else next.set(PARAM, to)
        return next
      },
      { replace: true },
    )

  useEffect(() => {
    if (pick.grain !== memory.grain || key !== keyOf(memory)) setMemory(pick)
    if (asked !== wanted) write(wanted)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `write` only closes over a stable setter
  }, [asked, wanted, pick])

  const onPick = (next: PeriodPick) => {
    setMemory(next)
    write(keyOf(next) === keyOf(fallback) ? null : keyOf(next))
  }
  return [pick, onPick]
}
