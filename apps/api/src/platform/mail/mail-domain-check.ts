import { Resolver } from 'node:dns/promises'
import { domainToASCII } from 'node:url'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'

/** WHICH ADDRESSES SIT ON A DOMAIN THAT CANNOT RECEIVE MAIL — asked at send
 *  time, before a letter is filed, so a dead domain is dropped with a reason
 *  instead of bouncing against the sending domain's reputation.
 *
 *  Three verdicts per domain and only `dead` blocks. `unknown` — a timeout, a
 *  failing resolver, the deadline passing — always means "send": a flaky DNS
 *  must never stop a real customer's letter.
 *
 *  "No MX" alone is not dead: RFC 5321 §5.1 falls back to the address record.
 *  Dead is NXDOMAIN, a null MX (RFC 7505), or no MX and no A and no AAAA.
 *
 *  Nothing is stored. The cache is this process's memory and expires by
 *  itself; no address ever reaches a log line. */

export type DomainVerdict = 'dead' | 'ok' | 'unknown'

/** The three lookups this file makes — the seam the unit test replaces. */
export interface DomainResolver {
  resolveMx(domain: string): Promise<Array<{ exchange: string }>>
  resolve4(domain: string): Promise<string[]>
  resolve6(domain: string): Promise<string[]>
}

export const MAIL_DOMAIN_RESOLVER = Symbol('pv.mail.domain-resolver')

/** One lookup. A healthy resolver answers in tens of ms; past this it is the
 *  resolver that is in trouble, not the domain. One try: a retry would spend
 *  the whole deadline on a single name. */
const LOOKUP_TIMEOUT_MS = 1_200
/** The whole call. A preflight is a person waiting on a form, so nothing waits
 *  longer; a name that needs more (several slow nameservers) reads `unknown`. */
const DEADLINE_MS = 2_500
/** A bulk preflight is a few hundred domains; this drains them inside the
 *  deadline at ~50 ms a lookup without flooding the resolver with one burst. */
const CONCURRENCY = 32
/** MX setups change over days, so an hour of trust costs nothing. */
const OK_TTL_MS = 60 * 60_000
/** Short on purpose: a domain registered a minute ago, or an outage that read
 *  as NXDOMAIN, must heal by itself before anybody has to ask why. */
const DEAD_TTL_MS = 5 * 60_000
/** Far above one company's customer domains; only bounds a runaway import. */
const CACHE_MAX = 5_000

/** Answers the resolver gives when the NAME or the RECORD is simply absent. */
const NO_NAME = 'ENOTFOUND'
const NO_RECORD = 'ENODATA'

@Injectable()
export class MailDomainCheck {
  private readonly log = new Logger('mail.domain')
  private readonly resolver: DomainResolver
  private readonly cache = new Map<string, { verdict: 'dead' | 'ok'; until: number }>()
  private readonly inFlight = new Map<string, Promise<DomainVerdict>>()

  constructor(@Optional() @Inject(MAIL_DOMAIN_RESOLVER) resolver?: DomainResolver) {
    this.resolver = resolver ?? new Resolver({ timeout: LOOKUP_TIMEOUT_MS, tries: 1 })
  }

  /** The input addresses (normalised: trimmed, lower-cased) whose domain definitely
   *  cannot receive mail. Never throws, never rejects. An address whose domain could
   *  not be judged in time is NOT in the set — doubt always means "send". */
  async undeliverable(addresses: readonly string[]): Promise<Set<string>> {
    const dead = new Set<string>()
    try {
      const byDomain = new Map<string, string[]>()
      for (const raw of addresses) {
        const address = raw.trim().toLowerCase()
        const domain = domainOf(address)
        if (!domain) continue
        const sameDomain = byDomain.get(domain)
        if (sameDomain) sameDomain.push(address)
        else byDomain.set(domain, [address])
      }

      const verdicts = await this.judgeAll([...byDomain.keys()])
      for (const [domain, verdict] of verdicts) {
        if (verdict === 'dead') for (const address of byDomain.get(domain) ?? []) dead.add(address)
      }
      const judged = [...verdicts.values()].filter((verdict) => verdict !== 'unknown').length
      const unjudged = byDomain.size - judged
      const counts = `domains=${byDomain.size} unjudged=${unjudged} dead_addresses=${dead.size}`
      /* Unjudged domains are sent unchecked — worth a visible line, or a broken
         resolver turns this check into a silent no-op. */
      if (unjudged > 0) this.log.log(counts)
      else this.log.debug(counts)
    } catch (error) {
      /* Doubt means send: a bug here must cost a bounce, never a blocked letter. */
      this.log.warn(`check failed — ${error instanceof Error ? error.name : 'unknown error'}`)
      dead.clear()
    }
    return dead
  }

