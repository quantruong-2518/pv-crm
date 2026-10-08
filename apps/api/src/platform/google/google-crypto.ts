import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

/** The two secrets of the Google link, both keyed by `GOOGLE_TOKEN_KEY`.
 *
 *  Refresh tokens are sealed with AES-256-GCM before they reach
 *  `platform.google_link`, with the actor id as associated data: a ciphertext
 *  copied onto another person's row fails to open instead of acting as them.
 *
 *  The OAuth `state` is HMAC-signed and short-lived, and names the actor who
 *  asked for the consent URL — the callback refuses it for anybody else, so a
 *  link started by one person cannot land a Google account on another's row.
 *  Its HMAC key is derived from the token key rather than being a fifth env
 *  variable: one secret to rotate, two purposes kept apart by the label. */

const IV_BYTES = 12
const TAG_BYTES = 16
const STATE_LABEL = 'pv.google.oauth-state'

/** The env value is base64 of exactly 32 bytes — AES-256 accepts no other size. */
export function tokenKeyOf(base64: string): Buffer | null {
  const key = Buffer.from(base64, 'base64')
  return key.length === 32 ? key : null
}

/** `iv | tag | ciphertext`, base64 — one text column, no separate IV column. */
export function sealToken(key: Buffer, actorId: string, token: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(actorId))
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
}

/** Throws on a wrong key, a tampered byte or another actor's ciphertext. */
export function openToken(key: Buffer, actorId: string, sealed: string): string {
  const raw = Buffer.from(sealed, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES))
  decipher.setAAD(Buffer.from(actorId))
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8')
}

export function signState(key: Buffer, actorId: string, expiresAt: Date): string {
  const body = Buffer.from(
    JSON.stringify({ a: actorId, e: expiresAt.getTime(), n: randomBytes(8).toString('hex') }),
  ).toString('base64url')
  return `${body}.${macOf(key, body)}`
}

/** The actor the state was minted for, or null when forged, garbled or expired. */
export function readState(key: Buffer, state: string, now: Date): string | null {
  const [body, mac] = state.split('.')
  if (!body || !mac) return null
  const want = Buffer.from(macOf(key, body))
  const got = Buffer.from(mac)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const { a, e } = parsed as { a?: unknown; e?: unknown }
    if (typeof a !== 'string' || typeof e !== 'number' || e <= now.getTime()) return null
    return a
  } catch {
    return null
  }
}

function macOf(key: Buffer, body: string): string {
  const stateKey = createHmac('sha256', key).update(STATE_LABEL).digest()
  return createHmac('sha256', stateKey).update(body).digest('base64url')
}
