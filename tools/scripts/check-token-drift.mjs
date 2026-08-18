#!/usr/bin/env node
/** Gác tầng token. Hai câu hỏi, cả hai đều từng chỉ trả lời được bằng trí nhớ:
 *
 *  1 · `packages/tokens/globals.css` có còn khớp bản thiết kế
 *      `project/theme/globals.css` không? Bản code được phép CỘNG THÊM token
 *      (mục "Token bổ sung" trong apps/web/README.md) nhưng không được ĐỔI giá
 *      trị của token đã chốt — đổi là đổi màu cả hệ mà không ai nhận ra.
 *
 *  2 · Có `var(--x)` nào trong code trỏ tới token KHÔNG TỒN TẠI không?
 *      CLAUDE.md: "Thiếu token thì HỎI, đừng bịa hex mới" — nhưng bịa tên token
 *      thì CSS im lặng cho ra màu trong suốt, không ai thấy cho tới lúc demo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DESIGN = join(ROOT, 'project/theme/globals.css')
const CODE = join(ROOT, 'packages/tokens/globals.css')

/** So GIÁ TRỊ, không so cách viết. Bản code đã qua Prettier nên nháy kép thành
 *  nháy đơn và `0.40` thành `0.4` — đó không phải drift, và nếu báo thì guard
 *  này sẽ kêu suốt cho tới lúc không ai đọc nữa. */
const norm = (v) =>
  v
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/#[0-9a-fA-F]{3,8}\b/g, (hex) => hex.toLowerCase())
    .replace(/\b(\d+)\.(\d*?)0+\b/g, (_, int, frac) => (frac ? `${int}.${frac}` : int))
    .trim()

const declarations = (css) => {
  const out = new Map()
  for (const m of css.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)) {
    out.set(m[1], norm(m[2]))
  }
  return out
}

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    if (n === 'node_modules' || n === 'dist' || n === 'coverage') return []
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []
  })

const problems = []

// ---- 1 · thiết kế vs code -------------------------------------------------
const design = declarations(readFileSync(DESIGN, 'utf8'))
const code = declarations(readFileSync(CODE, 'utf8'))

for (const [name, value] of design) {
  if (!code.has(name)) {
    problems.push(
      `token "${name}" có trong bản thiết kế nhưng MẤT trong packages/tokens/globals.css`,
    )
  } else if (code.get(name) !== value) {
    problems.push(
      `token "${name}" LỆCH giá trị\n    thiết kế: ${value}\n    code    : ${code.get(name)}`,
    )
  }
}

const added = [...code.keys()].filter((n) => !design.has(n))

// ---- 2 · var(--x) trỏ vào hư không ----------------------------------------
const sources = [join(ROOT, 'packages'), join(ROOT, 'apps')].flatMap(walk)
const referenced = new Map()

for (const file of sources) {
  for (const m of readFileSync(file, 'utf8').matchAll(/var\(\s*(--[\w-]+)/g)) {
    if (!referenced.has(m[1])) referenced.set(m[1], relative(ROOT, file))
  }
}

for (const [name, file] of referenced) {
  if (!code.has(name)) {
    problems.push(`var(${name}) dùng ở ${file} nhưng KHÔNG có trong packages/tokens/globals.css`)
  }
}

// ---- báo cáo ---------------------------------------------------------------
console.log(`Token đã chốt trong bản thiết kế : ${design.size}`)
console.log(`Token trong code                 : ${code.size} (+${added.length} bổ sung)`)
console.log(`var(--*) code đang tham chiếu    : ${referenced.size}`)

if (problems.length > 0) {
  console.error(`\n✗ ${problems.length} vấn đề ở tầng token:\n`)
  for (const p of problems) console.error(`  · ${p}`)
  console.error(
    '\nTầng token là file màu duy nhất của cả hệ. Sửa cho khớp, hoặc nếu đây là\n' +
      'quyết định thiết kế mới thì cập nhật project/theme/globals.css TRƯỚC.\n',
  )
  process.exit(1)
}

console.log('\n✓ Tầng token khớp bản thiết kế, không có var(--*) nào trỏ vào hư không.')
