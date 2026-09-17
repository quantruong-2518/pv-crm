/** A stored phone number, spelled for READING.
 *
 *  The books hold E.164 — `+84912301107`, one spelling so `=` can find it
 *  (`normalisePhone` in `@pv/contracts`). Eleven digits in a row is not a
 *  number anybody reads back over the phone, so the screen groups them:
 *  `+84 912 301 107`. DISPLAY ONLY — nothing here is written back.
 *
 *  ONLY `+84` IS REGROUPED, and that is the whole care this function takes.
 *  Grouping in threes is how a Vietnamese number is said aloud; applying it to
 *  `+65 9123 4567` or to a raw `0912301107` would invent a reading nobody
 *  uses, so anything else is handed back exactly as stored. */

/** The country code `normalisePhone` puts on a number that brought none. A
 *  local copy because the contract keeps its own private — see
 *  `sharedRequests`, the contract should export it. */
const VN_CC = '+84'

const GROUP = 3

export function phoneText(raw: string | null | undefined): string {
  const value = (raw ?? '').trim()
  if (!value.startsWith(VN_CC)) return value

  const body = value.slice(VN_CC.length)
  /* Anything behind the code that is not plain digits — an extension, two
     numbers in one cell — is a spelling this function does not understand. */
  if (body === '' || /\D/.test(body)) return value

  const groups: string[] = []
  for (let i = 0; i < body.length; i += GROUP) groups.push(body.slice(i, i + GROUP))

  /* A lone trailing digit joins the group before it: that is what turns a
     ten-digit landline into `243 456 7890` rather than `243 456 789 0`. */
  const last = groups[groups.length - 1]
  const before = groups[groups.length - 2]
  if (last !== undefined && before !== undefined && last.length === 1) {
    groups.splice(groups.length - 2, 2, before + last)
  }

  return [VN_CC, ...groups].join(' ')
}
