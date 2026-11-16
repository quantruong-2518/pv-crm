#!/usr/bin/env node
/** PreToolUse(Bash) guard: subagents share the main checkout with the main session, with each
 *  other and with parallel sessions, so a `git stash` / `checkout` / `reset` there rewrites files
 *  another agent is editing. A subagent working in its own linked worktree commits freely.
 *
 *  In the main checkout a subagent may stage explicit paths and commit only when it is a
 *  COMMITTER (the `worker` that the commit skill runs as), and never with a sweeping form
 *  (`add -A`, `commit -a`, `commit .`, `commit <directory>`). Plumbing that only touches the index
 *  (`update-index`, `commit-tree`, `update-ref`, plain `read-tree`) is not a write here:
 *  `.claude/skills/check/parallel.md` commits that way on a dirty tree. Plumbing that rewrites the
 *  working tree (`read-tree -u|--reset`, `checkout-index -f|-a`) and `commit --amend` are denied.
 *  A `cd` target the hook cannot resolve counts as the main checkout (fail closed).
 *
 *  Input: hook JSON on stdin; `agent_id` / `agent_type` exist only inside a subagent. Output: a
 *  PreToolUse deny on stdout, or nothing. Fails open on any crash. Best effort, not a sandbox: it
 *  follows `cd` and `git -C`, and does not look inside `$(...)`, `bash -c` or scripts. */
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const COMMIT_PATH = new Set(['add', 'commit'])
const OTHER_WRITES = new Set([
  'am',
  'apply',
  'checkout',
  'cherry-pick',
  'clean',
  'merge',
  'mv',
  'pull',
  'rebase',
  'reset',
  'restore',
  'revert',
  'rm',
  'stash',
  'switch',
])
const READ_ONLY_STASH = new Set(['list', 'show'])
const BRANCH_WRITE_FLAGS = new Set(['-d', '-D', '-m', '-M', '-f', '--delete', '--move', '--force'])
// The commit skill declares `agent: worker`, so no other agent type commits in the main checkout.
const COMMITTERS = new Set(['worker'])
const SWEEPING_FLAG = {
  add: /^(-A|--all|-u|--update)$/,
  commit: /^(-[a-zA-Z]*a[a-zA-Z]*|--all)$/,
}
const SWEEPING_PATH = { add: /^(\.\/?|:\/|\*)$/, commit: /^(\.\/?|:\/|\*)$/ }
// Options whose value is the next word, so a message like `docs` is not read as a path.
const VALUE_OPTIONS = new Set([
  '--message',
  '--file',
  '--author',
  '--date',
  '--template',
  '--reuse-message',
  '--reedit-message',
  '--fixup',
  '--squash',
  '--cleanup',
])
const READ_TREE_REWRITE = /^(--reset|-[a-zA-Z]*u[a-zA-Z]*)$/
const CHECKOUT_INDEX_REWRITE = /^(--force|--all|-[a-zA-Z]*[fa][a-zA-Z]*)$/
const HOME_VARS = /\$\{(HOME|CLAUDE_PROJECT_DIR)\}|\$(HOME|CLAUDE_PROJECT_DIR)\b/g
// Global git options that take a separate value (`git -c k=v commit`).
const OPTIONS_WITH_VALUE = new Set(['-c', '--git-dir', '--work-tree', '--namespace'])
const WRAPPERS = new Set(['env', 'command', 'time', 'nohup', 'exec'])
const OPERATOR = /^(&&|\|\||[;|\n()])/

/** Split a shell command into simple commands, each a token array; quotes group, heredoc bodies drop. */
export function parseCommands(text) {
  const commands = []
  let tokens = []
  let word = null
  let quote = null
  const heredocs = []
  const endWord = () => {
    if (word !== null) tokens.push(word)
    word = null
  }
  const endCommand = () => {
    endWord()
    if (tokens.length) commands.push(tokens)
    tokens = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === quote) quote = null
      else if (ch === '\\' && quote === '"' && i + 1 < text.length) word += text[++i]
      else word += ch
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      word ??= ''
    } else if (ch === '\\' && i + 1 < text.length) {
      word = (word ?? '') + text[++i]
    } else if (ch === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      const m = /^<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/.exec(text.slice(i))
      if (m) heredocs.push(m[2])
      endWord()
      i += m ? m[0].length - 1 : 1
    } else if (ch === '#' && word === null) {
      while (i + 1 < text.length && text[i + 1] !== '\n') i++
    } else if (/\s/.test(ch) && ch !== '\n') {
      endWord()
    } else if (ch === '&' && (text[i - 1] === '>' || text[i + 1] === '>')) {
      word = (word ?? '') + ch
    } else if (OPERATOR.test(text.slice(i, i + 2)) || ch === '&') {
      endCommand()
      if (text.slice(i, i + 2) === '&&' || text.slice(i, i + 2) === '||') i++
      if (ch === '\n' && heredocs.length) {
        const lines = text.slice(i + 1).split('\n')
        let used = 0
        while (heredocs.length && used < lines.length) {
          if (lines[used++].trim() === heredocs[0]) heredocs.shift()
        }
        i += lines.slice(0, used).join('\n').length + 1
      }
    } else {
      word = (word ?? '') + ch
    }
  }
  endCommand()
  return commands
}

/** `raw` resolved against `base` with `~`, `$HOME` and `$CLAUDE_PROJECT_DIR` expanded; null when
 *  it still holds a variable, is relative to an unknown base, or is not an existing directory. */
