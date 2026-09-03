/** PreToolUse guard: refuse any Bash call that would run db:seed or db:push.
 *
 *  The deny rules in .claude/settings.json match by PREFIX, and every command in
 *  this repo is wrapped as "wsl.exe -d Ubuntu-20.04 bash -lc ..." — the repo
 *  lives in WSL while Claude Code runs on Windows, see the wsl skill. So a rule
 *  written as Bash(pnpm db:seed:*) never matched anything an agent actually
 *  typed, and the guard protecting Neon was decorative. This one reads the
 *  command TEXT, so the wrapper makes no difference.
 *
 *  Both scripts rebuild from scratch: seed deletes every actor, lead,
 *  opportunity and contract before reloading, and apps/api/.env points at
 *  production Neon. push ALTERs the live schema with no migration file to read
 *  first.
 *
 *  Deliberately absolute, like the two rules it backs up. A person who needs it
 *  runs it themselves — this gates the agent, not the human at the keyboard. */

let raw = ''
process.stdin.on('data', (chunk) => (raw += chunk))
process.stdin.on('end', () => {
  let command = ''
  try {
    command = JSON.parse(raw)?.tool_input?.command ?? ''
  } catch {
    /* An unparseable payload is not a reason to block a build. */
    process.exit(0)
  }

  if (!/\bdb:(seed|push)\b/.test(command)) process.exit(0)

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'db:seed and db:push rebuild the database from scratch, and apps/api/.env points at production Neon. Blocked by tools/scripts/guard-db.mjs — run it yourself if you really mean to.',
      },
    }),
  )
})
