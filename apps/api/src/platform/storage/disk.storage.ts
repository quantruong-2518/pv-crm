import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { Env } from '../config/env'
import {
  GET_TTL_SECONDS,
  PUT_TTL_SECONDS,
  StorageObjectMissingError,
  StorageService,
} from './storage.service'

/** What a local URL vouches for. Short keys: it rides in the URL path. */
export type LocalGrant = { o: 'put' | 'get'; k: string; m: string; b: number; e: number }

/** DEV-ONLY storage: files under `STORAGE_DISK_DIR`, served by
 *  `local-storage.controller.ts` at `/storage/local/:token`.
 *
 *  The token is the grant itself plus an HMAC over it — the same shape as the
 *  unsubscribe link — so the route needs no session and no table, and behaves
 *  like a presigned S3 URL: the browser PUTs cross-origin with no cookie, and
 *  the operation, key, type, length and expiry cannot be edited without the
 *  secret. `env.ts` refuses this driver in production: a Fly machine's disk
 *  does not survive a deploy. */
export class DiskStorage extends StorageService {
  private readonly root: string
  private readonly base: string

  constructor(private readonly env: Env) {
    super()
    this.root = resolve(env.STORAGE_DISK_DIR)
    this.base = (env.PV_API_PUBLIC_URL || `http://localhost:${env.PORT}`).replace(/\/+$/, '')
  }

  presignPut(key: string, mime: string, bytes: number): Promise<string> {
    return Promise.resolve(
      this.url({ o: 'put', k: key, m: mime, b: bytes, e: expiry(PUT_TTL_SECONDS) }),
    )
  }

  presignGet(key: string, ttlSeconds = GET_TTL_SECONDS): Promise<string> {
    return Promise.resolve(this.url({ o: 'get', k: key, m: '', b: 0, e: expiry(ttlSeconds) }))
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.pathOf(key)).catch((error: NodeJS.ErrnoException) => {
      throw error.code === 'ENOENT' ? new StorageObjectMissingError(key) : error
    })
  }

  async size(key: string): Promise<number | null> {
    return stat(this.pathOf(key)).then(
      (s) => s.size,
      () => null,
    )
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true })
  }

  async write(key: string, body: Buffer): Promise<void> {
    const path = this.pathOf(key)
    await mkdir(dirname(path), { recursive: true })
    /* `wx`: an upload URL stays valid for 15 minutes, and a second PUT must
       not swap the bytes after the reader has read them. */
    await writeFile(path, body, { flag: 'wx' })
  }

  /** The grant a token carries, or `null` for a forged, malformed or expired
   *  one — never which of the three, for `unsubscribe-token.ts`'s reason. */
  verify(token: string): LocalGrant | null {
    const [payload, signature] = token.split('.')
    if (!payload || !signature) return null
    const offered = Buffer.from(signature, 'base64url')
    const expected = this.sign(payload)
    if (offered.length !== expected.length || !timingSafeEqual(offered, expected)) return null
    const grant = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LocalGrant
    return grant.e > Date.now() / 1_000 ? grant : null
  }

  private url(grant: LocalGrant): string {
    const payload = Buffer.from(JSON.stringify(grant)).toString('base64url')
    return `${this.base}/storage/local/${payload}.${this.sign(payload).toString('base64url')}`
  }

  private sign(payload: string): Buffer {
    return createHmac('sha256', this.env.STORAGE_DISK_SECRET).update(payload).digest()
  }

  /** Keys are server-made, but a key that escapes the root is a bug worth a
   *  throw rather than a write somewhere else on the machine. */
  private pathOf(key: string): string {
    const path = resolve(this.root, key)
    if (!path.startsWith(this.root + sep)) throw new Error(`storage: key escapes root: ${key}`)
    return path
  }
}

function expiry(ttlSeconds: number): number {
  return Math.floor(Date.now() / 1_000) + ttlSeconds
}
