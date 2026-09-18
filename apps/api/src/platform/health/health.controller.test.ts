// @vitest-environment node
import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DB } from '../db/db.module'
import { HealthController } from './health.controller'

/** The real controller behind a real Fastify adapter — status codes are the
 *  whole contract here, so they are read off the wire, not off a mock reply. */
async function serve(execute: () => Promise<unknown>): Promise<NestFastifyApplication> {
  @Module({ controllers: [HealthController], providers: [{ provide: DB, useValue: { execute } }] })
  class HealthOnly {}

  const app = await NestFactory.create<NestFastifyApplication>(HealthOnly, new FastifyAdapter(), {
    logger: false,
  })
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  return app
}

const up = () => vi.fn().mockResolvedValue({ rows: [] })
const down = () =>
  vi.fn().mockRejectedValue(
    Object.assign(new Error('Your account or project has exceeded the quota.'), {
      code: '53000',
    }),
  )

let app: NestFastifyApplication | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('GET /livez', () => {
  it('answers 200 without touching the database, even while it is down', async () => {
    const execute = down()
    app = await serve(execute)

    const res = await app.inject({ method: 'GET', url: '/livez' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('GET /readyz', () => {
  it('answers 200 when the database answers', async () => {
    app = await serve(up())

    const res = await app.inject({ method: 'GET', url: '/readyz' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok', db: true })
  })

  it('answers a real 503 when the database refuses', async () => {
    app = await serve(down())

    const res = await app.inject({ method: 'GET', url: '/readyz' })

    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ status: 'degraded', db: false })
  })
})

describe('GET /healthz (deprecated alias)', () => {
  it('no longer answers 200 for a degraded database', async () => {
    app = await serve(down())

    const res = await app.inject({ method: 'GET', url: '/healthz' })

    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ status: 'degraded', db: false })
  })
})
