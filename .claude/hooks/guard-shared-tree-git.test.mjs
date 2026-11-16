// Run: node --test .claude/hooks/*.test.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath, URL } from 'node:url'

import { decide, findGitWrites, parseCommands } from './guard-shared-tree-git.mjs'

const HOOK = fileURLToPath(new URL('./guard-shared-tree-git.mjs', import.meta.url))
let root
let main
let linked

function git(cwd, ...args) {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' })
}

before(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'guard-git-'))
  main = path.join(root, 'main')
  linked = path.join(root, 'linked')
  execFileSync('git', ['init', '-q', main])
  git(main, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'i')
  git(main, 'worktree', 'add', '-q', '-b', 'side', linked)
})

after(() => rmSync(root, { recursive: true, force: true }))

const bash = (command, cwd, agentType = 'Explore', agentId = 'a1') => ({
  agent_id: agentId,
  agent_type: agentType,
  cwd,
  tool_name: 'Bash',
  tool_input: { command },
})
const denied = (payload) => decide(payload)?.hookSpecificOutput.permissionDecision === 'deny'

describe('decide: subagent in the main checkout', () => {
  it('denies destructive writes', () => {
    for (const c of ['git stash', 'git checkout -- a.ts', 'git reset HEAD~1', 'git rm a.ts']) {
      assert.ok(denied(bash(c, main, 'worker')), c)
    }
  })

  it('denies add and commit for a non-committer', () => {
    assert.ok(denied(bash('git add a.ts', main)))
    assert.ok(denied(bash('git commit -m x', main)))
  })

  it('lets the committer stage named paths and commit', () => {
    assert.equal(decide(bash('git add a.ts b.ts && git commit -m "x && y"', main, 'worker')), null)
  })

  it('lets the commit skill (worker) commit with -F and named paths', () => {
    assert.equal(
      decide(bash('git add -- a.ts && git commit -F m.txt -- a.ts', main, 'worker')),
      null,
    )
  })

  it('denies commit for every agent type except worker', () => {
    for (const type of ['general-purpose', 'fork', 'screen-builder', 'claude']) {
      assert.ok(denied(bash('git add a.ts', main, type)), type)
      assert.match(
        decide(bash('git commit -m x a.ts', main, type)).hookSpecificOutput
          .permissionDecisionReason,
        /main session or the commit skill/,
      )
    }
  })

  it('denies whole-tree and whole-directory pathspecs for the committer', () => {
    mkdirSync(path.join(main, 'apps'), { recursive: true })
    for (const c of [
      'git commit -m x .',
      'git commit -m x ./',
      'git commit -m x -- .',
      'git commit -m x :/',
      "git commit -m x '*'",
      'git commit -m x apps',
      'git add ./',
      "git add '*'",
    ]) {
      assert.ok(denied(bash(c, main, 'worker')), c)
    }
  })

  it('does not read a message or a file path as a directory', () => {
    mkdirSync(path.join(main, 'docs'), { recursive: true })
    for (const c of [
      'git commit -m docs a.ts',
      'git commit -F docs a.ts',
      'git commit -sm docs a.ts',
      'git commit -m x apps/a.ts',
    ]) {
      assert.equal(decide(bash(c, main, 'worker')), null, c)
    }
  })

  it('denies history and working-tree rewrites even for the committer', () => {
    for (const c of [
      'git commit --amend --no-edit',
      'git read-tree -u HEAD',
      'git read-tree --reset HEAD',
      'git read-tree -mu HEAD',
      'git checkout-index -f a.ts',
      'git checkout-index -a',
      'git checkout-index -fa',
    ]) {
      assert.ok(denied(bash(c, main, 'worker')), c)
    }
  })

  it('lets stash list and stash show through but not stash', () => {
    assert.equal(decide(bash('git stash list', main)), null)
    assert.equal(decide(bash('git stash show -p stash@{0}', main)), null)
    assert.ok(denied(bash('git stash', main)))
    assert.ok(denied(bash('git stash pop', main)))
  })

  it('denies sweeping stage and commit flags even for the committer', () => {
    for (const c of [
      'git add -A',
      'git add .',
      'git add -u',
      'git commit -am x',
      'git commit -a',
    ]) {
      assert.ok(denied(bash(c, main, 'worker')), c)
    }
  })

  it('treats branch deletion as a write and listing as a read', () => {
    assert.ok(denied(bash('git branch -D side', main, 'worker')))
    assert.equal(decide(bash('git branch --list', main)), null)
  })

  it('lets reads and plumbing through', () => {
    const plumbing = 'git read-tree HEAD && git update-index --refresh && git write-tree'
    assert.equal(decide(bash('git status && git diff --name-only HEAD | head', main)), null)
    assert.equal(decide(bash(plumbing, main)), null)
  })

  it('does not read a commit message as commands', () => {
    const message = "git commit -m 'sửa\ngit stash\n' && echo ok"
    assert.equal(decide(bash(message, main, 'worker')), null)
  })

  it('skips a heredoc body', () => {
    const c = 'cat > f <<EOF\ngit stash\nEOF\ngit status'
    assert.equal(decide(bash(c, main)), null)
  })
})

