/** PreToolUse guard: refuse any Bash call that would rebuild the database.
 *
 *  The deny rules in .claude/settings.json match by PREFIX, and every command in
 *  this repo is wrapped as "wsl.exe -d Ubuntu-20.04 bash -lc ..." — the repo
 *  lives in WSL while Claude Code runs on Windows, see the wsl skill. So a rule
 *  written as Bash(pnpm db:seed:*) never matched anything an agent actually
 *  typed, and the guard protecting Neon was decorative. This one reads the
 *  command TEXT, so the wrapper makes no difference.
 *
 *  All three rebuild from scratch, and apps/api/.env points at production Neon:
 *  seed deletes every actor, lead, opportunity and contract before reloading;
 *  push ALTERs the live schema with no migration file to read first; reset:staff
 *  empties both schemas and does not reload anything at all.
 *
 *  Deliberately absolute, like the rules it backs up. A person who needs it runs
 *  it themselves — this gates the agent, not the human at the keyboard. */

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

  if (!/\bdb:(seed|push|reset:staff)\b/.test(command)) process.exit(0)

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
