import { createHash, randomBytes } from 'node:crypto'

/** THE TWO SECRETS THIS SYSTEM HANDS OUT — a session token and a reset token.
 *
 *  Both are made and stored the same way, and that sameness is deliberate:
 *  `platform.session.token_hash` and `platform.password_reset.token_hash` are
 *  the same kind of column holding the same kind of value, so they must not
 *  drift into two conventions that a reader has to keep straight.
 *
 *  ------------------------------------------------------------------
 *  32 BYTES, AND WHY THE NUMBER IS NOT NEGOTIABLE DOWNWARD
 *  ------------------------------------------------------------------
 *  Whoever holds a session token IS the person it was issued to — no password
 *  is asked for again. So the only defence against guessing is that the space
 *  is too large to walk: 2^256 with `randomBytes`, which is the operating
 *  system's CSPRNG and not `Math.random()`. A shorter, friendlier token (say
 *  8 bytes, because it fits on one line in a log) would be brute-forceable
 *  against a server that is happy to answer requests all day.
 *
 *  base64url and not hex: same entropy in 43 characters instead of 64, and no
 *  characters that need escaping in a `Set-Cookie` header or a query string.
 *  The reset token travels in a URL, so that matters twice.
 *
 *  ------------------------------------------------------------------
 *  sha256 WITH NO SALT AND NO KEY, ON PURPOSE
 *  ------------------------------------------------------------------
 *  `password.ts` goes to considerable trouble to be slow and salted; this file
 *  is deliberately the opposite, and the reason is the entropy of the input.
 *  A password is a human invention and lives in a wordlist; a token is 256 bits
 *  of noise, so there is no dictionary to try and no table to precompute. What
 *  the hash buys is that the DATABASE cannot impersonate anyone: a backup, a
 *  slow-query log, a person with read access to Neon — none of them come away
 *  with a token they can present. See the docblock at the top of
 *  `auth.schema.ts`, which owns this decision.
 *
 *  Slow hashing here would be an active mistake, not merely waste: this runs on
 *  EVERY authenticated request.
 *
 *  ------------------------------------------------------------------
 *  THERE IS NO CONSTANT-TIME COMPARE IN THIS FILE, AND THAT IS CORRECT
 *  ------------------------------------------------------------------
 *  Nothing in the auth path ever compares two tokens in JavaScript. The token
 *  is hashed and the hash is handed to Postgres, which answers from the UNIQUE
 *  index on `token_hash` — a comparison whose timing an attacker cannot read
 *  anything useful out of, because what varies with it is index depth, not how
 *  many leading characters they guessed right. A `timingSafeEqualStr` helper
 *  here would be an unused export inviting somebody to build the string
 *  comparison it exists to protect. */

/** A fresh secret for one session or one password-reset ticket. */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

/** What the database stores, for BOTH tables. Hex rather than base64url only
 *  because it is what a person reading a row expects a hash to look like; the
 *  column never leaves the server, so the encoding is free. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
