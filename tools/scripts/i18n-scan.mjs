/** Shared i18n scanner behind `i18n-check.mjs` and `i18n-fill.mjs`.
 *
 *  Vietnamese is the source of truth; `message(vi, en, ko)` carries the other
 *  languages. This module only reads source: it lists the web files in scope and
 *  returns, per file, (a) Vietnamese text sitting outside any message() call and
 *  (b) message() calls whose en or ko is still an empty literal.
 *
 *  `// i18n-ignore` on the same or previous line exempts a Vietnamese string that
 *  is a key or matcher, not display text; `i18n-ignore-file` anywhere exempts the
 *  file. Strings in type positions are skipped for the same reason.
 *
 *  Already-translated shapes are recognised and not flagged: three-literal helper
 *  calls, arrays and objects with a Hangul sibling, and a const used as the first
 *  argument of such a call. */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const WEB_SRC = join(ROOT, 'apps/web/src')
const ts = createRequire(join(ROOT, 'package.json'))('typescript')

const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/iu

export function inScope(rel) {
  if (!/\.tsx?$/.test(rel) || /\.d\.ts$/.test(rel)) return false
  if (/(^|\/)kit\//.test(rel) || /\.test\./.test(rel) || /fixture/i.test(rel)) return false
  return basename(rel) !== 'i18n.ts'
}

export function listFiles(dir = WEB_SRC) {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) {
        if (name !== 'node_modules' && name !== 'dist') walk(p)
      } else if (inScope(relative(dir, p))) out.push(p)
    }
  }
  walk(dir)
  return out
}

function localNames(sf) {
  const names = new Set(['message'])
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !/i18n['"]?$/.test(st.moduleSpecifier.getText())) continue
    const named = st.importClause?.namedBindings
    if (!named || !ts.isNamedImports(named)) continue
    for (const el of named.elements) {
      if ((el.propertyName ?? el.name).text === 'message') names.add(el.name.text)
    }
  }
  return names
}

function insideMessage(node, names) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && names.has(p.expression.text))
      return true
    if (ts.isObjectLiteralExpression(p)) {
      const keys = new Set(p.properties.map((x) => x.name?.getText?.()))
      if (keys.has('vi') && keys.has('en') && keys.has('ko')) return true
    }
  }
  return false
}

const HANGUL = /[\u3131-\u318e\uac00-\ud7a3]/u
const isLit = (n) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
const litText = (n) => (isLit(n) ? n.text : ts.isTemplateExpression(n) ? n.getText() : undefined)
const foreign = (n) => {
  const t = litText(n)
  return t !== undefined && t.trim() !== '' && !VI.test(t)
}

/** Call shaped `fn(vi, en, ko)`: three text args, the last two non-Vietnamese. */
function isTripleCall(n) {
  const [a, b, c] = n.arguments
  return n.arguments.length === 3 && litText(a) !== undefined && foreign(b) && foreign(c)
}

/** Identifiers passed as first argument of message()-like calls in this file. */
function messageSources(sf, names) {
  const ids = new Set()
  const walk = (n) => {
    const first = ts.isCallExpression(n) ? n.arguments[0] : undefined
    const named = ts.isIdentifier(n.expression ?? n) && names.has((n.expression ?? n).text)
    if (first && ts.isIdentifier(first) && (named || isTripleCall(n))) ids.add(first.text)
    ts.forEachChild(n, walk)
  }
  walk(sf)
  return ids
}

/** A Vietnamese leaf whose siblings already carry the other languages. */
function translatedShape(leaf, sources) {
  const part = ts.isTemplateMiddle(leaf) || ts.isTemplateTail(leaf)
  const node = ts.isTemplateHead(leaf) ? leaf.parent : part ? leaf.parent.parent : leaf
  const p = node.parent
  if (ts.isCallExpression(p)) return p.arguments[0] === node && isTripleCall(p)
  if (ts.isArrayLiteralExpression(p)) return p.elements.some((e) => HANGUL.test(litText(e) ?? ''))
  if (ts.isVariableDeclaration(p)) return ts.isIdentifier(p.name) && sources.has(p.name.text)
  if (!ts.isPropertyAssignment(p)) return false
  return p.parent.properties.some((x) => HANGUL.test(litText(x.initializer) ?? ''))
}

function isTypeOrImport(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isLiteralTypeNode(p) || ts.isImportDeclaration(p) || ts.isExportDeclaration(p))
      return true
  }
  return false
}

const isTextNode = (n) =>
  ts.isStringLiteral(n) ||
  ts.isNoSubstitutionTemplateLiteral(n) ||
  ts.isJsxText(n) ||
  ts.isTemplateHead(n) ||
  ts.isTemplateMiddle(n) ||
  ts.isTemplateTail(n)

const isEmptyLiteral = (n) =>
  n !== undefined &&
  (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
  n.text === ''

function viOf(node, text) {
  if (!node) return undefined
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return { text: node.text, template: false }
  if (ts.isTemplateExpression(node)) {
    const raw = text.slice(node.getStart() + 1, node.end - 1)
    return { text: raw, template: true }
  }
  return undefined
}

/** `{ hardcoded, calls }` for one source text. `calls` carry node ranges for the filler. */
export function scanSource(file, text) {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  if (/i18n-ignore-file/.test(text)) return { hardcoded: [], calls: [] }
  const names = localNames(sf)
  const sources = messageSources(sf, names)
  const lines = text.split('\n')
  const hardcoded = []
  const calls = []
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line

  const visit = (n) => {
    if (
      isTextNode(n) &&
      VI.test(n.text) &&
      !insideMessage(n, names) &&
      !isTypeOrImport(n) &&
      !translatedShape(n, sources)
    ) {
      const start = n.getStart()
      const raw = text.slice(start, n.end)
      const at = raw.search(VI)
      const line = lineOf(start + Math.max(at, 0))
      if (!lines[line].includes('i18n-ignore') && !lines[line - 1]?.includes('i18n-ignore'))
        hardcoded.push({ line: line + 1, text: n.text.replace(/\s+/g, ' ').trim().slice(0, 70) })
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && names.has(n.expression.text)) {
      const [vi, en, ko] = n.arguments
      const source = viOf(vi, text)
      if (source && source.text.trim() !== '' && (isEmptyLiteral(en) || isEmptyLiteral(ko)))
        calls.push({
          line: lineOf(n.getStart()) + 1,
          vi: source,
          en: isEmptyLiteral(en) ? { start: en.getStart(), end: en.end } : undefined,
          ko: isEmptyLiteral(ko) ? { start: ko.getStart(), end: ko.end } : undefined,
        })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return { hardcoded, calls }
}

export function readScan(file) {
  return scanSource(file, readFileSync(file, 'utf8'))
}
