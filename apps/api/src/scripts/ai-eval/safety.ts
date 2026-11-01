import * as dns from 'node:dns'
import * as net from 'node:net'

/** What keeps `ai:eval --suite assistant` off every real system.
 *
 *  `ai:eval` loads `apps/api/.env`, which on another machine names production, so
 *  nothing here trusts the environment: the URL is overwritten before any module
 *  of the app loads and read back exactly. The tripwire turns "no network" from a
 *  promise into a thrown error, and the suite probes it before relying on it.
 *
 *  This file imports node only: importing the app from here would run the app's
 *  modules before the overwrite. There is no flag that widens either fence. */

export const MEMORY_URL = 'pglite://memory'

/** The hosts a live run may reach; a scripted run reaches none. */
export const VENDOR_HOSTS = ['generativelanguage.googleapis.com', 'api.anthropic.com'] as const

/** Exact match: `pglite://./.pglite` is the owner's dev data, not a throwaway. */
export function assertMemoryUrl(url: string | undefined): void {
  if (url !== MEMORY_URL) {
    throw new Error(`ai-eval refused: database is not ${MEMORY_URL}, nothing was opened`)
  }
}

/** Every variable the reachable graph could use to leave the process. */
export function forceEnv(keepVendorKeys: boolean): void {
  process.env.DATABASE_URL = MEMORY_URL
  process.env.PV_QUEUE_DATABASE_URL = ''
  process.env.PV_WORKER_DATABASE_URL = ''
  process.env.NODE_ENV = 'test'
  delete process.env.PV_ROLE
  process.env.STORAGE_DRIVER = 'disk'
  process.env.PV_CORS_ORIGINS = ''
  process.env.PV_EMAIL_ENABLED = 'false'
  if (keepVendorKeys) return
  process.env.GEMINI_API_KEY = ''
  process.env.ANTHROPIC_API_KEY = ''
}

type Connect = typeof net.Socket.prototype.connect

const hostOf = (args: unknown[]): string => {
  const first = Array.isArray(args[0]) ? (args[0] as unknown[])[0] : args[0]
  if (typeof first === 'object' && first !== null) {
    const o = first as { host?: string; servername?: string; path?: string }
    return o.servername ?? o.host ?? o.path ?? 'unknown'
  }
  return typeof args[1] === 'string' ? args[1] : String(first)
}

/** Records and refuses. `blocked` must be empty at the end of a run: a hook that
 *  swallows the throw would otherwise hide an attempt. */
export function installTripwire(allowed: readonly string[]): { blocked: string[] } {
  const blocked: string[] = []
  const open = (host: string): boolean => allowed.includes(host)
  const refuse = (what: string): never => {
    blocked.push(what)
    throw new Error(`ai-eval refused a network call: ${what}`)
  }

  const connect: Connect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function guarded(this: net.Socket, ...args: unknown[]) {
    const host = hostOf(args)
    return open(host) ? Reflect.apply(connect, this, args) : refuse(`connect ${host}`)
  } as Connect

  const lookup = dns.lookup
  /* `assign`: the module is a namespace to the type checker and a plain object here. */
  Object.assign(dns, {
    lookup(this: unknown, ...args: unknown[]) {
      const host = String(args[0])
      return open(host) ? Reflect.apply(lookup, this, args) : refuse(`dns ${host}`)
    },
  })

  const fetcher = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const host = new URL(url).hostname
    return open(host) ? fetcher(input, init) : refuse(`fetch ${host}`)
  }
  return { blocked }
}

/** Must see it bite, on both ways out, before trusting that it stayed quiet. */
export async function probeTripwire(blocked: string[]): Promise<void> {
  const before = blocked.length
  await fetch('http://127.0.0.1:9/').catch(() => undefined)
  try {
    net.connect(9, '127.0.0.1')
  } catch {
    /* The throw is the point; `blocked` below is what is read. */
  }
  if (blocked.length !== before + 2) throw new Error('ai-eval: the tripwire does not bite')
  blocked.length = before
}
