/** Scan door rule — what an AI read from N files becomes company groups, and
 *  each group gets its outcome against the lead book.
 *
 *  Pure and deterministic on purpose: the model reads ONE file at a time and
 *  never decides grouping or matching, so the preview a seller approves is
 *  reproducible and never reshuffles between polls. Groups come out in order
 *  of first appearance (file order, companies before people inside a file).
 *
 *  Types are local: @pv/engines cannot import @pv/contracts (contracts
 *  depends on engines), so the API maps `ScanExtraction` in and `ScanPreview`
 *  out. Linking is union-find over shared keys — tax root, email, phone,
 *  company email domain, folded company name — so order of links is moot. */

export type ScanReadPerson = {
  name: string | null
  title: string | null
  email: string | null
  phones: readonly string[]
  companyName: string | null
}

export type ScanReadCompany = {
  name: string | null
  legalName: string | null
  taxCode: string | null
  address: string | null
  province: string | null
  website: string | null
  headcount: string | null
  phones: readonly string[]
  emails: readonly string[]
}

export type ScanReadFile = {
  fileId: string
  fileName: string
  people: readonly ScanReadPerson[]
  companies: readonly ScanReadCompany[]
  /** Paths the model doubted: a bare field (`taxCode`) doubts it on every
   *  record of the file, `people[0].email` on that record only. */
  unsure?: readonly string[]
}

/** A live lead that shares an email or tax code with the batch. `inScope`
 *  = the uploader may see it; outside scope its code must not leak. */
export type ScanBookLead = {
  code: string
  emailLower: string | null
  taxCode: string | null
  inScope: boolean
}

export type ScanFieldConfidence = 'SURE' | 'INFERRED' | 'CONFLICT'

export type ScanMergedField = {
  field: string
  value: string
  alt: string | null
  fromFile: string
  confidence: ScanFieldConfidence
}

export type ScanPlanPerson = {
  name: string | null
  title: string | null
  email: string | null
  phones: string[]
}

type ScanPlanGroupBase = {
  key: string
  company: string
  meta: string
  people: ScanPlanPerson[]
  fields: ScanMergedField[]
  fileIds: string[]
}

export type ScanPlanGroup = ScanPlanGroupBase &
  (
    | { outcome: 'MERGE_INTO_LEAD'; leadCode: string }
    | { outcome: 'NEW_LEAD' | 'HELD_MISSING_CONTACT' | 'HELD_OTHER_OWNER' }
  )

export type ScanPlan = {
  groups: ScanPlanGroup[]
  totals: { accounts: number; contacts: number; leadsToCreate: number }
  noLeadFileIds: string[]
}

/** A shared domain here says nothing about the employer, so it never links. */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.com.vn',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'yandex.com',
  'yandex.ru',
  'proton.me',
  'protonmail.com',
  'zoho.com',
])

/** Shown instead of a province when no card backs the company. */
export const SCAN_PROFILE_ONLY_META = 'chỉ có hồ sơ'

// ---------------------------------------------------------------------------
// Normalisers — each returns null when the input cannot serve as a key
// ---------------------------------------------------------------------------

export function foldText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Longer phrases first: the alternation is tried left to right. */
const LEGAL_WORDS =
  /\b(cong ty|co phan|trach nhiem huu han|mot thanh vien|joint stock company|tnhh|mtv|cp|jsc|company|corporation|corp|co|ltd|limited)\b/g

export function foldCompanyName(raw: string): string | null {
  const folded = foldText(raw).replace(LEGAL_WORDS, ' ').replace(/\s+/g, ' ').trim()
  return folded || null
}

export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

/** VN numbers to one national form: `+84`, `84`, `0084` and a stray `(0)`
 *  after the country code all become a single leading `0`. */
export function normalisePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0084')) digits = digits.slice(2)
  if (digits.startsWith('84') && digits.length >= 11)
    digits = `0${digits.slice(2).replace(/^0/, '')}`
  return /^0\d{9,10}$/.test(digits) ? digits : null
}

/** A branch (`0312345678-001`) is the same company as its root. */
export function taxRoot(raw: string): string | null {
  const match = raw.replace(/[^\d-]/g, '').match(/^(\d{10})(?:-?\d{3})?$/)
  return match ? match[1]! : null
}

function websiteHost(raw: string): string | null {
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]!
  return host.includes('.') ? host : null
}

function companyDomain(host: string | null): string | null {
  return host && !FREE_MAIL_DOMAINS.has(host) ? host : null
}

// ---------------------------------------------------------------------------
// Entities — one per company or person record that carries anything
// ---------------------------------------------------------------------------

type Entity = {
  slot: string
  fileId: string
  fileName: string
  company: ScanReadCompany | null
  person: ScanReadPerson | null
  links: string[]
  /** Source keys (`taxCode`, `phones`, `companyName`) the model doubted here. */
  unsure: ReadonlySet<string>
}

const present = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined

