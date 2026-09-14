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
 *  This script only ever ADDS: it updates the seats that exist and plants the
 *  ones that do not. It deletes no actor, no lead, no deal, and touches no table
 *  outside `platform.actor` (plus revoking sessions, see below). That is what
 *  makes it safe to point at a live database, and it is why it is a separate
 *  command instead of a flag on the other ones — a flag would be one typo away
 *  from the destructive path.
 *
 *  It plants rather than skips BECAUSE the two rebuild commands cannot both be
 *  run. `db:seed` writes the demo cast (`u-ha`, `u-chau`, …) and `reset-staff`
 *  writes the real seven, and each wipes what the other left. Before today this
 *  script matched by id against a book that had none of its ids, so every row
 *  fell through to "not in the database, skipped" and it wrote nothing at all —
 *  a command whose whole purpose was putting the real seats on a live database
 *  without destroying it. Now it does that: load the demo data, then run this,
 *  and both casts stand in the same book.
 *
 *  ------------------------------------------------------------------
 *  `STAFF` IS THE SOURCE OF IDENTITY, `password.ts` OF THE DEFAULT SECRET
 *  ------------------------------------------------------------------
 *  Names, ids and mailboxes come from `staff.ts`; the fallback password comes
 *  from `platform/auth/password.ts`, the module the running server also hands
 *  it out from. Neither this command nor `reset-staff.ts` keeps a copy, so the
 *  three cannot disagree.
 *
 *      pnpm db:seed:accounts                            # xem trước, không ghi
 *      pnpm db:seed:accounts -- --apply                 # ghi thật (chỉ pglite)
 *      pnpm db:seed:accounts -- --password='…' --apply  # ghi thật, mọi đích
 *
 *  Dry run is the default on purpose. The same shape as
 *  `scrub-smoke-rows.mjs`, and for the same reason: a script whose first run
 *  writes to production is a script nobody reads before running.
 *
 *  ------------------------------------------------------------------
 *  TWO THINGS THIS COMMAND REFUSES TO DO, BOTH SETTLED 14/09
 *  ------------------------------------------------------------------
 *  1 · **It will not plant the repository's own password on a real database.**
 *      `DEFAULT_PASSWORD` is a string anybody holding a clone can read, and the
 *      one-time ticket (`mustChangePasswordAt`) only blunts it — between the
 *      write and the person's next sign-in, seven live seats stand behind a
 *      secret that is in source control. So `--password=…` is REQUIRED unless
 *      the target is pglite, which is a throwaway file nobody signs in to.
 *      Checked once the target is known rather than up front, because that is
 *      when the answer exists; a dry run still shows the whole plan first, and
 *      says the write will be refused.
 *
 *  2 · **It will not re-enable a seat somebody disabled.** The update used to
 *      clear `disabledAt`, which turned "give these people a password" into
 *      "and let the ones we locked out back in" — a decision this command was
 *      never asked to make, taken silently, in the same statement as a routine
 *      password reset. A disabled seat is now reported and left alone, exactly
 *      like a row that is in the database but not in `staff.ts`. Unlocking one
 *      is somebody's deliberate act, and it belongs to a door that says so. */

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

  /* The repository's own password may only reach a throwaway database. Reason
     1 of the docblock; the check lives here because `kind` is the answer and
     `createDb` is where it arrives. */
  const refuseWrite = kind !== 'pglite' && !passwordArg

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
        member: a,
        emailFrom: row?.email ?? null,
        fresh: !row,
        hadPassword: Boolean(row?.passwordHash),
        /* A mailbox is UNIQUE on `actor`, so a seat cannot be planted while
           somebody else holds its address. Caught here rather than mid-INSERT:
           an aborted transaction says the same thing in Postgres' words, a few
           seconds later, and leaves the operator guessing which row it meant. */
        takenBy: rows.find((r) => r.email === a.email && r.id !== a.id)?.id ?? null,
        /* Reason 2 of the docblock. The DATE rather than a flag, because the
           report prints it: "locked" alone invites a reader to assume an
           accident, a date says a person did it on a day. */
        disabledAt: row?.disabledAt ?? null,
      }
    })

    for (const p of plan) {
      const { id, name, email } = p.member
      if (p.takenBy) {
        console.log(`  ! ${id.padEnd(8)} ${name.padEnd(20)} email đang là của ${p.takenBy} — DỪNG`)
        continue
      }
      if (p.disabledAt) {
        console.log(
          `  ! ${id.padEnd(8)} ${name.padEnd(20)} đang khoá từ ${day(p.disabledAt)} — KHÔNG đụng`,
        )
        continue
      }
      if (p.fresh) {
        console.log(`  + ${id.padEnd(8)} ${name.padEnd(20)} ${email}  (trồng mới)`)
        continue
      }
      const moved = p.emailFrom !== email ? `${p.emailFrom} → ${email}` : email
      console.log(
        `  · ${id.padEnd(8)} ${name.padEnd(20)} ${moved}` +
          (p.hadPassword ? '  (ghi đè mật khẩu cũ)' : '  (đặt mật khẩu lần đầu)'),
      )
    }

    const clash = plan.filter((p) => p.takenBy)
    if (clash.length > 0) {
      throw new Error(
        `${clash.length} ghế có email đang thuộc về người khác. ` +
          'Sửa `staff.ts` hoặc dọn dòng kia trước — không ghi gì cả.',
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
      console.log(
        refuseWrite
          ? '\nXem trước xong. Đích không phải pglite — lượt ghi sẽ đòi --password=…'
          : '\nXem trước xong. Thêm --apply để ghi thật.',
      )
      return
    }

    if (refuseWrite) {
      throw new Error(
        `Đích là ${kind}, không phải pglite — bắt buộc --password='…'. ` +
          'Mật khẩu mặc định nằm trong repo, ai có một bản sao đều đọc được.',
      )
    }

    await db.transaction(async (tx) => {
      for (const p of plan) {
        /* Skipped for the reason it was reported: the lock is somebody's
           decision, and this command was not asked to overturn it. */
        if (p.disabledAt) continue

        if (p.fresh) {
          /* Everything `actor` demands is already in `staff.ts` — the book is
             the source of identity, and this is the one place it becomes rows.
             `mustChangePasswordAt` is set here for the same reason it is set on
             an update: the operator typed this password, so it is a ticket. */
          await tx.insert(actor).values({
            id: p.member.id,
            name: p.member.name,
            email: p.member.email,
            role: p.member.role,
            roleId: p.member.roleId,
            branches: p.member.branches,
            ...(p.member.ownOnly === undefined ? {} : { ownOnly: p.member.ownOnly }),
            passwordHash: hash,
            mustChangePasswordAt: new Date(),
          })
          continue
        }

        await tx
          .update(actor)
          /* `mustChangePasswordAt` rides along because this command hands out a
             password its operator typed. Without it the person would keep using
             a string somebody else chose, which is the one thing
             `PasswordChangeGuard` exists to prevent.

             `disabledAt` is deliberately NOT in this list — reason 2 of the
             docblock. It used to be, and it made a routine password reset
             quietly unlock every seat somebody had locked. */
          .set({
            email: p.member.email,
            passwordHash: hash,
            mustChangePasswordAt: new Date(),
          })
          .where(eq(actor.id, p.member.id))

        /* Every password change kills that person's live sessions. The usual
           reason somebody's password is being reset is that somebody else has
           their old session, so leaving those alive defeats the reset. Here the
           password is being set for everyone at once, which makes it doubly
           true: whatever was signed in before was signed in under the old
           rules. */
        await tx.delete(session).where(eq(session.actorId, p.member.id))
      }
    })

    const locked = plan.filter((p) => p.disabledAt).length
    const planted = plan.filter((p) => !p.disabledAt && p.fresh).length
    console.log(
      `\n✓ ${plan.length - planted - locked} tài khoản đã cập nhật, ${planted} trồng mới` +
        (locked > 0 ? `, ${locked} ghế đang khoá bỏ qua` : '') +
        '; mọi phiên cũ của người đã cập nhật đều bị thu hồi.',
    )
  } finally {
    await close()
  }
}

/** A lock date, in the one form the rest of this command's output uses. */
function day(at: Date): string {
  return at.toISOString().slice(0, 10)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
