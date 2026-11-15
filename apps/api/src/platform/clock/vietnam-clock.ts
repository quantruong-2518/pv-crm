const VIETNAM_MS = 7 * 60 * 60_000

/** Vietnam is UTC+7 all year, so a fixed shift is exact; the one clock `platform/` shares,
 *  because it may not import the branch helper `kpi-rules.ts` keeps. */
export const vietnamDay = (at: number): string =>
  new Date(at + VIETNAM_MS).toISOString().slice(0, 10)

export const vietnamHour = (at: number): number => new Date(at + VIETNAM_MS).getUTCHours()

/** The `hour`:00 Vietnam moment of a Vietnam day (`YYYY-MM-DD`). */
export const cutOf = (day: string, hour: number): number =>
  Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00+07:00`)

/** Saturday or Sunday of a Vietnam day (`YYYY-MM-DD`). */
export const isWeekend = (day: string): boolean => {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return weekday === 0 || weekday === 6
}
