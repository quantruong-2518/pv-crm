import { afterEach, describe, expect, it, vi } from 'vitest'
import { MailDomainCheck, type DomainResolver } from './mail-domain-check'

type Answer<T> = T[] | string | 'hang'
type Zone = { mx?: Answer<{ exchange: string }>; a?: Answer<string>; aaaa?: Answer<string> }

/** A resolver over a fixed table. A string is the error code to reject with;
 *  `hang` never settles; a missing entry is ENODATA. */
function resolverOf(zones: Record<string, Zone>) {
  const calls: string[] = []
  const reply = <T>(kind: keyof Zone, domain: string): Promise<T[]> => {
    calls.push(`${kind}:${domain}`)
    const zone = zones[domain]
    if (!zone) return Promise.reject(Object.assign(new Error('nx'), { code: 'ENOTFOUND' }))
    const value = (zone[kind] ?? 'ENODATA') as Answer<T>
    if (value === 'hang') return new Promise(() => undefined)
    if (typeof value === 'string') {
      return Promise.reject(Object.assign(new Error(value), { code: value }))
    }
    return Promise.resolve(value)
  }
  const resolver: DomainResolver = {
    resolveMx: (domain) => reply('mx', domain),
    resolve4: (domain) => reply('a', domain),
    resolve6: (domain) => reply('aaaa', domain),
  }
  return { resolver, calls }
}

const MX = [{ exchange: 'mx.host.test' }]

afterEach(() => {
  vi.useRealTimers()
})

describe('MailDomainCheck verdicts', () => {
  const table: Array<[string, Zone | undefined, boolean]> = [
    ['NXDOMAIN → dead', undefined, true],
    ['null MX "." → dead', { mx: [{ exchange: '.' }] }, true],
    ['null MX as empty exchange → dead', { mx: [{ exchange: '' }], a: ['1.2.3.4'] }, true],
    ['MX present → ok', { mx: MX }, false],
    ['a usable MX beside a null one → ok', { mx: [{ exchange: '' }, ...MX] }, false],
    ['no MX + A → ok', { a: ['1.2.3.4'] }, false],
    ['no MX + no A + AAAA → ok', { aaaa: ['::1'] }, false],
    ['no MX + no A + no AAAA → dead', {}, true],
    ['empty MX answer + nothing else → dead', { mx: [] }, true],
    ['MX timeout → unknown', { mx: 'ETIMEOUT' }, false],
    ['MX SERVFAIL → unknown', { mx: 'ESERVFAIL' }, false],
    ['MX REFUSED → unknown', { mx: 'EREFUSED' }, false],
    ['MX connection refused → unknown', { mx: 'ECONNREFUSED' }, false],
    ['no MX, A fails, AAAA empty → unknown', { a: 'ESERVFAIL' }, false],
    ['no MX, A empty, AAAA times out → unknown', { aaaa: 'ETIMEOUT' }, false],
    ['no MX, A fails, AAAA present → ok', { a: 'ETIMEOUT', aaaa: ['::1'] }, false],
  ]

  it.each(table)('%s', async (_name, zone, dead) => {
    const { resolver } = resolverOf(zone ? { 'khach.test': zone } : {})
    const result = await new MailDomainCheck(resolver).undeliverable(['lan@khach.test'])
    expect([...result]).toEqual(dead ? ['lan@khach.test'] : [])
  })
})

