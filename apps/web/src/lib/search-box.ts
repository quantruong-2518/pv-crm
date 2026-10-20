import { SEARCH_MIN_CHARS } from '@pv/contracts'

/** What a search box says when its text is too short to search. */
const SEARCH_TOO_SHORT_TEXT = `Gõ ít nhất ${SEARCH_MIN_CHARS} ký tự`

/** The `q` a box may send, or `undefined` for the unfiltered list. Counted the
 *  way `searchText` counts on the server (trim, then NFC), so a hint is shown
 *  exactly when the server would ignore the text. */
export function searchableText(typed: string): string | undefined {
  const text = typed.trim().normalize('NFC')
  return text.length >= SEARCH_MIN_CHARS ? text : undefined
}

/** The `meta` line of a book's search box: shown only while the text is typed
 *  but too short, so the unfiltered list has a reason. */
export function searchHint(typed: string): string | undefined {
  return typed.trim() !== '' && searchableText(typed) === undefined
    ? SEARCH_TOO_SHORT_TEXT
    : undefined
}
