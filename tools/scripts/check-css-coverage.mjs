#!/usr/bin/env node
/** Gác vùng quét của Tailwind.
 *
 *  Tailwind v4 tự dò nguồn từ thư mục gốc của Vite. Trong monorepo, nó KHÔNG
 *  thấy package workspace — nên mọi class chỉ dùng bên trong @pv/ui sẽ lặng lẽ
 *  biến mất khỏi bản build. Không lỗi, không cảnh báo, chỉ có màn vỡ.
 *
 *  Đây là loại lỗi tệ nhất: build xanh, test xanh, typecheck xanh. Script này
 *  đọc mọi class giá trị tuỳ ý trong source rồi kiểm nó có thật sự sinh ra CSS
 *  hay không.
 *
 *  Chạy SAU `pnpm build`. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DIST = join(ROOT, 'apps/web/dist/assets')
const SOURCES = [join(ROOT, 'packages/ui/src'), join(ROOT, 'apps/web/src')]

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []
  })

let css = ''
try {
  for (const f of readdirSync(DIST).filter((n) => n.endsWith('.css'))) {
    css += readFileSync(join(DIST, f), 'utf8')
  }
} catch {
  console.error('✗ Không tìm thấy CSS đã build. Chạy `pnpm build` trước.')
  process.exit(1)
}

if (!css) {
  console.error('✗ Thư mục dist không có file CSS nào.')
  process.exit(1)
}

// Class dạng `h-[150px]`, `size-[38px]`, `bg-[linear-gradient(...)]`.
// Chỉ lấy loại có đơn vị px/rem — chúng chắc chắn phải xuất hiện nguyên văn
// trong CSS sinh ra, nên kiểm được mà không phải mô phỏng cách Tailwind escape.
const ARBITRARY = /\b[a-z][a-z0-9-]*-\[(-?[0-9.]+(?:px|rem))\]/g

const wanted = new Map()
for (const dir of SOURCES) {
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(ARBITRARY)) {
      if (!wanted.has(m[0])) wanted.set(m[0], relative(ROOT, file))
    }
  }
}

const missing = [...wanted].filter(([cls]) => {
  const value = cls.slice(cls.indexOf('[') + 1, -1)
  return !css.includes(value)
})

console.log(`Class giá trị tuỳ ý trong source : ${wanted.size}`)
console.log(`Có mặt trong CSS đã build        : ${wanted.size - missing.length}`)

if (missing.length > 0) {
  console.error(`\n✗ ${missing.length} class không sinh ra CSS:\n`)
  for (const [cls, file] of missing.slice(0, 25)) console.error(`  · ${cls}  (${file})`)
  if (missing.length > 25) console.error(`  … và ${missing.length - 25} class nữa`)
  console.error(
    '\nGần như chắc chắn là thiếu một dòng @source trong apps/web/src/styles/app.css.\n' +
      'Mỗi thư mục source của workspace phải được khai báo ở đó.\n',
  )
  process.exit(1)
}

console.log('\n✓ Mọi class giá trị tuỳ ý đều có mặt trong CSS đã build.')
