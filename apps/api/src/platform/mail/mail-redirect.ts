import { Logger } from '@nestjs/common'
import type { Env } from '@api/platform/config/env'
import type { MailMessage, MailPort } from './mail.contract'

/** Capped redirect (`PV_EMAIL_REDIRECT_TO`). The production demo book holds
 *  real staff, so every letter lands in ONE owner mailbox instead, a few per
 *  day. Past the cap the console driver takes it, so the job and the ledger
 *  behave as with the mail flag off. The counter is per process on purpose. */

/** True while letters are re-addressed. Provider signals then describe the
 *  target mailbox, never the original recipient, so nothing may blame an address. */
export const redirectOn = (env: Pick<Env, 'PV_EMAIL_REDIRECT_TO'>): boolean =>
  env.PV_EMAIL_REDIRECT_TO.trim() !== ''

const MAX_LISTED = 3
const vnDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

/** Same letter, re-addressed: the subject names who it was meant for. */
export function redirectMessage(message: MailMessage, target: string): MailMessage {
  const meant = [...message.to, ...(message.cc ?? [])]
  const shown = meant.slice(0, MAX_LISTED).join(', ')
  const more = meant.length > MAX_LISTED ? ` +${meant.length - MAX_LISTED}` : ''
  return { ...message, to: [target], cc: [], subject: `[→ ${shown}${more}] ${message.subject}` }
}

/** Counts letters per Vietnam calendar day; false once the day's cap is spent. */
export function createDailyCap(cap: number, now: () => Date = () => new Date()) {
  let day = ''
  let used = 0
  return (): boolean => {
    const today = vnDay.format(now())
    if (today !== day) {
      day = today
      used = 0
    }
    if (used >= cap) return false
    used += 1
    return true
  }
}

export function withRedirect(
  real: MailPort,
  console: MailPort,
  target: string,
  cap: number,
): MailPort {
  if (target.trim() === '') return real
  const take = createDailyCap(cap)
  const log = new Logger('mail')
  return {
    send: (message, key) => {
      const count = message.to.length + (message.cc?.length ?? 0)
      if (!take()) {
        log.warn(`letter held by daily redirect cap · key ${key} · ${count} recipients`)
        return console.send(message, key)
      }
      log.warn(`letter redirected · key ${key} · ${count} recipients`)
      return real.send(redirectMessage(message, target.trim()), key)
    },
  }
}
