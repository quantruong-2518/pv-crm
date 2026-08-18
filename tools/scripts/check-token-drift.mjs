#!/usr/bin/env node
/** Gác tầng token.
 *
 *  Có `var(--x)` nào trong code trỏ tới token KHÔNG TỒN TẠI không?
 *
 *  docs/luat-thiet-ke.md §2: "Thiếu token thì HỎI, đừng bịa hex mới" — nhưng bịa
 *  *tên token* còn tệ hơn bịa hex: CSS im lặng cho ra màu trong suốt, build
 *  xanh, test xanh, và không ai thấy cho tới lúc demo trước khách.
 *
 *  Bản trước còn một vế nữa: đối chiếu `packages/tokens/globals.css` với bản
 *  thiết kế `project/theme/globals.css`. Vế đó bỏ ngày 18/08 khi `project/` bị
 *  xoá — giờ cả repo chỉ còn MỘT file token, không có bản thứ hai để lệch.
 *  Dựng lại nguồn thiết kế thì khôi phục vế đó.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TOKENS = join(ROOT, 'packages/tokens/globals.css')

const declared = new Set()
for (const m of readFileSync(TOKENS, 'utf8').matchAll(/^\s*(--[\w-]+)\s*:/gm)) {
  declared.add(m[1])
}

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    if (n === 'node_modules' || n === 'dist' || n === 'coverage') return []
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(p) ? [p] : []
  })

const referenced = new Map()
for (const file of [join(ROOT, 'packages'), join(ROOT, 'apps')].flatMap(walk)) {
  for (const m of readFileSync(file, 'utf8').matchAll(/var\(\s*(--[\w-]+)/g)) {
    if (!referenced.has(m[1])) referenced.set(m[1], relative(ROOT, file))
  }
}

const dangling = [...referenced].filter(([name]) => !declared.has(name))

console.log(`Token khai báo trong packages/tokens/globals.css : ${declared.size}`)
console.log(`var(--*) code đang tham chiếu                    : ${referenced.size}`)

if (dangling.length > 0) {
  console.error(`\n✗ ${dangling.length} tham chiếu trỏ vào token không tồn tại:\n`)
  for (const [name, file] of dangling) console.error(`  · var(${name})  dùng ở ${file}`)
  console.error(
    '\nTầng token là file màu duy nhất của cả hệ. Khai báo token ở\n' +
      'packages/tokens/globals.css, hoặc sửa tên cho đúng. Đừng bịa hex mới.\n',
  )
  process.exit(1)
}

console.log('\n✓ Không có var(--*) nào trỏ vào hư không.')
