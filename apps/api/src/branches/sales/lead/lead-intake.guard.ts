import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import {
  createParamDecorator,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ENV, type Env } from '@api/platform/config/env'
import { PvError, invalid, rateLimited } from '@api/platform/http/problem'
import { LeadIntakeRepository, type IntakeClient } from './lead-intake.repository'

declare module 'fastify' {
  interface FastifyRequest {
    intakeClient?: IntakeClient
  }
}

/** Client metadata prepared by the guard, without exposing raw request objects
 *  to the controller or service. */
export const CurrentIntakeClient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IntakeClient => {
    const client = ctx.switchToHttp().getRequest<FastifyRequest>().intakeClient
    if (!client) throw new Error('Intake guard chưa chuẩn bị client context.')
    return client
  },
)

@Injectable()
export class LeadIntakeGuard implements CanActivate {
  private active = 0
  private readonly blocked = new Map<string, number>()

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly repo: LeadIntakeRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>()
    const reply = ctx.switchToHttp().getResponse<FastifyReply>()

    if (this.active >= this.env.PV_INTAKE_MAX_INFLIGHT) {
      reply.header('Retry-After', '5')
      throw rateLimited('Cửa nhận lead đang bận. Vui lòng thử lại sau vài giây.')
    }

    this.active++
    let released = false
    const release = () => {
      if (released) return
      released = true
      this.active--
    }
    reply.raw.once('finish', release)
    reply.raw.once('close', release)

    try {
      this.assertOrigin(req)
      const page = this.landingPageOf(req)
      const ip = this.clientIpOf(req)
      const ipHash = this.hash(`ip:${ip}`)
      const pageHash = this.hash(`page:${page.rateKey}`)

      const cachedWait = Math.max(this.cachedWait(pageHash), this.cachedWait(ipHash))
      if (cachedWait > 0) this.refuse(reply, cachedWait)

      /* Spend the page budget first. Once a botnet blocks one form, new random
         IPs no longer create unbounded limiter rows. */
      const pageWait = await this.repo.consume(pageHash, {
        scope: 'page',
        minute: this.env.PV_INTAKE_PAGE_RATE_PER_MINUTE,
        day: this.env.PV_INTAKE_PAGE_RATE_PER_DAY,
        blockMinutes: 1,
      })
      if (pageWait > 0) {
        this.rememberBlock(pageHash, pageWait)
        this.refuse(reply, pageWait)
      }

      const ipWait = await this.repo.consume(ipHash, {
        scope: 'ip',
        minute: this.env.PV_INTAKE_RATE_PER_MINUTE,
        day: this.env.PV_INTAKE_RATE_PER_DAY,
        blockMinutes: 15,
      })
      if (ipWait > 0) {
        this.rememberBlock(ipHash, ipWait)
        this.refuse(reply, ipWait)
      }

      if (page.denied) throw invalid({ landingPage: ['Landing page này chưa được cho phép.'] })

      req.intakeClient = {
        ipHash,
        ...this.header(req, 'origin', 300, 'origin'),
        ...this.header(req, 'referer', 500, 'referrer'),
        ...this.header(req, 'user-agent', 500, 'userAgent'),
      }
      return true
    } catch (error) {
      release()
      throw error
    }
  }

  private assertOrigin(req: FastifyRequest): void {
    const origin = req.headers.origin
    if (origin === undefined) return
    if (typeof origin !== 'string') throw this.originDenied()

    const local = this.env.NODE_ENV === 'development' && /^http:\/\/localhost:\d+$/.test(origin)
    if (!local && !this.env.PV_CORS_ORIGINS.includes(origin)) throw this.originDenied()
  }

  private originDenied(): PvError {
    return new PvError({
      kind: 'forbidden',
      status: 403,
      title: 'Origin này không được phép gửi lead.',
    })
  }

  private landingPageOf(req: FastifyRequest): { rateKey: string; denied: boolean } {
    const query = req.query as Record<string, unknown>
    const value = query.landingPage
    if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      return { rateKey: 'invalid', denied: false }
    }

    const allowlist = this.env.PV_INTAKE_LANDING_PAGES
    if (allowlist.length > 0 && !allowlist.includes(value)) {
      return { rateKey: 'invalid', denied: true }
    }
    return { rateKey: value, denied: false }
  }

  private clientIpOf(req: FastifyRequest): string {
    if (this.env.NODE_ENV !== 'production') return req.ip

    const value = req.headers['fly-client-ip']
    if (typeof value === 'string' && isIP(value) !== 0) return value
    throw new PvError({
      kind: 'server',
      status: 500,
      title: 'Không xác định được địa chỉ gửi yêu cầu.',
    })
  }

  private hash(value: string): string {
    return createHmac('sha256', this.env.PV_INTAKE_IP_HASH_SECRET).update(value).digest('hex')
  }

  private cachedWait(key: string): number {
    const until = this.blocked.get(key) ?? 0
    const wait = Math.ceil((until - Date.now()) / 1_000)
    if (wait > 0) return wait
    if (until !== 0) this.blocked.delete(key)
    return 0
  }

  private rememberBlock(key: string, seconds: number): void {
    /* Page caps bound how many IP keys can reach this map. The emergency cap
       below is still a final fence for configuration mistakes. */
    if (this.blocked.size >= 10_000) {
      for (const candidate of this.blocked.keys()) {
        if (this.cachedWait(candidate) === 0) continue
        this.blocked.delete(candidate)
        break
      }
    }
    this.blocked.set(key, Date.now() + seconds * 1_000)
  }

  private refuse(reply: FastifyReply, wait: number): never {
    reply.header('Retry-After', String(wait))
    throw rateLimited()
  }

  private header<K extends 'origin' | 'referrer' | 'userAgent'>(
    req: FastifyRequest,
    name: 'origin' | 'referer' | 'user-agent',
    max: number,
    key: K,
  ): Partial<Record<K, string>> {
    const value = req.headers[name]
    return typeof value === 'string' && value !== ''
      ? ({ [key]: value.slice(0, max) } as Record<K, string>)
      : {}
  }
}