describe('MailDomainCheck', () => {
  it('returns the normalised addresses of dead domains only', async () => {
    const { resolver } = resolverOf({ 'good.test': { mx: MX } })
    const result = await new MailDomainCheck(resolver).undeliverable([
      '  Lan@Gone.TEST ',
      'an@good.test',
      'binh@gone.test',
    ])
    expect([...result].sort()).toEqual(['binh@gone.test', 'lan@gone.test'])
  })

  it('looks an IDN domain up in ASCII, whatever its case', async () => {
    const { resolver, calls } = resolverOf({ 'xn--bcher-kva.test': { mx: [{ exchange: '.' }] } })
    const result = await new MailDomainCheck(resolver).undeliverable(['Lan@BÜCHER.test'])
    expect(calls).toEqual(['mx:xn--bcher-kva.test'])
    expect([...result]).toEqual(['lan@bücher.test'])
  })

  it.each([
    'no-at-sign',
    'two@at@signs.test',
    '@nolocal.test',
    'nodomain@',
    'lan@localhost',
    'lan@[127.0.0.1]',
    'lan@bad domain.test',
    'lan@trailing.test.',
    '',
  ])('skips a malformed address without a lookup: %j', async (address) => {
    const { resolver, calls } = resolverOf({})
    expect((await new MailDomainCheck(resolver).undeliverable([address])).size).toBe(0)
    expect(calls).toEqual([])
  })

  it('judges 2,000 addresses on 3 domains with 3 MX lookups', async () => {
    const { resolver, calls } = resolverOf({ 'a.test': { mx: MX }, 'b.test': { mx: MX } })
    const domains = ['a.test', 'b.test', 'gone.test']
    const addresses = Array.from({ length: 2_000 }, (_, i) => `u${i}@${domains[i % 3]}`)
    const result = await new MailDomainCheck(resolver).undeliverable(addresses)
    expect(calls.sort()).toEqual(['mx:a.test', 'mx:b.test', 'mx:gone.test'])
    expect(result.size).toBe(666)
    expect([...result].every((address) => address.endsWith('@gone.test'))).toBe(true)
  })

  it('answers from the cache without a second lookup', async () => {
    const { resolver, calls } = resolverOf({ 'good.test': { mx: MX } })
    const check = new MailDomainCheck(resolver)
    await check.undeliverable(['a@good.test', 'a@gone.test'])
    const again = await check.undeliverable(['b@good.test', 'b@gone.test'])
    expect(calls).toHaveLength(2)
    expect([...again]).toEqual(['b@gone.test'])
  })

  it('never caches unknown', async () => {
    const { resolver, calls } = resolverOf({ 'slow.test': { mx: 'ETIMEOUT' } })
    const check = new MailDomainCheck(resolver)
    await check.undeliverable(['a@slow.test'])
    await check.undeliverable(['a@slow.test'])
    expect(calls).toHaveLength(2)
  })

  it('lets a dead verdict expire within minutes while ok is kept', async () => {
    vi.useFakeTimers()
    const zones: Record<string, Zone> = { 'good.test': { mx: MX } }
    const { resolver, calls } = resolverOf(zones)
    const check = new MailDomainCheck(resolver)
    expect((await check.undeliverable(['a@new.test', 'a@good.test'])).size).toBe(1)

    zones['new.test'] = { mx: MX }
    vi.setSystemTime(Date.now() + 4 * 60_000)
    expect((await check.undeliverable(['a@new.test'])).size).toBe(1)
    vi.setSystemTime(Date.now() + 2 * 60_000)
    expect((await check.undeliverable(['a@new.test', 'a@good.test'])).size).toBe(0)
    expect(calls).toEqual(['mx:new.test', 'mx:good.test', 'mx:new.test'])
  })

  it('returns at the overall deadline, with unresolved domains left out', async () => {
    vi.useFakeTimers()
    const { resolver } = resolverOf({ 'hang.test': { mx: 'hang' } })
    const pending = new MailDomainCheck(resolver).undeliverable(['a@hang.test', 'a@gone.test'])
    let settled = false
    void pending.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(2_400)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect([...(await pending)]).toEqual(['a@gone.test'])
  })

  it('never rejects, even when the resolver throws synchronously', async () => {
    const broken = {
      resolveMx: () => {
        throw new Error('boom')
      },
    } as unknown as DomainResolver
    await expect(new MailDomainCheck(broken).undeliverable(['a@x.test'])).resolves.toEqual(
      new Set(),
    )
  })
})
