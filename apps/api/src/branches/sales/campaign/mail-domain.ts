/** The two things both send paths share about the domain check
 *  (`MailDomainCheck`): how its result set is keyed, and how a drop is traced. */

/** The key `MailDomainCheck.undeliverable` answers under: JS-trimmed and
 *  lower-cased. SQL `trim()` strips spaces only, so a stored address ending in
 *  a tab or NBSP must be folded here or it would never match its own verdict. */
export const mailKey = (address: string): string => address.trim().toLowerCase()

/** Run-note fragment for addresses dropped as undeliverable. A count and
 *  nothing else: the verdict is never stored, so this note is the only trace
 *  that a drop happened — and a note must not carry an address or a domain. */
export const deadNote = (dropped: number): string =>
  dropped > 0 ? ` · ${dropped} tên miền không nhận thư` : ''
