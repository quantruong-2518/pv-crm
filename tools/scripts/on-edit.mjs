#!/usr/bin/env node
/** PostToolUse hook — formats and auto-fixes lint right after every agent file write.
 *
 *  Why it's worth doing: the shortest possible feedback loop. An agent writes
 *  `gap-[9px]`, and knows right then, not after waiting for `pnpm check` or
 *  CI. This is exactly the "fast vibe that stays stable" part — the gate
 *  placed as close as possible to where the mistake is made.
 *
 *  Principle: this hook NEVER blocks. If the environment can run it, great;
 *  if it can't, it silently skips — lint-staged and CI still gate enough. A
 *  hook that breaks things often is a hook that gets removed. */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, extname, relative, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(import.meta.url)

const readStdin = async () => {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

/** Find a package's bin file.
 *
 *  Can't use `require.resolve('eslint/bin/eslint.js')`: ESLint 9 declares
 *  `exports` and doesn't open that path, so resolve would throw.
 *  `./package.json` is open in every package — go around through that and
 *  join the path instead. */
const bin = (pkg, rel) => {
  try {
    return resolve(dirname(require.resolve(`${pkg}/package.json`)), rel)
  } catch {
    return null
  }
}

const run = (entry, args) => {
  if (!entry) return null
  return spawnSync(process.execPath, [entry, ...args], { cwd: ROOT, encoding: 'utf8' })
}

try {
  const payload = JSON.parse((await readStdin()) || '{}')
  const file = payload?.tool_input?.file_path
  if (!file) process.exit(0)

  const abs = resolve(ROOT, file)
  const rel = relative(ROOT, abs)
  // Outside the repo, or inside the design source / a generated folder → leave it alone.
  if (rel.startsWith('..') || /^(project|node_modules|.*[\\/]dist)[\\/]/.test(rel)) process.exit(0)

  const ext = extname(abs)
  const formattable = ['.ts', '.tsx', '.js', '.mjs', '.css', '.json', '.md', '.yml', '.yaml']
  if (!formattable.includes(ext)) process.exit(0)

  run(bin('prettier', 'bin/prettier.cjs'), ['--write', '--log-level', 'error', abs])

  if (['.ts', '.tsx', '.js', '.mjs'].includes(ext)) {
    // Default formatter (stylish): empty stdout when clean.
    const out = run(bin('eslint', 'bin/eslint.js'), ['--fix', abs])
    const remaining = (out?.stdout ?? '').trim()
    if (remaining) {
      // Print so the agent sees it right away in the transcript. Still exit 0 — report, don't block.
      console.log(`[aurora] lint errors still unfixed in ${rel}:\n${remaining}`)
    }
  }
} catch {
  // Silent. CI is where the actual blocking happens.
}

process.exit(0)