describe('decide: other places', () => {
  it('lets the main session do anything', () => {
    assert.equal(decide(bash('git stash', main, undefined, null)), null)
  })

  it('lets a subagent commit in its own linked worktree', () => {
    assert.equal(decide(bash('git add -A && git commit -m x', linked)), null)
  })

  it('follows cd and git -C into the main checkout', () => {
    assert.ok(denied(bash(`cd ${main} && git checkout -- a.ts`, linked)))
    assert.ok(denied(bash(`git -C ${main} restore a.ts`, linked)))
  })

  it('expands ~, $HOME and $CLAUDE_PROJECT_DIR in a cd target', () => {
    const saved = { home: process.env.HOME, project: process.env.CLAUDE_PROJECT_DIR }
    process.env.HOME = root
    process.env.CLAUDE_PROJECT_DIR = main
    try {
      for (const c of [
        'cd ~/main && git stash',
        'cd "$HOME/main" && git stash',
        'cd ${HOME}/main && git stash',
        'cd $CLAUDE_PROJECT_DIR && git stash',
        'cd "${CLAUDE_PROJECT_DIR}" && git stash',
      ]) {
        assert.ok(denied(bash(c, linked)), c)
      }
      assert.equal(decide(bash('cd ~/linked && git add -A && git commit -m x', main)), null)
    } finally {
      for (const [key, name] of [
        ['home', 'HOME'],
        ['project', 'CLAUDE_PROJECT_DIR'],
      ]) {
        if (saved[key] === undefined) delete process.env[name]
        else process.env[name] = saved[key]
      }
    }
  })

  it('treats a cd target it cannot resolve as the main checkout', () => {
    assert.ok(denied(bash('cd $SOMEWHERE/x && git stash', linked)))
    assert.ok(denied(bash('cd "$(mktemp -d)" && git stash', linked)))
    assert.ok(denied(bash('cd does-not-exist && git stash', linked)))
    assert.ok(denied(bash('cd - && git stash', linked)))
    assert.ok(denied(bash('cd $SOMEWHERE && git -C . stash', linked)))
  })

  it('allows writes outside any repository', () => {
    assert.equal(decide(bash('git add x', os.tmpdir())), null)
  })
})

describe('parsers', () => {
  it('skips a comment, whatever quotes it holds', () => {
    assert.ok(denied(bash('echo "it\'s" # don\'t\ngit stash', main)))
    assert.ok(denied(bash("git log --format='%h' # it's\ngit stash", main)))
    assert.deepEqual(parseCommands('echo a#b # c\nls'), [['echo', 'a#b'], ['ls']])
  })

  it('keeps quoted words whole and drops redirections of stderr', () => {
    assert.deepEqual(parseCommands('cd "a b" && git log 2>&1 | head'), [
      ['cd', 'a b'],
      ['git', 'log', '2>&1'],
      ['head'],
    ])
  })

  it('skips env assignments and global options before the subcommand', () => {
    const writes = findGitWrites('GIT_EDITOR=true git -c core.x=1 --no-pager rebase main', '/r')
    assert.deepEqual(writes, [{ subcommand: 'rebase', dir: '/r', args: ['main'] }])
  })
})

describe('hook process', () => {
  it('prints a deny decision on stdout for a blocked command', () => {
    const out = execFileSync('node', [HOOK], {
      input: JSON.stringify(bash('git reset HEAD~1', main)),
      encoding: 'utf8',
    })
    assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecision, 'deny')
  })

  it('prints nothing for malformed input or an allowed command', () => {
    assert.equal(execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf8' }), '')
    const input = JSON.stringify(bash('git status', main))
    assert.equal(execFileSync('node', [HOOK], { input, encoding: 'utf8' }), '')
  })
})
