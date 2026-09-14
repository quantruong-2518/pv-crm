import { eq } from 'drizzle-orm'
import { createDb } from '@api/platform/db/create-db'
import { loadEnv } from '@api/platform/config/env'
import { DEFAULT_PASSWORD, hashPassword } from '@api/platform/auth/password'
import { session } from '@api/platform/auth/auth.schema'
import { actor } from '@api/platform/db/platform.schema'
import { STAFF } from './staff'

/** Give the existing people a mailbox and a password — WITHOUT rebuilding anything.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS IS NOT PART OF THE TWO REBUILD COMMANDS
 *  ------------------------------------------------------------------
 *  `seed.ts` and `reset-staff.ts` both DELETE before they write, which against
 *  the Neon database loses whatever came in through the import door and exists
 *  in no fixture.
 *
 *  This script only ever runs `UPDATE … WHERE id = …` against actors that
 *  already exist. It creates nothing, deletes nothing, and touches no table
 *  outside `platform.actor` (plus revoking sessions, see below). That is what
 *  makes it safe to point at a live database, and it is why it is a separate
 *  command instead of a flag on the other ones — a flag would be one typo away
 *  from the destructive path.
 *
 *  ------------------------------------------------------------------
 *  `STAFF` IS THE SOURCE OF IDENTITY, `password.ts` OF THE DEFAULT SECRET
 *  ------------------------------------------------------------------
 *  Names, ids and mailboxes come from `staff.ts`; the fallback password comes
 *  from `platform/auth/password.ts`, the module the running server also hands
 *  it out from. Neither this command nor `reset-staff.ts` keeps a copy, so the
 *  three cannot disagree. `--password=…` overrides the default and is the only
 *  path that survives the day that constant is deleted — read the reason it
 *  exists at all where it is declared.
 *
 *      pnpm db:seed:accounts                            # xem trước, không ghi
 *      pnpm db:seed:accounts -- --apply                 # ghi thật
 *      pnpm db:seed:accounts -- --password='…' --apply  # mật khẩu khác
 *
 *  Dry run is the default on purpose. The same shape as
 *  `scrub-smoke-rows.mjs`, and for the same reason: a script whose first run
 *  writes to production is a script nobody reads before running. */

const APPLY = process.argv.includes('--apply')

const passwordArg = process.argv.find((a) => a.startsWith('--password='))
const PASSWORD = passwordArg?.slice('--password='.length) ?? DEFAULT_PASSWORD

/** Mirrors `PASSWORD_MIN` in `@pv/contracts`. Not imported, deliberately: this
 *  is the floor for a HAND-TYPED operational secret, and it should be free to
 *  be stricter than the one a user's own password has to clear. */
const MIN = 12

async function main(): Promise<void> {
  /* Only reachable via `--password=…`, since the default clears this by a wide
     margin. Kept because the argument is the path that will still exist after
     the constant is deleted. */
  if (PASSWORD.length < MIN) {
    throw new Error(`--password=… quá ngắn (tối thiểu ${MIN} ký tự).`)
  }

  const env = loadEnv()
  const { db, close, kind } = await createDb(env.DATABASE_URL)

  console.log(
    `[db] ${kind} · ${APPLY ? 'GHI THẬT' : 'xem trước'} · ` +
      `mật khẩu ${passwordArg ? 'từ --password' : 'mặc định (password.ts)'}`,
  )

  try {
    const rows = await db.select().from(actor)
    const byId = new Map(rows.map((r) => [r.id, r]))

    /* Hash ONCE, not per actor. scrypt is deliberately slow (~100 ms), and
       seven identical derivations of the same string differ only in salt —
       which matters for a password store shared between strangers, not for one
       operator handing themselves seven demo logins. Seven salts would cost
       most of a second and buy nothing here. */
    const hash = await hashPassword(PASSWORD)

    const plan = STAFF.map((a) => {
      const row = byId.get(a.id)
      return {
        id: a.id,
        name: a.name,
        emailFrom: row?.email ?? null,
        emailTo: a.email,
        missing: !row,
        hadPassword: Boolean(row?.passwordHash),
      }
    })

    for (const p of plan) {
      if (p.missing) {
        console.log(`  ✗ ${p.id.padEnd(8)} không có trong DB — bỏ qua`)
        continue
      }
      const moved = p.emailFrom !== p.emailTo ? `${p.emailFrom} → ${p.emailTo}` : p.emailTo
      console.log(
        `  · ${p.id.padEnd(8)} ${p.name.padEnd(20)} ${moved}` +
          (p.hadPassword ? '  (ghi đè mật khẩu cũ)' : '  (đặt mật khẩu lần đầu)'),
      )
    }

    /* Anyone in the database the account book does not know about. Reported
       rather than touched: a row this script cannot explain is a row somebody
       added on purpose, and silently handing it a known password would be the
       worst possible reading of "seed the accounts". */
    for (const row of rows) {
      if (!STAFF.some((a) => a.id === row.id)) {
        console.log(
          `  ! ${row.id.padEnd(8)} có trong DB nhưng không có trong staff.ts — KHÔNG đụng`,
        )
      }
    }

    if (!APPLY) {
      console.log('\nXem trước xong. Thêm --apply để ghi thật.')
      return
    }

    await db.transaction(async (tx) => {
      for (const p of plan) {
        if (p.missing) continue
        await tx
          .update(actor)
          /* `mustChangePasswordAt` rides along because this command hands out a
             password its operator typed. Without it the person would keep using
             a string somebody else chose, which is the one thing
             `PasswordChangeGuard` exists to prevent. */
          .set({
            email: p.emailTo,
            passwordHash: hash,
            disabledAt: null,
            mustChangePasswordAt: new Date(),
          })
          .where(eq(actor.id, p.id))

        /* Every password change kills that person's live sessions. The usual
           reason somebody's password is being reset is that somebody else has
           their old session, so leaving those alive defeats the reset. Here the
           password is being set for everyone at once, which makes it doubly
           true: whatever was signed in before was signed in under the old
           rules. */
        await tx.delete(session).where(eq(session.actorId, p.id))
      }
    })

    const written = plan.filter((p) => !p.missing).length
    console.log(
      `\n✓ ${written} tài khoản đã có email .com và mật khẩu; mọi phiên cũ đã bị thu hồi.`,
    )
  } finally {
    await close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
