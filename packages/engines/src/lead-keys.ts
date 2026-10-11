/** Lead keys — the one place a raw company or person field becomes a
 *  comparable key. Every door (scan, import, form, landing) and the admission
 *  gate must fold through here: two normalisers that disagree by one rule make
 *  the same company a duplicate at one door and a stranger at the next.
 *
 *  Each normaliser returns null when the input cannot serve as a key. */

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
  /\b(cong ty|cty|co phan|trach nhiem huu han|mot thanh vien|joint stock company|tnhh|mtv|cp|jsc|company|corporation|corp|co|ltd|limited)\b/g

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

export function websiteHost(raw: string): string | null {
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]!
  return host.includes('.') ? host : null
}

/** Null for a free-mail host: it names a mail provider, not an employer. */
export function companyDomain(host: string | null): string | null {
  return host && !FREE_MAIL_DOMAINS.has(host) ? host : null
}

// ---------------------------------------------------------------------------
// The full key set of one company and its people
// ---------------------------------------------------------------------------

export type LeadKeyCompany = {
  name?: string | null
  taxCode?: string | null
  website?: string | null
}
export type LeadKeyPerson = { name?: string | null; email?: string | null; phone?: string | null }

export type LeadPersonKeys = { email: string | null; phone: string | null; name: string | null }

export type LeadKeys = {
  taxRoot: string | null
  nameKey: string | null
  /** Non-free domains of the website and of every person's email. */
  domains: string[]
  /** Same order and length as the people passed in, so indexes line up. */
  people: LeadPersonKeys[]
}

export function leadKeys(company: LeadKeyCompany, people: readonly LeadKeyPerson[]): LeadKeys {
  const keyed = people.map((p) => ({
    email: p.email ? normaliseEmail(p.email) : null,
    phone: p.phone ? normalisePhone(p.phone) : null,
    name: (p.name && foldText(p.name)) || null,
  }))
  const hosts = [
    company.website ? websiteHost(company.website) : null,
    ...keyed.map((p) => p.email && p.email.split('@')[1]!),
  ]
  return {
    taxRoot: company.taxCode ? taxRoot(company.taxCode) : null,
    nameKey: company.name ? foldCompanyName(company.name) : null,
    domains: [...new Set(hosts.map(companyDomain).filter((d): d is string => !!d))],
    people: keyed,
  }
}

// ---------------------------------------------------------------------------
// Grouping by shared keys
// ---------------------------------------------------------------------------

/** Union-find over items that share any link; returns each item's root index.
 *  The smaller index always wins the root, so a group's root is its earliest
 *  item and callers get first-appearance order for free. */
export function groupByLinks(links: readonly (readonly string[])[]): number[] {
  const parent = links.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!
    return i
  }
  const firstByLink = new Map<string, number>()
  links.forEach((own, i) => {
    for (const link of own) {
      const seen = firstByLink.get(link)
      if (seen === undefined) firstByLink.set(link, i)
      else parent[Math.max(find(seen), find(i))] = Math.min(find(seen), find(i))
    }
  })
  return links.map((_, i) => find(i))
}
