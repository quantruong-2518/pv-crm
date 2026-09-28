import type { MailAddressIntent } from './mail.contract'

/** Group-letter addresses: the one normal form, and who a bounce is pinned on.
 *  Pure functions, no SQL — the ledger calls them and decides nothing more.
 *  Design: ADR 0066 (group letter = one delivery + per-address rows). */

/** Same normal form as `email_delivery.recipient` and `email_suppression`, so
 *  suppression and reply matching compare like with like. */
export const normalAddress = (address: string): string => address.trim().toLowerCase()

/** Normalised, empty ones dropped, first occurrence wins — the table is
 *  UNIQUE(delivery_id, address), and a duplicate would abort the whole send tx. */
export function letterAddresses(addresses: readonly MailAddressIntent[]): MailAddressIntent[] {
  const seen = new Set<string>()
  const out: MailAddressIntent[] = []
  for (const a of addresses) {
    const address = normalAddress(a.address)
    if (address === '' || seen.has(address)) continue
    seen.add(address)
    out.push({ ...a, address })
  }
  return out
}

/** One address of a letter, with the role that decides whether it can be
 *  blamed at all — see `pinBlame`. */
export type BlameCandidate = { address: string; role: 'to' | 'cc' }

/** WHO A BOUNCE OR COMPLAINT IS ABOUT, or nobody.
 *
 *  Resend's event carries `data.to` (To only) and a free-text bounce message,
 *  never the failing address — a complaint is a To recipient's mail client
 *  pressing "spam", so a CC is never a candidate no matter how the message
 *  reads. Among the To addresses: one → that one; otherwise exactly one named
 *  in the message → it; otherwise nobody. Guessing wrong suppresses a working
 *  mailbox for good, which is why "nobody" is an answer and not a fallback to
 *  everyone. */
export function pinBlame(
  candidates: readonly BlameCandidate[],
  message: string | undefined,
): string[] {
  const toAddresses = candidates.filter((c) => c.role === 'to').map((c) => c.address)
  const unique = [...new Set(toAddresses.map(normalAddress).filter((a) => a !== ''))]
  if (unique.length <= 1) return unique
  const named = new Set(
    (message?.toLowerCase().match(/[a-z0-9._%+'-]+@[a-z0-9.-]+/g) ?? []).map((token) =>
      token.replace(/\.+$/, ''),
    ),
  )
  const hits = unique.filter((address) => named.has(address))
  return hits.length === 1 ? hits : []
}
