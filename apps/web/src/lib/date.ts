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

import { getLang, LOCALE_TAG, type Lang } from '@/app/i18n'

/** Cache formatters by language; constructing one per table cell is expensive. */
const DM: Record<Lang, Intl.DateTimeFormat> = Object.fromEntries(
  (['vi', 'en', 'ko'] as const).map((lang) => [
    lang,
    new Intl.DateTimeFormat(LOCALE_TAG[lang], { day: '2-digit', month: '2-digit' }),
  ]),
) as Record<Lang, Intl.DateTimeFormat>
const DMY: Record<Lang, Intl.DateTimeFormat> = Object.fromEntries(
  (['vi', 'en', 'ko'] as const).map((lang) => [
    lang,
    new Intl.DateTimeFormat(LOCALE_TAG[lang], {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
  ]),
) as Record<Lang, Intl.DateTimeFormat>
const HM: Record<Lang, Intl.DateTimeFormat> = Object.fromEntries(
  (['vi', 'en', 'ko'] as const).map((lang) => [
    lang,
    new Intl.DateTimeFormat(LOCALE_TAG[lang], {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }),
  ]),
) as Record<Lang, Intl.DateTimeFormat>

/** A DATE with no time and no zone is a calendar day, not an instant.
 *
 *  `Day` in the contract is a bare `YYYY-MM-DD`, and the spec makes `new Date`
 *  read exactly that shape as midnight UTC — so west of Greenwich the formatter
 *  renders the day BEFORE the one the user typed. It shows up hardest under a
 *  `<input type="date">`, where the screen echoes the choice straight back.
 *  Appending a wall-clock time flips the parse to local, which is what a
 *  calendar day means to the person reading it. Anything carrying a zone
 *  already (`Moment`, always) is untouched by this branch. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** A broken string comes back as itself — never 'Invalid Date', never a throw.
 *  One bad timestamp does not get to blank a whole screen. */
function moment(iso: string): Date | null {
  const date = new Date(DATE_ONLY.test(iso) ? `${iso}T00:00:00` : iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** '2026-08-30T23:00:00Z' → '31/08' (at +07) */
export function dm(iso: string): string {
  const date = moment(iso)
  return date ? DM[getLang()].format(date) : iso
}

/** '2026-08-30T23:00:00Z' → '31/08/2026' (at +07) */
export function dmy(iso: string): string {
  const date = moment(iso)
  return date ? DMY[getLang()].format(date) : iso
}

/** '2026-08-30T23:00:00Z' → '06:00' (at +07) */
export function hm(iso: string): string {
  const date = moment(iso)
  return date ? HM[getLang()].format(date) : iso
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
  return date ? `${DM[getLang()].format(date)} ${HM[getLang()].format(date)}` : iso
}

/** A value for `<input type="datetime-local">`, N minutes from now.
 *
 *  That input does NOT take ISO — it wants `YYYY-MM-DDTHH:mm` in machine-local
 *  time, and handing it a string with a `Z` leaves the field blank with no
 *  error. This is the ONE place in the web app allowed to call `Date.now()`: it
 *  returns a default for a person to edit, not a moment to display. */
export function localSlot(minutesFromNow = 10): string {
  return slotOf(new Date(Date.now() + minutesFromNow * 60_000))
}

/** The same value, for a moment that already exists — editing a batch already
 *  held for 9am has to put that hour back into the control it came out of. */
export function localInput(iso: string): string {
  return slotOf(new Date(iso))
}

function slotOf(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}
