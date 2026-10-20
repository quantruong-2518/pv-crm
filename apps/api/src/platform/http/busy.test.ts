// @vitest-environment node
import { HttpException, Logger, type ArgumentsHost } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { ProblemFilter } from './problem.filter'

const pgError = (code: string) =>
  Object.assign(new Error('pg says no'), { code, severity: 'ERROR', routine: 'ProcessInterrupts' })

/** Runs the real filter against a fake Fastify request and returns what it sent. */
function respond(raw: unknown): { status: number; body: Record<string, unknown> } {
  const sent = { status: 0, body: {} as Record<string, unknown> }
  const reply = {
    status(code: number) {
      sent.status = code
      return reply
    },
    type: () => reply,
    send(body: Record<string, unknown>) {
      sent.body = body
    },
  }
  const req = {
    method: 'GET',
    url: '/sales/leads/LD-1?x=1',
    id: 'req-1',
    headers: {},
    routeOptions: { url: '/sales/leads/:code' },
  }
  const host = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => reply }) }
  new ProblemFilter().catch(raw, host as unknown as ArgumentsHost)
  return sent
}

describe('database budgets reach the client as a controlled 503', () => {
  it.each([
    ['statement_timeout (57014)', '57014'],
    ['lock_timeout (55P03)', '55P03'],
  ])('%s', (_, code) => {
    const { status, body } = respond(pgError(code))
    expect(status).toBe(503)
    expect(body).toMatchObject({
      type: 'server',
      title: 'Hệ thống đang bận, thử lại sau ít phút.',
      status: 503,
      instance: '/sales/leads/LD-1?x=1',
      traceId: 'req-1',
    })
  })

  it('still sees the code through a wrapped cause', () => {
    expect(respond(new Error('query failed', { cause: pgError('57014') })).status).toBe(503)
  })

  it('leaves every other status exactly as it was', () => {
    expect(respond(pgError('23505')).status).toBe(409)
    expect(respond(new HttpException('too big', 413)).status).toBe(500)
    expect(respond(new HttpException('later', 503)).status).toBe(500)
    expect(respond(new Error('boom')).status).toBe(500)
  })

  it('logs the route pattern and the SQLSTATE, not the URL', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    respond(pgError('57014'))
    const line = String(warn.mock.calls[0]?.[0])
    expect(line).toContain('GET /sales/leads/:code')
    expect(line).toContain('57014')
    expect(line).not.toContain('LD-1')
    warn.mockRestore()
  })
})
