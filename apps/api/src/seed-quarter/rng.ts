/** Deterministic PRNG (mulberry32). Every draw of a run comes from here, so the
 *  same `params.SEED` reproduces the same book byte for byte. `fork` derives a
 *  stream from the ORIGINAL seed plus a label, never from the current state, so
 *  adding a scenario or skipping an emitter does not shift anyone else's draws. */

export type Rng = {
  next(): number
  int(a: number, b: number): number
  real(a: number, b: number): number
  chance(p: number): boolean
  pick<T>(xs: readonly T[]): T
  weighted<T>(pairs: readonly (readonly [T, number])[]): T
  weightedKey<K extends string>(w: Record<K, number>): K
  logUniform(a: number, b: number): number
  /** A v4-shaped uuid drawn from the stream, for tables whose id is random. */
  uuid(): string
  fork(label: string): Rng
}

/** FNV-1a over the label, folded into a 32-bit seed. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function makeRng(seed: number): Rng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const real = (a: number, b: number): number => a + next() * (b - a)
  const int = (a: number, b: number): number => a + Math.floor(next() * (b - a + 1))
  const weighted = <T>(pairs: readonly (readonly [T, number])[]): T => {
    const total = pairs.reduce((n, [, w]) => n + w, 0)
    let at = next() * total
    for (const [value, w] of pairs) {
      at -= w
      if (at < 0) return value
    }
    return pairs[pairs.length - 1]![0]
  }
  const hex = (): string => int(0, 15).toString(16)
  return {
    next,
    int,
    real,
    chance: (p) => next() < p,
    pick: (xs) => xs[Math.floor(next() * xs.length)]!,
    weighted,
    weightedKey: (w) =>
      weighted(Object.entries(w) as [string, number][] as [never, number][]) as never,
    logUniform: (a, b) => Math.exp(real(Math.log(a), Math.log(b))),
    uuid: () => {
      const digits = Array.from({ length: 32 }, hex).join('')
      const variant = (8 + int(0, 3)).toString(16)
      return `${digits.slice(0, 8)}-${digits.slice(8, 12)}-4${digits.slice(13, 16)}-${variant}${digits.slice(17, 20)}-${digits.slice(20, 32)}`
    },
    fork: (label) => makeRng(hash(`${seed}:${label}`)),
  }
}
