// @vitest-environment node
import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../config/env'
import type { MailLedger } from './mail.contract'
import type { MailSignalRepository } from './mail-signal.repository'
import { UnsubscribeController } from './unsubscribe.controller'
import { sign } from './unsubscribe-token'

/** The click comes from the target mailbox while mail is redirected, so it must
 *  not suppress the original recipient; the engagement is still recorded. */

const SECRET = 'test-secret'
const ID = '0b9c7a4e-3f1d-4c2a-9e8b-5a6d7c8e9f01'

const run = async (redirectTo: string) => {
  const suppress = vi.fn(async () => {})
  const recordEngagement = vi.fn(async () => 'recorded')
  const controller = new UnsubscribeController(
    loadEnv({
      DATABASE_URL: 'pglite://memory',
      PV_UNSUBSCRIBE_SECRET: SECRET,
      PV_EMAIL_REDIRECT_TO: redirectTo,
    }),
    { suppress } as unknown as MailLedger,
    {
      recipientOf: async () => 'staff@demo.example',
      recordEngagement,
    } as unknown as MailSignalRepository,
  )
  await controller.oneClick(sign(ID, SECRET))
  return { suppress, recordEngagement }
}

describe('unsubscribe while mail is redirected', () => {
  it('redirect off: the recipient is suppressed', async () => {
    const { suppress } = await run('')
    expect(suppress).toHaveBeenCalledWith('staff@demo.example', 'unsubscribe', 'operator')
  })

  it('redirect on: nobody is suppressed, the click is still recorded', async () => {
    const { suppress, recordEngagement } = await run('owner@demo.example')
    expect(suppress).not.toHaveBeenCalled()
    expect(recordEngagement).toHaveBeenCalledOnce()
  })
})
