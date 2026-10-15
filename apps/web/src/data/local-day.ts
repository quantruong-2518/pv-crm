/** Today on the USER'S calendar — slicing `toISOString()` is a day off for
 *  anybody pressing after 17:00 in Hanoi. */
export function localDay(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}