function companyLinks(c: ScanReadCompany): string[] {
  const emails = c.emails.map(normaliseEmail).filter(present)
  const domains = [...emails.map((e) => e.split('@')[1]!), c.website && websiteHost(c.website)]
  const tax = c.taxCode && taxRoot(c.taxCode)
  return [
    tax && `tax:${tax}`,
    ...emails.map((e) => `email:${e}`),
    ...c.phones.map(normalisePhone).map((p) => p && `phone:${p}`),
    ...domains.map((d) => companyDomain(d ?? null)).map((d) => d && `domain:${d}`),
    ...[c.name, c.legalName].map((n) => n && foldCompanyName(n)).map((n) => n && `name:${n}`),
  ].filter((l): l is string => !!l)
}

function personLinks(p: ScanReadPerson): string[] {
  const email = p.email && normaliseEmail(p.email)
  const domain = email && companyDomain(email.split('@')[1]!)
  const name = p.companyName && foldCompanyName(p.companyName)
  return [
    email && `email:${email}`,
    ...p.phones.map(normalisePhone).map((ph) => ph && `phone:${ph}`),
    domain && `domain:${domain}`,
    name && `name:${name}`,
  ].filter((l): l is string => !!l)
}

function hasText(values: readonly (string | null)[]): boolean {
  return values.some((v) => !!v?.trim())
}

/** `people[0].phones[1]` under prefix `people[0].` becomes `phones`; an
 *  indexed path for another record is dropped. */
function unsureFor(paths: readonly string[] | undefined, prefix: string): ReadonlySet<string> {
  const own = (paths ?? []).map((path) =>
    path.startsWith(prefix) ? path.slice(prefix.length) : path.includes('[') ? '' : path,
  )
  return new Set(own.filter(Boolean).map((key) => key.replace(/\[\d+\]$/, '')))
}

function readEntities(files: readonly ScanReadFile[]): Entity[] {
  return files.flatMap((f) => {
    const base = { fileId: f.fileId, fileName: f.fileName }
    const companies = f.companies
      .map((c, i) => ({
        ...base,
        company: c,
        person: null,
        unsure: unsureFor(f.unsure, `companies[${i}].`),
      }))
      .filter(({ company: c }) =>
        hasText([
          c.name,
          c.legalName,
          c.taxCode,
          c.address,
          c.province,
          c.website,
          c.headcount,
          ...c.phones,
          ...c.emails,
        ]),
      )
      .map((e) => ({ ...e, links: companyLinks(e.company) }))
    const people = f.people
      .map((p, i) => ({
        ...base,
        company: null,
        person: p,
        unsure: unsureFor(f.unsure, `people[${i}].`),
      }))
      .filter(({ person: p }) => hasText([p.name, p.email, ...p.phones]))
      .map((e) => ({ ...e, links: personLinks(e.person) }))
    return [...companies, ...people].map((e, n) => ({ ...e, slot: `${f.fileId}#${n}` }))
  })
}

/** Union-find where the smaller index always wins the root, so a group's
 *  root is its earliest entity and group order falls out of Map order. */
function groupEntities(entities: Entity[]): Entity[][] {
  const parent = entities.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!
    return i
  }
  const firstByLink = new Map<string, number>()
  entities.forEach((e, i) => {
    for (const link of e.links) {
      const seen = firstByLink.get(link)
      if (seen === undefined) firstByLink.set(link, i)
      else parent[Math.max(find(seen), find(i))] = Math.min(find(seen), find(i))
    }
  })
  const groups = new Map<number, Entity[]>()
  entities.forEach((e, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), e])
  })
  return [...groups.values()]
}

// ---------------------------------------------------------------------------
// Per-group merge
// ---------------------------------------------------------------------------

type FieldSpec = {
  field: string
  company: keyof ScanReadCompany
  /** Only the company name is also printed on a person's card. */
  person?: 'companyName'
  norm: (raw: string) => string | null
  /** Report the normalised form, because it is also the stored key. */
  canonical?: true
}

const FIELD_SPECS: readonly FieldSpec[] = [
  { field: 'name', company: 'name', person: 'companyName', norm: foldCompanyName },
  { field: 'legalName', company: 'legalName', norm: foldCompanyName },
  { field: 'taxCode', company: 'taxCode', norm: taxRoot, canonical: true },
  { field: 'address', company: 'address', norm: foldText },
  { field: 'province', company: 'province', norm: foldText },
  { field: 'website', company: 'website', norm: websiteHost },
  { field: 'headcount', company: 'headcount', norm: foldText },
  { field: 'phone', company: 'phones', norm: normalisePhone, canonical: true },
  { field: 'email', company: 'emails', norm: normaliseEmail, canonical: true },
]

/** A list field offers its first entry: one reading per source. */
function readSource(spec: FieldSpec, e: Entity): { key: string; raw: string | undefined } | null {
  if (e.company) {
    const v = e.company[spec.company]
    return { key: spec.company, raw: (typeof v === 'string' ? v : v?.[0])?.trim() }
  }
  return spec.person && e.person ? { key: spec.person, raw: e.person[spec.person]?.trim() } : null
}

