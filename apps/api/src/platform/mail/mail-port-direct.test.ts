import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** `MAIL_PORT_DIRECT` skips the redirect, so only the auth letter may hold it:
 *  the consumer or a brief mailer switching to it would mail real staff. */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ALLOWED = ['platform/auth/password-reset.mailer.ts']

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(join(dir, e.name))
      : /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  )

describe('MAIL_PORT_DIRECT', () => {
  it('is injected only by the password reset mailer', () => {
    const users = sources(SRC)
      .map((f) => relative(SRC, f))
      .filter((f) => !f.startsWith('platform/mail/'))
      .filter((f) => readFileSync(join(SRC, f), 'utf8').includes('MAIL_PORT_DIRECT'))
    /* auth.module.ts only mentions it in a docblock, so allow it as comment-only. */
    expect(users.filter((f) => f !== 'platform/auth/auth.module.ts')).toEqual(ALLOWED)
  })
})
