/** Insertion-ordered cache with a lifetime per entry. Insertion order is the
 *  eviction order: when full, the oldest key goes. */
export class TtlCache<T> {
  private readonly rows = new Map<string, { value: T; expiresAt: number }>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(key: string): T | undefined {
    const row = this.rows.get(key)
    if (!row) return undefined
    if (row.expiresAt <= Date.now()) {
      this.rows.delete(key)
      return undefined
    }
    return row.value
  }

  set(key: string, value: T): void {
    if (this.rows.size >= this.maxEntries) {
      const oldest = this.rows.keys().next()
      if (!oldest.done) this.rows.delete(oldest.value)
    }
    this.rows.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }
}
