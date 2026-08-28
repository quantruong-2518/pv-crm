import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

/** PASSWORD HASHING — `scrypt` out of Node's own `node:crypto`, nothing added.
 *
 *  ------------------------------------------------------------------
 *  WHY NOT bcrypt OR argon2
 *  ------------------------------------------------------------------
 *  Both are better-known answers and both are NATIVE modules. This server is
 *  built into a Docker image and deployed to Fly; a native module turns that
 *  build into "does the builder image happen to carry the right toolchain and
 *  the right glibc", which is a class of failure that appears at deploy time
 *  on somebody else's machine and never on the laptop it was written on. The
 *  repo is dependency-strict for the same reason.
 *
 *  `scrypt` is memory-hard, ships with Node, and was designed for exactly this
 *  job. It is a weaker answer than argon2id on paper and a much stronger one
 *  than any hand-rolled PBKDF2 loop, and it costs zero dependencies.
 *
 *  ------------------------------------------------------------------
 *  WHY SALT MATTERS HERE AND DELIBERATELY DOES NOT FOR THE SESSION TOKEN
 *  ------------------------------------------------------------------
 *  `auth.schema.ts` stores a bare `sha256` of the session token and says, in
 *  its own docblock, that leaving the salt out is a decision rather than an
 *  oversight. Both statements are true at once, and the difference is entropy:
 *
 *   · A session token is 32 bytes from `randomBytes` — 2^256 possibilities.
 *     Nobody precomputes a lookup table for that space, so a salt would buy
 *     nothing and cost a column plus a round trip.
 *   · A password is something a person invented. The realistic space is a
 *     wordlist and a few substitutions, and it is REUSED across sites. Without
 *     a per-row salt, one rainbow table cracks every account at once, and two
 *     people who picked the same password are visibly identical in the dump.
 *     The salt is what forces an attacker to spend the full scrypt cost once
 *     PER ACCOUNT instead of once for the whole table.
 *
 *  So: 16 random bytes per hash, stored in the clear beside the hash. A salt is
 *  not a secret — its whole job is to be unique.
 *
 *  ------------------------------------------------------------------
 *  THE STORED STRING CARRIES ITS OWN PARAMETERS
 *  ------------------------------------------------------------------
 *      scrypt$N=16384,r=8,p=1$<salt base64url>$<key base64url>
 *
 *  `verifyPassword` re-derives with the parameters READ OUT OF THE STRING, not
 *  with the constants below. That is what makes the cost raisable: the day
 *  N goes to 32768, every hash written from then on carries the new number and
 *  every hash written before it still verifies against the old one. Reading the
 *  constants instead would lock out everybody who last changed their password
 *  before the bump — a self-inflicted outage with no error message anywhere,
 *  because "wrong password" is exactly what it looks like. */

/** CPU/memory cost. 16384 is the figure Node's own documentation uses and is
 *  around 100 ms on the machine class this runs on — slow enough to make an
 *  offline dictionary attack expensive, fast enough that a person signing in
 *  does not notice. Raise it here; old hashes keep verifying (see above). */
const N = 16384
const r = 8
const p = 1

const SALT_BYTES = 16
const KEY_BYTES = 64

/** Node refuses a derivation when `128 * N * r > maxmem`, and its default
 *  `maxmem` is 32 MiB. At N=16384 the requirement is exactly 16 MiB, so the
 *  default would just barely do — and the next doubling of N would land on
 *  32 MiB, i.e. precisely at the limit, and start throwing. Asking for 64 MiB
 *  now means raising the cost later is a one-character edit rather than a
 *  puzzling `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` in production. */
const MAXMEM = 64 * 1024 * 1024

/** Sanity bounds applied to parameters READ BACK from a stored string.
 *
 *  The column is ours, so this is not input validation in the usual sense — it
 *  is a fuse. A corrupted or hand-edited row carrying `N=1073741824` would make
 *  one sign-in attempt try to allocate a terabyte and take the process with it,
 *  which is a denial of service delivered through the password field. Anything
 *  outside these bounds is treated as a malformed hash: the answer is `false`,
 *  same as any other unusable stored value. */
