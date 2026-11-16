// Run: node --test .claude/hooks/*.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath, URL } from 'node:url'

const HOOK = fileURLToPath(new URL('../../tools/scripts/on-edit.mjs', import.meta.url))
let tmp

before(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'on-edit-'))
})
after(() => rmSync(tmp, { recursive: true, force: true }))

// `.txt` is not formattable, so the hook records the edit and exits before prettier or eslint run.
const run = (payload, env = {}) =>
  spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: tmp, ...env },
  })
const listOf = (id) => path.join(tmp, 'claude-pvcrm-edits', `${id}.txt`)
const edit = (extra) => ({ tool_input: { file_path: '/x/y.txt' }, ...extra })

describe('on-edit: edit list for the Stop quality gate', () => {
  it('appends the absolute path for the main thread', () => {
    run(edit({ session_id: 's1' }))
    run({ session_id: 's1', tool_input: { file_path: '/x/z.txt' } })
    assert.equal(readFileSync(listOf('s1'), 'utf8'), '/x/y.txt\n/x/z.txt\n')
  })

  it('records nothing for a subagent', () => {
    run(edit({ session_id: 's2', agent_id: 'a1' }))
    assert.equal(existsSync(listOf('s2')), false)
  })

  it('ignores a session id that is not a plain token', () => {
    run(edit({ session_id: '../escape' }))
    assert.equal(existsSync(path.join(tmp, 'escape.txt')), false)
  })

  it('exits 0 when the list cannot be written', () => {
    const blocker = path.join(tmp, 'file-not-dir')
    writeFileSync(blocker, '')
    assert.equal(run(edit({ session_id: 's3' }), { TMPDIR: blocker }).status, 0)
  })
})