/** Each source offers one reading; the first wins and the first reading
 *  that normalises differently becomes `alt`, so two sources that disagree
 *  both reach the seller. Agreement only among doubted readings stays
 *  INFERRED — repeating a guess does not make it sure. */
function mergeField(spec: FieldSpec, members: Entity[]): ScanMergedField | null {
  const readings = members
    .map((e) => {
      const source = readSource(spec, e)
      const norm = source?.raw ? spec.norm(source.raw) : null
      if (!source?.raw || !norm) return null
      const shown = spec.canonical ? norm : source.raw
      return { shown, norm, file: e.fileName, unsure: e.unsure.has(source.key) }
    })
    .filter(present)
  const first = readings[0]
  if (!first) return null
  const other = readings.find((r) => r.norm !== first.norm)
  const confidence = other ? 'CONFLICT' : readings.every((r) => r.unsure) ? 'INFERRED' : 'SURE'
  return {
    field: spec.field,
    value: first.shown,
    alt: other?.shown ?? null,
    fromFile: first.file,
    confidence,
  }
}

function dedupePeople(members: Entity[]): ScanPlanPerson[] {
  const byKey = new Map<string, ScanPlanPerson>()
  for (const p of members.map((e) => e.person).filter(present)) {
    const email = p.email ? normaliseEmail(p.email) : null
    const phones = p.phones.map(normalisePhone).filter(present)
    const name = p.name?.trim() || null
    const key = email ? `e:${email}` : `n:${foldText(name ?? '')}|${phones[0] ?? ''}`
    const seen = byKey.get(key)
    if (!seen) {
      byKey.set(key, { name, title: p.title?.trim() || null, email, phones })
      continue
    }
    seen.name ??= name
    seen.title ??= p.title?.trim() || null
    seen.phones = [...new Set([...seen.phones, ...phones])]
  }
  return [...byKey.values()]
}

const KEY_PRIORITY = ['tax:', 'domain:', 'name:', 'email:', 'phone:'] as const

/** Built from identity, not position, so a group keeps its key when an
 *  unrelated file lands before it. */
function groupKey(members: Entity[]): string {
  const links = members.flatMap((e) => e.links)
  for (const prefix of KEY_PRIORITY) {
    const hit = links.find((l) => l.startsWith(prefix))
    if (hit) return hit
  }
  return `slot:${members[0]!.slot}`
}

/** An in-scope match wins over any out-of-scope one: the seller can act on
 *  it, and holding would strand the batch on a lead nobody here may see.
 *  Within a pool, tax code outranks email — an email names one person who
 *  may have moved on. */
function matchBook(members: Entity[], book: readonly ScanBookLead[]): ScanBookLead | undefined {
  const links = new Set(members.flatMap((e) => e.links))
  const pick = (pool: readonly ScanBookLead[]) =>
    pool.find((b) => b.taxCode && links.has(`tax:${taxRoot(b.taxCode)}`)) ??
    pool.find((b) => b.emailLower && links.has(`email:${b.emailLower}`))
  return pick(book.filter((b) => b.inScope)) ?? pick(book)
}

function buildGroup(members: Entity[], book: readonly ScanBookLead[]): ScanPlanGroup {
  const fields = FIELD_SPECS.map((s) => mergeField(s, members)).filter(present)
  const value = (field: string) => fields.find((f) => f.field === field)?.value
  const people = dedupePeople(members)
  const base: ScanPlanGroupBase = {
    key: groupKey(members),
    company: value('name') ?? value('legalName') ?? '',
    meta: people.length === 0 ? SCAN_PROFILE_ONLY_META : (value('province') ?? ''),
    people,
    fields,
    fileIds: [...new Set(members.map((e) => e.fileId))],
  }
  const hit = matchBook(members, book)
  if (hit) {
    return hit.inScope
      ? { ...base, outcome: 'MERGE_INTO_LEAD', leadCode: hit.code }
      : { ...base, outcome: 'HELD_OTHER_OWNER' }
  }
  return { ...base, outcome: people.some((p) => p.email) ? 'NEW_LEAD' : 'HELD_MISSING_CONTACT' }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function planLeadScan(
  files: readonly ScanReadFile[],
  book: readonly ScanBookLead[],
): ScanPlan {
  const entities = readEntities(files)
  const groups = groupEntities(entities).map((members) => buildGroup(members, book))
  const yielded = new Set(entities.map((e) => e.fileId))
  return {
    groups,
    totals: {
      accounts: groups.length,
      contacts: groups.reduce((n, g) => n + g.people.length, 0),
      leadsToCreate: groups.filter((g) => g.outcome === 'NEW_LEAD').length,
    },
    noLeadFileIds: files.map((f) => f.fileId).filter((id) => !yielded.has(id)),
  }
}
