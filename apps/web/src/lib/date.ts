/** Dates for the interface.
 *
 *  ------------------------------------------------------------------
 *  READ THE ZONE, DO NOT SLICE THE STRING — THIS IS A FIX, NOT A TASTE
 *  ------------------------------------------------------------------
 *  The previous version cut `iso.slice(0, 10)` and split on the dashes. That
 *  was right exactly once: back when every moment came from a frozen fixture
 *  written with an explicit `+07:00`. The real server returns
 *  `Date.toISOString()` — UTC with a `Z` — so at +07 EVERY moment falling
 *  between 00:00 and 06:59 Vietnam time printed the PREVIOUS DAY. Schedule a
 *  wave for 31/08 06:00, it is stored as `2026-08-30T23:00:00Z`, and the
 *  scheduling screen answered "30/08" on the very table that took the order.
 *
 *  `Intl` reads the moment in the browser's zone — the clock the user is
 *  actually looking at, and the same thing `mas-mail-modal` and `meetings-card`
 *  already do with hand-rolled copies of this idea.
 *
 *  The old rule stands: no function here calls `new Date()` with no argument.
 *  The result depends on the input string and the machine's zone, never on when
 *  it was rendered, so a screen drawn twice still reads the same. */

/** Formatters built ONCE per session. `Intl.DateTimeFormat` is expensive to
 *  construct and cheap to call, and the three functions below run on every cell
 *  of every table row. */
const DM = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' })
const DMY = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const HM = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** A broken string comes back as itself — never 'Invalid Date', never a throw.
 *  One bad timestamp does not get to blank a whole screen. */
function moment(iso: string): Date | null {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** '2026-08-30T23:00:00Z' → '31/08' (at +07) */
export function dm(iso: string): string {
  const date = moment(iso)
  return date ? DM.format(date) : iso
}

/** '2026-08-30T23:00:00Z' → '31/08/2026' (at +07) */
export function dmy(iso: string): string {
  const date = moment(iso)
  return date ? DMY.format(date) : iso
}

/** '2026-08-30T23:00:00Z' → '31/08 06:00' (at +07).
 *
 *  Here because `dm` alone cannot carry a SCHEDULING screen: two waves on one
 *  day render identically, and a bare "31/08" does not say 6am or 11pm — on a
 *  feature whose whole value is the hour. No year: the run book and the wave
 *  chain are both read within a few weeks, and four more characters per row
 *  answer a question nobody asked. */
export function dmhm(iso: string): string {
  const date = moment(iso)
  return date ? `${DM.format(date)} ${HM.format(date)}` : iso
}

/** A value for `<input type="datetime-local">`, N minutes from now.
 *
 *  That input does NOT take ISO — it wants `YYYY-MM-DDTHH:mm` in machine-local
 *  time, and handing it a string with a `Z` leaves the field blank with no
 *  error. This is the ONE place in the web app allowed to call `Date.now()`: it
 *  returns a default for a person to edit, not a moment to display. */
export function localSlot(minutesFromNow = 10): string {
  const date = new Date(Date.now() + minutesFromNow * 60_000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}