  /** Verdicts that arrived before the deadline. Lookups still running are not
   *  cancelled: they finish into the cache, so the next preflight is instant. */
  private async judgeAll(domains: string[]): Promise<Map<string, DomainVerdict>> {
    const verdicts = new Map<string, DomainVerdict>()
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < domains.length) {
        const domain = domains[next++] as string
        verdicts.set(domain, await this.judge(domain))
      }
    }
    const all = Promise.all(Array.from({ length: CONCURRENCY }, worker))
    let timer: NodeJS.Timeout | undefined
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, DEADLINE_MS)
    })
    await Promise.race([all, deadline])
    clearTimeout(timer)
    /* A copy: workers past the deadline keep writing into `verdicts`. */
    return new Map(verdicts)
  }

  private judge(domain: string): Promise<DomainVerdict> {
    const hit = this.cache.get(domain)
    if (hit && hit.until > Date.now()) return Promise.resolve(hit.verdict)

    const running = this.inFlight.get(domain)
    if (running) return running
    const lookup = this.lookup(domain)
      .catch((): DomainVerdict => 'unknown')
      .then((verdict) => {
        this.inFlight.delete(domain)
        if (verdict !== 'unknown') this.remember(domain, verdict)
        return verdict
      })
    this.inFlight.set(domain, lookup)
    return lookup
  }

  private async lookup(domain: string): Promise<DomainVerdict> {
    const mx = await answer(this.resolver.resolveMx(domain))
    if (mx === 'no-name') return 'dead'
    if (mx === 'error') return 'unknown'
    if (mx !== 'no-record' && mx.length > 0) {
      /* RFC 7505: the only exchange is the root — "this domain takes no mail". */
      return mx.some((record) => record.exchange.replace(/\.$/, '') !== '') ? 'ok' : 'dead'
    }

    const [a, aaaa] = await Promise.all([
      answer(this.resolver.resolve4(domain)),
      answer(this.resolver.resolve6(domain)),
    ])
    const has = (records: typeof a): boolean => Array.isArray(records) && records.length > 0
    if (has(a) || has(aaaa)) return 'ok'
    /* Dead only when BOTH families answered "nothing"; one failed lookup is doubt. */
    return a === 'error' || aaaa === 'error' ? 'unknown' : 'dead'
  }

  private remember(domain: string, verdict: 'dead' | 'ok'): void {
    this.cache.delete(domain)
    if (this.cache.size >= CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    const ttl = verdict === 'dead' ? DEAD_TTL_MS : OK_TTL_MS
    this.cache.set(domain, { verdict, until: Date.now() + ttl })
  }
}

/** The records, or WHY there are none. Only the two "absent" codes are facts
 *  about the domain; every other failure (ETIMEOUT, ESERVFAIL, EREFUSED,
 *  ECONNREFUSED, …) is a fact about the resolver and reads as `error`. */
async function answer<T>(lookup: Promise<T[]>): Promise<T[] | 'no-name' | 'no-record' | 'error'> {
  try {
    return await lookup
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code
    return code === NO_NAME ? 'no-name' : code === NO_RECORD ? 'no-record' : 'error'
  }
}

/** The ASCII domain to look up, or null when the address is not this
 *  service's business: syntax belongs to the contract, not to DNS. */
function domainOf(address: string): string | null {
  const parts = address.split('@')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const ascii = domainToASCII(parts[1])
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(ascii) ? ascii : null
}