const N_MAX = 1 << 20
const R_MAX = 32
const P_MAX = 16

/** `scrypt` with a promise around it, and NEVER `scryptSync`.
 *
 *  `scryptSync` blocks the event loop for the whole derivation — about 100 ms
 *  at these parameters. On the request path that is not "a slow endpoint", it
 *  is the ENTIRE server stopping: every in-flight request, every queue poll,
 *  every health check waits behind one person typing a password. The async form
 *  runs on libuv's threadpool and costs one thread instead. */
function derive(plain: string, salt: Buffer, params: Params, keyBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      plain,
      salt,
      keyBytes,
      { N: params.N, r: params.r, p: params.p, maxmem: MAXMEM },
      (error, key) => {
        if (error) reject(error)
        else resolve(key)
      },
    )
  })
}

type Params = { N: number; r: number; p: number }

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const key = await derive(plain, salt, { N, r, p }, KEY_BYTES)
  return `scrypt$N=${N},r=${r},p=${p}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

/** `true` only when `plain` re-derives to exactly what is stored.
 *
 *  NEVER THROWS. A stored string that cannot be parsed — a truncated column, a
 *  value written by some earlier scheme, a row edited by hand — is a failed
 *  sign-in, not a 500. Throwing here would turn one bad row into a stack trace
 *  in the log and, worse, into a DIFFERENT response than a wrong password,
 *  which is one more bit an outsider can read off the server. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parsed = parse(stored)
  if (!parsed) return false

  try {
    const derived = await derive(plain, parsed.salt, parsed.params, parsed.key.length)
    /* Length is compared first because `timingSafeEqual` THROWS on a length
       mismatch rather than returning false — and a mismatch is only reachable
       through a malformed row, which must answer `false` like everything else
       in this function. */
    return derived.length === parsed.key.length && timingSafeEqual(derived, parsed.key)
  } catch {
    return false
  }
}

/** A REAL hash of a value nobody knows, for the "no such mailbox" path.
 *
 *  `signIn` must spend the same ~100 ms whether or not the address exists.
 *  Skipping the derivation when the lookup misses makes the RESPONSE TIME an
 *  oracle: a few hundred probes and an outsider has a list of which mailboxes
 *  belong to accounts here, which is precisely the fact the identical error
 *  message in `auth.service.ts` refuses to hand over. A timing difference of
 *  two orders of magnitude is not subtle — it is legible over the public
 *  internet without any statistics.
 *
 *  Built once per process, lazily: it costs one derivation, and paying it at
 *  import time would add 100 ms to every boot including the worker's, which
 *  never signs anybody in. The random input is thrown away deliberately — no
 *  password on earth verifies against this, so the comparison always fails and
 *  only the CPU time is real. */
let dummy: Promise<string> | null = null
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(32).toString('base64url'))
  return dummy
}

function parse(stored: string): { params: Params; salt: Buffer; key: Buffer } | null {
  const parts = stored.split('$')
  if (parts.length !== 4) return null
  const [scheme, spec, saltPart, keyPart] = parts
  if (scheme !== 'scrypt' || !spec || !saltPart || !keyPart) return null

  const match = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(spec)
  if (!match) return null
  const params = { N: Number(match[1]), r: Number(match[2]), p: Number(match[3]) }
  if (params.N < 2 || params.N > N_MAX || (params.N & (params.N - 1)) !== 0) return null
  if (params.r < 1 || params.r > R_MAX) return null
  if (params.p < 1 || params.p > P_MAX) return null

  const salt = Buffer.from(saltPart, 'base64url')
  const key = Buffer.from(keyPart, 'base64url')
  /* `Buffer.from(…, 'base64url')` never throws — it silently drops characters
     it cannot read, so garbage decodes to a short buffer rather than to an
     error. Empty is the only shape that reliably means "this was not base64",
     and a zero-length key would otherwise compare equal to another zero-length
     key and let anybody in. */
  if (salt.length === 0 || key.length === 0) return null

  return { params, salt, key }
}
