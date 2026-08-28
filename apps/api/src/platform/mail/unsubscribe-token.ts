import { createHmac, timingSafeEqual } from 'node:crypto'

/** THE UNSUBSCRIBE LINK, AND WHY IT IS SIGNED RATHER THAN LOOKED UP.
 *
 *  ------------------------------------------------------------------
 *  WHAT THIS PROTECTS AGAINST
 *  ------------------------------------------------------------------
 *  The obvious link is `/mail/unsubscribe/<deliveryId>`, and it works right up
 *  until somebody notices the ids are enumerable. A delivery id in a URL with
 *  no signature is an anonymous, unauthenticated door through which anyone can
 *  unsubscribe anyone — and every one of those writes a row in
 *  `email_suppression`, which is the one table this system will not let a
 *  screen undo casually. The list is the asset; a stranger must not be able to
 *  burn holes in it by counting.
 *
 *  So the id travels with an HMAC over itself. Only a holder of
 *  `PV_UNSUBSCRIBE_SECRET` can mint one, the link stays stateless — no token
 *  table, no expiry to sweep, no second round trip at send time — and a
 *  tampered id fails the comparison instead of unsubscribing a neighbour.
 *
 *  ------------------------------------------------------------------
 *  PURE, SYNCHRONOUS, AND THE SECRET IS AN ARGUMENT
 *  ------------------------------------------------------------------
 *  Two functions, no class, no `process.env` read. `env.ts` is the one place
 *  that reads configuration (its docblock says why), and a module that reaches
 *  for `process.env` on its own is a module whose behaviour depends on when it
 *  was imported. The caller already holds `Env`; it passes the secret in.
 *
 *  That also makes both halves ordinary pure functions — the same rule the
 *  engines follow, and the reason this file is testable without a container.
 *
 *  Signing only. Whether a verified id may actually unsubscribe — the row still
 *  exists, the address is read off it, the suppression is written — belongs to
 *  `unsubscribe.controller.ts`, which calls `verify()` and answers for every
 *  case it comes back `null` on. */

/** `<deliveryId>.<signature>`; the separator a token is split on. A UUID
 *  contains no dot and base64url emits none, so exactly one appears. */
const SEPARATOR = '.'

/** An empty key is not a weak key, it is a missing one — and HMAC will happily
 *  accept it, producing tokens anybody can forge with `createHmac` and the
 *  empty string. `env.ts` refuses to boot with `PV_MAS_ENABLED=true` and no
 *  secret; this is the second net, for every other way this file can be
 *  reached. */
function keyed(secret: string, value: string): Buffer {
  if (secret.length === 0) {
    throw new Error('PV_UNSUBSCRIBE_SECRET rỗng — không ký được liên kết huỷ đăng ký.')
  }
  return createHmac('sha256', secret).update(value).digest()
}

/** base64url, not base64: this string goes into a URL path, and `+` and `/`
 *  both need escaping there while `=` padding is noise a mail client is free to
 *  mangle when it linkifies. */
export function sign(deliveryId: string, secret: string): string {
  return `${deliveryId}${SEPARATOR}${keyed(secret, deliveryId).toString('base64url')}`
}

/** The delivery id a token vouches for, or `null` — never a thrown error for a
 *  malformed token.
 *
 *  This is reached from a public URL, so every shape of rubbish is an ordinary
 *  input: no separator, an empty half, a signature that is not base64, a
 *  signature of the wrong length. Each one is `null`, and the caller answers
 *  the same way it answers a wrong signature. Distinguishing them on screen
 *  would tell a probing client which half of the token it got right.
 *
 *  `timingSafeEqual` throws when the two buffers differ in length, which is
 *  itself an early exit an attacker can measure — so the length is checked
 *  first and both branches end in the same `null`. The comparison that matters,
 *  over two 32-byte digests, is the constant-time one. */
export function verify(token: string, secret: string): string | null {
  const cut = token.lastIndexOf(SEPARATOR)
  if (cut <= 0 || cut === token.length - 1) return null

  const deliveryId = token.slice(0, cut)
  const offered = Buffer.from(token.slice(cut + 1), 'base64url')
  const expected = keyed(secret, deliveryId)

  if (offered.length !== expected.length) return null
  return timingSafeEqual(offered, expected) ? deliveryId : null
}
