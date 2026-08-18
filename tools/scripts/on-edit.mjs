#!/usr/bin/env node
/** Hook PostToolUse — định dạng và tự sửa lint ngay sau mỗi lần agent ghi file.
 *
 *  Vì sao đáng làm: vòng lặp ngắn nhất có thể. Agent viết `gap-[9px]`, biết
 *  ngay lúc đó, không phải đợi tới `pnpm check` hay tới CI. Đây chính là phần
 *  "vibe nhanh mà vẫn ổn định" — cái gác đặt sát chỗ sinh lỗi nhất.
 *
 *  Nguyên tắc: hook này KHÔNG BAO GIỜ chặn. Môi trường nào chạy được thì tốt,
 *  không chạy được thì im lặng bỏ qua — lint-staged và CI vẫn gác đủ. Một hook
 *  hay hỏng là một hook sẽ bị gỡ. */
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

/** Tìm file bin của một package.
 *
 *  Không dùng `require.resolve('eslint/bin/eslint.js')` được: ESLint 9 khai báo
 *  `exports` và không mở đường dẫn đó, nên resolve sẽ ném. `./package.json` thì
 *  package nào cũng mở — đi vòng qua đó rồi ghép đường dẫn. */
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
  // Ngoài repo, hoặc trong nguồn thiết kế / thư mục sinh ra → không đụng.
  if (rel.startsWith('..') || /^(project|node_modules|.*[\\/]dist)[\\/]/.test(rel)) process.exit(0)

  const ext = extname(abs)
  const formattable = ['.ts', '.tsx', '.js', '.mjs', '.css', '.json', '.md', '.yml', '.yaml']
  if (!formattable.includes(ext)) process.exit(0)

  run(bin('prettier', 'bin/prettier.cjs'), ['--write', '--log-level', 'error', abs])

  if (['.ts', '.tsx', '.js', '.mjs'].includes(ext)) {
    // Formatter mặc định (stylish): sạch thì stdout rỗng.
    const out = run(bin('eslint', 'bin/eslint.js'), ['--fix', abs])
    const remaining = (out?.stdout ?? '').trim()
    if (remaining) {
      // In ra để agent thấy ngay trong transcript. Vẫn exit 0 — báo, không chặn.
      console.log(`[aurora] còn lỗi lint chưa tự sửa được ở ${rel}:\n${remaining}`)
    }
  }
} catch {
  // Im lặng. CI mới là chỗ chặn.
}

process.exit(0)