function resolveDir(base, raw) {
  const home = os.homedir()
  let target = raw === '~' || raw.startsWith('~/') ? home + raw.slice(1) : raw
  target = target.replace(HOME_VARS, (match, braced, bare) => {
    const name = braced ?? bare
    return (name === 'HOME' ? home : process.env[name]) ?? match
  })
  if (/[$`]/.test(target)) return null
  if (base === null && !path.isAbsolute(target)) return null
  const resolved = path.resolve(base ?? '/', target)
  try {
    return statSync(resolved).isDirectory() ? resolved : null
  } catch {
    return null
  }
}

/** Every git write in `command` as `{ subcommand, dir, args }`, following `cd` and `-C`. A `dir` of
 *  null means the directory could not be worked out; the caller treats it as the main checkout. */
export function findGitWrites(command, startDir) {
  const writes = []
  let cwd = startDir
  for (const tokens of parseCommands(command)) {
    while (tokens.length && (/^[A-Za-z_]\w*=/.test(tokens[0]) || WRAPPERS.has(tokens[0]))) {
      tokens.shift()
    }
    if (tokens[0] === 'cd' || tokens[0] === 'pushd' || tokens[0] === 'popd') {
      const operands = tokens.slice(1).filter((t) => t !== '-L' && t !== '-P' && t !== '--')
      const target = tokens[0] === 'popd' || operands[0] === '-' ? null : (operands[0] ?? '~')
      cwd = target === null ? null : resolveDir(cwd, target)
      continue
    }
    if (tokens[0] !== 'git') continue
    let dir = cwd
    let i = 1
    while (i < tokens.length && tokens[i].startsWith('-')) {
      if (tokens[i] === '-C') {
        dir = resolveDir(dir, tokens[i + 1] ?? '.')
        i += 2
      } else {
        i += OPTIONS_WITH_VALUE.has(tokens[i]) ? 2 : 1
      }
    }
    const subcommand = tokens[i]
    if (!subcommand) continue
    const args = tokens.slice(i + 1)
    const isWrite =
      COMMIT_PATH.has(subcommand) ||
      (OTHER_WRITES.has(subcommand) && !(subcommand === 'stash' && READ_ONLY_STASH.has(args[0]))) ||
      (subcommand === 'branch' && args.some((a) => BRANCH_WRITE_FLAGS.has(a))) ||
      (subcommand === 'read-tree' && args.some((a) => READ_TREE_REWRITE.test(a))) ||
      (subcommand === 'checkout-index' && args.some((a) => CHECKOUT_INDEX_REWRITE.test(a)))
    if (isWrite) writes.push({ subcommand, dir, args })
  }
  return writes
}

/** True when `dir` is inside the main working tree of a repository (not a linked worktree). */
export function isMainCheckout(dir) {
  let out
  try {
    out = execFileSync(
      'git',
      ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
  } catch {
    return false // not a repository, or the directory does not exist yet
  }
  const [gitDir, commonDir] = out
    .trim()
    .split('\n')
    .map((p) => path.resolve(p))
  return gitDir === commonDir
}

/** Non-option words of `args`, skipping the value of options such as `-m` and everything after `--`. */
function pathArgs(args) {
  const paths = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') return [...paths, ...args.slice(i + 1)]
    if (!a.startsWith('-')) paths.push(a)
    else if (VALUE_OPTIONS.has(a)) i++
    else if (!a.startsWith('--') && /^-[a-zA-Z]*[mFCct]$/.test(a)) i++
  }
  return paths
}

const isDirectory = (dir, p) => {
  try {
    return statSync(path.resolve(dir, p)).isDirectory()
  } catch {
    return false
  }
}

function verdict(write, agentType) {
  const { subcommand, dir, args } = write
  const isAmend = subcommand === 'commit' && args.includes('--amend')
  if (!COMMIT_PATH.has(subcommand) || isAmend) {
    return `\`git ${subcommand}\` in the shared main checkout rewrites files or history other sessions rely on. Work in your own linked worktree, or list what you need in your report.`
  }
  if (!COMMITTERS.has(agentType)) {
    return `\`git ${subcommand}\` in the shared main checkout is for the main session or the commit skill. List the files you changed in your report; they commit them.`
  }
  const sweepsPaths = pathArgs(args).some(
    (a) =>
      SWEEPING_PATH[subcommand].test(a) || (subcommand === 'commit' && isDirectory(dir ?? '.', a)),
  )
  if (sweepsPaths || args.some((a) => SWEEPING_FLAG[subcommand].test(a))) {
    return `\`git ${subcommand}\` with a sweeping flag or a whole-directory path also takes other sessions' half-done files. Name each file you own.`
  }
  return null
}

export function decide(payload) {
  if (!payload.agent_id) return null // main session
  const command = payload.tool_input?.command
  if (typeof command !== 'string') return null
  const writes = findGitWrites(command, payload.cwd || process.cwd())
  for (const write of writes) {
    const inMain = write.dir === null || isMainCheckout(write.dir)
    const reason = inMain ? verdict(write, payload.agent_type) : null
    if (reason) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      }
    }
  }
  return null
}

function main() {
  try {
    const decision = decide(JSON.parse(readFileSync(0, 'utf8')))
    if (decision) process.stdout.write(JSON.stringify(decision))
  } catch {
    // A guard that crashes must not stop the build: normal permissions still apply.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
