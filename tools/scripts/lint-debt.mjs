#!/usr/bin/env node
/** Báo cáo nợ lint — đọc `eslint-suppressions.json` thành thứ người đọc được.
 *
 *  File suppressions tồn tại để rule giữ mức `error` mà CI vẫn xanh ngay hôm
 *  nay. Nhưng nợ mà không ai đếm thì thành nợ vĩnh viễn. Chạy `pnpm lint:debt`
 *  để biết còn bao nhiêu, ở đâu, và file nào đáng dọn trước. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

let data
try {
  data = JSON.parse(readFileSync(join(ROOT, 'eslint-suppressions.json'), 'utf8'))
} catch {
  console.log('✓ Không có eslint-suppressions.json — repo không nợ lint dòng nào.')
  process.exit(0)
}

const byRule = new Map()
const byFile = []

for (const [file, rules] of Object.entries(data)) {
  let fileTotal = 0
  for (const [rule, { count }] of Object.entries(rules)) {
    byRule.set(rule, (byRule.get(rule) ?? 0) + count)
    fileTotal += count
  }
  byFile.push([file, fileTotal])
}

const total = [...byRule.values()].reduce((a, b) => a + b, 0)

console.log(`Nợ lint: ${total} vi phạm trong ${byFile.length} file\n`)

console.log('Theo rule:')
for (const [rule, n] of [...byRule].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${rule}`)
}

console.log('\nMười file nợ nhiều nhất:')
for (const [file, n] of byFile.sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(n).padStart(4)}  ${file}`)
}

console.log(
  '\nDọn xong một file thì chạy `pnpm lint:prune` để gỡ nó khỏi danh sách.\n' +
    'Rule vẫn là `error`: thêm vi phạm mới ở bất kỳ đâu là CI đỏ.',
)
